---
phase: 35-pipeline-engine
plan: 03
subsystem: ui
tags: [next.js, react, server-actions, polling, pipeline-ui, shadcn-ui, tailwind]

# Dependency graph
requires:
  - phase: 35-pipeline-engine
    provides: Pipeline database schema (pipeline_runs, pipeline_steps), server actions (startPipeline, retryPipeline), pipeline stages
affects: [35-04]

provides:
  - New pipeline run form page with use case textarea, file upload, and start button
  - Run detail page with vertical step timeline, status badges, expandable logs, retry controls
  - StepStatusBadge reusable component for pipeline step status visualization
  - StepLogPanel reusable component for expandable step detail panels
  - 5-second polling for live run progress updates

# Tech tracking
tech-stack:
  added: []
  patterns: [vertical timeline with connector lines, 5-second polling via router.refresh(), server component + client wrapper pattern for live data]

key-files:
  created:
    - web/app/(dashboard)/projects/[id]/new-run/page.tsx
    - web/app/(dashboard)/projects/[id]/runs/[runId]/page.tsx
    - web/app/(dashboard)/projects/[id]/runs/[runId]/run-detail-client.tsx
    - web/components/step-status-badge.tsx
    - web/components/step-log-panel.tsx
  modified: []

key-decisions:
  - "Client-only new-run page using useActionState for form submission -- simpler than server component + client form split"
  - "Server component page + client wrapper pattern for run detail -- server fetches data, client handles polling and interactivity"
  - "5-second polling via router.refresh() for live updates -- simple, reliable, replaced by Supabase Realtime in Phase 36"

patterns-established:
  - "Vertical timeline with dot connectors and border-l lines for pipeline step visualization"
  - "StepStatusBadge as reusable status indicator across pipeline views"
  - "Server component + client wrapper: server page fetches data, passes to client component for interactivity and polling"

requirements-completed: [FOUND-03, FOUND-04, PIPE-03]

# Metrics
duration: 3min
completed: 2026-03-15
---

# Phase 35 Plan 03: Pipeline UI Summary

**New run form with use case textarea and file upload, run detail page with vertical step timeline, status badges, expandable logs, retry controls, and 5-second polling**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-15T16:11:28Z
- **Completed:** 2026-03-15T16:14:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- New pipeline run form page with textarea placeholder example, optional run name, drag-and-drop file upload area, and Start Pipeline button triggering server action
- Run detail page with vertical step timeline showing status badges, expandable log panels, retry controls for failed steps, and collapsible use case section
- StepStatusBadge and StepLogPanel as reusable components for pipeline visualization
- 5-second polling via router.refresh() while run is active (pending/running), auto-stops on completion

## Task Commits

Each task was committed atomically:

1. **Task 1: New pipeline run form page** - `eadcf19` (feat)
2. **Task 2: Run detail page with step progress and retry** - `dc9d5bf` (feat)

## Files Created/Modified
- `web/app/(dashboard)/projects/[id]/new-run/page.tsx` - New pipeline run form with textarea, file upload, and start button
- `web/app/(dashboard)/projects/[id]/runs/[runId]/page.tsx` - Run detail server component fetching run + steps from Supabase
- `web/app/(dashboard)/projects/[id]/runs/[runId]/run-detail-client.tsx` - Client wrapper with polling, retry, and step timeline rendering
- `web/components/step-status-badge.tsx` - Reusable status badge (pending/running/complete/failed/skipped) with icons and colors
- `web/components/step-log-panel.tsx` - Expandable step panel with log output, error display, and retry button

## Decisions Made
- Used client-only page (useActionState) for new-run form -- avoids complexity of separate server/client component split for a simple form
- Server component + client wrapper pattern for run detail -- server fetches data with RLS, client handles interactivity and polling
- 5-second polling via router.refresh() instead of client-side fetch -- leverages Next.js server component re-rendering for consistent data flow

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Pipeline UI is complete: users can create runs and monitor step-by-step progress
- Plan 35-04 can build the run list view within the project detail page
- StepStatusBadge and StepLogPanel components are ready for reuse in the run list

## Self-Check: PASSED

All 5 key files verified present. Both task commits (eadcf19, dc9d5bf) confirmed in git log.

---
*Phase: 35-pipeline-engine*
*Completed: 2026-03-15*
