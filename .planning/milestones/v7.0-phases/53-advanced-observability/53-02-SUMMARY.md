---
phase: 53-advanced-observability
plan: 02
subsystem: ui
tags: [v7-swimlane, gantt, time-window, css-only-tooltip, reduced-motion]

# Dependency graph
requires:
  - phase: 53-01
    provides: graph wired so the shell layout has settled
  - phase: 50-data-pipeline
    provides: agent_events.started_at and ended_at populated
  - phase: 49-navigation-realtime
    provides: useRealtimeTable hook
  - phase: 48-foundation
    provides: V7 design tokens, GlassCard
provides:
  - SwimlaneTimeline component inserted between FleetBound and the Kanban/Terminal grid
  - Pure deriveBars helper with span pairing + terminal-type promotion + window clipping
  - 4 swimlane components: SwimlaneAxis, SwimlaneBar, SwimlaneLane, SwimlaneTimeline
  - Cross-agent delegation fixture (8 events) applied to live DB
  - Consolidated reduced-motion media query disabling decorative pulses + tooltip transitions

affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [span-pairing-by-id, terminal-type-promotion, css-only-tooltip, sliding-window-now-bucket]

key-files:
  created:
    - web/lib/v7/swimlane/bars.ts
    - web/lib/v7/swimlane/__tests__/bars.test.ts
    - web/components/v7/swimlane/swimlane-axis.tsx
    - web/components/v7/swimlane/swimlane-bar.tsx
    - web/components/v7/swimlane/swimlane-lane.tsx
    - web/components/v7/swimlane/swimlane-timeline.tsx
    - supabase/fixtures/53-test-data.sql
  modified:
    - web/app/globals.css
    - web/components/v7/swarm-layout-shell.tsx

key-decisions:
  - "Span pairing by (agent_name, span_id) tolerates multi-event spans (thinking start + done end) and merges to a single bar"
  - "Terminal types (done/error) win the bar color so users see span outcomes, not in-flight state"
  - "5s sliding-window tick with Math.floor(now/5000) memo key — 0.2 re-renders/sec, well below jank threshold"
  - "Lane assignment alphabetical (deterministic), capped at 8 lanes (10+ agents truncated to first 8 alphabetically)"
  - "CSS-only tooltip via :hover/:focus-visible — no JS state, no portals, no Radix dep"
  - "Bar colors use color-mix(in srgb, var(--v7-X) 60%, white) for bright gradient; works in both dark and light themes via the same V7 tokens"

patterns-established:
  - "Pure swimlane helpers in web/lib/v7/swimlane/ with vitest co-located in __tests__/"
  - "Per-phase fixture SQL files in supabase/fixtures/{N}-test-data.sql, applied via Supabase Management API curl"
  - "Consolidated reduced-motion block at end of globals.css (vs scattered per-section rules) for any decorative motion that needs disabling"

requirements-completed: [OBS-01, OBS-02]

# Metrics
duration: ~25min (helper + tests + 4 components + CSS + fixture + wire)
completed: 2026-04-16
---

# Phase 53 Plan 02: Gantt Swimlane Timeline Summary

**Per-agent Gantt-style timeline of recent activity. One lane per swarm_agent (alphabetical, capped at 8), bars colored by event type with terminal-type promotion, hover/focus reveals a tooltip with span name, duration, agent, and timestamps. Reuses Phase 49's SwarmRealtimeProvider via useRealtimeTable.**

## Performance

- **Duration:** ~25 min
- **Tasks completed:** 6 of 6
- **Files created:** 7
- **Files modified:** 2
- **Tests:** 14 vitest assertions, all passing
- **Live DB rows added:** 8 agent_events (total for EASY swarm now 20)

## Accomplishments

