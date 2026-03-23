---
phase: 36-dashboard-graph
plan: 03
subsystem: ui
tags: [react-flow, swarm-graph, broadcast, sheet-drawer, run-detail, run-list-live, real-time]

# Dependency graph
requires:
  - phase: 36-dashboard-graph
    provides: "Broadcast infrastructure, useBroadcast hook, broadcastStepUpdate/broadcastRunUpdate (36-01)"
  - phase: 36-dashboard-graph
    provides: "SwarmGraph component, AgentNode, AnimatedEdge, AgentDetailPanel (36-02)"
  - phase: 36-dashboard-graph
    provides: "Wave 0 test stubs for run-list-live (36-00)"
  - phase: 35-pipeline-engine
    provides: "Run detail page, run list page, RunCard, StepLogPanel, PipelineRun/PipelineStep interfaces"
provides:
  - "Graph-primary run detail page with Broadcast subscription replacing 5-second polling"
  - "Collapsible Sheet timeline drawer with auto-scroll and jump-to-active-step"
  - "RunListLive client wrapper for live run list updates via Broadcast"
  - "Project page Swarm Graph tab showing latest successful run's graph"
  - "Global runs page using RunListLive for real-time updates"
affects: [37-hitl-approval]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Graph-primary layout with Sheet drawer for secondary content", "RunListLive client wrapper pattern (server fetches, client subscribes)", "Sheet side drawer for step timeline (400px right)"]

key-files:
  created:
    - "web/components/dashboard/run-list-live.tsx"
  modified:
    - "web/app/(dashboard)/projects/[id]/runs/[runId]/run-detail-client.tsx"
    - "web/app/(dashboard)/projects/[id]/runs/[runId]/page.tsx"
    - "web/app/(dashboard)/projects/[id]/page.tsx"
    - "web/app/(dashboard)/runs/page.tsx"
    - "web/components/dashboard/__tests__/run-list-live.test.ts"

key-decisions:
  - "Graph fills viewport as primary view, step timeline moved to Sheet drawer -- graph is the centerpiece of the real-time experience"
  - "RunListLive wraps server-rendered data with client-side Broadcast subscription -- preserves SSR initial load with live updates"

patterns-established:
  - "Graph-primary layout: SwarmGraph fills remaining viewport with h-[calc(100vh-...)] and floating action buttons"
  - "Sheet timeline drawer: side=right, 400px, with auto-scroll to active step and jump button"
  - "RunListLive wrapper pattern: server component fetches initialRuns, client component subscribes for live updates"

requirements-completed: [DASH-02, DASH-03, DASH-04, GRAPH-01]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 36 Plan 03: Page Integration Summary

**Graph-primary run detail page with Sheet timeline drawer, RunListLive Broadcast wrapper for live run lists, and project Swarm Graph tab -- replacing 5-second polling with real-time Broadcast subscriptions across all dashboard pages**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T05:50:00Z
- **Completed:** 2026-03-23T06:00:18Z
- **Tasks:** 3 (2 auto + 1 checkpoint)
- **Files modified:** 6

## Accomplishments
- Restructured run detail page to graph-primary layout with SwarmGraph filling viewport, replacing the step-timeline-first design
- Removed 5-second polling (setInterval + router.refresh) entirely, replaced with useBroadcast subscription on run:{runId} channel
- Created RunListLive client wrapper subscribing to runs:live channel for live status updates on run list pages
- Added Swarm Graph as third tab on project page (Overview | Runs | Swarm Graph) with empty state and latest successful run query
- Converted Wave 0 run-list-live test stubs into real passing assertions
- Human verification checkpoint approved (deferred manual testing to later)

## Task Commits

Each task was committed atomically:

1. **Task 1: Restructure run detail page to graph-primary layout with Sheet timeline drawer** - `bcc4f08` (feat)
2. **Task 2: Run list live wrapper and project Swarm Graph tab** - `e58e359` (feat)
3. **Task 3: Verify real-time dashboard and graph experience** - checkpoint approved (no commit)

## Files Created/Modified
- `web/app/(dashboard)/projects/[id]/runs/[runId]/run-detail-client.tsx` - Graph-primary layout with Broadcast subscription, Sheet timeline drawer, auto-scroll
- `web/app/(dashboard)/projects/[id]/runs/[runId]/page.tsx` - Adjusted padding for graph-primary client component
- `web/components/dashboard/run-list-live.tsx` - New client wrapper with Broadcast subscription for live run list updates
- `web/app/(dashboard)/projects/[id]/page.tsx` - Added Swarm Graph tab, RunListLive in Runs tab, latest successful run query
- `web/app/(dashboard)/runs/page.tsx` - Replaced static RunCard list with RunListLive wrapper
- `web/components/dashboard/__tests__/run-list-live.test.ts` - Converted Wave 0 stubs to real assertions

## Decisions Made
- Graph fills viewport as primary view with step timeline in Sheet drawer -- the graph is the centerpiece of the real-time experience, not secondary
- RunListLive uses server-fetch + client-subscribe pattern -- SSR provides initial data, Broadcast provides live updates without full page refresh

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All Phase 36 Dashboard & Graph features complete (Plans 00-03)
- Real-time Broadcast infrastructure replacing all polling patterns
- Interactive SwarmGraph with agent nodes, animated edges, celebration
- Run detail, run list, and project pages all wired for live updates
- Ready for Phase 37 HITL Approval to add pipeline pause/resume and diff viewer

## Self-Check: PASSED

- All 6 key files verified on disk
- Both task commits (bcc4f08, e58e359) verified in git log

---
*Phase: 36-dashboard-graph*
*Completed: 2026-03-23*
