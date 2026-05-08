---
phase: 80
plan: 03
type: execute
wave: 2
depends_on: ["80-02"]
files_modified:
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/app/api/inngest/route.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "debtor-email-coordinator.ts is now a thin classifier — no inline dispatch, no Kanban writes"
    - "Classifier flips agent_runs.status from 'classifying' to 'predicted' inside step.run with race guard"
    - "Classifier emits 'debtor-email/predicted' event with run_id, agent_run_id, ranked, swarm_type"
    - "Stage 3.5 dispatcher is registered in /api/inngest/route.ts and serves live traffic"
    - "Live debtor-email traffic flows: classifier → predicted event → dispatcher → kanban or handler_event"
    - "All Wave 0 classifier test assertions are GREEN"
    - "coordinator-orchestrator.ts is unchanged (Phase 76 D-09 invariant: orchestrator placeholder seam preserved)"
  artifacts:
    - path: "web/lib/inngest/functions/debtor-email-coordinator.ts"
      provides: "Thin Stage 3 classifier (post-refactor)"
      contains: "flip-status-predicted"
    - path: "web/app/api/inngest/route.ts"
      provides: "Inngest serve config including stage3Dispatcher"
      contains: "stage3Dispatcher"
  key_links:
    - from: "debtor-email-coordinator.ts"
      to: "Inngest event bus 'debtor-email/predicted'"
      via: "(inngest.send as unknown as DynamicSend)({ name: 'debtor-email/predicted', ... })"
      pattern: "debtor-email/predicted"
    - from: "debtor-email-coordinator.ts"
      to: "agent_runs.status='predicted'"
      via: "step.run('flip-status-predicted', ...) with .eq('status', 'classifying') race guard"
      pattern: "flip-status-predicted"
    - from: "/api/inngest/route.ts"
      to: "stage3Dispatcher Inngest function"
      via: "functions array entry"
      pattern: "stage3Dispatcher"
---

<objective>
Refactor `debtor-email-coordinator.ts` to a thin classifier (per CONTEXT.md `<decisions>` Classifier Refactor Boundaries) and register the new dispatcher in the Inngest serve config. This wave switches live traffic to the new architecture.

Purpose: After this plan ships:
- The classifier stops dispatching (lines 241–393 are removed).
- It flips `agent_runs.status` to `predicted` and emits `debtor-email/predicted`.
- The dispatcher (built in Wave 1, idle until now) starts handling routing.
- Live traffic flows through the new split for the first time.

Output: Refactored classifier (~200 LOC, down from ~423) + one-line registration in route.ts. Wave 0 classifier tests turn GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-CONTEXT.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-RESEARCH.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-PATTERNS.md
@web/lib/inngest/functions/debtor-email-coordinator.ts
@web/app/api/inngest/route.ts
@web/lib/inngest/functions/stage-3-dispatcher.ts
@CLAUDE.md

<interfaces>
<!-- Existing in debtor-email-coordinator.ts (KEEP) -->
- Imports + function shell (lines ~1-60)
- DynamicSend type alias (lines 45-48) — REUSE for emit-predicted
- SWARM_TYPE constant — KEEP (used in event name template)
- step.run("resolve-run-id", ...) (lines 90-95) — KEEP
- step.run("create-agent-run", ...) — KEEP
- step.run("create-coordinator-run", ...) — KEEP
- step.run("classify-intent", ...) — KEEP (Intent Agent invocation unchanged per CONTEXT)
- step.run("persist-ranked", ...) — KEEP
- mergeToolOutputs / hoist top-1 logic — KEEP

<!-- TO REMOVE (lines 222-393 approximately) -->
- evaluate-escalation-gate step
- write-escalation step
- if (decision.kind === "single_shot") branch (lines 241-348)
- Phase 76 placeholder Kanban write block (lines 264-308)
- dispatch-single-shot step (lines 312-325)
- low-confidence Kanban block (lines 357-393)
- loadSwarmIntents import (no longer used by classifier)
- loadSwarmNoiseCategories import (was used by old escalation-gate caller; gone)
- evaluateEscalationGate import (moved to dispatcher)

<!-- TO ADD (NEW step.run blocks at end of try, before return) -->
step.run("flip-status-predicted", ...)
step.run("emit-predicted", ...)
return { run_id, email_id, decision: "predicted" as const }