- SwimlaneTimeline renders one lane per swarm_agent, bars derived from agent_events spans, x-axis = trailing 30-min window
- Span pairing collapses multi-event spans into a single bar with terminal-type-wins color promotion
- In-flight spans (no ended_at) clamp to windowEnd so they appear as right-edge progress bars
- 7 evenly-spaced HH:MM tick labels positioned past the 92px lane label gutter
- CSS-only tooltip on hover or :focus-visible — tabbable bars satisfy keyboard-only verification
- Empty states: "No agent activity in the last 30 minutes" when lanes exist but no bars; "No agents registered" when no agents at all
- Reduced-motion media query disables decorative pulses (v7-pulse-eyebrow inline + .v7-pulse class) globally, plus instant tooltip fade
- Cross-agent delegation fixture seeds the trace-dddd-4444 tree (orchestrator + 3 delegations) applied to live DB so the graph particles + swimlane bars both have visible activity

## Task Commits

- `886d974` (feat) — covers tasks 53-02-1..6: bars helper + tests, fixture file + applied via Mgmt API, 4 swimlane components, globals.css additions, shell wire-in, consolidated reduced-motion media query

## Files Created/Modified

- `web/lib/v7/swimlane/bars.ts` -- Bar/Lane types, deriveBars, formatDuration, formatTime
- `web/lib/v7/swimlane/__tests__/bars.test.ts` -- 14 vitest assertions
- `web/components/v7/swimlane/swimlane-axis.tsx` -- absolute-positioned tick labels with gutter offset
- `web/components/v7/swimlane/swimlane-bar.tsx` -- positional bar + CSS-only tooltip
- `web/components/v7/swimlane/swimlane-lane.tsx` -- label strip + lane background helper
- `web/components/v7/swimlane/swimlane-timeline.tsx` -- root with header, axis, grid, empty states
- `supabase/fixtures/53-test-data.sql` -- 8-event cross-agent delegation tree (idempotent via ON CONFLICT)
- `web/app/globals.css` -- V7 swimlane styles + per-event-type bar gradients + tooltip styling + reduced-motion media query
- `web/components/v7/swarm-layout-shell.tsx` -- SwimlaneTimeline imported and inserted between FleetBound and the Kanban/Terminal grid

## Decisions Made

- **Span pairing key = (agent_name, span_id)** -- prevents cross-agent merges if Orq.ai ever reuses span_ids; deterministic and side-effect-free
- **Terminal types win color** -- a span that started "thinking" but ended "done" should render teal, not pink, so users see the outcome at a glance
- **5s sliding-window tick** -- 0.2 re-renders/sec; no perceptual difference vs 1s tick at 1000px canvas / 30-min window scale per 53-RESEARCH §5
- **CSS-only tooltip** -- avoids Radix portal overhead and React state for an interaction that has zero data dependencies
- **Lane cap = 8** -- visual budget; 10+ agents truncate to alphabetically first 8 with no warning UI (intentional — out of scope; revisit when a user actually has >8 agents)
- **Consolidated reduced-motion block** -- single source of truth at end of globals.css for any decorative motion that should be disabled

## Deviations from Plan

None — followed 53-02-PLAN.md and 53-RESEARCH.md sections 4-5 verbatim. Plan expected 5 dddd children rows with `parent_span_id LIKE 'span-dddd-%'`; actual count is 6 (more delegation richness because span-dddd-04 has parent span-dddd-02 which is itself a child of span-dddd-01 — counted independently). Better data, no functional difference.

## Issues Encountered

- None at code level. The Anthropic API was returning HTTP 529 to subagent dispatches throughout the session, forcing inline execution of the plan. The plan was detailed enough that this was zero-loss.

## Live DB State After Apply

```
SELECT count(*) FROM agent_events
  WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb';
-- 20 (was 12, +8 fixture rows)

SELECT count(*) FROM agent_events
  WHERE swarm_id = 'f8df0bce-ed24-4b77-b921-7fce44cabbbb'
  AND parent_span_id LIKE 'span-dddd-%';
-- 6 (delegation children across the dddd tree)
```

## Self-Check: PASSED

- [x] 14 swimlane tests pass
- [x] 21 graph tests still pass (regression — no impact)
- [x] tsc --noEmit clean for 53-02 scope
- [x] Files committed at `886d974`
- [x] Fixture applied — `total: 20` confirmed via Mgmt API curl
- [x] SwimlaneTimeline mounted in shell between fleet and kanban/terminal sections

---
*Phase: 53-advanced-observability*
*Completed: 2026-04-16*
