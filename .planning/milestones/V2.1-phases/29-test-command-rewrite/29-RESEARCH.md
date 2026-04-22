# Phase 29: Test Command Rewrite - Research

**Researched:** 2026-03-12
**Domain:** Command orchestration -- rewriting test.md to invoke 3 subagents instead of 1 monolithic tester
**Confidence:** HIGH

## Summary

Phase 29 replaces the current `test.md` command's Step 5 ("Invoke Tester Subagent") with a 3-step orchestration: dataset-preparer -> experiment-runner -> results-analyzer. The current test.md already handles capability gating (Step 1), API key loading (Step 1.5), MCP checks (Step 2), swarm discovery (Step 3), deployment pre-check (Step 4), results display (Step 6), and next-steps guidance (Step 7). Only Step 5 changes.

All three subagent `.md` files are complete and locked (Phases 26-28). Each writes a JSON handoff contract (`dataset-prep.json`, `experiment-raw.json`, `test-results.json`) to the swarm output directory. The rewrite adds intermediate file validation between steps -- if an upstream subagent fails or writes malformed JSON, the test command aborts before invoking the next subagent.

The `--agent` flag already exists in test.md (Step 3). It must be forwarded to all three subagents as an agent-key filter. The deploy.md command pattern shows how scoped invocation works -- pass agent-key filter through to subagent context.

**Primary recommendation:** Rewrite test.md Step 5 to invoke dataset-preparer, experiment-runner, results-analyzer in sequence with JSON validation gates between each step. Preserve Steps 1-4 and Steps 6-7 mostly unchanged.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Rewritten test.md orchestrates dataset-preparer -> experiment-runner -> results-analyzer in sequence | Architecture Pattern 1: Sequential subagent orchestration with handoff contracts. All three subagent interfaces are documented. |
| TEST-02 | Test command preserves `--agent` flag for single-agent testing | Current test.md Step 3 already parses `--agent`. Forward agent-key filter to each subagent invocation. |
| TEST-03 | Test command checks intermediate JSON files between subagent steps and aborts on upstream errors | Architecture Pattern 2: Intermediate validation gates. Check file existence + JSON validity + required fields after each subagent. |
</phase_requirements>

## Standard Stack

### Core

No new libraries or tools. This phase modifies a single file (`orq-agent/commands/test.md`) that orchestrates existing subagents.

| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| test.md | `orq-agent/commands/test.md` | Command entry point | Existing command file being rewritten |
| dataset-preparer.md | `orq-agent/agents/dataset-preparer.md` | Subagent 1: dataset prep | Phase 26 output, LOCKED |
| experiment-runner.md | `orq-agent/agents/experiment-runner.md` | Subagent 2: experiment execution | Phase 27 output, LOCKED |
| results-analyzer.md | `orq-agent/agents/results-analyzer.md` | Subagent 3: results analysis | Phase 28 output, LOCKED |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `dataset-prep.json` | Handoff contract: preparer -> runner | Written by dataset-preparer Phase 8, read by experiment-runner Phase 1 |
| `experiment-raw.json` | Handoff contract: runner -> analyzer | Written by experiment-runner Phase 6, read by results-analyzer Phase 1 |
| `test-results.json` | Final output contract | Written by results-analyzer Phase 6, read by test.md Step 6 |

### Alternatives Considered

None. The 3-subagent architecture is a locked V2.1 decision. No alternative orchestration patterns apply.

## Architecture Patterns

### Recommended Structure

The rewritten test.md follows the same 7-step structure as the current file. Only Step 5 changes:

```
Current test.md:
  Step 1: Capability Gate         (keep as-is)
  Step 1.5: Load API Key          (keep as-is)
  Step 2: MCP Availability        (keep as-is)
  Step 3: Locate Swarm            (keep as-is)
  Step 4: Pre-check Deployment    (REMOVE -- dataset-preparer Phase 1 handles this)
  Step 5: Invoke Tester           (REPLACE with 3-subagent orchestration)
  Step 6: Display Results         (keep as-is, already reads test-results.json)
  Step 7: Next Steps              (keep as-is)
```

### Pattern 1: Sequential Subagent Orchestration

**What:** test.md invokes 3 subagents in sequence, passing the same swarm directory path and agent-key filter to each.

**When to use:** This is the only pattern for this phase.

