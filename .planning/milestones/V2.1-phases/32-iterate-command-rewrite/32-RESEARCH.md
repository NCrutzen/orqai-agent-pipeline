# Phase 32: Iterate Command Rewrite - Research

**Researched:** 2026-03-13
**Domain:** Command orchestration -- rewriting iterate.md to invoke failure-diagnoser + prompt-editor in a loop instead of monolithic iterator
**Confidence:** HIGH

## Summary

Phase 32 rewrites `iterate.md` to replace its Step 5 ("Invoke Iterator Subagent") with a loop that orchestrates `failure-diagnoser` -> `prompt-editor` in cycles, enforcing 5 stop conditions. The current iterate.md (Steps 1-4, 6-7) already handles capability gating, API key loading, MCP checks, swarm discovery, test-results pre-check, results display, and next-steps guidance. Only Step 5 changes.

Both subagent `.md` files are complete and locked (Phases 30-31). The failure-diagnoser reads test-results.json, diagnoses failures, collects HITL approval, and writes `iteration-proposals.json`. The prompt-editor reads iteration-proposals.json, applies changes, re-deploys, re-tests on holdout, computes before/after comparison, and updates test-results.json with new scores. The iterate command wraps these two in a loop and evaluates stop conditions between cycles.

This is structurally parallel to Phase 29 (test command rewrite), which replaced a monolithic tester with 3 sequential subagents. The key difference is the loop: iterate.md must track iteration count, elapsed time, and score deltas across cycles to enforce stop conditions. The old iterator.md (544 lines, 9 phases) defined these same 5 stop conditions (max_iterations=3, timeout=10min, min_improvement=5%, all_pass, user_declined) -- the rewrite preserves these exact values.

**Primary recommendation:** Rewrite iterate.md Step 5 to loop over failure-diagnoser -> prompt-editor cycles. Move stop condition logic from the old iterator.md into iterate.md itself. Preserve Steps 1-4 and Steps 6-7 with minimal changes.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LOOP-01 | Rewritten iterate.md orchestrates failure-diagnoser -> prompt-editor in loop with stop conditions | Architecture Pattern 1: Loop orchestration. failure-diagnoser writes iteration-proposals.json, prompt-editor reads it, applies changes, re-tests, updates test-results.json. Iterate command evaluates stop conditions after each cycle. |
| LOOP-02 | Iterate command enforces 5 stop conditions (max_iterations, timeout, min_improvement, all_pass, user_declined) | Architecture Pattern 2: Stop condition evaluation. All 5 conditions documented in old iterator.md Phase 8, with exact thresholds (3 iterations, 10 minutes, 5% improvement). |
| LOOP-03 | Iterate command preserves `--agent` flag and produces iteration-log.md + audit-trail.md | Current iterate.md Step 3 already parses `--agent`. Logging delegated to prompt-editor (Phase 6 of prompt-editor.md). iterate.md only needs to verify log files exist after final cycle. |
</phase_requirements>

## Standard Stack

### Core

No new libraries or tools. This phase modifies a single file (`orq-agent/commands/iterate.md`) that orchestrates existing subagents.

| Component | Location | Purpose | Why Standard |
|-----------|----------|---------|--------------|
| iterate.md | `orq-agent/commands/iterate.md` | Command entry point | Existing command file being rewritten |
| failure-diagnoser.md | `orq-agent/agents/failure-diagnoser.md` | Subagent 1: diagnose failures + collect HITL approval | Phase 30 output, LOCKED |
| prompt-editor.md | `orq-agent/agents/prompt-editor.md` | Subagent 2: apply changes, re-deploy, re-test, compare | Phase 31 output, LOCKED |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `iteration-proposals.json` | Handoff contract: failure-diagnoser -> prompt-editor | Written by failure-diagnoser Phase 5, read by prompt-editor Phase 1 |
| `test-results.json` | Loop state: updated by prompt-editor after each cycle | Read by iterate.md for stop condition evaluation (all_pass, min_improvement) |
| `iteration-log.md` | Per-cycle log | Written by prompt-editor Phase 6 (appended each cycle) |
| `audit-trail.md` | Append-only audit record | Written by prompt-editor Phase 6 (appended each cycle) |

