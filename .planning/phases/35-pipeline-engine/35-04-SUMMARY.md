---
phase: 35-pipeline-engine
plan: 04
subsystem: ui
tags: [next.js, react, shadcn-tabs, run-list, run-card, global-runs, sidebar]

# Dependency graph
requires:
  - phase: 35-pipeline-engine
    provides: Pipeline database schema, server actions, run detail page, step status components
affects: []

provides:
  - RunCard component with status badge, step progress, agent count, timestamps, error display
  - Tabbed project detail page (Overview | Runs)
  - Global runs page showing all runs across projects
  - Sidebar Runs nav item pointing to global runs page

# Tech tracking
tech-stack:
  added: [shadcn-tabs]
  patterns: [tabbed layout with shadcn Tabs, relative time formatting without library, card-as-link pattern]

key-files:
  created:
    - web/components/run-card.tsx
    - web/app/(dashboard)/runs/page.tsx
  modified:
    - web/app/(dashboard)/projects/[id]/page.tsx
    - web/components/app-sidebar.tsx

key-decisions:
  - "Relative time formatting with simple inline function -- no date library needed for human-readable timestamps"
  - "Default tab set to 'runs' on project detail -- users primarily come here to see/start pipeline runs"

patterns-established:
  - "RunCard as reusable card-link component for pipeline run display"
  - "Tabbed page layout with shadcn Tabs for multi-section content"

requirements-completed: [FOUND-05]

# Metrics
duration: 4min
completed: 2026-03-22
---

# Phase 35 Plan 04: Run List UI Summary

**Run card component, tabbed project detail page, global runs page, and sidebar navigation update**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-22
- **Completed:** 2026-03-22
- **Tasks:** 1/2 (checkpoint deferred)
- **Files modified:** 4

## Accomplishments
- RunCard component with status badge (color-coded), step progress bar, agent count, relative timestamps, duration, and error display for failed runs
- Project detail page refactored to tabbed layout (Overview | Runs) using shadcn Tabs component
- Runs tab with project-scoped run list, "New Pipeline Run" button, and empty state
- Global runs page at /runs showing all runs across projects with project name labels
- Sidebar Runs nav item updated to point to /runs

## Task Commits

Each task was committed atomically:

1. **Task 1: Run card component, tabbed project detail, and global runs page** - `c59f390` (feat)
2. **Task 1 follow-up: Route Claude API calls through Orq.ai router** - `d109981` (refactor)

## Checkpoint Status

**Task 2 (end-to-end verification):** DEFERRED -- user will test pipeline flow manually in next session. All code is committed and TypeScript compiles cleanly.

## Files Created/Modified
- `web/components/run-card.tsx` - Reusable run card with status, progress, timestamps, and error display
- `web/app/(dashboard)/runs/page.tsx` - Global runs page across all projects
- `web/app/(dashboard)/projects/[id]/page.tsx` - Refactored to tabbed layout (Overview | Runs)
- `web/components/app-sidebar.tsx` - Sidebar Runs href updated to /runs

## Decisions Made
- Relative time formatting uses simple inline function rather than adding a date library
- Default tab is "runs" since users primarily visit project pages to see/manage pipeline runs

## Deviations from Plan

None - Task 1 executed as planned. Task 2 (checkpoint) deferred to next session.

## Issues Encountered
None.

## User Setup Required
End-to-end verification pending: Supabase + Inngest + Anthropic API key needed for manual testing.

## Next Phase Readiness
- Run list UI complete: project-scoped and global views ready
- Phase 36 (Dashboard & Graph) can build on polling pattern established in 35-03 and run list from 35-04
- Supabase Realtime will replace 5-second polling in Phase 36

## Self-Check: PASSED

All 4 key files verified present. Both task commits (c59f390, d109981) confirmed in git log.

---
*Phase: 35-pipeline-engine*
*Completed: 2026-03-22*
