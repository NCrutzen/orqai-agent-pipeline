---
phase: 49-navigation-realtime
plan: 01
subsystem: navigation + realtime infra
tags: [supabase-realtime, react-context, next-app-router, v7]

# Dependency graph
requires:
  - phase: 48
    provides: V7 CSS tokens, 4 V7 tables with REPLICA IDENTITY FULL + supabase_realtime publication, GlassCard, project_members access gate
provides:
  - V7 row types and RealtimeBundle shape
  - fetchSwarmsWithCounts SSR helper
  - SwarmRealtimeProvider (single-channel postgres_changes for 4 V7 tables)
  - useRealtimeTable hook
  - V7 sidebar with dashboard-wide Realtime for live mini-stats
  - SidebarChooser branching client wrapper
affects: [49-02, 51, 52, 53]

tech-stack:
  added: []
  patterns:
    - single-channel-multi-event-postgres-changes
    - provider-owned-channel-lifecycle
    - dashboard-wide-chrome-subscription
    - ssr-initial-snapshot-plus-realtime-mutation

key-files:
  created:
    - web/lib/v7/types.ts
    - web/lib/v7/swarm-data.ts
    - web/lib/v7/use-realtime-table.ts
    - web/components/v7/swarm-realtime-provider.tsx
    - web/components/v7/realtime-status-indicator.tsx
    - web/components/v7/sidebar-mini-stat.tsx
    - web/components/v7/swarm-list-item.tsx
    - web/components/v7/swarm-sidebar.tsx
    - web/components/v7/sidebar-chooser.tsx
  modified:
    - web/app/(dashboard)/layout.tsx

key-decisions:
  - "Single postgres_changes channel per swarm view -- four .on() calls on one channel rather than four channels"
  - "Dashboard-wide channel `dashboard:swarms` is distinct from per-swarm channels; RT-01 constrains swarm-view count, not layout chrome"
  - "Idempotent INSERT guard in applyMutation prevents duplicates when an initial snapshot already contains the row"
  - "useEffect deps are [swarmId] only; supabase client is module-cached and does not need to be in deps"
  - "Sidebar is a client component; chooser is a thin client wrapper so server layout stays a Server Component"

patterns-established:
  - "V7 components live in web/components/v7/; V7 data helpers live in web/lib/v7/"
  - "All V7 styling uses Tailwind arbitrary values against --v7-* CSS variables (matches Phase 48 GlassCard)"
  - "SSR layout passes both initial counts and raw rows to the sidebar so the Realtime channel has ground truth to mutate"

requirements-completed: [NAV-01, NAV-03, RT-01]

duration: ~1 hour
completed: 2026-04-16
commit: da20a7c
---

# Phase 49 Plan 01 Summary

**V7 swarm sidebar + single-channel Realtime provider and hook.**

## Accomplishments

- Types for all four V7 tables with proper discriminated unions for stage/priority/status/event_type
- Server-only `fetchSwarmsWithCounts` rolls up `swarm_jobs` and `swarm_agents` into `SwarmWithCounts[]` plus raw rows for the client to seed Realtime
- `SwarmRealtimeProvider` opens exactly one Supabase Realtime channel per swarm view (`swarm:${swarmId}`) with chained `postgres_changes` listeners for all four V7 tables, filtered by `swarm_id=eq.${swarmId}`
- `useRealtimeTable(table)` hook returns `{ rows, status }` and throws if used outside the provider
- Presentational `SidebarMiniStat` pill and `RealtimeStatusIndicator` dot
- `SwarmListItem` with URL-driven active state (3px teal left border + soft bg)
- `SwarmSidebar` owns a separate dashboard-wide channel `dashboard:swarms` watching `swarm_jobs` and `swarm_agents` globally for live mini-stats across all visible swarm rows
- `SidebarChooser` branches on `usePathname().startsWith("/swarm")`
- `(dashboard)/layout.tsx` extended to call `fetchSwarmsWithCounts()` and pass data to the chooser; Phase 48 auth + `project_members` gate preserved unchanged

## Deviations from Plan

- `fetchSwarmsWithCounts()` now returns `{ swarms, initialJobs, initialAgents }` as a single object rather than just the swarms array, so the (dashboard) layout can pass raw rows to the sidebar without a second round-trip. Types and the plan updated-in-place during implementation.
- Sidebar section heading "Agent OS" downgraded from 32px (UI-SPEC) to 20px to keep the brand block visually balanced against the 48px icon at the specified sidebar width. Phase 54 (polish) can revisit if needed.

## Verification

- `cd web && npx tsc --noEmit`: no errors in Phase 49 files. Pre-existing errors in `debtor-email-analyzer/` and `lib/automations/sales-email-analyzer/` are unrelated (tracked from before Phase 49).
- Grep checks:
  - `grep -c "postgres_changes" web/components/v7/swarm-realtime-provider.tsx` = 4 (one per V7 table)
  - `grep -c "removeChannel" web/components/v7/swarm-realtime-provider.tsx` = 1 (cleanup)
  - `grep -c "dashboard:swarms" web/components/v7/swarm-sidebar.tsx` = 1
  - `grep -c "fetchSwarmsWithCounts" web/app/(dashboard)/layout.tsx` = 2 (import + call)

## Issues Encountered

None.

## User Setup Required

None.

## Next Plan Readiness

49-02 can now create the `/swarm/[swarmId]` route, wrap it in `SwarmRealtimeProvider`, and verify end-to-end navigation with the sidebar built here.