**Flow:**
```
Step 5.1: Invoke dataset-preparer
  Input: swarm_dir, agent_key_filter, mcp_available, ORQ_API_KEY
  Output: {swarm_dir}/dataset-prep.json

Step 5.2: Validate dataset-prep.json (gate)
  Check: file exists, valid JSON, has "agents" key, at least 1 agent with status "ready"

Step 5.3: Invoke experiment-runner
  Input: swarm_dir, agent_key_filter, ORQ_API_KEY
  Output: {swarm_dir}/experiment-raw.json

Step 5.4: Validate experiment-raw.json (gate)
  Check: file exists, valid JSON, has "agents" key, at least 1 agent with status "complete" or "partial"

Step 5.5: Invoke results-analyzer
  Input: swarm_dir (reads both dataset-prep.json and experiment-raw.json from disk)
  Output: {swarm_dir}/test-results.json, {swarm_dir}/test-results.md

Step 5.6: Validate test-results.json (gate)
  Check: file exists, valid JSON, has "results.overall_pass" key
```

### Pattern 2: Intermediate Validation Gates (TEST-03)

**What:** Between each subagent invocation, test.md validates the output JSON file before proceeding.

**Validation checks per gate:**
1. **File exists** -- the expected JSON file is present in the swarm directory
2. **Valid JSON** -- `jq . file.json > /dev/null 2>&1` succeeds
3. **Required keys present** -- specific fields that downstream subagents depend on
4. **At least one actionable agent** -- not all agents are in error/skipped state

**Abort message format:**
```
ABORT: {step_name} failed -- {specific_reason}.

Expected file: {swarm_dir}/{filename}
{If file exists but invalid: "File exists but contains invalid JSON."}
{If file valid but no ready agents: "All agents are in error state. Check upstream logs."}

Fix the issue and re-run /orq-agent:test.
```

**Required keys per handoff file:**

| File | Required Keys | Downstream Consumer |
|------|--------------|---------------------|
| `dataset-prep.json` | `.agents`, at least 1 agent with `status: "ready"` | experiment-runner Phase 1 |
| `experiment-raw.json` | `.agents`, at least 1 agent with `status: "complete"` or `"partial"` | results-analyzer Phase 1 |
| `test-results.json` | `.results.overall_pass` (boolean) | test.md Step 6 |

### Pattern 3: Agent-Key Filter Forwarding (TEST-02)

**What:** The `--agent` flag parsed in Step 3 must be forwarded to all 3 subagents.

**How each subagent consumes it:**
- **dataset-preparer:** Phase 1 Step 2 -- "If agent-key filter provided: Only include the matching agent(s)"
- **experiment-runner:** Phase 1 Step 3 -- "If agent_key filter provided, only include matching agent(s)"
- **results-analyzer:** Does not filter directly -- it processes whatever agents are in experiment-raw.json (pre-filtered by upstream steps)

**Important:** The filter is applied at the source (dataset-preparer) and carried through. Experiment-runner also applies the filter when reading dataset-prep.json. Results-analyzer processes all agents present in experiment-raw.json without additional filtering -- the upstream filtering is sufficient.

### Pattern 4: Pre-check Consolidation

**What:** The current test.md Step 4 (Pre-check Deployment) duplicates logic that dataset-preparer Phase 1 already performs.

**Decision:** Remove Step 4 from test.md. Dataset-preparer Phase 1 verifies `orqai_id` for all agents and stops with a clear error if any agent is undeployed. The validation gate after Step 5.1 will catch this failure (dataset-prep.json will not be written).

**Why this is safe:** Dataset-preparer produces the same "not deployed" error message. The test command's validation gate will detect the missing dataset-prep.json and abort with context.

### Anti-Patterns to Avoid

- **Passing data between subagents in memory:** All handoff is via JSON files on disk. The test command does NOT read subagent output and pass it as input to the next subagent. Each subagent reads from disk independently.
- **Skipping validation gates:** Every intermediate file must be validated. The old monolithic tester handled errors internally; with 3 separate subagents, the orchestrator must verify outputs.
- **Re-implementing subagent logic in test.md:** The test command is an orchestrator only. It reads JSON outputs for display purposes (Step 6) but never recomputes scores, thresholds, or pass/fail.
- **Filtering agents in results-analyzer:** Only filter at dataset-preparer and experiment-runner. Results-analyzer processes what it receives.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON validation | Custom parsing logic | `jq . file.json` in bash | jq handles edge cases, escaping, nested structures |
| Deployment pre-check | Duplicate check in test.md | dataset-preparer Phase 1 | Subagent already handles this; avoid duplication |
| Results aggregation | Any statistics in test.md | results-analyzer output | All computation belongs in the subagent |
| Progress display | Per-example progress tracking | Per-subagent phase progress | Keep orchestrator simple; subagents report their own progress |