### Alternatives Considered

None. The 2-subagent architecture is a locked V2.1 decision. No alternative orchestration patterns apply.

## Architecture Patterns

### Recommended Structure

The rewritten iterate.md follows the same 7-step structure as the current file. Only Step 5 changes:

```
Current iterate.md:
  Step 1: Capability Gate         (keep as-is)
  Step 1.5: Load API Key          (keep as-is)
  Step 2: MCP Availability        (keep as-is)
  Step 3: Locate Swarm            (keep as-is)
  Step 4: Pre-check Test Results  (keep as-is)
  Step 5: Invoke Iterator         (REPLACE with loop over failure-diagnoser + prompt-editor)
  Step 6: Display Results         (MODIFY to use loop state instead of expecting iterator output)
  Step 7: Next Steps              (keep as-is)
```

### Pattern 1: Loop Orchestration with Two Subagents (LOOP-01)

**What:** iterate.md wraps failure-diagnoser -> prompt-editor in a loop. Each cycle: diagnose, propose, approve, apply, re-deploy, re-test. Stop conditions checked between cycles.

**When to use:** This is the only pattern for this phase.

**Flow:**
```
iteration = 0
start_time = now()
initial_scores = snapshot from test-results.json (Step 4)
previous_scores = initial_scores

LOOP:
  iteration += 1

  // Pre-loop stop checks
  IF iteration > 3: STOP "max_iterations"
  IF elapsed > 10 minutes: STOP "timeout"

  // Step 5.1: Invoke failure-diagnoser
  Input: swarm_dir, iteration_number, agent_key_filter (if --agent)
  Output: {swarm_dir}/iteration-proposals.json

  // Step 5.2: Validate iteration-proposals.json
  Check: file exists, valid JSON, has per_agent array
  Check: at least 1 agent with approval "approved"
  IF all rejected: STOP "user_declined"

  // Step 5.3: Invoke prompt-editor
  Input: swarm_dir, iteration_number
  Output: updated test-results.json, appended iteration-log.md, appended audit-trail.md

  // Step 5.4: Evaluate post-cycle stop conditions
  Read updated test-results.json
  IF results.overall_pass == true: STOP "all_pass"

  Compute average bottleneck improvement across changed agents:
    FOR each changed agent:
      delta = (new_bottleneck - previous_bottleneck) / previous_bottleneck * 100
    average_delta = mean of deltas
  IF average_delta < 5%: STOP "min_improvement"

  previous_scores = current_scores
  GOTO LOOP
```

### Pattern 2: Stop Condition Evaluation (LOOP-02)

**What:** Five hard stop conditions evaluated at specific points in the loop. Two are checked before invoking subagents (max_iterations, timeout), one during failure-diagnoser output (user_declined), two after prompt-editor completes (all_pass, min_improvement).

**Evaluation order and timing:**

| Condition | When Evaluated | Threshold | Source |
|-----------|---------------|-----------|--------|
| max_iterations | Before each cycle starts | iteration > 3 | Loop counter |
| timeout | Before each cycle starts | elapsed > 10 minutes | Wall clock |
| user_declined | After failure-diagnoser, before prompt-editor | All agents rejected in iteration-proposals.json | iteration-proposals.json |
| all_pass | After prompt-editor completes | results.overall_pass == true | Updated test-results.json |
| min_improvement | After prompt-editor completes | average bottleneck delta < 5% | Comparison of previous vs current scores |

**Score tracking:** The iterate command must track `previous_scores` (bottleneck per agent) across iterations. Initial values come from test-results.json read in Step 4. After each cycle, prompt-editor updates test-results.json with holdout re-test scores -- iterate.md re-reads this file to compute deltas.

### Pattern 3: Agent-Key Filter Forwarding (LOOP-03)

**What:** The `--agent` flag parsed in Step 3 must be forwarded to failure-diagnoser.

**How each subagent consumes it:**
- **failure-diagnoser:** Filters to single agent when building failure priority list (Phase 1). Only that agent is diagnosed and proposed.
- **prompt-editor:** Does not need the filter -- it processes whatever is in iteration-proposals.json (pre-filtered by failure-diagnoser).

