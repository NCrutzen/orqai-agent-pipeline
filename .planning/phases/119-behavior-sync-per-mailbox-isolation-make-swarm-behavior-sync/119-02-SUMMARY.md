---
phase: 119-behavior-sync-per-mailbox-isolation
plan: 02
subsystem: testing
tags: [vitest, inngest, fan-out, fault-isolation, regression-test, mocks]

# Dependency graph
requires:
  - phase: 119-01
    provides: orchestrator/worker split exposing swarmBehaviorSync.handler (fan-out) + swarmBehaviorSyncMailbox.handler (per-mailbox worker) + the behavior_sync_mailbox_failed onFailure sink
provides:
  - "behavior-sync vitest suite retargeted to the orchestrator/worker split (14 existing tests green)"
  - "4 new regression tests encoding the 2026-06-16 starvation/abort regression (fan-out coverage, fault isolation, fair budgeting, step-id uniqueness)"
  - "Supabase test mock extended to capture pipeline_events inserts (onFailure telemetry assertions)"
affects: [debtor-multi-mailbox-enablement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Capture fan-out via the mocked inngest.send; drive per-unit behaviour through the worker handler directly"
    - "Per-mailbox fault isolation encoded as a must-not-regress test (forced throw on one mailbox, assert others complete)"

key-files:
  created: []
  modified:
    - web/lib/email-behavior/__tests__/behavior-sync.test.ts

key-decisions:
  - "Existing per-mailbox tests target getWorkerHandler(); enablement/fan-out tests target getOrchestratorHandler() and assert on captured inngest.send events"
  - "onFailure attribution verified by invoking worker __config.onFailure with a synthetic failed-wrapper event and asserting the behavior_sync_mailbox_failed pipeline_events row carries the mailbox"

patterns-established:
  - "fannedOutEvents() helper + runWorker(mailbox) helper for the orchestrator/worker test split"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-06-17
---

# Phase 119 Plan 02: Regression test suite Summary

**Behavior-sync vitest suite retargeted to the orchestrator/worker split (14 existing tests preserved) plus 4 new regression tests that encode the 2026-06-16 starvation/abort failure — fan-out coverage, per-mailbox fault isolation, fair budgeting, and step-id uniqueness — all 18 green.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-17
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `getOrchestratorHandler()` / `getWorkerHandler()` accessors, a `runWorker(mailbox)` helper, and a `fannedOutEvents()` capture over the mocked `inngest.send`.
- Retargeted the 10 per-mailbox behaviour tests (1-4, 6-10, 14) to the worker handler with `event.data = {swarm_type, mailbox}`; the worker returns the single PerSwarmCounts directly. No db-state assertion weakened.
- Reframed the orchestrator-level tests (5, 11, 13) to assert on the fanned-out `swarm/behavior-sync.mailbox` events, and test 12 to within-invocation step-id uniqueness for one worker call.
- Added the Phase 119 regression `describe` block: FAN-OUT-COVERAGE (3 pairs across 2 swarms, none dropped, no Graph), FAULT-ISOLATION (forced throw on LARGE rejects only its run; BB/CC complete; `behavior_sync_mailbox_failed` row attributable to the mailbox), BUDGET/NON-STARVATION (BB/CC complete independent of LARGE's folder count), STEP-ID-UNIQUENESS (heavy 12-folder invocation, all-unique ids + singular run/tick).
- Extended the table-aware Supabase mock to capture `pipeline_events` inserts.

## Task Commits

1. **Task 1: retarget existing suite to orchestrator/worker split** - `be9cb80` (test)
2. **Task 2: encode the regression (fan-out / fault isolation / budget / step-ids)** - `715a784` (test)

## Files Created/Modified
- `web/lib/email-behavior/__tests__/behavior-sync.test.ts` - Retargeted harness + new regression block; mock captures pipeline_events inserts

## Decisions Made
- Verified onFailure attribution by directly invoking the worker's `__config.onFailure` with a synthetic `inngest/function.failed` wrapper event (the mock harness calls `.handler` directly, so onFailure is config-level) and asserting the `behavior_sync_mailbox_failed` row carries `decision_details.mailbox`.

## Deviations from Plan
None - plan executed as written. (The fan-out-coverage test asserts no Graph call at the orchestrator level rather than threading a heavy folder tree through it, exactly as the plan's "the orchestrator does NOT call Graph, so a large folder tree is irrelevant here" note specifies.)

## Issues Encountered
None. The plan's predicted transient red (existing tests calling the now-orchestrator handler) was resolved by the Task 1 retarget.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 119 code + tests complete. The suite is the permanent guard that one mailbox can never again starve or abort the others.
- Post-merge operator step (out of scope): re-enable debtor `behavior_tracking_config={enabled:true, mailboxes:[4]}` and re-verify the per-mailbox observe.

---
*Phase: 119-behavior-sync-per-mailbox-isolation*
*Completed: 2026-06-17*
