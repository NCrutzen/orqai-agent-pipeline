---
phase: 52-live-interactivity
plan: 01
subsystem: terminal event stream
tags: [react, useSyncExternalStore, ring-buffer, supabase-realtime, v7]

# Dependency graph
requires:
  - phase: 49
    provides: useRealtimeTable("events"), SwarmRealtimeProvider single channel
  - phase: 50
    provides: agent_events flowing into Supabase via Inngest cron
provides:
  - EventBufferStore (per-swarm, FIFO 500 max)
  - useEventBuffer hook (useSyncExternalStore)
  - Terminal formatters + chip color map
  - TerminalStream panel (auto-scroll + pause + clear + missed-events pill)
  - v7-blink keyframe + v7-terminal-shell utility class
affects: [52-02, 52-03, 53]

tech-stack:
  added: []
  patterns:
    - module-store-plus-useSyncExternalStore
    - ring-buffer-fifo-with-id-dedup
    - sticky-bottom-auto-scroll-with-missed-counter
    - bridge-realtime-to-imperative-store

key-files:
  created:
    - web/lib/v7/terminal/event-buffer.ts
    - web/lib/v7/terminal/use-event-buffer.ts
    - web/lib/v7/terminal/format.ts
    - web/components/v7/terminal/event-type-chip.tsx
    - web/components/v7/terminal/terminal-row.tsx
    - web/components/v7/terminal/terminal-stream.tsx
  modified:
    - web/app/globals.css (v7-blink + v7-terminal-shell)
    - web/components/v7/swarm-layout-shell.tsx (TerminalStream wired in)

key-decisions:
  - "Module store + useSyncExternalStore (not React state) so high-frequency event pushes don't cascade unrelated re-renders"
  - "Per-swarm store registry survives React remounts inside the same swarm view"
  - "FIFO eviction + id-set dedup makes pushMany idempotent against duplicate Realtime signals"
  - "Realtime feed is sorted asc before push so the buffer can append naturally and the terminal renders oldest-at-top"
  - "Auto-scroll suspends if user is >32px from bottom; missed-events delta surfaces as a sticky pill"
  - "Terminal shell uses fixed dark colors (#071018) intentionally, regardless of theme -- matches design reference and gives it a 'terminal' feel"

patterns-established:
  - "External-store hooks for high-frequency client-side data (avoid React state for streaming data)"
  - "All terminal rendering reads from useRealtimeTable -- never opens its own channel"

requirements-completed: [OBS-03, OBS-04, OBS-05]

duration: ~30min
completed: 2026-04-16
commit_range: 6137221..ea02aab
---

# Phase 52 Plan 01 Summary

**Live event stream with bounded ring buffer.**

## Accomplishments

- `EventBufferStore`: subscribe/getSnapshot/getServerSnapshot for `useSyncExternalStore`, plus pushMany/setPaused/clear. Capacity 500, FIFO eviction, id-set dedup. Per-swarm registry via module-scoped Map.
- `useEventBuffer(swarmId)` hook returns `{events, paused, setPaused, clear, pushMany}` -- delegates to the per-swarm store.
- Pure formatters in `terminal/format.ts`: `formatTime` (cached Intl.DateTimeFormat), `formatPayload` per event type, `EVENT_TYPE_CHIP` color map for 7 event types.
- `EventTypeChip`, `TerminalRow`, `TerminalStream` components. The stream subscribes to `useRealtimeTable("events")`, sorts ascending, bridges into the buffer, manages auto-scroll + missed-count, and renders the panel header (eyebrow + Pause/Resume + Clear buttons) + scroller (`v7-terminal-shell`) + sticky "N new events" pill.
- `globals.css` additions: `@keyframes v7-blink` (caret blink) + `.v7-terminal-shell` utility (fixed-dark scroller).
- `swarm-layout-shell.tsx` wires `<TerminalStream swarmId={swarmId} />` in place of the Phase 49 placeholder.

## Deviations from Plan
None.

## Verification
- `npx tsc --noEmit` -- no new errors.
- All grep checks pass (see `52-REVIEW.md`).
- 12 Phase 51-fixture events already in DB; manual browser walkthrough deferred.

## Issues Encountered
- Initial `EMPTY_SNAPSHOT` cast as `as AgentEvent[]` rejected by strict TS (readonly never[]). Fixed via explicit `as unknown as AgentEvent[]` with comment.

## Next Plan Readiness
52-02 can now wire the Kanban into the same shell row.
