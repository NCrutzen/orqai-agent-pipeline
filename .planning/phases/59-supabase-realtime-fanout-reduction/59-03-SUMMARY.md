---
phase: 59-supabase-realtime-fanout-reduction
plan: 03
subsystem: infra
tags: [supabase, realtime, broadcast, debounce, vitest, performance]

# Dependency graph
requires:
  - phase: 59-supabase-realtime-fanout-reduction
    provides: "CONTEXT.md decision #3 — 500ms per-(channel, event-key) debounce on step/run broadcasts; chat path bypasses"
provides:
  - "In-module 500ms debounce inside web/lib/supabase/broadcast.ts (emit-the-latest coalescing)"
  - "Step updates keyed by run:{runId}:step-update:{stepName}; run updates keyed by runs:live:run-update:{runId}"
  - "Chat events (broadcastChatMessage, createChatBroadcaster.send) and broadcastHealthUpdate explicitly bypass — distinct semantic events"
  - "Vitest unit suite proving rapid coalescing, key independence, cross-run isolation, and chat-bypass"
affects: [phase-60-realtime-followup, pipeline-monitoring, dashboard-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-module debounce Map<key, {timer, payload, channel, event}> with setTimeout / clearTimeout"
    - "Public-API parity refactor: change internals only so caller sites need zero edits (drift-gate principle)"
    - "Vitest fake timers (vi.useFakeTimers + advanceTimersByTimeAsync) for debounce coverage"

key-files:
  created: []
  modified:
    - "web/lib/supabase/broadcast.ts"
    - "web/lib/supabase/__tests__/broadcast.test.ts"

key-decisions:
  - "Debounce machinery lives inside broadcast.ts (not at call sites) so all 22 callers in pipeline.ts and 4 in pipeline/conversation-action.ts + pipeline/discussion-action.ts stay untouched."
  - "Public Promise<void> contract resolves on schedule, not on emit — acceptable because no caller awaits delivery confirmation."
  - "Chat events route through original direct-send code paths verbatim; bypass is structural (different functions, never call debouncedSend) plus unit-test-enforced."
  - "Channel open/close moved inside flushDebounced so the channel is created once per emitted broadcast (not once per coalesced call), reducing realtime channel churn further."

patterns-established:
  - "Phase 59 debounce pattern: keyed by ${channelName}:${event}:${entity-key}, emit-the-latest, 500ms window. Reusable for any future high-frequency status broadcaster."
  - "Backward-compat refactor: keep export names + signatures + Promise<void> shape; verify by tsc --noEmit across web/ and zero diff in caller files."

requirements-completed: []

# Metrics
duration: ~12min
completed: 2026-04-26
---

# Phase 59 Plan 03: Pipeline broadcast debounce Summary

**500ms emit-the-latest debounce inside `web/lib/supabase/broadcast.ts` keyed by (channel, event-key); chat tokens and chat messages bypass; zero caller-site edits.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-26T10:39:00Z (approx)
- **Completed:** 2026-04-26T10:51:49Z
- **Tasks:** 2 (TDD RED + GREEN combined into one atomic commit per plan)
- **Files modified:** 2

## Accomplishments

- `broadcastStepUpdate` and `broadcastRunUpdate` now coalesce rapid same-key calls (waiting -> running -> complete within 100ms) into a single broadcast carrying the latest payload.
- `broadcastChatMessage`, `createChatBroadcaster.send`, and `broadcastHealthUpdate` are physically untouched and proven-non-debounced by Tests 4 and 5.
- 6 new debounce tests + 7 updated existing tests + 4 unchanged useBroadcast tests = 17 passing vitest cases.
- Backward-compat preserved: `pnpm tsc --noEmit` reports zero new errors in web/ (only 3 pre-existing errors in unrelated files: missing `@dnd-kit/utilities` import and `dotenv` imports — out of scope per plan guardrails).
- Zero diff in pipeline.ts, pipeline/conversation-action.ts, pipeline/discussion-action.ts (the drift gate).

## Task Commits

The plan defined two TDD tasks but specified ONE atomic commit referencing D-03 (success criteria line 314). Both files committed together:

1. **Task 1 + Task 2: RED + GREEN combined per plan instruction** — `e6fc407` (perf)
   - `perf(realtime): add 500ms debounce to step/run broadcasts (Phase 59 D-03)`
   - Tests written first, observed RED on the two coalescing assertions (Tests 1 and 6 saw 3 calls instead of 0 before the window), then GREEN after the broadcast.ts edit.

## Files Created/Modified

- `web/lib/supabase/broadcast.ts` — added module-local `debounceMap: Map<string, DebounceEntry>`, `debouncedSend()`, `flushDebounced()`. Rewrote `broadcastStepUpdate` and `broadcastRunUpdate` to schedule via `debouncedSend`. Left `broadcastChatMessage`, `createChatBroadcaster`, `broadcastHealthUpdate` byte-identical to their prior bodies; added bypass-marker comments per plan instruction.
- `web/lib/supabase/__tests__/broadcast.test.ts` — added 6 new tests (`broadcast debounce (Phase 59 D-03)` describe block) and updated existing `broadcastStepUpdate` / `broadcastRunUpdate` tests to use `vi.useFakeTimers()` + `advanceTimersByTimeAsync(600)` because the public API now resolves on schedule, not on emit. Existing useBroadcast hook tests preserved verbatim.

## Decisions Made

- **Channel reuse strategy: open per flush, not per call.** Original code called `createAdminClient()` and `admin.channel(...)` on every broadcast call; the debounce flush continues that pattern (one open/close per emitted broadcast). Net effect under load: fewer channel opens than before because coalesced calls don't open new channels.
- **Test strategy: rewrite-in-place, not parallel.** The existing test file already exercised broadcastStepUpdate / broadcastRunUpdate with synchronous-await semantics. After debouncing, those assertions would race the timer. Rather than adding a second test file, the existing tests were updated to advance fake timers — tests stay close to the public API contract, no duplicated mocking scaffolding.
- **No teardown of debounceMap between tests.** vi.useFakeTimers() ensures pending timers don't bleed across tests, and each test uses unique runIds so map entries can't collide. No reset hook needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pre-existing test file rewritten to remain green under new debounced API**
- **Found during:** Task 1 RED check
- **Issue:** `broadcast.test.ts` already existed with 7 tests asserting synchronous behavior (e.g., `expect(mockRemoveChannel).toHaveBeenCalledWith({ send: mockSend })` immediately after `await broadcastStepUpdate(...)`). Plan said "Create `web/lib/supabase/__tests__/broadcast.test.ts`" but the file was already there with passing tests that would break under debouncing.
- **Fix:** Merged: kept all existing tests, switched their setup to `vi.useFakeTimers()` and added `await vi.advanceTimersByTimeAsync(600)` before assertions, then added the 6 new debounce tests in a dedicated `describe` block. Preserved the four `useBroadcast` hook tests unchanged.
- **Files modified:** web/lib/supabase/__tests__/broadcast.test.ts
- **Verification:** All 17 tests pass.
- **Committed in:** e6fc407 (combined commit per plan)

**2. [Rule 3 - Blocking] `pnpm install` ran in worktree before tests could run**
- **Found during:** Task 1 RED check
- **Issue:** Fresh worktree had no `node_modules`; `pnpm exec vitest` reported "Command 'vitest' not found".
- **Fix:** Ran `pnpm install` in `web/`. Created an untracked `web/pnpm-lock.yaml` file. Did NOT commit the lockfile — it was intentionally not in scope, and committing it could mask a real lockfile-mismatch issue at the repo root.
- **Files modified:** none committed.
- **Verification:** vitest binary present at `web/node_modules/.bin/vitest`.
- **Committed in:** N/A (out-of-scope artifact left untracked).

---

**Total deviations:** 2 auto-fixed (Rule 3 - blocking, both during initial RED setup).
**Impact on plan:** No scope creep. Both deviations were operational (tooling + pre-existing test file) and did not change implementation surface.

## Issues Encountered

- Pre-existing tsc errors in unrelated files (`components/v7/kanban/kanban-job-card.tsx` missing `@dnd-kit/utilities`, `lib/debtor-email/icontroller-catchup.ts` and `lib/debtor-email/replay.ts` missing `dotenv`). Logged here for visibility; deliberately NOT fixed (out of scope per `<scope_guardrails>` and the executor's SCOPE BOUNDARY rule).

## TDD Gate Compliance

The plan defined two TDD tasks (RED + GREEN) but the success criteria mandated **one atomic commit referencing D-03**. The chosen execution path:

1. Wrote failing tests first (RED observed: Tests 1 and 6 failed with `expected 0 sends, got 3` before any production change).
2. Implemented the debounce.
3. Re-ran the suite — all 17 green.
4. Single combined commit `e6fc407` carries both files and the RED-then-GREEN narrative in its body.

This is consistent with the plan's `<success_criteria>` line "1 atomic commit on main referencing D-03" and the explicit instruction in Task 2's commit step that stages both `broadcast.ts` and `broadcast.test.ts` together.

## Verification Results

- 17/17 vitest tests pass: `pnpm exec vitest run lib/supabase/__tests__/broadcast.test.ts`
- `pnpm tsc --noEmit` clean for broadcast.ts and all caller files (3 pre-existing errors in unrelated files remain — out of scope).
- Zero diff in `web/lib/inngest/functions/pipeline.ts`, `web/lib/pipeline/conversation-action.ts`, `web/lib/pipeline/discussion-action.ts` (drift-gate confirmed by `git diff` against base).

## User Setup Required

None — internal refactor with zero external configuration.

## Next Phase Readiness

- Phase 59 plan 04 (snapshot-and-compare verification per CONTEXT.md decision #4) can proceed: 24h post-merge, take a Supabase realtime metric snapshot and project to monthly volume.
- Manual smoke recommended on staging before merge: trigger a pipeline run, verify run-detail page still updates within ≤500ms perceived latency, and confirm chat messages still stream without coalescing.

## Self-Check: PASSED

- web/lib/supabase/broadcast.ts: FOUND (modified in commit e6fc407)
- web/lib/supabase/__tests__/broadcast.test.ts: FOUND (modified in commit e6fc407)
- Commit e6fc407: FOUND on branch (`git log --oneline | grep e6fc407`)

---
*Phase: 59-supabase-realtime-fanout-reduction*
*Completed: 2026-04-26*