<!-- Existing in /api/inngest/route.ts -->
import statements + functions: [...] array passed to serve()
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Refactor debtor-email-coordinator.ts to thin classifier</name>
  <read_first>
    - web/lib/inngest/functions/debtor-email-coordinator.ts (full, ~423 lines) — line-by-line awareness of what to keep/remove
    - 80-PATTERNS.md §"MODIFIED web/lib/inngest/functions/debtor-email-coordinator.ts" — exact KEEP/REPLACE/REMOVE map
    - 80-CONTEXT.md §"Classifier Refactor Boundaries" — locked 9-step responsibility list
    - 80-RESEARCH.md §"File / function boundaries" table — refactored responsibility row
    - web/lib/inngest/functions/stage-3-dispatcher.ts (the file built in Wave 1) — verify event payload field names match what dispatcher destructures (swarm_type, run_id, agent_run_id, email_id, automation_run_id, budget_run_id, ranked, language, urgency, entity)
  </read_first>
  <files>web/lib/inngest/functions/debtor-email-coordinator.ts</files>
  <action>
    Surgical refactor. The classifier's locked responsibility list (CONTEXT.md `<decisions>`):
    1. Resolve agent_run_id (KEEP existing logic).
    2. Insert coordinator_runs row (KEEP).
    3. Invoke Intent Agent (KEEP).
    4. Write tool_outputs.intent_first_pass via mergeToolOutputs (KEEP).
    5. Hoist top-1 onto agent_runs back-compat columns (KEEP).
    6. Persist ranked_intents on coordinator_runs (KEEP).
    7. Flip agent_runs.status 'classifying' → 'predicted' (NEW).
    8. Emit `debtor-email/predicted` event (NEW).
    9. Return.

    Concrete edits:

    A. REMOVE imports (search top of file):
       - `loadSwarmIntents` from `@/lib/swarms/registry` — DELETE the import line if only the classifier used it; if other code in the file references it, only delete its usages.
       - `loadSwarmNoiseCategories` from `@/lib/swarms/registry` — DELETE.
       - `evaluateEscalationGate` from `@/lib/automations/debtor-email/coordinator/escalation-gate` — DELETE (moved to dispatcher).
       - Keep `mergeToolOutputs`, `createRun`, `updateRun`, `loadSwarmCategoryRows` if used by Intent-Agent invocation (verify; remove if unreferenced after the body cuts).

    B. REMOVE the entire block from the `evaluate-escalation-gate` step.run through the end of the low-confidence Kanban block. Concretely, delete from line ~222 through line ~393. The block to remove starts at the first `await step.run("evaluate-escalation-gate", ...)` call and ends just before the `} catch (err) {` of the existing try.

    C. After the last KEEP step (the `persist-ranked` / coordinator_runs.ranked_intents update — verify the exact step name during read-first), ADD these two new step.run blocks BEFORE the `return` and BEFORE the catch:

       ```ts
       // ---- Flip agent_runs.status: classifying → predicted ----
       await step.run("flip-status-predicted", async () => {
         const { error } = await supabase
           .from("agent_runs")
           .update({ status: "predicted" })
           .eq("id", agent_run_id)
           .eq("status", "classifying"); // race guard: only flip from classifying
         if (error) throw new Error(`flip-status-predicted: ${error.message}`);
       });

       // ---- Emit <swarm>/predicted event for the cross-swarm dispatcher ----
       await step.run("emit-predicted", async () => {
         await (inngest.send as unknown as DynamicSend)({
           name: `${SWARM_TYPE}/predicted`,
           data: {
             swarm_type: SWARM_TYPE,
             run_id,
             agent_run_id,
             email_id,
             automation_run_id: automation_run_id ?? null,
             budget_run_id: budget_run_id ?? null,
             ranked: output.ranked,
             language: output.language,
             urgency: output.urgency,
             entity,
           },
         });
       });

       return { run_id, email_id, decision: "predicted" as const };
       ```

       Adjust variable names to match what's actually in scope at that point in the file (`output`, `agent_run_id`, `run_id`, `email_id`, `automation_run_id`, `budget_run_id`, `entity`, `supabase`, `SWARM_TYPE`). If `entity` is not in scope where the existing code put it, hoist it earlier or fall back to `null`.

    D. The catch block stays. The catch references `automation_run_id` / `run_id` for failure marking — verify it still compiles after removals.

    E. Run `npx tsc --noEmit` after the edit to catch any dangling reference (e.g. variables declared only inside the removed block but referenced elsewhere).

    F. CONFIRM with grep: file no longer contains `dispatch-single-shot`, `kanban_reason`, `evaluateEscalationGate`, `loadSwarmIntents`, `loadSwarmNoiseCategories`. If any of those names appear in code COMMENTS, remove the comments too — they would mislead future readers.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | grep -E "debtor-email-coordinator" | head -20 ; npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts 2>&1 | tail -50</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "flip-status-predicted" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 1
    - `grep -c "emit-predicted" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 1
    - `grep -cE "\\\$\\{SWARM_TYPE\\}/predicted|debtor-email/predicted" web/lib/inngest/functions/debtor-email-coordinator.ts` returns >= 1
    - `grep -c "dispatch-single-shot" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 0
    - `grep -c "kanban_reason" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 0
    - `grep -c "evaluateEscalationGate" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 0
    - `grep -c "loadSwarmIntents\\|loadSwarmNoiseCategories" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 0
    - `grep -c '\\.eq("status", "classifying")' web/lib/inngest/functions/debtor-email-coordinator.ts` returns >= 1 (race guard present)
    - File line count is significantly reduced — `wc -l web/lib/inngest/functions/debtor-email-coordinator.ts` should report <= 280 (was ~423)
    - `cd web && npx tsc --noEmit 2>&1 | grep "debtor-email-coordinator"` returns no errors
    - vitest output: the new "flips agent_runs.status to 'predicted'" test is GREEN
    - vitest output: the "emits 'debtor-email/predicted'" test is GREEN
    - vitest output: the negative "classifier does NOT call automation_runs.insert with kanban_reason" test is GREEN
    - vitest output: any `it.skip` migrated tests remain skipped (not failing)
  </acceptance_criteria>
  <done>Classifier is thin (≤280 LOC); flip + emit steps present with race guard; all Wave 0 classifier assertions GREEN; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Register stage3Dispatcher in /api/inngest/route.ts (live-traffic switch)</name>
  <read_first>
    - web/app/api/inngest/route.ts (full) — locate the imports block and the functions array passed to serve()
    - 80-PATTERNS.md §"MODIFIED web/app/api/inngest/route.ts" — append-pattern
    - web/lib/inngest/functions/stage-3-dispatcher.ts — verify the export name is `stage3Dispatcher`
  </read_first>
  <files>web/app/api/inngest/route.ts</files>
  <action>
    1. Add an import for `stage3Dispatcher` from `@/lib/inngest/functions/stage-3-dispatcher`. Place it alongside other Inngest-function imports, alphabetical-ish or grouped by feature (look for the existing `coordinatorOrchestrator` / `coordinatorSynthesis` imports and place near them).

    2. Append `stage3Dispatcher` as a new entry in the `functions: [...]` array passed to `serve()`. Add it adjacent to `coordinatorOrchestrator` / `coordinatorSynthesis` (per PATTERNS.md). Comma-correct.

    3. NO other changes — no event re-routing, no env-flag gating. The wildcard `*/predicted` trigger means simply registering the function activates it for ALL swarms emitting that event family.

    4. Verify `npx tsc --noEmit` clean afterwards. Verify there are no duplicate registrations.
  </action>
  <verify>
    <automated>cd web && grep -c "stage3Dispatcher" app/api/inngest/route.ts && npx tsc --noEmit 2>&1 | grep -E "(route\\.ts|stage-3-dispatcher)" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "stage3Dispatcher" web/app/api/inngest/route.ts` returns >= 2 (import + array entry)
    - `grep -c "from \"@/lib/inngest/functions/stage-3-dispatcher\"" web/app/api/inngest/route.ts` returns 1
    - `cd web && npx tsc --noEmit 2>&1 | grep "route.ts"` returns no errors
    - `grep -E "stage3Dispatcher.*stage3Dispatcher" web/app/api/inngest/route.ts` returns 0 (no duplicate)
  </acceptance_criteria>
  <done>Dispatcher registered exactly once; tsc clean; live traffic now routes through the new split.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