### Pattern 4: Logging Delegation

**What:** iterate.md delegates all per-cycle logging to prompt-editor (Phase 6). The iterate command itself does NOT write to iteration-log.md or audit-trail.md. It only verifies these files exist after the final cycle for the results display (Step 6).

**Why:** prompt-editor already writes iteration-log.md and audit-trail.md after each cycle. Duplicating this logic in iterate.md would create conflicting writes. The prompt-editor has the per-evaluator before/after data needed for meaningful log entries.

### Pattern 5: Intermediate Validation Gate

**What:** Between failure-diagnoser and prompt-editor, validate iteration-proposals.json.

**Checks:**
1. File exists at `{swarm_dir}/iteration-proposals.json`
2. Valid JSON
3. Has `per_agent` array
4. At least 1 agent with `approval: "approved"` (if zero, stop with `user_declined`)

**This parallels the validation gates in test.md (Phase 29 Pattern 2).**

### Anti-Patterns to Avoid

- **Embedding diagnosis/proposal logic in iterate.md:** All failure analysis belongs in failure-diagnoser. iterate.md is an orchestrator only.
- **Duplicating logging:** prompt-editor handles iteration-log.md and audit-trail.md. iterate.md does not write to these files.
- **Re-reading subagent .md files inside the loop:** Read failure-diagnoser.md and prompt-editor.md once before the loop starts. Subagent instructions do not change between iterations.
- **Checking stop conditions inside subagents:** Stop conditions are the iterate command's responsibility. Neither failure-diagnoser nor prompt-editor evaluate stop conditions (prompt-editor explicitly notes: "Do NOT embed stop conditions").
- **Cleaning iteration-proposals.json between cycles:** Each failure-diagnoser invocation overwrites it with the current iteration number. No cleanup needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON validation | Custom parsing logic | `jq . file.json` in bash | jq handles edge cases; same pattern as test.md |
| Score comparison | Custom diff logic in iterate.md | prompt-editor Phase 5 output | prompt-editor already computes and displays before/after deltas |
| Logging | Log writes in iterate.md | prompt-editor Phase 6 | prompt-editor has the detailed per-evaluator data needed for logs |
| HITL approval | Approval flow in iterate.md | failure-diagnoser Phase 4 | HITL is locked into the failure-diagnoser scope |
| XML parsing for prompts | Anything in iterate.md | prompt-editor Phase 2 | Section-level changes are prompt-editor's domain |

**Key insight:** iterate.md should be thin. It loops, invokes, validates, evaluates stop conditions, and displays final results. All domain logic (diagnosis, editing, re-deploy, re-test, logging) lives in the 2 subagents.

## Common Pitfalls

### Pitfall 1: Score Snapshot Timing
**What goes wrong:** iterate.md reads test-results.json for min_improvement check, but prompt-editor already overwrote it with holdout scores from the current cycle. The "before" scores are lost.
**Why it happens:** Both iterate.md and prompt-editor read/write the same test-results.json file.
**How to avoid:** iterate.md snapshots bottleneck scores from test-results.json BEFORE invoking the cycle (before failure-diagnoser runs). After prompt-editor completes, re-read test-results.json for "after" scores. This matches prompt-editor's own Phase 1.3 snapshot pattern.
**Warning signs:** min_improvement always shows 0% delta because "before" and "after" are the same updated file.

### Pitfall 2: user_declined Detection
**What goes wrong:** iterate.md invokes prompt-editor even though all agents were rejected, wasting a cycle.
**Why it happens:** iterate.md doesn't check iteration-proposals.json between the two subagent invocations.
**How to avoid:** After failure-diagnoser completes, validate iteration-proposals.json. If all agents have `approval: "rejected"`, stop with `user_declined` BEFORE invoking prompt-editor. Failure-diagnoser already writes rejected agents to the file.
**Warning signs:** prompt-editor displays "No approved changes. Skipping prompt editing." -- this should be caught by iterate.md first.

