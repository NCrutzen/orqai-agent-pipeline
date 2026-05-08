---
phase: 49-navigation-realtime
plan: 02
subsystem: swarm route + layout shell
tags: [next-app-router, supabase-auth, react-context, v7]

# Dependency graph
requires:
  - plan: 49-01
    provides: SwarmRealtimeProvider, useRealtimeTable, RealtimeStatusIndicator, GlassCard
provides:
  - /swarm/[swarmId] route with per-swarm access gate
  - SwarmLayoutShell with placeholder regions for later phases
  - V7-styled 404 for inaccessible/nonexistent swarms
affects: [51, 52, 53]

tech-stack:
  added: []
  patterns:
    - per-route-access-gate-in-server-layout
    - provider-boundary-in-route-layout
    - phase-captioned-placeholder-regions

key-files:
  created:
    - web/app/(dashboard)/swarm/[swarmId]/layout.tsx
    - web/app/(dashboard)/swarm/[swarmId]/page.tsx
    - web/app/(dashboard)/swarm/[swarmId]/not-found.tsx
    - web/components/v7/swarm-layout-shell.tsx

key-decisions:
  - "Per-swarm access check runs in the route layout (server component) before the page mounts -- prevents flash of unauthorized content"
  - "SwarmRealtimeProvider placed in the route layout (not the page) so it unmounts cleanly on dynamic segment change"
  - "Placeholder regions use dashed borders on the fleet ghost cards so reviewers see the grid structure; briefing/kanban/terminal stay flat GlassCards"
  - "Single SwarmLayoutShell owns the full main grid -- later phases replace individual regions rather than rewriting the layout"

patterns-established:
  - "Route layouts own provider boundaries; pages focus on fetching view-specific data"
  - "PlaceholderRegion internal helper makes it trivial to preview the grid with consistent glass styling"

requirements-completed: [NAV-02, RT-01]

duration: ~30min
completed: 2026-04-16
commit: <next>
---

# Phase 49 Plan 02 Summary

**`/swarm/[swarmId]` route, layout shell, and 404.**

## Accomplishments

- `web/app/(dashboard)/swarm/[swarmId]/layout.tsx` gates per-swarm access via `project_members` count query; on miss, calls `notFound()`. On hit, wraps children in `SwarmRealtimeProvider`.
- `web/app/(dashboard)/swarm/[swarmId]/page.tsx` fetches swarm name/description and renders `<SwarmLayoutShell>`.
- `web/app/(dashboard)/swarm/[swarmId]/not-found.tsx` renders a V7-styled GlassCard with "Swarm not found" heading and a pill link back to the dashboard.
- `web/components/v7/swarm-layout-shell.tsx` renders the full V7 main grid: header with name + description + `RealtimeStatusIndicator`, briefing row (1.4fr/0.8fr), subagent fleet row (single GlassCard with 4 dashed ghost cards), workbench row (1.2fr/0.8fr for kanban + terminal). Reads channel status via `useRealtimeTable("jobs")`.

## Deviations from Plan

- Plan 49-02 described the fleet row as "a single outer PlaceholderRegion containing a 4-cell grid of empty inner divs". Implemented exactly that; the inner cells use dashed borders so the grid structure reads visually.
- Kanban and terminal placeholder captions moved from "Job board -- Phase 52" / "Event stream -- Phase 52" to the same strings but with an em dash (consistent with the rest of the shell).

## Verification

See `.planning/phases/49-navigation-realtime/49-VERIFICATION.md` for full status (13/13 must_haves passing, runtime browser verification deferred).

## Issues Encountered

None.

## User Setup Required

None.

## Next Phase Readiness

Phase 49 complete. Phase 50 (Data Pipeline) can write `agent_events`, and the V7 route will surface updates automatically through the provider -- no additional client wiring needed. Phase 51 (Hero Components) replaces the placeholder regions one-by-one.
