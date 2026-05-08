---
phase: 51-hero-components
plan: 03
subsystem: agent detail drawer (UI)
tags: [v7, ui, shadcn, radix, realtime]

requires:
  - phase: 48
    provides: V7 tokens
  - phase: 49
    provides: useRealtimeTable, SwarmRealtimeProvider
  - plan: 51-01
    provides: SubagentFleet click wiring
provides:
  - <DrawerProvider> + useDrawer hook
  - <AgentDetailDrawer> via shadcn Sheet
  - Cycle-time + trace-grouping utilities
  - <DrawerTimeline> subcomponent
  - Shell wiring: hero components replace placeholders
affects: [52, 53]

tech-stack:
  added: []
  patterns:
    - radix-sheet-themed-for-v7
    - derived-state-from-realtime-arrays
    - trace-id-grouping

key-files:
  created:
    - web/components/v7/drawer/drawer-context.tsx
    - web/components/v7/drawer/agent-detail-drawer.tsx
    - web/components/v7/drawer/drawer-timeline.tsx
    - web/lib/v7/drawer/cycle-time.ts
    - web/lib/v7/drawer/timeline.ts
    - supabase/fixtures/51-test-data.sql
  modified:
    - web/components/v7/swarm-layout-shell.tsx
    - web/app/(dashboard)/swarm/[swarmId]/page.tsx

key-decisions:
  - "Drawer uses shadcn Sheet (Radix Dialog) with a v7-drawer-content class override -- no new dependency"
  - "Workflow stage row is static (Intake/Run/Verify/Escalate/Done) matching the design reference; dynamic per-agent workflows deferred to V8+"
  - "Timeline grouping preserves event order per trace; last-5 cap is applied before grouping"
  - "Drawer open state lives in React Context, NOT the URL -- ephemeral by design"

patterns-established:
  - "web/components/v7/drawer/ as home for drawer UI"
  - "FleetBound wrapper resolves useDrawer inside the shell client boundary"

requirements-completed: [DRAW-01, DRAW-02, DRAW-03, DRAW-04]

duration: ~20min
completed: 2026-04-16
commit_range: 5d75108..175a818
---

# Phase 51 Plan 03 Summary

**Slide-out drawer + shell wiring + test fixture.**

## Accomplishments

- `DrawerContext` + `DrawerProvider` + `useDrawer` hook; no URL coupling.
- `cycle-time.ts` pairs thinking/done events by `span_id` and returns mean duration, with a `formatCycle` helper.
- `timeline.ts` groups the last N events for an agent by `trace_id`, preserving insertion order and bucketing null trace_ids under "unknown".
- `drawer-timeline.tsx` renders the groups with colored-dot rows (status-colored + halo) and monospace timestamps.
- `agent-detail-drawer.tsx` wraps shadcn Sheet with V7 styling. Reads the open agent from context, resolves the row + events via realtime, renders eyebrow + Cabinet 26px title + role + 2-col KPI grid (Active / Avg cycle) + mini-hierarchy panel + timeline panel + workflow tag row + skills section. Custom pill-shaped Close button overrides the default Sheet close.
- `swarm-layout-shell.tsx` now mounts `DrawerProvider` at the root, replaces the briefing+fleet placeholders with the real components, and drops `<AgentDetailDrawer />` as a sibling so the drawer can open regardless of where the card click originates.
- `page.tsx` forwards `swarmId` to the shell (required for the briefing server action).
- `supabase/fixtures/51-test-data.sql` seeds 3 agents + 12 events across 3 traces, idempotent.

## Verification

- `cd web && npx tsc --noEmit` — no new errors
- `cd web && npx vitest run lib/orqai/__tests__/trace-mapper.test.ts` — 8/8 pass (no regression)
- Manual verification (requires fixture apply + dev server): Phase 51 human verification protocol in 51-VERIFICATION.md

## Deviations from Plan

None. Plan executed as written.

## Next Phase Readiness

Phase 52 (live interactivity) can now:
- Replace the Kanban placeholder in the shell with its real component (shell already exposes the region)
- Replace the Terminal placeholder with its real component
- Read events from the same `useRealtimeTable("events")` feed the drawer already consumes
- Reuse `v7-pulse-eyebrow` keyframe for terminal "live" indicator
