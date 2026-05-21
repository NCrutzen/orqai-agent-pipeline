---
phase: 80
plan: 01
subsystem: agentic-pipeline-stage-3
tags: [tdd, red-scaffold, wave-0, classifier-dispatcher-split, predicted-status]
dependency_graph:
  requires:
    - "swarm_intents registry rows with handler_status (Phase 76 migration 20260507_phase76_swarm_intents_handler_status.sql)"
    - "agent_runs.status CHECK constraint accepting 'predicted' (already true per CONTEXT.md Resolved After Research #1)"
  provides:
    - "STATUS literal-union including 'predicted' for downstream TS consumers"
    - "RED test contracts for stage-3-dispatcher (Wave 1 / plan 80-02)"
    - "RED test contracts for classifier predicted-flip + emit (Wave 2 / plan 80-03)"
    - "RED test contracts for backfill-stuck-classifying-stage3 (Wave 4 / plan 80-05)"
  affects:
    - "All downstream waves: implementation must satisfy these failing assertions"
tech_stack:
  added: []
  patterns:
    - "vitest mock-step shell (copy of debtor-email-orchestrator.test.ts:1-117)"
    - "inline placeholderRow / registeredRow fixture helpers (no fixtures module per RESEARCH Q9)"
    - "describe.skip / it.skip with migration-comment to preserve git-history readability"
    - "@ts-expect-error on imports of not-yet-existing modules (deliberate RED via module-not-found)"
key_files:
  created:
    - "web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts"
    - "web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts"
  modified:
    - "web/lib/automations/debtor-email/coordinator/types.ts"
    - "web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts"
decisions:
  - "Skip (not delete) existing classifier inline-dispatch tests — preserves git-history readability and migration trail to stage-3-dispatcher.test.ts"
  - "Inline test fixtures (no separate fixtures module per RESEARCH Q9)"
  - "Single atomic dispatch step.run with idempotency precondition inside (consolidates Phase 76's split-step pattern per RESEARCH §Replay-safety Q2)"
  - "Mock node:readline/promises so prod typed-phrase prompt does not block tests; documents the two-factor gate contract (Plan 80-05 implements)"
metrics:
  duration: "~12m"
  completed_at: "2026-05-08T14:35:40Z"
  tasks_completed: 3
  files_changed: 4
---

# Phase 80 Plan 01: Test Scaffolds (RED) Summary

Wave 0 RED scaffolds for Phase 80 classifier/dispatcher split. Three single-concern commits land the `predicted` STATUS literal-union and three failing test files that define the contracts Waves 1-4 must satisfy.

## Per-Task Outcomes

### Task 1 — STATUS literal-union edit (commit `0af4689`)

