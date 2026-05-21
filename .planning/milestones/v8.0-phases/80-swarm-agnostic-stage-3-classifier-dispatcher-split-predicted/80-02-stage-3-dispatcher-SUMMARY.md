---
phase: 80
plan: 02
subsystem: agentic-pipeline-stage-3
tags: [wave-1, stage-3-dispatcher, registry-bug-fix, hard-separation, cross-swarm]
dependency_graph:
  requires:
    - "Phase 80 Plan 01 RED scaffolds (test contracts the dispatcher must satisfy)"
    - "Phase 76 swarm_intents.handler_status registry rows (migration 20260507)"
    - "Phase 68 loadSwarmIntents() registry loader"
  provides:
    - "Stage 3.5 dispatcher Inngest function (web/lib/inngest/functions/stage-3-dispatcher.ts) — cross-swarm, wildcard `*/predicted` subscriber"
    - "Pure escalation gate reading SwarmIntentRow[] (hard-separation rule honored)"
    - "GREEN state for all 5 dispatcher tests in 80-01"
  affects:
    - "Wave 2 (plan 80-03): classifier refactor will emit `*/predicted` and the dispatcher route.ts registration completes the live-traffic switch"
tech_stack:
  added: []
  patterns:
    - "Inngest wildcard trigger `*/predicted` — fan-in from every swarm classifier"
    - "Asymmetric idempotency preconditions (placeholder via agent_runs.status, registered via coordinator_runs.completed_at)"
    - "Single atomic step.run for placeholder branch (consolidated per RESEARCH §Replay-safety Q2)"
    - "SendFn cast pattern (CLAUDE.md / Phase 65 dae6276) — never alias inngest.send"
    - "Reserved-future hook for Stage 3.5 orchestrator-worker fan-out (Phase 76 D-07 deferred)"
key_files:
  created:
    - "web/lib/inngest/functions/stage-3-dispatcher.ts (231 lines)"
  modified:
    - "web/lib/automations/debtor-email/coordinator/escalation-gate.ts (parameter type SwarmNoiseCategoryRow[] → SwarmIntentRow[])"
    - "web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts (buildCategory → buildIntent)"
    - "web/lib/inngest/functions/debtor-email-coordinator.ts (caller switched from loadSwarmNoiseCategories to loadSwarmIntents)"
    - "web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts (removed @ts-expect-error after Wave 1 import resolved)"
decisions:
  - "Caller-side swap to loadSwarmIntents applied here in Wave 1 (transient swap allowed by plan note) — keeps `tsc --noEmit` clean between Wave 1 and Wave 2; no live traffic change because dispatcher is unregistered."
  - "Registered branch idempotency uses coordinator_runs.completed_at (NOT agent_runs.status) because dispatcher does not flip agent_runs.status in this branch (handler owns it). Status-based sentinel would re-fire inngest.send on replay."
metrics:
  duration: "~4m"
  completed_at: "2026-05-08T14:42:00Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 80 Plan 02: Stage 3 Dispatcher Summary

Stage 3.5 dispatcher built and the escalation-gate registry-source bug fixed. All 5 RED dispatcher tests from Plan 80-01 turn GREEN. Live traffic still hits the monolithic coordinator — the dispatcher is intentionally unregistered until Wave 2.

## One-liner

Cross-swarm wildcard `*/predicted` subscriber that routes via `swarm_intents.handler_status` with asymmetric idempotency preconditions per branch.

## Per-Task Outcomes

### Task 1 — Swap escalation-gate to SwarmIntentRow[] (commit `8898913`)

- `web/lib/automations/debtor-email/coordinator/escalation-gate.ts`:
  - Import: `SwarmNoiseCategoryRow` → `SwarmIntentRow` (from `@/lib/swarms/types`).
  - Parameter: `categories: SwarmNoiseCategoryRow[]` → `intents: SwarmIntentRow[]`.
  - Lookup: `categories.find((c) => c.category_key === r.intent)` → `intents.find((i) => i.intent_key === r.intent)`.
  - Doc-comment updated to point at hard-separation rule (`docs/agentic-pipeline/stage-3-coordinator.md`) and migration `20260504b:94`.
