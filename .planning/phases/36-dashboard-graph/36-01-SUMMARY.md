---
phase: 36-dashboard-graph
plan: 01
subsystem: api
tags: [supabase-broadcast, react-flow, dagre, graph-mapper, realtime, inngest]

# Dependency graph
requires:
  - phase: 35-pipeline-engine
    provides: "Inngest pipeline function, PipelineStep interface, PIPELINE_STAGES, Supabase admin/client helpers"
  - phase: 36-dashboard-graph
    provides: "Wave 0 test stubs for broadcast and graph-mapper (36-00)"
provides:
  - "Supabase Broadcast server-side emit helpers (broadcastStepUpdate, broadcastRunUpdate)"
  - "Client-side useBroadcast React hook for real-time channel subscription"
  - "Graph-mapper utility (parseArchitectOutput, mapPipelineToGraph, mapStepToNodeStatus)"
  - "Pipeline function real-time Broadcast emissions at every step transition"
  - "React Flow, dagre, and canvas-confetti npm dependencies"
affects: [36-02, 36-03]

# Tech tracking
tech-stack:
  added: ["@xyflow/react", "@dagrejs/dagre", "canvas-confetti", "@types/dagre"]
  patterns: ["Supabase Broadcast for real-time updates (replacing polling)", "Hub-spoke graph mapping from architect output", "useRef for stable callback in subscription hooks"]

key-files:
  created:
    - "web/lib/supabase/broadcast.ts"
    - "web/lib/pipeline/graph-mapper.ts"
  modified:
    - "web/lib/inngest/functions/pipeline.ts"
    - "web/package.json"
    - "web/lib/supabase/__tests__/broadcast.test.ts"
    - "web/lib/pipeline/__tests__/graph-mapper.test.ts"

key-decisions:
  - "broadcastRunUpdate sends payload directly (no redundant runId spread) to avoid TypeScript TS2783 duplicate property warning"
  - "Regex patterns use case-insensitive flag only (no dotAll /s) for ES2017 target compatibility"

patterns-established:
  - "Broadcast channel naming: run:{runId} for per-run updates, runs:live for global run list updates"
  - "Server-side broadcast pattern: create admin client, create channel, send, removeChannel"
  - "Client-side subscription pattern: useBroadcast hook with useRef for stable callbacks"
  - "Graph hub-spoke pattern: first parsed agent is orchestrator connected to all others"

requirements-completed: [DASH-01, DASH-04]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 36 Plan 01: Broadcast Infrastructure & Graph Mapper Summary

**Supabase Broadcast real-time helpers with per-run and global channels, graph-mapper parsing architect output to React Flow nodes/edges, and Inngest pipeline emissions at every step transition**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T05:29:03Z
- **Completed:** 2026-03-23T05:34:41Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Installed 4 npm dependencies: @xyflow/react, @dagrejs/dagre, canvas-confetti, @types/dagre
- Created broadcast.ts with server-side broadcastStepUpdate/broadcastRunUpdate and client-side useBroadcast hook
- Created graph-mapper.ts with parseArchitectOutput, mapPipelineToGraph, and mapStepToNodeStatus
- Integrated 7 broadcast emissions into Inngest pipeline function (running, complete, failed, pipeline-complete)
- Converted 22 Wave 0 it.todo() stubs into 23 real passing tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create Broadcast helpers + graph-mapper** - `6b696e3` (feat)
2. **Task 2: Integrate Broadcast emissions into Inngest pipeline function** - `87d346c` (feat)

## Files Created/Modified
- `web/lib/supabase/broadcast.ts` - Server-side Broadcast emit helpers + client-side useBroadcast hook
- `web/lib/pipeline/graph-mapper.ts` - Parses architect output to React Flow nodes/edges with status mapping
- `web/lib/inngest/functions/pipeline.ts` - Added 7 broadcast calls at every step/run status transition
- `web/package.json` - Added @xyflow/react, @dagrejs/dagre, canvas-confetti, @types/dagre
- `web/package-lock.json` - Lock file updated with 23 new packages
- `web/lib/supabase/__tests__/broadcast.test.ts` - 11 real tests covering emit helpers and useBroadcast hook
- `web/lib/pipeline/__tests__/graph-mapper.test.ts` - 12 real tests covering parsing, mapping, and status updates

## Decisions Made
- broadcastRunUpdate sends payload directly without redundant runId spread to satisfy TypeScript strict mode (TS2783)
- Regex patterns avoid the /s (dotAll) flag for ES2017 tsconfig target compatibility, using explicit \n patterns instead

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed markdown bold marker leaking into parsed role/tool values**
- **Found during:** Task 1 (graph-mapper creation)
- **Issue:** Regex patterns for role/tools/description extraction did not account for `**Key:**` markdown format where the colon is inside the bold markers, causing `** ` prefix in extracted values
- **Fix:** Updated regex to `\*{0,2}Key\*{0,2}:\*{0,2}` to handle both `**Key:**` and `Key:` formats
- **Files modified:** web/lib/pipeline/graph-mapper.ts
- **Verification:** All 12 graph-mapper tests pass
- **Committed in:** 6b696e3 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed TypeScript regex dotAll flag incompatibility with ES2017 target**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** Regex `/is` flag (dotAll) requires ES2018+, but tsconfig targets ES2017 (TS1501)
- **Fix:** Removed `s` flag from 3 regex patterns; they only match single-line content so dotAll was unnecessary
- **Files modified:** web/lib/pipeline/graph-mapper.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 6b696e3 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed duplicate runId property in broadcastRunUpdate payload spread**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** RunUpdatePayload already contains runId, so `{ runId, ...payload }` duplicates the property (TS2783)
- **Fix:** Changed to pass `payload` directly since it already includes runId
- **Files modified:** web/lib/supabase/broadcast.ts, web/lib/supabase/__tests__/broadcast.test.ts
- **Verification:** tsc --noEmit exits 0
- **Committed in:** 6b696e3 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (3 bugs via Rule 1)
**Impact on plan:** All auto-fixes necessary for TypeScript compilation and correct parsing. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Broadcast infrastructure ready for Plans 02-03 to build real-time UI components
- Graph-mapper ready for SwarmGraph component to consume via mapPipelineToGraph
- Pipeline function emits events that useBroadcast hook can subscribe to
- React Flow, dagre, and canvas-confetti installed and ready for graph rendering

## Self-Check: PASSED

- All 7 key files verified on disk
- Both task commits (6b696e3, 87d346c) verified in git log

---
*Phase: 36-dashboard-graph*
*Completed: 2026-03-23*
