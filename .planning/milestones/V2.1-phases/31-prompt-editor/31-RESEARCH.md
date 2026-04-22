# Phase 31: Prompt Editor - Research

**Researched:** 2026-03-12
**Domain:** Agent spec file editing, deployer/experiment-runner delegation, before/after score comparison
**Confidence:** HIGH

## Summary

Phase 31 creates `prompt-editor.md`, a new subagent that extracts iterator.md Phases 5-7 (apply changes, re-deploy, re-test) plus the before/after score comparison from Phase 7 Step 7.3. The prompt-editor reads `iteration-proposals.json` (produced by Phase 30's failure-diagnoser), filters to approved agents, applies section-level changes to agent spec `.md` files preserving YAML frontmatter and all non-instruction sections, then delegates re-deploy to `deployer.md` and holdout re-test to `experiment-runner.md` (NOT dataset-preparer -- no duplicate dataset uploads). After re-test, it computes before/after score comparison and flags any evaluator regressions.

This is primarily a coordination subagent: it performs one direct operation (spec file editing) and delegates two operations (re-deploy, holdout re-test). The spec file editing logic is well-documented in iterator.md Phase 5 and is the highest-risk operation (corrupting YAML frontmatter or non-instruction sections). The delegation pattern reuses existing subagents unchanged.

**Primary recommendation:** Extract iterator.md Phases 5-7 into `prompt-editor.md` (~200 lines). The subagent reads `iteration-proposals.json` + `dataset-prep.json` (for holdout dataset IDs) + agent spec files. It delegates to deployer.md and experiment-runner.md (holdout mode) + results-analyzer.md (holdout mode). No reference files needed in `<files_to_read>` -- delegates load their own.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITPIPE-04 | Prompt-editor applies approved section-level changes preserving YAML frontmatter and non-instruction sections | iterator.md Phase 5 has the exact spec file editing logic (Steps 5.1-5.4). Agent spec template confirms XML-tagged structure within `## Instructions` section. YAML frontmatter preservation rules are documented. |
| ITPIPE-05 | Prompt-editor delegates re-deploy to deployer and holdout re-test to experiment-runner (skips dataset-preparer) | ARCHITECTURE.md Anti-Pattern 4 explicitly forbids re-running dataset-preparer during iteration. experiment-runner.md supports holdout mode (`dataset_id` as direct input, writes to `experiment-raw-holdout.json`). results-analyzer.md supports holdout mode (`holdout=true` reads `experiment-raw-holdout.json`). deployer.md unchanged -- its idempotent diff logic naturally handles selective updates. |
| ITPIPE-06 | Prompt-editor computes before/after score comparison and flags regressions | iterator.md Phase 7 Steps 7.3-7.4 have the exact comparison table format and delta calculation. Regression flagging logic is documented (any evaluator median decrease = warning, even if still passing). |
</phase_requirements>

## Standard Stack

### Core

| Component | Purpose | Why Standard |
|-----------|---------|--------------|
| `iteration-proposals.json` (input) | Handoff contract from failure-diagnoser | Schema defined in ARCHITECTURE.md and confirmed by Phase 30 implementation |
| `dataset-prep.json` (input) | Source of `holdout_dataset_id` per agent | Written by dataset-preparer (Phase 26); experiment-runner reads this for holdout mode |
| `test-results.json` (input + output) | Before scores (input), updated after scores (output) | Read for original scores; updated with holdout re-test scores for iterate.md stop condition evaluation |
| Agent spec `.md` files (read-write) | Current prompt content; edited with approved changes | Standard template with YAML frontmatter + markdown sections + XML-tagged instructions |
| `deployer.md` (delegate) | Re-deploys changed agents to Orq.ai | Existing subagent, unchanged; idempotent create-or-update handles selective updates |
| `experiment-runner.md` (delegate) | Runs holdout re-test experiments | Existing subagent with holdout mode; accepts `dataset_id` directly, writes `experiment-raw-holdout.json` |
| `results-analyzer.md` (delegate) | Aggregates holdout re-test scores | Existing subagent with `holdout=true` parameter; reads `experiment-raw-holdout.json` |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `iteration-log.md` (output) | Per-cycle human-readable log | Appended after each iteration cycle |
| `audit-trail.md` (output) | Append-only audit record | Appended after each iteration cycle |
| `iteration-log.json` template | Schema reference for structured logging | Referenced for log field names and structure |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Delegating to experiment-runner for holdout re-test | Calling Orq.ai API directly from prompt-editor | Delegation reuses proven experiment execution logic; direct API calls would duplicate ~200 lines of experiment-runner logic and violate single-responsibility |
| Delegating to results-analyzer for score aggregation | Computing scores inline in prompt-editor | Delegation keeps prompt-editor under ~200 lines; inline computation would duplicate statistical aggregation logic |
| String-based section replacement | Full YAML/XML parser | Agent specs use simple non-nested XML with standard markdown sections; string split is sufficient and proven in iterator.md |

## Architecture Patterns

### Recommended File Structure

```
orq-agent/agents/prompt-editor.md    # New subagent (~200 lines)
```

No new templates, reference files, or supporting files needed.

### Pattern 1: Input Contract from iteration-proposals.json

**What:** The prompt-editor reads `iteration-proposals.json` and filters to agents with `approval: "approved"`. For each approved agent, it reads the `changes[]` array containing `section`, `reason`, `before`, `after` per change.

**When to use:** Phase 1 of the subagent -- immediately after reading the file.

**Key fields:**
```json
{
  "iteration": 1,
  "per_agent": [
    {
      "agent_key": "my-agent",
      "approval": "approved",
      "changes": [
        {
          "section": "<task_handling>",
          "reason": "...",
          "before": "existing content",
          "after": "modified content"
        }
      ]
    }
  ]
}
```

### Pattern 2: Spec File Editing with Section-Level Replacement

**What:** For each approved change, locate the XML-tagged section within the `## Instructions` code block and replace only that section's content. This is the highest-risk operation in the subagent.

**From iterator.md Phase 5:**
1. Read the agent spec `.md` file
2. Parse file structure: YAML frontmatter (`---` delimiters), then markdown sections
3. Locate `## Instructions` section
4. Find the XML code block within it (between ` ```xml ` and ` ``` `)
5. For each changed section: find `<section>` and `</section>` tags, replace content between them with the `after` value from the proposal
6. Write back the full file preserving everything else

**Safety invariant:** The file write MUST preserve:
- YAML frontmatter (orqai_id, orqai_version, deployed_at, deploy_channel, custom fields)
- `## Configuration` section
- `## Model` section
- `## Tools` section
- `## Context` section
- `## Evaluators` section
- `## Guardrails` section
- `## Runtime Constraints` section
- `## Input/Output Templates` section
- All XML sections within Instructions that were NOT changed

**If section tag not found:** Log a warning and skip that change. Do NOT create malformed XML.

### Pattern 3: Deployer Delegation (Re-deploy)

**What:** After applying changes to local spec files, invoke `deployer.md` with the swarm directory path. The deployer's existing idempotent create-or-update logic automatically detects which agents have changed instructions and PATCHes only those.

**Key detail:** Do NOT modify the deployer. It processes the full swarm manifest but only updates resources where the local spec differs from the Orq.ai state. Changed agents get status `updated`; unchanged agents get `unchanged`.

**From iterator.md Phase 6:**
- Invoke deployer with swarm directory path
- Collect results: which agents were updated, their new `orqai_version` and `deployed_at`
- If any agent fails to re-deploy: log failure but continue to re-test successfully deployed agents
- If ALL agents fail: skip re-test, continue to logging

### Pattern 4: Holdout Re-test Delegation (Experiment-Runner + Results-Analyzer)

**What:** After re-deploy, invoke `experiment-runner.md` in holdout mode, then `results-analyzer.md` in holdout mode. This validates whether prompt changes improved performance on unseen data.

**Experiment-runner holdout mode invocation:**
- `dataset_id`: the `holdout_dataset_id` from `dataset-prep.json` per agent
- `agent_key`: list of approved + successfully re-deployed agent keys only
- `evaluator_ids`: reuse from original test (from `test-results.json` evaluators array `orqai_evaluator_id`)
- `run_count`: 3 (default)
- Writes to: `experiment-raw-holdout.json`

**Results-analyzer holdout mode invocation:**
- `holdout=true`: reads `experiment-raw-holdout.json` instead of `experiment-raw.json`
- Produces holdout test-results (can be read for comparison)

**CRITICAL (ARCHITECTURE.md Anti-Pattern 4):** Do NOT invoke dataset-preparer during iteration. Datasets already exist on Orq.ai from the original `/orq-agent:test` run. Re-uploading wastes API calls, creates duplicates, and risks rate limiting.

### Pattern 5: Before/After Score Comparison

**What:** After holdout re-test completes, compute a comparison table for each changed agent using original `test-results.json` scores as "Before" and holdout re-test scores as "After".

**From iterator.md Phase 7 Step 7.3:**
```markdown
### Re-Test Results: {agent-key}

| Evaluator | Before | After | Delta | Status |
|-----------|--------|-------|-------|--------|
| {name} | {old_median} | {new_median} | {delta}% | improved/unchanged/regressed |

**Bottleneck:** {old_bottleneck} -> {new_bottleneck} ({improvement}%)
```

**Delta calculation:** `delta = ((new_median - old_median) / old_median) * 100`
- Status: `improved` if delta > 0, `unchanged` if delta == 0, `regressed` if delta < 0

**Regression flagging (from iterator.md Phase 7 Step 7.4):** If ANY evaluator's median decreased after changes (even if still passing), flag it:
```
Warning: {evaluator} regressed from {old} to {new} on {agent-key}.
```

### Pattern 6: Logging (iteration-log.md and audit-trail.md)

**What:** After each iteration cycle, append to both log files. `iteration-log.md` gets a detailed per-cycle entry; `audit-trail.md` gets a compact append-only entry.

**Write logs BEFORE returning results** to ensure diagnosis/proposals are recorded even if downstream operations fail. If log write fails, display content in terminal as warning but do not block.

### Anti-Patterns to Avoid

- **Re-running dataset-preparer:** Datasets already exist. Only experiment-runner and results-analyzer are needed for holdout re-test.
- **Full prompt replacement:** Only replace specific XML-tagged sections. Never replace the entire instructions content.
- **Embedding stop conditions:** Stop conditions belong in iterate.md (Phase 32). The prompt-editor does its job and returns.
- **Loading reference files:** prompt-editor delegates to deployer and experiment-runner which load their own references. No `<files_to_read>` needed beyond the evaluator types reference (not needed -- scores come from test-results.json).
- **Modifying deployer.md or experiment-runner.md:** Both already support the operations prompt-editor needs. No changes to existing subagents.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Experiment execution for holdout re-test | Custom API calls in prompt-editor | Delegate to experiment-runner.md (holdout mode) | experiment-runner already handles adaptive polling, retry, JSONL parsing |
| Score aggregation for holdout re-test | Inline statistics computation | Delegate to results-analyzer.md (holdout=true) | results-analyzer already handles Student's t, scale normalization, category slicing |
| Agent re-deployment | Direct API calls in prompt-editor | Delegate to deployer.md | deployer handles MCP-first/REST-fallback, idempotent create-or-update, verification |
| YAML frontmatter parsing | Regex-based parser | Split on `---` delimiters pattern | Standard YAML frontmatter: find first `---`, find second `---`, content between is YAML |
| XML section parsing | Full XML parser | String split on `<tag>`/`</tag>` | Agent prompts use simple non-nested XML; a parser is overkill |

**Key insight:** The prompt-editor's only direct operation is spec file editing. Everything else (re-deploy, re-test, score aggregation) is delegation to existing subagents. This keeps the file under ~200 lines.

## Common Pitfalls

### Pitfall 1: Corrupting YAML Frontmatter During Spec File Write

**What goes wrong:** Writing back the spec file loses YAML frontmatter fields (orqai_id, deployed_at) or corrupts the `---` delimiters.
**Why it happens:** Naive "find Instructions section and replace everything" approach doesn't account for frontmatter structure.
**How to avoid:** Parse file in 3 layers: (1) YAML frontmatter between `---` delimiters, (2) markdown sections, (3) XML content within `## Instructions`. Only modify layer 3. Write back all 3 layers intact.
**Warning signs:** Deployer fails on re-deploy because orqai_id is missing from frontmatter.

### Pitfall 2: Corrupting Non-Instruction Sections

**What goes wrong:** The `## Model`, `## Tools`, `## Context`, or `## Evaluators` sections are accidentally modified or deleted during spec file write.
**Why it happens:** Greedy regex/string replacement that doesn't precisely scope to the Instructions section.
**How to avoid:** Locate `## Instructions` section boundaries precisely. Only modify content within that section. Verify all other `##` sections are present and unchanged after write.
**Warning signs:** Agent loses its tools or model configuration after iteration.

### Pitfall 3: Re-Running Dataset-Preparer During Holdout Re-test

**What goes wrong:** Invoking the full test pipeline (dataset-preparer -> experiment-runner -> results-analyzer) instead of just experiment-runner -> results-analyzer. Creates duplicate datasets on Orq.ai.
**Why it happens:** Treating holdout re-test as a "mini test run" instead of a targeted experiment.
**How to avoid:** Only invoke experiment-runner (with holdout dataset_id from dataset-prep.json) and results-analyzer (with holdout=true). Never invoke dataset-preparer from prompt-editor.
**Warning signs:** New datasets appearing on Orq.ai platform during iteration. Rate limiting (429 errors) during re-test.

### Pitfall 4: Missing holdout_dataset_id in dataset-prep.json

**What goes wrong:** Older dataset-prep.json files may not have `holdout_dataset_id` per agent.
**Why it happens:** Schema evolution -- older runs used a different field structure.
**How to avoid:** Check for `holdout_dataset_id` presence. If missing, warn user: "Holdout dataset IDs not found. Re-run /orq-agent:test to generate updated results with per-split dataset IDs." Do NOT silently skip re-test.
**Warning signs:** experiment-runner invoked with null/undefined dataset_id.

### Pitfall 5: Regression Flags Not Surfaced

**What goes wrong:** A prompt change improves the bottleneck evaluator but degrades another evaluator. User doesn't notice the regression.
**Why it happens:** Only reporting the bottleneck delta without per-evaluator comparison.
**How to avoid:** Always display the full per-evaluator before/after table. Flag any evaluator with delta < 0 as a regression warning, even if the overall bottleneck improved.
**Warning signs:** User reports "scores got worse after iteration" but the iteration log shows improvement.

### Pitfall 6: Section Tag Not Found in Instructions

**What goes wrong:** A proposed change targets `<task_handling>` but the agent spec doesn't have that XML tag (e.g., unstructured instructions or different tag names).
**Why it happens:** failure-diagnoser proposes changes to logical sections, but the actual spec may not use standard XML tags.
**How to avoid:** Before applying each change, verify the target section tag exists in the instructions. If not found, log a warning and skip that change. Do NOT create malformed XML by inserting tags that don't match the existing structure.
**Warning signs:** Spec file has `<section>` tags that don't match the proposal's target section.

## Code Examples

### Example 1: Spec File Editing Flow

From iterator.md Phase 5:

```
1. Read {swarm_dir}/agents/{agent_key}.md
2. Split on '---' to isolate YAML frontmatter
3. Find '## Instructions' markdown heading
4. Find ```xml and ``` code block delimiters within Instructions
5. For each change in iteration-proposals.json:
   a. Find <section> opening tag in the XML content
   b. Find </section> closing tag
   c. Replace everything between tags with change.after
6. Reassemble: frontmatter + all markdown sections (with modified Instructions)
7. Write back to same file path
```

### Example 2: Holdout Re-test Delegation

From iterator.md Phase 7 and ARCHITECTURE.md:

```
1. Read dataset-prep.json for per-agent holdout_dataset_id
2. Build agent filter: only approved + successfully re-deployed agents
3. Invoke experiment-runner.md:
   - dataset_id = holdout_dataset_id (per agent)
   - agent_key = list of changed agents
   - evaluator_ids = from test-results.json evaluators[].orqai_evaluator_id
   - run_count = 3
4. Invoke results-analyzer.md:
   - holdout = true (reads experiment-raw-holdout.json)
5. Read holdout test-results for score comparison
```

### Example 3: Before/After Score Comparison Table

From iterator.md Phase 7 Step 7.3:

```markdown
### Re-Test Results: support-triage-agent

| Evaluator | Before | After | Delta | Status |
|-----------|--------|-------|-------|--------|
| instruction_following | 0.55 | 0.78 | +41.8% | improved |
| coherence | 0.82 | 0.80 | -2.4% | regressed |
| helpfulness | 0.70 | 0.75 | +7.1% | improved |

**Bottleneck:** 0.55 -> 0.78 (+41.8%)

Warning: coherence regressed from 0.82 to 0.80 on support-triage-agent.
```

### Example 4: Logging Format

From iterator.md Phase 9:

**iteration-log.md entry:**
```markdown
## Iteration 1 -- 2026-03-12T19:30:00Z

### Changes Applied

**Agent: support-triage-agent**
- Modified `<task_handling>`: Added priority classification heuristics
- Reason: instruction_following=0.55 (threshold 0.8)

### Re-Test Results (Holdout Split)

| Evaluator | Before | After | Delta |
|-----------|--------|-------|-------|
| instruction_following | 0.55 | 0.78 | +41.8% |

**Improvement:** 41.8% on bottleneck evaluator. Continuing.
```

**audit-trail.md entry:**
```markdown
## [2026-03-12T19:30:00Z] Iteration 1

- **Agent:** support-triage-agent
- **Changes proposed:** 1 (modified <task_handling>)
- **Approval:** Approved
- **Scores before:** instruction_following=0.55, coherence=0.82
- **Scores after:** instruction_following=0.78, coherence=0.80
- **Bottleneck improvement:** 0.55 -> 0.78 (+41.8%)
- **Stop condition:** None (continuing)
```

## State of the Art

| Old Approach (V2.0 iterator.md) | New Approach (V2.1 prompt-editor) | When Changed | Impact |
|----------------------------------|-----------------------------------|--------------|--------|
| Monolithic iterator.md (544 lines) combines diagnosis + application + re-deploy + re-test | Prompt-editor (~200 lines) handles only application + delegation + comparison | V2.1 restructure | 63% reduction in context load; clear separation from diagnosis |
| iterator.md calls tester.md for holdout re-test (loads full 771-line tester) | prompt-editor calls experiment-runner directly (loads only ~200-line subagent) | V2.1 decomposition | Peak context drops from ~2,715 to ~730 lines |
| Stop conditions embedded in same file as change application | Stop conditions separated into iterate.md (Phase 32) | V2.1 architecture pattern 4 | Subagent is stateless; command file manages cross-iteration state |

## Open Questions

1. **test-results.json update mechanism for stop condition evaluation**
   - What we know: iterate.md needs updated scores after each cycle to evaluate stop conditions (min_improvement, all_pass). ARCHITECTURE.md says prompt-editor "Updates test-results.json with holdout re-test scores."
   - What's unclear: Should prompt-editor overwrite the original test-results.json with holdout scores, or write a separate file? Overwriting would make stop condition evaluation simple but loses the original scores.
   - Recommendation: Write holdout results to a predictable location (either update test-results.json in-place or write test-results-holdout.json). The before/after comparison needs original scores preserved somewhere. Since the comparison is computed and displayed BEFORE any file update, store the "before" snapshot in memory, then update test-results.json for iterate.md to read. This matches ARCHITECTURE.md: "Updates test-results.json with holdout re-test scores."

2. **Evaluator ID passthrough to experiment-runner**
   - What we know: experiment-runner holdout mode accepts `evaluator_ids` to skip resolution. test-results.json has `evaluators[].orqai_evaluator_id`.
   - What's unclear: Whether prompt-editor should pass evaluator_ids or let experiment-runner re-resolve them.
   - Recommendation: Pass `evaluator_ids` from test-results.json to skip unnecessary GET /v2/evaluators call during iteration. This is faster and avoids rate limiting.

3. **Multiple agents with different holdout dataset IDs**
   - What we know: dataset-prep.json has per-agent holdout_dataset_id. experiment-runner processes agents sequentially.
   - What's unclear: Whether experiment-runner can handle per-agent different dataset_ids in holdout mode or expects a single dataset_id.
   - Recommendation: Invoke experiment-runner once per agent in holdout mode (each with its own dataset_id). This matches experiment-runner's sequential per-agent processing model.

## Sources

### Primary (HIGH confidence)

- `orq-agent/agents/iterator.md` -- Phases 5-7 and Phase 9 contain the exact logic to extract (spec file editing, deployer delegation, holdout re-test, score comparison, logging)
- `.planning/research/ARCHITECTURE.md` -- V2.1 architecture with prompt-editor responsibilities, data flow, anti-patterns (especially Anti-Pattern 4: no dataset-preparer during iteration)
- `orq-agent/agents/failure-diagnoser.md` -- Phase 30 implementation confirming iteration-proposals.json schema
- `orq-agent/agents/deployer.md` -- Existing subagent confirming idempotent create-or-update behavior
- `orq-agent/agents/experiment-runner.md` -- Holdout mode documentation confirming dataset_id input, experiment-raw-holdout.json output
- `orq-agent/agents/results-analyzer.md` -- Holdout mode parameter confirming experiment-raw-holdout.json input
- `orq-agent/templates/agent-spec.md` -- Agent spec structure (YAML frontmatter, markdown sections, XML instructions)
- `.planning/phases/30-failure-diagnoser/30-RESEARCH.md` -- Phase 30 research confirming iteration-proposals.json contract

### Secondary (MEDIUM confidence)

- `.planning/ROADMAP.md` -- Phase 31 description and dependency chain (Phase 30 + Phase 27)
- `orq-agent/templates/iteration-log.json` -- V3.0 logging schema template
- `orq-agent/commands/iterate.md` -- Current command file showing orchestration pattern (to be rewritten in Phase 32)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All input/output schemas confirmed by completed phases and existing subagent documentation
- Architecture: HIGH - Pattern directly extracted from working iterator.md with documented V2.1 architecture decisions
- Pitfalls: HIGH - All pitfalls derived from actual V2.0 implementation experience documented in iterator.md and ARCHITECTURE.md anti-patterns

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- internal project architecture, no external dependencies)