- Test fixture (`escalation-gate.test.ts`): `buildCategory()` → `buildIntent()` returning `SwarmIntentRow`.
- Caller (`debtor-email-coordinator.ts`): `loadSwarmNoiseCategories` → `loadSwarmIntents` (transient caller-side swap applied here per plan permission — keeps tsc green between waves; no live behavior change because the function still feeds the same `evaluateEscalationGate` call).

Acceptance criteria:
- `grep -c SwarmIntentRow escalation-gate.ts` = 3 (≥2 ✓)
- `grep -c SwarmNoiseCategoryRow escalation-gate.ts` = 0 ✓
- `grep -c "intent_key === r.intent" escalation-gate.ts` = 1 ✓
- `grep -c "category_key === r.intent" escalation-gate.ts` = 0 ✓
- `tsc --noEmit | grep escalation-gate` = clean ✓
- All 5 escalation-gate tests pass ✓

### Task 2 — Implement stage-3-dispatcher.ts (commit `0ed9ca2`)

- New file `web/lib/inngest/functions/stage-3-dispatcher.ts` (231 lines).
- Inngest `createFunction` with:
  - id `automations/stage-3-dispatcher`
  - retries: 0
  - concurrency keyed on `event.data.run_id` (limit 1)
  - wildcard trigger `{ event: "*/predicted" }` (cast through `keyof Events`)
- Body:
  1. Extract typed payload + derive `swarm_type` from `data.swarm_type ?? eventName.split("/")[0]` (zero hardcoded swarm names).
  2. `step.run("load-intents")` → `loadSwarmIntents(admin, swarm_type)`.
  3. Locate `intentRow` for `top.intent`; throw if missing (fail closed).
  4. Apply `evaluateEscalationGate(output, intents)` — reserved-future hook for orchestrator fan-out, currently `void decision`.
  5. **Placeholder branch** — single atomic `step.run("dispatch-placeholder")`:
     - Read `agent_runs.status` precondition; early-return if ≠ `predicted` (idempotency).
     - INSERT `automation_runs` kanban row (`automation: '${swarm_type}-kanban'`, `result.kanban_reason: 'no_handler'`).
     - UPDATE `agent_runs.status` → `routed_human_queue` with `.eq('status', 'predicted')` race guard.
     - UPDATE `coordinator_runs.completed_at` + `completed_handlers: 0`.
     - `emitAutomationRunStale(admin, '${swarm_type}-kanban')`.
  6. **Registered branch** — `step.run("dispatch-registered")`:
     - Read `coordinator_runs.completed_at` precondition; early-return if set (idempotency sentinel — this branch does NOT flip `agent_runs.status`, so a status-based sentinel would re-fire `inngest.send` on replay).
     - `(inngest.send as unknown as SendFn)({ name: intentRow.handler_event, data: {...} })`.
     - UPDATE `coordinator_runs.completed_at` + `completed_handlers: 1` inside the same step.
     - **Does NOT** flip `agent_runs.status` (handler owns it per CONTEXT.md "Handler-owned statuses").
  7. Catch block: mark `automation_runs.status='failed'` + `coordinator_runs.completed_at` + `emitAutomationRunStale(admin, '${swarm_type}-review')`, then re-throw.
- Removed `@ts-expect-error` from the test import (the directive went unused after Wave 1 implementation landed).

**NOT registered in `web/app/api/inngest/route.ts`** — that's Wave 2's job, paired with the classifier refactor that emits `*/predicted` so live traffic flips atomically.

Acceptance criteria (all ✓):
- File exists, 231 lines (≥120)
- `stage3Dispatcher` exported = 1
- `'*/predicted'` literal = 1
- `loadSwarmIntents` references = 2
- `dispatch-placeholder` step name = 1
- `dispatch-registered` step name = 1
- `routed_human_queue` references = 2
- `kanban_reason.*no_handler` = 2
- Placeholder idempotency `row?.status !== "predicted"` = 1
- Registered idempotency: `coordinator_runs` SELECT on `completed_at` immediately precedes `inngest.send` (`grep -B2 'inngest.send' | grep coordinator_runs` = 1) ✓
- `coordRow?.completed_at` early-return = 1
- Hardcoded `SWARM_TYPE =` = 0
- `inngest.send` / `SendFn` cast usage = 2
- `tsc --noEmit | grep stage-3-dispatcher` = clean
- vitest: **5/5 dispatcher tests GREEN** (placeholder, registered, wildcard cross-swarm, idempotency, replay)