- File: `web/lib/automations/debtor-email/coordinator/types.ts`
- Added `"predicted"` between `"classifying"` and `"routed_human_queue"` in the STATUS const array.
- `tsc --noEmit` clean across the entire `web/` project — no consumer breaks.
- DB CHECK constraint already accepts `predicted` (per 80-CONTEXT.md "Resolved After Research" #1); this is a pure TS catch-up.

### Task 2 — Dispatcher RED test scaffold (commit `52a3a8b`)

- File created: `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts`
- 5 RED test cases per 80-VALIDATION.md Wave 0:
  1. `placeholder routes to kanban + flips agent_runs.status='routed_human_queue'`
  2. `registered emits handler_event from swarm_intents (does NOT flip agent_runs.status)`
  3. `wildcard routes sales-email/predicted via event.name discrimination` (cross-swarm, must_have #6)
  4. `duplicate */predicted event for same agent_run_id is no-op (idempotency)`
  5. `replay does not duplicate kanban (status precondition gates entire step.run)`
- Inline `placeholderRow` + `registeredRow` helpers (per PATTERNS.md / RESEARCH Q9).
- Mocks: `@/lib/inngest/client`, `@/lib/swarms/registry`, `@/lib/automations/runs/emit`, `@/lib/supabase/admin`.
- RED state: vitest reports `Failed to resolve import "../stage-3-dispatcher"` — Wave 1 / plan 80-02 lands the implementation.

### Task 3 — Classifier predicted-flip + backfill RED scaffolds (commit `618a27e`)

**`web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts`** (modified):
- Skipped 6 existing `it(...)` cases + 2 `describe(...)` blocks that asserted inline classifier dispatch / kanban writes — all marked with comment `// Phase 80 Wave 2: dispatch moved to stage-3-dispatcher; assertions migrated to stage-3-dispatcher.test.ts`. Skipped tests count: 12 (visible in vitest output).
- Added `Phase 80: Stage 3 classifier emits predicted (no inline dispatch)` describe block with 3 RED cases:
  1. `flips agent_runs.status from 'classifying' to 'predicted' (flip-status-predicted step)` — asserts both the step name AND the UPDATE patch shape
  2. `emits 'debtor-email/predicted' event with run_id, agent_run_id, ranked, swarm_type`
  3. `classifier does NOT call automation_runs.insert with kanban_reason (dispatch moved to stage-3-dispatcher)`

**`web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts`** (new):
- 6 RED test cases per 80-VALIDATION.md Wave 0:
  1. `dry-run does NOT mutate DB (apply=false default)`
  2. `HAS_KANBAN bucket flips status to routed_human_queue (apply=true)`
  3. `NO_KANBAN bucket writes to JSON file (apply=true), does NOT flip`
  4. `MULTI_KANBAN bucket flagged via JSON (apply=true), does NOT flip`
  5. `status-precondition guard prevents racing dispatcher (.eq status classifying on UPDATE)`
  6. `prod gate: typed-phrase prompt is consulted under --confirm-prod`
- Mocks `@supabase/supabase-js` (chainable + thenable update), `node:fs/promises`, `node:readline/promises`, `@/lib/inngest/client`.
- RED state: vitest reports `Failed to resolve import "../backfill-stuck-classifying-stage3"` — Wave 4 / plan 80-05 lands the implementation.

## RED-State Confirmation (vitest tail)

```
 Test Files  3 failed (3)
      Tests  3 failed | 2 passed | 12 skipped (17)
   Start at  16:35:35
   Duration  1.08s
```

Breakdown of the 3 failures (RED — by design):
- `stage-3-dispatcher.test.ts` — `Failed to resolve import "../stage-3-dispatcher"` (module not yet implemented).
- `backfill-stuck-classifying-stage3.test.ts` — `Failed to resolve import "../backfill-stuck-classifying-stage3"` (module not yet implemented).
- `debtor-email-coordinator.test.ts` — 3 new assertion failures:
  - `Phase 80: ... flips agent_runs.status from 'classifying' to 'predicted'` — expected `flip-status-predicted` in step.run names (not yet wired in classifier).
  - `Phase 80: ... emits 'debtor-email/predicted' event` — expected `predictedEmit` to be defined (not yet wired).
  - `Phase 80: ... classifier does NOT call automation_runs.insert with kanban_reason` — expected `kanbanInsert` to be undefined; current classifier still writes the inline `low_confidence` kanban row.

The 2 passes inside `debtor-email-coordinator.test.ts` are pre-Phase-80 tests (Phase 70 TELE-01 pipeline_events row + the failure-path assertion) that survive the refactor unchanged.

## Deviations from Plan

None — plan executed exactly as written. The "3 single-concern commits" structure (revised by checker per the plan note at the top) was followed; each commit touches at most two files and ends with a clean verifiable state.

## Files Modified Per Task

| Task | Commit  | Files                                                                                              |
| ---- | ------- | -------------------------------------------------------------------------------------------------- |
| 1    | 0af4689 | web/lib/automations/debtor-email/coordinator/types.ts                                              |
| 2    | 52a3a8b | web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts (new)                               |
| 3    | 618a27e | web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts; web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts (new) |

## TDD Gate Compliance

This is a Wave 0 RED-only plan; the GREEN/REFACTOR gates land in subsequent plans (80-02 dispatcher impl, 80-03 classifier refactor, 80-05 backfill impl). The plan-type is `tdd` and the deliverable is the RED state — confirmed via vitest output above.

## Threat Flags

None. No new trust boundaries, no new external inputs, no new auth surface, no PII. Test files run only locally / in CI.

## Self-Check: PASSED

Verification:
- `web/lib/automations/debtor-email/coordinator/types.ts` — exists; contains `"predicted"`.
- `web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` — exists.
- `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — exists; contains `it.skip` (8 occurrences) + new Phase 80 describe block.
- `web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` — exists.
- Commits `0af4689`, `52a3a8b`, `618a27e` — present in `git log`.
- vitest output matches expected RED state (3 files failed, 2 passed pre-Phase-80 tests, 12 skipped from Wave 2 migration).