**Key insight:** test.md should be thin. It gates, invokes, validates, and displays. All domain logic lives in the 3 subagents.

## Common Pitfalls

### Pitfall 1: Duplicate Pre-check Creates Confusion
**What goes wrong:** If test.md Step 4 (deployment pre-check) and dataset-preparer Phase 1 both check deployment status, users may see two different error messages for the same problem.
**Why it happens:** The current test.md has its own pre-check because the old monolithic tester expected it.
**How to avoid:** Remove test.md Step 4. Let dataset-preparer be the single authority on deployment verification.
**Warning signs:** Two consecutive "not deployed" error messages during a single test run.

### Pitfall 2: Validation Gate Checks Wrong Fields
**What goes wrong:** Test command checks for fields that don't match the actual subagent output schema.
**Why it happens:** Subagent schemas evolved during Phases 26-28; test.md may reference outdated field names.
**How to avoid:** Validate against the exact schemas documented in the subagent `.md` files. Use the field names from the code examples in each subagent's output section.
**Warning signs:** Gate passes but downstream subagent fails with "field not found."

### Pitfall 3: Agent-Key Filter Not Forwarded Consistently
**What goes wrong:** User runs `/orq-agent:test --agent my-agent` but experiment-runner processes all agents because the filter wasn't passed.
**Why it happens:** Filter is parsed in Step 3 but not forwarded to all subagent invocations in Step 5.
**How to avoid:** Pass agent-key filter explicitly to dataset-preparer and experiment-runner. Results-analyzer inherits filtering from upstream JSON content.
**Warning signs:** Single-agent test takes as long as full-swarm test.

### Pitfall 4: MCP Flag Not Forwarded
**What goes wrong:** Dataset-preparer defaults to MCP-first but MCP was already detected as unavailable in test.md Step 2.
**Why it happens:** The `mcp_available` flag from Step 2 isn't passed to subagent context.
**How to avoid:** Forward `mcp_available` to dataset-preparer (which uses MCP for dataset creation). Experiment-runner is REST-only (LOCKED) so it doesn't need the flag. Results-analyzer makes no API calls.
**Warning signs:** Dataset-preparer retries MCP and times out despite test.md already knowing MCP is down.

### Pitfall 5: Step 6 Reads Old test-results.json
**What goes wrong:** Test command displays results from a previous run because results-analyzer failed silently.
**Why it happens:** test-results.json from a previous run exists in the swarm directory. Current run's results-analyzer fails but the old file persists.
**How to avoid:** The validation gate after Step 5.5 should check the `tested_at` timestamp in test-results.json is recent (within last 5 minutes). Or, delete stale test-results.json before invoking the pipeline.
**Warning signs:** test-results.json `tested_at` timestamp doesn't match current time.

## Code Examples

### Validation Gate Implementation

```markdown
## Step 5.2: Validate Dataset Preparation Output

After dataset-preparer completes, verify the handoff contract:

\`\`\`bash
# Check file exists
ls {swarm_dir}/dataset-prep.json 2>/dev/null || echo "FILE_NOT_FOUND"

# Check valid JSON
jq . {swarm_dir}/dataset-prep.json > /dev/null 2>&1 || echo "INVALID_JSON"

# Check at least one agent with status "ready"
READY_COUNT=$(jq '[.agents | to_entries[] | select(.value.status == "ready")] | length' {swarm_dir}/dataset-prep.json 2>/dev/null)
echo "READY_AGENTS: $READY_COUNT"
\`\`\`

**If FILE_NOT_FOUND:** Abort with message pointing to dataset-preparer failure.
**If INVALID_JSON:** Abort with message about malformed output.
**If READY_AGENTS == 0:** Abort with message that all agents were skipped or errored.
```

### Subagent Invocation Context

