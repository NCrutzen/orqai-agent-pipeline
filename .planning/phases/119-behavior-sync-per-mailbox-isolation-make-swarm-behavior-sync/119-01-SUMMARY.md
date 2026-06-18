---
phase: 119-behavior-sync-per-mailbox-isolation
plan: 01
subsystem: infra
tags: [inngest, fan-out, outlook, delta-sync, concurrency, telemetry, replay-safety]

# Dependency graph
requires:
  - phase: 112.5
    provides: registry-driven delta-sync worker (load-enabled-swarms, per-folder delta body, 23505 idempotent inserts, replay-safe runId/tickIso)
  - phase: 118
    provides: multi-mailbox flatten (cfg.mailboxes ?? [cfg.mailbox]) + mailbox-suffixed step ids + TRACKED_INGEST_SOURCES widening
provides:
  - "swarm-behavior-sync split into a thin cron orchestrator (fan-out) + a per-mailbox worker (one mailbox per invocation)"
  - "new typed event swarm/behavior-sync.mailbox (one per enabled swarm x mailbox)"
  - "per-mailbox fault isolation: a throw on one mailbox is its own failed run, never aborts others"
  - "fair budgeting: concurrency [{key:event.data.mailbox,limit:1},{limit:4}] replaces concurrency:{limit:1}"
  - "visible per-mailbox failure telemetry (recordWorkerFailure + behavior_sync_mailbox_failed pipeline_events row)"
affects: [119-02, debtor-multi-mailbox-enablement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cron orchestrator fans out one event per work-unit; per-unit worker processes exactly one (true fault isolation + per-unit budget)"
    - "onFailure visible-telemetry sink reused across workers (recordWorkerFailure) + a unit-attributable best-effort row"

key-files:
  created: []
  modified:
    - web/lib/inngest/functions/swarm-behavior-sync.ts
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
    - docs/swarm-behavior-tracking.md

key-decisions:
  - "Thin cron orchestrator + separate per-mailbox worker (CONTEXT preferred fan-out path), not the single-function try/catch fallback"
  - "Global worker concurrency ceiling = 4 (Claude's discretion): parallel enough that mailboxes don't queue behind a heavy box, polite to Graph"
  - "Registered the new event in events.ts (not in the plan's files_modified) — required for the typed inngest.send/trigger to compile"

patterns-established:
  - "swarm/behavior-sync.mailbox fan-out event is the single producer/consumer contract between orchestrator and worker"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-06-17
---

# Phase 119 Plan 01: Fan-out per-mailbox isolation Summary

**`swarm-behavior-sync` split into a thin cron orchestrator that fans out one `swarm/behavior-sync.mailbox` event per enabled `(swarm × mailbox)` and a per-mailbox worker that processes exactly one mailbox per invocation — giving true fault isolation, fair per-mailbox budgeting, and visible `behavior_sync_mailbox_failed` telemetry.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-06-17
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Orchestrator (`swarmBehaviorSync`) keeps id `swarm/behavior-sync` + both triggers, drops `concurrency:{limit:1}`, runs the unchanged `load-enabled-swarms` flatten, and fans out one lean `{swarm_type, mailbox, weights}` event per EnabledSwarm via the inline `SendFn` cast. Touches no Graph; mints no runId/tickIso.
- Worker (`swarmBehaviorSyncMailbox`, id `swarm/behavior-sync.mailbox`) carries the de-looped per-mailbox body verbatim: four mailbox-suffixed step ids, runId/tickIso minted inside step.run, TRACKED_INGEST_SOURCES, the 23505 idempotent no-op inserts, bootstrap correlation, and skipped_moves telemetry all preserved. Concurrency `[{key:"event.data.mailbox",limit:1},{limit:4}]`.
- `onFailure` writes a visible terminal-failure record: `recordWorkerFailure({stage:1, stageLabel:"behavior-sync-mailbox"})` plus a guarded, mailbox-attributable `behavior_sync_mailbox_failed` `pipeline_events` row (decision_details `{swarm_type, mailbox, error_message}`); the handler can never throw.
- Worker registered in the Inngest serve route; runbook updated with the new topology + the 2026-06-16 regression it fixes.

## Task Commits

1. **Task 1: orchestrator + worker split** - `cbcbf11` (refactor)
2. **Task 2: register worker + visible failure telemetry + runbook** - `e8da875` (feat)

_Note: the worker `onFailure` sink (Task 2A) was authored together with the worker config and landed in the Task 1 commit; the Task 2 commit covers route registration (2B) and the runbook (2C)._

## Files Created/Modified
- `web/lib/inngest/functions/swarm-behavior-sync.ts` - Split into orchestrator + per-mailbox worker; onFailure telemetry sink
- `web/lib/inngest/events.ts` - Registered the typed `swarm/behavior-sync.mailbox` event (imports `SignalWeights`)
- `web/app/api/inngest/route.ts` - Import + register `swarmBehaviorSyncMailbox`
- `docs/swarm-behavior-tracking.md` - New cron→orchestrator→fan-out→per-mailbox-worker topology, visible failure telemetry, new concurrency model, regression rationale

## Decisions Made
- Chose the CONTEXT "preferred" fan-out path (thin orchestrator + separate worker) over the single-function try/catch fallback — gives independent retries/failures and removes the shared wall-clock budget.
- Global worker concurrency ceiling = 4 (documented inline as Claude's discretion).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Registered the new event type in events.ts**
- **Found during:** Task 1 (orchestrator + worker split)
- **Issue:** `events.ts` is the typed Inngest event registry (`EventSchemas.fromRecord<Events>`). The new `swarm/behavior-sync.mailbox` name is rejected by tsc on both `inngest.send` and the worker trigger until it is declared. `events.ts` was not in the plan's `files_modified`.
- **Fix:** Added the `swarm/behavior-sync.mailbox` entry (data `{swarm_type, mailbox, weights?}`) and imported `SignalWeights`.
- **Files modified:** web/lib/inngest/events.ts
- **Verification:** `cd web && tsc --noEmit` → 0 errors.
- **Committed in:** `cbcbf11` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary for the fan-out event to typecheck. No scope creep.

## Issues Encountered
- The worktree had no `node_modules` (fresh `git worktree add`). Symlinked `web/node_modules` from the main checkout (same repo, compatible deps) so `tsc` could run. The symlink is gitignored and not committed.

## User Setup Required
None - no external service configuration required. (Re-enabling debtor `behavior_tracking` on its 4 mailboxes remains a separate post-merge operator step, out of scope here.)

## Next Phase Readiness
- Ready for Plan 119-02: the orchestrator/worker split exposes `swarmBehaviorSync.handler` (orchestrator) and `swarmBehaviorSyncMailbox.handler` (worker) for the test retarget + regression suite.
- Expected transient red: the existing behavior-sync tests still call the (now-orchestrator) handler for per-mailbox assertions; 119-02 retargets them to the worker handler.

---
*Phase: 119-behavior-sync-per-mailbox-isolation*
*Completed: 2026-06-17*