- **Live traffic switch**: same Inngest event bus as before; no new external boundary.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-80-05 | Denial of Service | Classifier-emits-predicted but dispatcher unregistered (race during deploy) | mitigate | Both files ship in the same plan; Vercel atomic deploy ensures simultaneous activation. If a stuck-`predicted` row appears post-deploy, the backfill script (Wave 4) and the new monitoring queries (Wave 5 RFC) cover detection. |
| T-80-06 | Repudiation | classifier flip-status race with concurrent invocation | mitigate | `.eq("status", "classifying")` race guard on the UPDATE — only flips from classifying, idempotent against double-runs. |
</threat_model>

<verification>
- `cd web && npx vitest run lib/inngest/functions/__tests__/` — full Inngest test suite GREEN.
- `cd web && npx tsc --noEmit` — clean.
- `grep -rn "kanban_reason\\|dispatch-single-shot\\|evaluateEscalationGate" web/lib/inngest/functions/debtor-email-coordinator.ts` returns no hits.
- `grep -c stage3Dispatcher web/app/api/inngest/route.ts` returns >= 2.
- **Phase 76 D-09 invariant check (must_have #5 — orchestrator seam preserved):**
  - `grep -c "handler_status.*placeholder" web/lib/inngest/functions/coordinator-orchestrator.ts` returns >= 1 (placeholder-handling branch still exists)
  - `git diff --stat HEAD~3 web/lib/inngest/functions/coordinator-orchestrator.ts` shows zero lines changed in this phase (the file is OUT of `files_modified` for every plan in Phase 80; the grep is the floor, the git-diff is belt-and-suspenders — drop the git-diff if `HEAD~3` is too rigid for the local branch shape, the grep alone satisfies the invariant)
- After deploy to acceptance: emit a fixture `debtor-email/coordinator.requested` event; observe the chain: classifier → `debtor-email/predicted` → dispatcher → either Kanban or handler_event. (Live-smoke verification belongs to /gsd-verify-work; this PLAN's automated verification stops at unit tests.)
</verification>

<success_criteria>
- Classifier is thin and complies with the locked 9-step responsibility list.
- Live traffic now flows through `classifier → predicted event → dispatcher` for debtor-email.
- All test assertions added in Wave 0 are GREEN.
- No `agent_runs.status='classifying'` rows accrue past their LLM-call duration after this deploys.
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-03-SUMMARY.md` with: classifier line-count delta, removed-vs-kept map, route.ts diff, GREEN vitest output for both classifier and dispatcher test files.
</output>