### Pitfall 3: Timeout Check Granularity
**What goes wrong:** A cycle starts at 9:30 elapsed, failure-diagnoser takes 2 minutes (user reviewing proposals), prompt-editor takes 3 minutes. Total 14:30 but timeout wasn't checked mid-cycle.
**Why it happens:** Timeout is only checked at loop start.
**How to avoid:** Check timeout before EACH subagent invocation (before failure-diagnoser AND before prompt-editor). This provides two checkpoints per cycle. Mid-subagent timeouts cannot be enforced (subagents run to completion), but at least the next subagent won't start.
**Warning signs:** Iterations running well past 10 minutes.

### Pitfall 4: iteration_number Off-By-One
**What goes wrong:** failure-diagnoser receives iteration_number=0 on first cycle, but iteration-log.md shows "Iteration 0" which looks wrong.
**Why it happens:** iteration counter initialized to 0 and incremented after subagent invocation instead of before.
**How to avoid:** Initialize iteration=0, increment to 1 BEFORE first cycle. Pass iteration_number=1 to failure-diagnoser on first cycle.
**Warning signs:** iteration-log.md and audit-trail.md show "Iteration 0".

### Pitfall 5: Old iterator.md Still Referenced
**What goes wrong:** iterate.md Step 5 still says "Read the iterator subagent instructions from `orq-agent/agents/iterator.md`" -- invoking the old monolith instead of the new subagents.
**Why it happens:** Incomplete rewrite -- the reference to iterator.md was not removed.
**How to avoid:** Remove ALL references to `iterator.md` from iterate.md. Replace with references to `failure-diagnoser.md` and `prompt-editor.md`. Search for "iterator" in the rewritten file to verify.
**Warning signs:** The old 9-phase monolithic pipeline runs instead of the 2-subagent loop.

### Pitfall 6: Stale iteration-proposals.json From Previous Run
**What goes wrong:** First cycle's prompt-editor reads iteration-proposals.json left over from a previous `/orq-agent:iterate` run if failure-diagnoser fails silently.
**Why it happens:** No cleanup of iteration artifacts before the loop starts.
**How to avoid:** Add cleanup before the loop: delete `iteration-proposals.json` from swarm directory. Do NOT delete `iteration-log.md` or `audit-trail.md` (these are append-only and may contain history from previous runs).
**Warning signs:** prompt-editor processes proposals from a previous iteration cycle.

## Code Examples

### Loop Structure with Stop Conditions

```markdown
## Step 5: Iteration Loop

Initialize loop state:
- `iteration = 0`
- `start_time = current timestamp`
- Snapshot initial bottleneck scores from test-results.json per agent

Clean stale artifacts:
\`\`\`bash
rm -f {swarm_dir}/iteration-proposals.json
\`\`\`

### Step 5.1: Loop Start

Increment iteration counter: `iteration += 1`

**Stop check -- max_iterations:** If `iteration > 3`, stop with reason `max_iterations`.
**Stop check -- timeout:** If elapsed time > 10 minutes, stop with reason `timeout`.

Display: `Iteration {iteration} of 3 (max)`

### Step 5.2: Invoke Failure Diagnoser

Read `orq-agent/agents/failure-diagnoser.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)
- **agent_key_filter** (if `--agent` specified)

### Step 5.3: Validate Iteration Proposals

Check `{swarm_dir}/iteration-proposals.json`:
1. File exists
2. Valid JSON
3. Has `per_agent` array
4. Count agents with `approval: "approved"`

**If zero approved agents:** Stop with reason `user_declined`.

**Stop check -- timeout:** If elapsed time > 10 minutes, stop with reason `timeout`.

### Step 5.4: Invoke Prompt Editor

Read `orq-agent/agents/prompt-editor.md`. Invoke with:
- **swarm_dir** (from Step 3)
- **iteration_number** (current iteration count)

### Step 5.5: Evaluate Post-Cycle Stop Conditions

Read updated `{swarm_dir}/test-results.json`.

**Stop check -- all_pass:** If `results.overall_pass == true`, stop with reason `all_pass`.

**Stop check -- min_improvement:**
For each changed agent (from iteration-proposals.json approved list):
  - Get new bottleneck score from updated test-results.json
  - Get previous bottleneck score from in-memory snapshot
  - Compute delta: `((new - previous) / previous) * 100`
Compute average delta across all changed agents.
If average delta < 5%: stop with reason `min_improvement`.