## vitest GREEN Output

```
RUN  v4.1.5 /Users/nickcrutzen/Developer/agent-workforce/web

Test Files  2 passed (2)
     Tests  10 passed (10)   ← 5 dispatcher + 5 escalation-gate
  Duration  774ms
```

The 5 dispatcher tests:
1. `placeholder routes to kanban + flips agent_runs.status='routed_human_queue'` ✓
2. `registered emits handler_event from swarm_intents (does NOT flip agent_runs.status)` ✓
3. `wildcard routes sales-email/predicted via event.name discrimination` ✓
4. `duplicate */predicted event for same agent_run_id is no-op (idempotency)` ✓
5. `replay does not duplicate kanban (status precondition gates entire step.run)` ✓

## Lines Added / Removed

| File | +/- |
|------|-----|
| `web/lib/inngest/functions/stage-3-dispatcher.ts` (new) | +231 / 0 |
| `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` | +14 / -7 |
| `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | +12 / -8 |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` | +6 / -2 |
| `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` | +3 / -1 |

Net: +266 / -18 across 5 files in 2 commits.

## Caller-Side Swap Applied Here vs Deferred (per plan task 1 step 5)

**Applied here in Wave 1.** The single caller `web/lib/inngest/functions/debtor-email-coordinator.ts:224` was switched from `loadSwarmNoiseCategories` → `loadSwarmIntents` in the same commit as the parameter swap. Rationale:
- Keeps `npx tsc --noEmit` clean between Wave 1 and Wave 2 (no transient type errors leaking into branch builds / CI).
- Does not change live behavior — the coordinator is still the unrouted Stage 3 path; only its registry source for `requires_orchestration` changed (from a wrong table to the right one). This matches the spirit of the "caller-side swap is one extra line" plan note.
- Wave 2 (plan 80-03) will delete this entire `evaluate-escalation-gate` step.run when the classifier refactors to emit `*/predicted` and the dispatcher takes over.

## Deviations from Plan

None — plan executed exactly as written. The "transient caller swap" optional path described in Task 1 step 5 was taken, and that choice is documented above.

## Threat Model Compliance

| Threat ID | Disposition | Mitigation Realized |
|-----------|-------------|---------------------|
| T-80-02 (Spoofing — wildcard `*/predicted`) | accept | Dispatcher fails closed via `if (!intentRow) throw` when `swarm_intents` lookup misses. |
| T-80-03 (Tampering — replay double-write) | mitigate | Asymmetric idempotency preconditions implemented: placeholder branch reads `agent_runs.status !== 'predicted'`; registered branch reads `coordinator_runs.completed_at`. Atomic single-step.run for placeholder branch. Verified by tests #4 (idempotency) and #5 (replay). |
| T-80-04 (Elevation — wrong escalation flag) | mitigate | Task 1 swapped to `SwarmIntentRow[]`; `requires_orchestration` now read from the correct registry table per hard-separation rule. |

## Threat Flags

None. No new trust boundaries, no new auth surface, no new external publishers — the dispatcher consumes Inngest events from inside our own VPC.

## TDD Gate Compliance

This plan converts Wave 0 RED tests to GREEN — gate sequence is the cross-plan pair:
- RED gate: commit `52a3a8b` (plan 80-01 task 2) — `test(80-01): scaffold stage-3-dispatcher RED tests`.
- GREEN gate: commit `0ed9ca2` (plan 80-02 task 2) — `feat(80-02): implement Stage 3.5 dispatcher`.

Both commits present in `git log`. No REFACTOR commit — implementation landed clean against the test contract.

## Self-Check: PASSED

Verification:
- `web/lib/inngest/functions/stage-3-dispatcher.ts` exists ✓ (231 lines)
- `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` exists ✓ (contains `SwarmIntentRow`, no `SwarmNoiseCategoryRow`)
- Commits `8898913`, `0ed9ca2` present in `git log` ✓
- vitest: 10 tests passing across dispatcher + escalation-gate suites ✓
- `tsc --noEmit | grep -E "stage-3-dispatcher|escalation-gate"` returns clean ✓
- All `evaluateEscalationGate(` callers compile against `SwarmIntentRow[]` ✓
