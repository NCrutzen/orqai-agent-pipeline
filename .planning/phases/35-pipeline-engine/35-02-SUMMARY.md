---
phase: 35-pipeline-engine
plan: 02
subsystem: pipeline
tags: [inngest, durable-functions, supabase, server-actions, zod, pipeline-engine]

# Dependency graph
requires:
  - phase: 35-pipeline-engine
    plan: 01
    provides: Inngest client, events, prompt adapter, stages, error classifier, database schema
provides:
  - Pipeline durable function (executePipeline) with step-per-stage execution and retry-from-failed-step
  - Server actions (startPipeline, retryPipeline) for creating and retrying pipeline runs
affects: [35-03, 35-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [step-per-stage Inngest durable function, resume-from-failed via DB state check, large outputs in DB with references in Inngest state, admin client inside Inngest functions]

key-files:
  created:
    - web/lib/inngest/functions/pipeline.ts
    - web/app/(dashboard)/projects/[id]/new-run/actions.ts
  modified:
    - web/app/api/inngest/route.ts

key-decisions:
  - "Stage results stored in Supabase pipeline_steps.result, references returned from step.run() -- avoids Inngest state size limits"
  - "Manual steps_completed increment via read+update -- no custom RPC function needed, simpler setup"
  - "retryPipeline resets failed step AND all subsequent steps -- ensures clean slate for re-execution"

patterns-established:
  - "Durable function: each pipeline stage as separate step.run() with DB state check for resume"
  - "Context assembly: STAGE_CONTEXT_MAP maps each stage to its required inputs from prior stages"
  - "Server action: create records then trigger Inngest event, redirect to detail page"

requirements-completed: [PIPE-01, PIPE-04, PIPE-05]

# Metrics
duration: 4min
completed: 2026-03-15
---

# Phase 35 Plan 02: Pipeline Durable Function Summary

**Inngest durable function executing 7 pipeline stages via step.run() with DB-persisted results, resume-from-failed-step support, and server actions for starting/retrying pipeline runs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-15T16:06:55Z
- **Completed:** 2026-03-15T16:12:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Pipeline durable function with 7 stage steps plus 2 bookkeeping steps (mark-running, mark-complete), each wrapped in Inngest step.run()
- Resume-from-failed-step via Supabase state check -- completed steps are skipped on re-trigger
- Stage context assembly map routes outputs from prior stages to downstream stage inputs
- onFailure handler writes plain-English error messages to pipeline_steps table
- startPipeline server action creates run + step records, triggers Inngest, redirects to run detail page
- retryPipeline server action resets failed and subsequent steps, re-triggers Inngest with resumeFromStep

## Task Commits

Each task was committed atomically:

1. **Task 1: Pipeline durable function with step-per-stage execution** - `0c2a738` (feat)
2. **Task 2: Server action to create pipeline run and trigger Inngest** - `c00d6c3` (feat)

## Files Created/Modified
- `web/lib/inngest/functions/pipeline.ts` - Main pipeline durable function with step.run() per stage, resume logic, and onFailure handler
- `web/app/(dashboard)/projects/[id]/new-run/actions.ts` - Server actions: startPipeline (create + trigger) and retryPipeline (reset + re-trigger)
- `web/app/api/inngest/route.ts` - Registered executePipeline in Inngest serve route functions array

## Decisions Made
- Large stage outputs stored in Supabase pipeline_steps.result JSONB, only references returned from step.run() -- follows RESEARCH.md Pitfall 6 to avoid Inngest state size limits
- Used manual read+update pattern for incrementing steps_completed instead of custom Supabase RPC function -- simpler setup, no additional DB migration needed
- retryPipeline resets all steps from the failed step onward (not just the failed step) -- ensures subsequent steps don't have stale state from a previous partial run

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Supabase PromiseLike incompatibility with .catch()**
- **Found during:** Task 1 (tsc --noEmit check)
- **Issue:** Supabase `.rpc()` returns `PromiseLike<void>` which lacks `.catch()` method, causing TypeScript error
- **Fix:** Replaced rpc-with-catch pattern with direct read+update for steps_completed increment
- **Files modified:** web/lib/inngest/functions/pipeline.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 0c2a738 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor implementation adjustment for type safety. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - relies on Inngest and Anthropic API keys configured in Plan 35-01.

## Next Phase Readiness
- Pipeline engine is functional: startPipeline creates DB records and triggers Inngest, executePipeline runs all 7 stages
- Plan 35-03 can build the UI for triggering pipelines (new-run form) and viewing run progress (run detail page)
- Plan 35-04 can add file upload support and enhanced pipeline features
- retryPipeline is ready for the retry button UI in Plan 35-03

## Self-Check: PASSED

All 3 key files verified present. Both task commits (0c2a738, c00d6c3) confirmed in git log.

---
*Phase: 35-pipeline-engine*
*Completed: 2026-03-15*