```markdown
## Step 5.1: Invoke Dataset Preparer

Read the dataset-preparer subagent instructions from `orq-agent/agents/dataset-preparer.md`. Invoke with:

- **Swarm directory path** (from Step 3)
- **Agent filter** (if `--agent agent-key` specified in the command)
- **MCP availability flag** (from Step 2)
- **ORQ_API_KEY** (from Step 1.5)

Display progress:
\`\`\`
Phase 1/3: Preparing datasets...
\`\`\`

## Step 5.3: Invoke Experiment Runner

Read the experiment-runner subagent instructions from `orq-agent/agents/experiment-runner.md`. Invoke with:

- **Swarm directory path** (from Step 3)
- **Agent filter** (if `--agent agent-key` specified in the command)
- **ORQ_API_KEY** (from Step 1.5)

Display progress:
\`\`\`
Phase 2/3: Running experiments...
\`\`\`

## Step 5.5: Invoke Results Analyzer

Read the results-analyzer subagent instructions from `orq-agent/agents/results-analyzer.md`. Invoke with:

- **Swarm directory path** (from Step 3)

Display progress:
\`\`\`
Phase 3/3: Analyzing results...
\`\`\`
```

### Abort Message Template

```
ABORT: {phase_name} failed.

Expected: {swarm_dir}/{expected_file}
{Specific reason: "File not found" | "Invalid JSON" | "No agents with status ready"}

The test pipeline stopped before {next_phase_name}.
Fix the upstream issue and re-run /orq-agent:test.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic tester.md (771 lines, 8 phases) | 3 focused subagents (dataset-preparer, experiment-runner, results-analyzer) | V2.1 (Phase 26-28) | test.md becomes orchestrator only |
| evaluatorq SDK for experiments | REST-only for experiments (LOCKED P27) | V2.1 | experiment-runner uses raw curl |
| In-memory state between phases | JSON handoff contracts on disk | V2.1 | Enables validation gates, debugging, and re-runs |

**Deprecated/outdated:**
- `tester.md`: The monolithic agent file. After Phase 29, test.md no longer invokes tester.md. The file can be archived or deleted.
- `@orq-ai/evaluatorq`: SDK removed entirely in V2.1. experiment-runner uses REST API.
- `@orq-ai/node`: Not installed. All operations use raw REST via curl.

## Open Questions

1. **Should tester.md be deleted or archived?**
   - What we know: After rewrite, test.md invokes the 3 subagents directly. tester.md is no longer referenced.
   - What's unclear: Whether any other command or pipeline references tester.md.
   - Recommendation: Search for all references to `tester.md` in the codebase. If none outside test.md, delete it as part of this phase.

2. **Should stale JSON files be cleaned before pipeline start?**
   - What we know: Previous test runs leave `dataset-prep.json`, `experiment-raw.json`, `test-results.json` in the swarm directory.
   - What's unclear: Whether dataset-preparer/experiment-runner overwrite or merge with existing files.
   - Recommendation: Add a cleanup step at the start of Step 5 that removes previous pipeline outputs. Each subagent writes a fresh file. This prevents Pitfall 5 (stale results).

3. **Progress display granularity**
   - What we know: Current test.md shows a progress bar per agent. Subagents print their own terminal output.
   - What's unclear: Whether the orchestrator should suppress subagent output and show only phase-level progress, or let subagent output flow through.
   - Recommendation: Let subagent output flow through (each subagent already has terminal summaries). Orchestrator adds phase-level headers only: "Phase 1/3: Preparing datasets...", "Phase 2/3: Running experiments...", "Phase 3/3: Analyzing results...".

## Sources

### Primary (HIGH confidence)
- `orq-agent/commands/test.md` -- Current test command implementation (read in full)
- `orq-agent/agents/dataset-preparer.md` -- Phase 26 subagent (read in full)
- `orq-agent/agents/experiment-runner.md` -- Phase 27 subagent (read in full)
- `orq-agent/agents/results-analyzer.md` -- Phase 28 subagent (read in full)
- `orq-agent/agents/tester.md` -- Legacy monolithic tester (read in full)
- `orq-agent/commands/deploy.md` -- Reference for command-to-subagent invocation pattern (read in full)
- `.planning/REQUIREMENTS.md` -- TEST-01, TEST-02, TEST-03 requirement definitions
- `.planning/STATE.md` -- Project decisions, accumulated context from Phases 26-28

### Secondary (MEDIUM confidence)
- None needed. All information comes from project files.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; all components are existing project files
- Architecture: HIGH - All 3 subagent interfaces are locked and documented; orchestration pattern follows deploy.md precedent
- Pitfalls: HIGH - Derived from reading actual subagent code and identifying integration seams

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependencies to drift)
