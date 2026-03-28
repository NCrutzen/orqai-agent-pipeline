---
phase: 44-project-model-data-collection
plan: 02
subsystem: data-collection
tags: [inngest, cron, orqai, zod, analytics, rest-api, supabase]

# Dependency graph
requires:
  - phase: 44-01
    provides: "orqai_snapshots table, OrqaiSnapshot TypeScript interface"
provides:
  - "Inngest hourly cron function collecting Orq.ai workspace and per-agent analytics"
  - "Zod validation schemas for Orq.ai REST API responses with .passthrough() flexibility"
  - "Analytics completion event types for both Orq.ai and Zapier collectors"
affects: [44-03, 45-executive-dashboard]

# Tech tracking
tech-stack:
  added: [zod]
  patterns: [inngest-cron-collector, zod-passthrough-validation, raw-response-preservation]

key-files:
  created:
    - web/lib/inngest/functions/orqai-collector.ts
    - web/lib/orqai/types.ts
  modified:
    - web/lib/inngest/events.ts
    - web/app/api/inngest/route.ts

key-decisions:
  - "REST API instead of MCP -- MCP tools cannot be called from Inngest functions (no MCP client context)"
  - "Zod .passthrough() schemas -- exact API response shape needs live verification, flexible schemas prevent crashes"
  - "Raw responses stored alongside extracted metrics -- enables debugging when API schema changes"

patterns-established:
  - "Inngest cron collector: separate step.run() per API call + store step for retry isolation"
  - "Zod .passthrough() for unverified API schemas: validate known fields, accept unknown extras"
  - "Analytics event naming: analytics/{source}-{action}.completed"

requirements-completed: [DINT-04, DINT-05]

# Metrics
duration: 2min
completed: 2026-03-28
---

# Phase 44 Plan 02: Orq.ai Analytics Collector Summary

**Hourly Inngest cron function collecting Orq.ai workspace + per-agent metrics via REST API with Zod validation, stored in orqai_snapshots**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-28T10:54:09Z
- **Completed:** 2026-03-28T10:56:53Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Orq.ai analytics collector runs hourly as Inngest cron function with 3 isolated step.run() calls
- Flexible Zod schemas validate API responses without crashing on unknown fields
- Both workspace-level totals and per-agent breakdowns are collected and stored
- Raw API responses preserved in JSONB columns for debugging schema changes
- Events type extended with analytics completion events for both Orq.ai and Zapier collectors (Plan 03 ready)

## Task Commits

Each task was committed atomically:

1. **Task 1: Orq.ai response Zod schemas and event types** - `fe36b9f` (feat)
2. **Task 2: Orq.ai collector Inngest cron function and registration** - `e145a0f` (feat)

## Files Created/Modified
- `web/lib/orqai/types.ts` - Zod schemas for Orq.ai REST API response validation with .passthrough()
- `web/lib/inngest/functions/orqai-collector.ts` - Inngest hourly cron function: fetch workspace overview, fetch per-agent metrics, store snapshot
- `web/lib/inngest/events.ts` - Extended with analytics/orqai-collect.completed and analytics/zapier-scrape.completed events
- `web/app/api/inngest/route.ts` - Registered collectOrqaiAnalytics in Inngest serve handler

## Decisions Made
- Used Orq.ai REST API (`/v2/analytics/overview`, `/v2/analytics/query`) instead of MCP because MCP tools cannot be called from Inngest functions (no MCP client context available server-side)
- Zod schemas use `.passthrough()` because exact API response shapes need live verification -- prevents crashes while logging unknown fields
- Raw API responses stored in `raw_workspace_data` and `raw_query_data` JSONB columns for debugging API schema changes
- Added both Orq.ai and Zapier event types in one edit to avoid modifying events.ts again in Plan 03

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. The collector uses the existing `ORQ_API_KEY` environment variable.

## Next Phase Readiness
- Plan 03 (Zapier browser scraper) can proceed -- `analytics/zapier-scrape.completed` event type already defined
- Orq.ai REST API endpoint paths (`/v2/analytics/overview`, `/v2/analytics/query`) need verification at first runtime -- if they differ, the function will fail with a clear HTTP error and paths can be adjusted

---
*Phase: 44-project-model-data-collection*
*Completed: 2026-03-28*
