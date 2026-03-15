---
phase: 35-pipeline-engine
plan: 01
subsystem: pipeline
tags: [inngest, anthropic-sdk, gray-matter, supabase, rls, vitest, pipeline, durable-functions]

# Dependency graph
requires:
  - phase: 34-foundation-auth
    provides: Supabase client factories, projects/project_members tables, RLS patterns
provides:
  - Pipeline database schema (pipeline_runs, pipeline_steps, pipeline_files) with RLS
  - Inngest client with typed events and serve route at /api/inngest
  - Prompt adapter that fetches .md files from GitHub and calls Claude API
  - 7 pipeline stage definitions with execution order
  - Error classifier with plain-English user-facing messages
affects: [35-02, 35-03, 35-04]

# Tech tracking
tech-stack:
  added: [inngest@3.x, @anthropic-ai/sdk@0.x, gray-matter@4.x, vitest@4.x]
  patterns: [prompt adapter (fetch .md -> strip frontmatter -> Claude API), error classification map, XML-tagged context in user messages, GitHub raw URL for runtime .md fetching]

key-files:
  created:
    - supabase/schema-pipeline.sql
    - web/lib/inngest/client.ts
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts
    - web/lib/pipeline/adapter.ts
    - web/lib/pipeline/stages.ts
    - web/lib/pipeline/errors.ts
    - web/lib/pipeline/__tests__/adapter.test.ts
    - web/lib/pipeline/__tests__/errors.test.ts
    - web/lib/pipeline/__tests__/stages.test.ts
    - web/vitest.config.ts
  modified:
    - web/package.json

key-decisions:
  - "Direct Claude messages.create() API over Agent SDK -- pipeline stages are predetermined, not agent-decided"
  - "GitHub raw URL for .md file fetching with PIPELINE_REPO_RAW_URL env var -- runtime fetching per user decision"
  - "Vitest for test framework -- fast, ESM-native, works with TypeScript out of the box"
  - "Error codes set on Error objects via unknown cast -- allows typed classification without custom Error subclasses"

patterns-established:
  - "Prompt adapter: fetch .md from GitHub -> gray-matter strip frontmatter -> system prompt to Claude"
  - "XML-tagged context in user messages: <use_case>, <blueprint>, etc."
  - "Error classification: classifyError() inspects message + code, toPlainEnglish() maps to user-friendly string"
  - "Pipeline stages as typed array with getStageByName() lookup"
  - "Inngest typed events with EventSchemas().fromRecord<Events>()"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03]

# Metrics
duration: 5min
completed: 2026-03-15
---

# Phase 35 Plan 01: Pipeline Infrastructure Summary

**Pipeline database schema with RLS, Inngest durable function client, prompt adapter fetching .md files from GitHub for Claude API calls, 7-stage definitions, and error classification with plain-English messages**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-15T15:59:33Z
- **Completed:** 2026-03-15T16:04:06Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Pipeline database schema with 3 tables (pipeline_runs, pipeline_steps, pipeline_files), 5 RLS policies, and 2 indexes
- Inngest client with typed event schemas and Next.js serve route at /api/inngest
- Prompt adapter that fetches .md files from GitHub, strips YAML frontmatter with gray-matter, formats context as XML tags, and calls Claude messages.create()
- 7 pipeline stage definitions (architect through readme-generator) with GitHub raw URL paths
- Error classifier covering Anthropic API, GitHub fetch, Supabase, and timeout errors with user-friendly messages
- 22 tests passing across adapter, stages, and errors modules (TDD approach)

## Task Commits

Each task was committed atomically:

1. **Task 1: Database schema for pipeline runs, steps, and files** - `6900551` (feat)
2. **Task 2 RED: Failing tests for adapter, stages, errors** - `75dd93e` (test)
3. **Task 2 GREEN: Implementation of all modules** - `3f6d2e6` (feat)