Update in-memory previous_scores with current scores.

### Step 5.6: Continue Loop

Go to Step 5.1.
```

### Results Display (Step 6 Modification)

```markdown
## Step 6: Display Iteration Results

After the loop exits, display summary using loop state:

\`\`\`
Iterations: {iteration}
Stopped: {stop_reason_display}

Agent              | Before | After  | Delta   | Status
-------------------|--------|--------|---------|--------
{agent-key}        | {initial_bottleneck} | {final_bottleneck} | {total_delta}%  | improved/unchanged/regressed
\`\`\`

**Before column:** From initial test-results.json snapshot (Step 4).
**After column:** From final test-results.json after last cycle.
**Delta:** Total improvement across all iterations, not just last cycle.

Files: iteration-log.md | audit-trail.md
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic iterator.md (544 lines, 9 phases) | 2 focused subagents + loop in iterate.md | V2.1 (Phases 30-31) | iterate.md becomes orchestrator with loop control |
| Iterator owns stop conditions, diagnosis, editing, logging | iterate.md owns stop conditions only; diagnosis in failure-diagnoser, editing in prompt-editor | V2.1 | Clear separation of concerns |
| 4 stop conditions in iterator.md | 5 stop conditions in iterate.md (added timeout) | V2.1 requirements | LOOP-02 adds explicit timeout condition |
| Iterator invokes tester.md for re-test | prompt-editor invokes experiment-runner + results-analyzer directly | V2.1 | Skips dataset-preparer on holdout re-test |

**Deprecated/outdated:**
- `iterator.md`: The monolithic agent file. After Phase 32, iterate.md no longer invokes iterator.md. The file should be archived or deleted.

## Open Questions

1. **Should iterator.md be deleted or archived?**
   - What we know: After rewrite, iterate.md invokes failure-diagnoser and prompt-editor directly. iterator.md is no longer referenced.
   - What's unclear: Whether any other command or pipeline references iterator.md.
   - Recommendation: Search for all references to `iterator.md` in the codebase. If none outside iterate.md, delete it as part of this phase.

2. **Should iteration-log.md and audit-trail.md be cleaned before first cycle?**
   - What we know: These are append-only files. prompt-editor appends to them each cycle.
   - What's unclear: Whether users expect a fresh log per `/orq-agent:iterate` invocation or a cumulative log across multiple invocations.
   - Recommendation: Do NOT clean these files. They serve as cumulative history. Each entry has a timestamp and iteration number for traceability.

3. **min_improvement computed on changed agents only or all failing agents?**
   - What we know: The old iterator.md computes average improvement across "changed agents" (approved + applied).
   - What's unclear: If an agent was rejected (skipped) in cycle 1 but still failing, should it lower the average?
   - Recommendation: Compute min_improvement only on agents that were changed in the current cycle (approved agents from iteration-proposals.json). Rejected/unchanged agents are excluded from the average.

## Sources

### Primary (HIGH confidence)
- `orq-agent/commands/iterate.md` -- Current iterate command implementation (read in full)
- `orq-agent/agents/iterator.md` -- Legacy monolithic iterator, 544 lines (read in full, stop conditions extracted)
- `orq-agent/agents/failure-diagnoser.md` -- Phase 30 subagent (read in full)
- `orq-agent/agents/prompt-editor.md` -- Phase 31 subagent (read in full)
- `orq-agent/commands/test.md` -- Reference for command-to-subagent orchestration pattern (Phase 29 precedent)
- `.planning/phases/29-test-command-rewrite/29-RESEARCH.md` -- Parallel rewrite research (read in full)
- `.planning/REQUIREMENTS.md` -- LOOP-01, LOOP-02, LOOP-03 requirement definitions
- `.planning/STATE.md` -- Project decisions, accumulated context from Phases 26-31

### Secondary (MEDIUM confidence)
- None needed. All information comes from project files.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new libraries; all components are existing project files
- Architecture: HIGH - Both subagent interfaces are locked and documented; loop pattern derived from old iterator.md Phase 8
- Pitfalls: HIGH - Derived from reading actual subagent contracts and identifying integration seams

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- no external dependencies to drift)
