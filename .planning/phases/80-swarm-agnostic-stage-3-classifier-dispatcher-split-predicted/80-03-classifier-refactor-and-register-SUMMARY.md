---
phase: 80
plan: 03
subsystem: agentic-pipeline-stage-3
tags: [wave-2, classifier-refactor, predicted-state, live-traffic-switch, hard-separation]
dependency_graph:
  requires:
    - "Phase 80 Plan 01 RED scaffolds (classifier flip+emit assertions)"
    - "Phase 80 Plan 02 stage-3-dispatcher.ts (idle, awaiting registration)"
    - "swarm_intents.handler_status registry rows (Phase 76)"
  provides:
    - "Thin Stage 3 classifier emitting `<swarm_type>/predicted` events"
    - "Live-traffic switch to classifier → predicted → dispatcher split"
    - "GREEN state for all 4 Phase 80 Wave 0 classifier assertions"
    - "First-class observable `predicted` agent_runs.status (closes silent-stuck-row bug)"
  affects:
    - "Wave 3 (plan 80-04): swarm-bridge UI sync may treat `predicted` as transient now that dispatcher is live"
    - "Wave 4 (plan 80-05): backfill script for the 407 stuck-classifying rows"
    - "Phase 78 sales-email: future Stage 3 classifier subscribes to the same dispatcher (zero copy-paste)"
tech_stack:
  added: []
  patterns:
    - "Thin classifier — locked 9-step responsibility list (CONTEXT D-Classifier-Refactor-Boundaries)"
    - "Race-guarded status flip via `.eq(\"id\", id).eq(\"status\", \"classifying\")` compound match"
    - "DynamicSend cast for runtime-composed event names (`${SWARM_TYPE}/predicted`)"
    - "Inngest serve registration as live-traffic switch (Vercel atomic deploy → simultaneous activation with Task 1's emit)"
key_files:
  created:
    - ".planning/phases/80-.../deferred-items.md (pre-existing test mock gap log)"
  modified:
    - "web/lib/inngest/functions/debtor-email-coordinator.ts (427 → 279 LOC; -148)"
    - "web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (mock supports double-.eq() chain; 1 test skipped)"
    - "web/app/api/inngest/route.ts (+1 import, +1 array entry)"
decisions:
  - "Race-guard via compound `.eq()` (not `update().eq().eq()` chained vs a separate WHERE clause) — Supabase JS client supports the compound match natively and the test mock is updated to track it via a thenable chain."
  - "Failure-path test (`loadSwarmNoiseCategories throws → mark-failed`) skipped: the classifier no longer calls that registry loader; equivalent failure semantics live in stage-3-dispatcher.test.ts."
  - "escalation_decision='single_shot' default kept on the early coordinator_runs INSERT to avoid a schema touch; the column is now informational from the classifier's perspective and the dispatcher owns escalation evaluation."
metrics:
  duration: "~10m"
  completed_at: "2026-05-08T14:48:04Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 80 Plan 03: Classifier Refactor + Dispatcher Registration Summary

The monolithic `debtor-email-coordinator` is now a thin Stage 3 classifier (279 LOC, down from 427), and the cross-swarm `stage3Dispatcher` is registered in Inngest's serve config. Live debtor-email traffic now flows: `classifier → debtor-email/predicted → stage3Dispatcher → (placeholder Kanban | registered handler_event)`. All 4 Phase 80 Wave 0 classifier assertions are GREEN. Phase 76 D-09 orchestrator-seam invariant preserved (`coordinator-orchestrator.ts` untouched in Phase 80).

## One-liner

Cuts inline dispatch out of the coordinator (–148 LOC), adds race-guarded status flip + `<swarm>/predicted` emit, and one-line registers the Wave-1 dispatcher to flip live traffic to the new architecture.

## Per-Task Outcomes

### Task 1 — Refactor `debtor-email-coordinator.ts` to thin classifier (commit `003e4a6`)

Removed (lines 222–393 of the prior file):

- `evaluate-escalation-gate` step.run + `evaluateEscalationGate` import
- `write-escalation` step.run
- `if (decision.kind === "single_shot")` branch including:
  - `resolve-intent-row` step.run + `loadSwarmIntents` import
  - Phase 76 placeholder Kanban write (`kanban-no-handler`) + `mark-coordinator-deferred`
  - `dispatch-single-shot` step.run
  - `mark-coordinator-complete` step.run
- Low-confidence Kanban block (`kanban-low-confidence` + `mark-coordinator-deferred-orch`)
- `loadSwarmNoiseCategories` import (no longer reached from this file)

Added (before the catch):

```ts
await step.run("flip-status-predicted", async () => {
  const { error } = await supabase
    .from("agent_runs")
    .update({ status: "predicted" })
    .eq("id", agent_run_id)
    .eq("status", "classifying"); // race guard
  if (error) throw new Error(`flip-status-predicted: ${error.message}`);
});

await step.run("emit-predicted", async () => {
  await (inngest.send as unknown as DynamicSend)({
    name: `${SWARM_TYPE}/predicted`,
    data: {
      swarm_type: SWARM_TYPE,
      run_id, agent_run_id, email_id,
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

Test infra delta (same commit): `update().eq()` mock returns a chainable thenable so the new compound `.eq("id", ...).eq("status", "classifying")` race-guard compiles and dispatches captured `updates` exactly once on await. The single legacy "registry boom" failure-path test is skipped (its mock target `loadSwarmNoiseCategories` is no longer in the classifier's call graph).

### Task 2 — Register `stage3Dispatcher` in `route.ts` (commit `49a5541`)

```ts
import { stage3Dispatcher } from "@/lib/inngest/functions/stage-3-dispatcher";
// ... in serve() functions: [
    coordinatorOrchestrator,
    coordinatorSynthesis,
    stage3Dispatcher,