## Files Created/Modified
- `supabase/schema-pipeline.sql` - Pipeline state machine tables with RLS (pipeline_runs, pipeline_steps, pipeline_files)
- `web/lib/inngest/client.ts` - Inngest client instance with typed event schemas
- `web/lib/inngest/events.ts` - Typed event definitions for pipeline/run.started
- `web/app/api/inngest/route.ts` - Inngest serve endpoint exporting GET, POST, PUT
- `web/lib/pipeline/adapter.ts` - Prompt adapter: .md fetch -> frontmatter strip -> Claude API call
- `web/lib/pipeline/stages.ts` - 7 pipeline stage definitions with GitHub raw URL mapping
- `web/lib/pipeline/errors.ts` - Error classification and plain-English mapping (8 error categories)
- `web/lib/pipeline/__tests__/adapter.test.ts` - 5 tests for prompt adapter
- `web/lib/pipeline/__tests__/errors.test.ts` - 11 tests for error classification
- `web/lib/pipeline/__tests__/stages.test.ts` - 6 tests for stage definitions
- `web/vitest.config.ts` - Vitest configuration with path alias support
- `web/package.json` - Added inngest, @anthropic-ai/sdk, gray-matter, vitest dependencies

## Decisions Made
- Used direct Claude messages.create() API instead of Anthropic Agent SDK -- pipeline stages are predetermined, not agent-decided; simpler and sufficient
- GitHub raw URL pattern for .md file fetching with configurable PIPELINE_REPO_RAW_URL env var -- aligns with user decision for runtime fetching
- Chose vitest as test framework -- ESM-native, fast, TypeScript support out of the box, no additional config needed
- camelCase to snake_case conversion for XML tag names in user messages -- ensures consistent tag naming regardless of JS context key format

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed vitest test framework**
- **Found during:** Task 2 (TDD required test infrastructure)
- **Issue:** No test framework was installed in the project
- **Fix:** Installed vitest and created vitest.config.ts with path aliases
- **Files modified:** web/package.json, web/vitest.config.ts
- **Verification:** Tests run and pass
- **Committed in:** 3f6d2e6 (Task 2 GREEN commit)

**2. [Rule 1 - Bug] Fixed TypeScript strict type casting**
- **Found during:** Task 2 (tsc --noEmit check)
- **Issue:** `(error as Record<string, unknown>)` fails strict TS -- Error type doesn't overlap with Record
- **Fix:** Used double-cast pattern `(error as unknown as Record<string, unknown>)` in adapter.ts, errors.ts, and test files
- **Files modified:** web/lib/pipeline/adapter.ts, web/lib/pipeline/errors.ts, web/lib/pipeline/__tests__/errors.test.ts, web/lib/pipeline/__tests__/adapter.test.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 3f6d2e6 (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for test infrastructure and type safety. No scope creep.

## User Setup Required

**External services require manual configuration.** The plan's frontmatter documents required setup for:

### Inngest
- Create Inngest account at https://www.inngest.com/
- Create an app in the Inngest Dashboard
- Add `INNGEST_EVENT_KEY` to `web/.env.local` (Dashboard -> Manage -> Event Keys)
- Add `INNGEST_SIGNING_KEY` to `web/.env.local` (Dashboard -> Manage -> Signing Key)

### Anthropic
- Add `ANTHROPIC_API_KEY` to `web/.env.local` (https://console.anthropic.com/ -> API Keys)

### Pipeline Repository
- Optionally set `PIPELINE_REPO_RAW_URL` in `web/.env.local` (defaults to https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main)

## Issues Encountered
- `@types/gray-matter` npm package does not exist (404) -- gray-matter ships its own TypeScript types, so no additional types package needed

## Next Phase Readiness
- Pipeline infrastructure complete: database schema, Inngest client, prompt adapter, stages, and error mapper all in place
- Plan 35-02 can build the durable pipeline function using inngest.createFunction() with step.run() per stage
- Plan 35-03 can build the pipeline UI (run list, run detail) querying pipeline_runs and pipeline_steps tables
- User must configure Inngest + Anthropic API keys before pipeline execution is functional

## Self-Check: PASSED

All 12 key files verified present. All 3 task commits (6900551, 75dd93e, 3f6d2e6) confirmed in git log.

---
*Phase: 35-pipeline-engine*
*Completed: 2026-03-15*
