---
phase: 80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted
plan: 04
subsystem: ui
tags: [kanban, triage, swarm-bridge, agent-runs, predicted, stage-3]

requires:
  - phase: 80-03
    provides: classifier writes status='predicted' to agent_runs and emits stage3/predicted.received

provides:
  - "agent_runs.status='predicted' rows render in the swarm Kanban 'progress' lane (was: silently 'backlog')"
  - "agent_runs.status='predicted' rows attribute to 'Stage 3 Dispatcher' in the agent column"

affects: [80-05, swarm-kanban, debtor-email]

tech-stack:
  added: []
  patterns:
    - "Two distinct status='predicted' meanings preserved: agent_runs (transient, → progress) vs automation_runs/Bulk Review (audit, → review)"

key-files:
  created: []
  modified:
    - web/lib/automations/swarm-bridge/sync.ts

key-decisions:
  - "predicted on agent_runs maps to 'progress' (sub-second transient), NOT 'review' — Bulk Review predicted-on-automation_runs continues to map to 'review' separately"
  - "predicted owner attributed to 'Stage 3 Dispatcher' for the agent column"

patterns-established:
  - "Separate triage helpers per source table: triageStageFromStatus consumes agent_runs.status; stageFromStatus consumes automation_runs.status. Same word ('predicted') legitimately means different things across the two helpers."

requirements-completed: []

duration: 4min
completed: 2026-05-08
---

# Phase 80 Plan 04: UI sync — predicted lane mapping Summary

**`agent_runs.status='predicted'` now surfaces in the Kanban 'progress' lane attributed to 'Stage 3 Dispatcher', closing the visibility gap exposed by the Phase 80 classifier/dispatcher split.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-08T14:48:55Z
- **Completed:** 2026-05-08T14:52:55Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `case "predicted":` to `triageStageFromStatus` (falls through into the existing `"progress"` arm group alongside `classifying` / `fetching_document` / `generating_body` / `creating_draft`).
- Added `case "predicted":` to `triageAgentFromStatus` returning `"Stage 3 Dispatcher"`.
- Bulk Review path (`stageFromStatus` → `case "predicted": return "review";` at line 35; `isReviewStatus` at line 64) intentionally untouched.
- `tsc --noEmit` clean for `swarm-bridge/sync.ts`. Pre-existing 27 vitest failures across 10 unrelated test files (review-loader / verdict-worker / pipeline-stages / etc.) confirmed identical before and after via `git stash` baseline check — no regressions introduced.

## Task Commits

1. **Task 1: Add 'predicted' case to triageStageFromStatus and triageAgentFromStatus** — `36f3c9d` (feat)

## Files Created/Modified
- `web/lib/automations/swarm-bridge/sync.ts` — Two new case arms in the `agent_runs.status` triage helpers (lines 223 + 253). Bulk Review `automation_runs.status` paths (lines 35, 64) verified unchanged.

## Diff Snippet

```ts
// triageStageFromStatus (line ~220)
switch (status) {
  case "classifying":
  case "predicted":
    // Phase 80: dispatcher transient — sub-second under healthy conditions; only routed_human_queue surfaces to review.
    // NB: This is agent_runs.status='predicted' (Stage 3 classifier emitted, dispatcher about to route).
    // The Bulk Review automation_runs.status='predicted' path (lines ~35, ~64) is intentionally separate.
  case "fetching_document":
  case "generating_body":
  case "creating_draft":
    return "progress";
  ...
}

// triageAgentFromStatus (line ~246)
switch (status) {
  case "classifying":
    return "Intent Agent";
  case "predicted":
    // Phase 80: Stage 3 dispatcher owns the row between classifier emit and handler dispatch.
    return "Stage 3 Dispatcher";
  ...
}
```

## Grep Evidence — Bulk Review Paths Untouched

```
$ grep -n 'case "predicted"' web/lib/automations/swarm-bridge/sync.ts
35:    case "predicted":     ← Bulk Review (stageFromStatus → "review") — UNCHANGED
223:    case "predicted":    ← NEW (triageStageFromStatus → "progress")
253:    case "predicted":    ← NEW (triageAgentFromStatus → "Stage 3 Dispatcher")
```

Line 35 still falls into `return "review";` (unchanged from HEAD). Line 64's `isReviewStatus` predicate (`status === "feedback" || status === "predicted"`) is unchanged. Bulk Review semantics preserved.

## Test Suite Status

```
Test Files  10 failed | 84 passed | 21 skipped (115)
      Tests  27 failed | 686 passed | 29 skipped | 95 todo (837)
```

Identical counts at HEAD (pre-edit baseline via `git stash`). All 27 failures are in unrelated files: `review/__tests__/safety-review-loader.test.ts` (`admin.schema is not a function` mock gap), `verdict-worker-dispatch.test.ts`, `classifier-invoice-copy-handler.test.ts`, `lib/pipeline/__tests__/stages.test.ts`, etc. Logged for separate cleanup; out of scope per executor SCOPE BOUNDARY rule.

## Decisions Made
None beyond the plan: mapping `predicted → progress` (not `review`) and `predicted → "Stage 3 Dispatcher"` were both pre-locked in 80-CONTEXT and 80-PATTERNS.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None.

## Next Phase Readiness
- Plan 80-05 (backfill stuck-classifying rows) can proceed; the UI mapping now correctly surfaces any `predicted` rows the backfill produces during transit.
- Plan 80-06 (RFC doc lock) can document the new lane semantics with confidence the code matches the doc.

## Self-Check: PASSED

- `web/lib/automations/swarm-bridge/sync.ts` — FOUND (modified)
- Commit `36f3c9d` — FOUND on `main`
- `grep -c 'case "predicted"' web/lib/automations/swarm-bridge/sync.ts` → 3 (1 pre-existing + 2 new)
- `npx tsc --noEmit` against `swarm-bridge/sync.ts` → clean

---
*Phase: 80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted*
*Completed: 2026-05-08*
