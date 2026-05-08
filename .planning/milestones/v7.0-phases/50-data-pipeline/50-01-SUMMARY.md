---
phase: 50-data-pipeline
plan: 01
subsystem: data pipeline (db + mapper)
tags: [supabase, inngest, orqai, mcp, zod, vitest, v7]

# Dependency graph
requires:
  - phase: 48
    provides: agent_events table, REPLICA IDENTITY FULL, supabase_realtime publication
provides:
  - Migration 20260416_trace_sync.sql (unique index + orqai_sync_state + projects.orqai_project_id)
  - Shared Orq.ai MCP HTTP helper (callOrqaiMcp)
  - Zod schemas for list_traces / list_spans payloads
  - Pure spansToAgentEvents mapper + maxEndTime watermark helper
affects: [50-02, 51, 52, 53]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - shared-mcp-helper
    - passthrough-zod-schemas
    - pure-functional-mapper
    - partial-unique-index-idempotency

key-files:
  created:
    - supabase/migrations/20260416_trace_sync.sql
    - web/lib/orqai/mcp.ts
    - web/lib/orqai/trace-mapper.schema.ts
    - web/lib/orqai/trace-mapper.ts
    - web/lib/orqai/__tests__/trace-mapper.test.ts
  modified: []

key-decisions:
  - "Partial unique index WHERE span_id IS NOT NULL allows null-span fallback rows"
  - "orqai_project_id on projects is nullable -- swarms without Orq.ai integration still work"
  - "Mapper is pure so it's trivially unit-testable; Inngest wiring is the only I/O layer"
  - "Zod .passthrough() on all attributes objects survives Orq.ai shape drift"

patterns-established:
  - "web/lib/orqai/ as home for Orq.ai-specific non-Inngest logic"
  - "Shared MCP helper callOrqaiMcp consolidates the JSON-RPC boilerplate"
  - "Unit tests use real-shape fixtures from live MCP responses"

requirements-completed: [DATA-03 (partial -- caching layer in DB)]

# Metrics
duration: ~25min
completed: 2026-04-16
commit_range: 45a982e..f7bc274
---

# Phase 50 Plan 01 Summary

**DB migration + shared MCP helper + pure trace mapper with 8 unit tests.**

## Accomplishments

- `supabase/migrations/20260416_trace_sync.sql` adds the partial unique index `agent_events_span_event_idx` (span_id, event_type) WHERE span_id IS NOT NULL, creates the `orqai_sync_state` watermark table, and adds the nullable `projects.orqai_project_id` column with its partial index.
- `web/lib/orqai/mcp.ts` extracts the Orq.ai MCP HTTP JSON-RPC helper (`callOrqaiMcp`) from `orqai-collector.ts` patterns. 45s timeout, bearer auth via `ORQ_API_KEY`, JSON parse of `result.content[0].text`.
- `web/lib/orqai/trace-mapper.schema.ts` declares Zod schemas for `list_traces` and `list_spans` responses. All objects use `.passthrough()` so Orq.ai can evolve payloads without breaking the pipeline.
- `web/lib/orqai/trace-mapper.ts` implements pure `spanToAgentEvents`, `spansToAgentEvents`, and `maxEndTime` mapping functions. Tool spans -> tool_call+tool_result; everything else -> thinking+done. Agent-name fallback chain: span operation -> trace operation -> span.name -> "unknown-agent".
- `web/lib/orqai/__tests__/trace-mapper.test.ts` -- 8 vitest tests, all green, fixtures derived from a real MCP trace pulled 2026-04-16.

## Task Commits

1. `45a982e` -- feat(50-01): add V7 trace sync migration
2. `860bf9f` -- feat(50-01): extract shared Orq.ai MCP HTTP helper
3. `cccbd19` -- feat(50-01): add Zod schemas for Orq.ai trace/span payloads
4. `d839c55` -- feat(50-01): add pure trace-to-agent-events mapper
5. `f7bc274` -- test(50-01): unit tests for trace mapper with real-shape fixtures

## Deviations from Plan

None. Plan executed exactly as written.

## Verification

- `cd web && npx vitest run lib/orqai/__tests__/trace-mapper.test.ts` -- **8 pass**
- `cd web && npx tsc --noEmit` -- **no new errors**; pre-existing errors in `debtor-email-analyzer/` and `sales-email-analyzer/` remain untouched.
- Grep:
  - `grep -c "callOrqaiMcp" web/lib/orqai/mcp.ts` = 1 (definition)
  - `grep -c ".passthrough()" web/lib/orqai/trace-mapper.schema.ts` = 7
  - `grep -c "span_id, event_type" supabase/migrations/20260416_trace_sync.sql` = 1

## Issues Encountered

**Supabase Management API token expired.** The token in the Phase 48 plan notes (`sbp_f441f401...`) returns `{"message":"Unauthorized"}`. The migration SQL file is complete and committed; execution against the live DB is deferred to user action.

## User Setup Required

1. Apply migration `supabase/migrations/20260416_trace_sync.sql` to Supabase (via Studio SQL editor OR by providing a current Management API token so the next session can run it via curl).
2. Verify: `SELECT indexname FROM pg_indexes WHERE indexname = 'agent_events_span_event_idx';` returns 1 row; `SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name='orqai_project_id';` returns 1 row.

## Next Plan Readiness

50-02 can now import `callOrqaiMcp`, the Zod schemas, and the mapper to build the cron function.