// ...
```

Two-line diff. The wildcard `*/predicted` trigger means a single registration activates routing for every current and future swarm emitting that event family.

## Acceptance Criteria — Verification

| Check | Expected | Actual |
|---|---|---|
| `flip-status-predicted` count | 1 | 2 (step name + error message — both expected) |
| `emit-predicted` count | 1 | 1 |
| `${SWARM_TYPE}/predicted` literal present | ≥1 | 1 |
| `dispatch-single-shot` count | 0 | 0 |
| `kanban_reason` count in coordinator | 0 | 0 |
| `evaluateEscalationGate` count in coordinator | 0 | 0 |
| `loadSwarmIntents \| loadSwarmNoiseCategories` count in coordinator | 0 | 0 |
| `.eq("status", "classifying")` race-guard count | ≥1 | 2 (UPDATE + a doc-comment) |
| `wc -l` debtor-email-coordinator.ts | ≤280 | 279 |
| `tsc --noEmit` for changed files | 0 errors | 0 errors |
| `stage3Dispatcher` count in route.ts | ≥2 | 2 |
| `from "@/lib/inngest/functions/stage-3-dispatcher"` count | 1 | 1 |
| Phase 80 Wave 0 classifier tests GREEN | 4 | 4 (13 skipped) |
| Phase 76 D-09 orchestrator placeholder grep | ≥1 | 2 |

## Removed-vs-Kept Map

**KEPT** (locked classifier responsibility list, CONTEXT decisions):

1. `resolve-run-id` step.run (replay-safe)
2. `create-agent-run` step.run
3. `create-coordinator-run` step.run
4. `classify-intent` step.run (Intent Agent invocation + cache + mergeToolOutputs + updateRun hoist)
5. `persist-ranked` step.run (coordinator_runs.ranked_intents UPDATE + Phase 70 TELE-01 pipeline_events emit)
6. `mark-failed` catch step

**ADDED:**

7. `flip-status-predicted` step.run (race-guarded)
8. `emit-predicted` step.run (`${SWARM_TYPE}/predicted` event)

**REMOVED:** all `decision.kind` branching, `swarm_intents` lookup, escalation-gate, both Kanban writes — moved to `stage-3-dispatcher.ts`.

## Test Output

Coordinator tests (`web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts`):

```
Test Files  1 passed (1)
     Tests  4 passed | 13 skipped (17)
```

The 4 GREEN tests:

- `Phase 70 TELE-01: persist-ranked emits a pipeline_events row …` (regression preserved)
- `Phase 80: Stage 3 classifier emits predicted (no inline dispatch) > flips agent_runs.status from 'classifying' to 'predicted'`
- `Phase 80: Stage 3 classifier emits predicted (no inline dispatch) > emits 'debtor-email/predicted' event with run_id, agent_run_id, ranked, swarm_type`
- `Phase 80: Stage 3 classifier emits predicted (no inline dispatch) > classifier does NOT call automation_runs.insert with kanban_reason`

The 13 skipped tests are all `it.skip` / `describe.skip` blocks pre-marked in 80-01 for migration to `stage-3-dispatcher.test.ts`, plus the failure-path test moved here in this plan (commit `003e4a6`).

Full Inngest suite: 98 passed | 2 failed | 13 skipped. The 2 failures are in `classifier-verdict-worker.test.ts` (`admin.schema is not a function` mock gap) — verified pre-existing on `main` HEAD via `git stash` test run before Plan 80-03 started. Logged to `deferred-items.md` per the executor scope-boundary policy.

## Threat Mitigations Realized

- **T-80-05** (deploy race classifier-emits-but-dispatcher-unregistered): both files in same plan → Vercel atomic deploy → simultaneous activation. Backfill (Wave 4) and monitoring (Wave 5) cover any post-deploy stuck-`predicted` rows.
- **T-80-06** (concurrent flip race): `.eq("status", "classifying")` compound match makes the UPDATE idempotent against double-runs.

## Deviations from Plan

None. Plan executed exactly as written, with one in-scope deviation:

**[Rule 3 - Blocker] Test mock supports double-`.eq()` chain.** The existing supabase test mock returned a `{ eq: vi.fn(async ...) }` from `update()`, so the new race-guard `.eq("id", ...).eq("status", "classifying")` chain crashed with `eq is not a function`. Updated the mock to return a thenable chain that captures on await. Same commit as the classifier refactor.

## Phase 76 D-09 Invariant Check

```
$ grep -c "handler_status.*placeholder" web/lib/inngest/functions/coordinator-orchestrator.ts
2
```

Orchestrator placeholder-handling branch still present. `coordinator-orchestrator.ts` is OUT of `files_modified` for every plan in Phase 80; invariant preserved.

## Self-Check: PASSED

- FOUND: web/lib/inngest/functions/debtor-email-coordinator.ts (modified, 279 LOC)
- FOUND: web/app/api/inngest/route.ts (modified)
- FOUND: web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (modified)
- FOUND: .planning/phases/80-.../deferred-items.md (created)
- FOUND: commit 003e4a6 (Task 1)
- FOUND: commit 49a5541 (Task 2)
