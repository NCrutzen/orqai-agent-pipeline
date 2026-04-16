---
phase: 50-data-pipeline
plan: 02
subsystem: inngest cron wiring
tags: [inngest, cron, orqai, supabase, mcp]

# Dependency graph
requires:
  - plan: 50-01
    provides: migration SQL, callOrqaiMcp, Zod schemas, pure mapper
  - phase: 48
    provides: agent_events table with REPLICA IDENTITY FULL + Realtime publication
  - phase: 49
    provides: SwarmRealtimeProvider auto-consumes INSERT events
provides:
  - syncOrqaiTraces Inngest cron function (every 2 minutes)
  - Route registration so Vercel deploys the new cron
affects: [51, 52, 53]

tech-stack:
  added: []
  patterns:
    - per-swarm-isolated-step
    - watermark-plus-safety-net-idempotency
    - upsert-on-conflict-ignore-duplicates
    - on-failure-handler-to-settings

key-files:
  created:
    - web/lib/inngest/functions/orqai-trace-sync.ts
  modified:
    - web/app/api/inngest/route.ts

key-decisions:
  - "Per-swarm sync in its own step.run() -- retry granularity + failure isolation"
  - "Error path writes to orqai_sync_state.last_error rather than throwing, so one bad swarm doesn't block the cron"
  - "onFailure handler upserts a single key 'orqai_trace_sync_last_error' in settings -- Phase 51 briefing can surface it later"
  - "Reformatted serve() functions array to multi-line now that it has 7 entries"

patterns-established:
  - "Orq.ai-dependent crons live under web/lib/inngest/functions/ and import from web/lib/orqai/"
  - "Cron id convention: analytics/<verb>-<noun>"
  - "Per-entity sync loop uses step.run(\`sync-<entity>-\${id}\`) for granular Inngest memoization"

requirements-completed: [DATA-01, DATA-02 (via Realtime propagation from Phase 48 publication), DATA-03 (via watermark caching)]

duration: ~15min
completed: 2026-04-16
commit_range: d7da751..e1702e6
---

# Phase 50 Plan 02 Summary

**Inngest cron function that syncs Orq.ai traces to agent_events, and its route registration.**

## Accomplishments

- `web/lib/inngest/functions/orqai-trace-sync.ts` -- the cron function. Every 2 minutes:
  1. Load all swarms with `projects.orqai_project_id IS NOT NULL`.
  2. Load all sync watermarks in one round-trip.
  3. Per swarm (its own step): fetch new traces since `max(last_end_time, now - 15min)` via `list_traces` MCP (paginated, capped at 200 traces per run); for each trace, fetch spans via `list_spans`, map via `spansToAgentEvents`, upsert with `onConflict: "span_id,event_type" ignoreDuplicates: true`.
  4. Advance the watermark to the newest `end_time` observed; clear `last_error` on success.
  - Per-swarm failures are isolated: they write `last_error` into `orqai_sync_state` and return `{ inserted: 0, error }` rather than throwing. The overall function continues with the next swarm.
  - The `onFailure` handler writes a single key into the `settings` table so a cron-level crash is discoverable.
- `web/app/api/inngest/route.ts` -- imports `syncOrqaiTraces` and adds it to the `functions` array. Multi-line format for readability with 7 entries now.

## Task Commits

1. `d7da751` -- feat(50-02): add orqai-trace-sync Inngest cron function
2. `e1702e6` -- feat(50-02): register syncOrqaiTraces in Inngest serve route

## Deviations from Plan

None.

## Verification

- `grep -c "syncOrqaiTraces" web/app/api/inngest/route.ts` = **2** (import + functions[] entry)
- `grep -c "step.run" web/lib/inngest/functions/orqai-trace-sync.ts` = **5** (record-failure, load-mapped-swarms, load-watermarks, sync-swarm-${id} template, + internal upserts)
- `grep -c "AbortSignal.timeout" web/lib/orqai/mcp.ts` = **1**
- `cd web && npx tsc --noEmit` -- **no new errors** (pre-existing debtor/sales-email-analyzer errors untouched)
- `cd web && npx vitest run lib/orqai/` -- **8 pass**

## Issues Encountered

None during code execution. The migration from 50-01 must be applied before the cron can actually write rows (pre-check `projects.orqai_project_id` and the unique index). Until then, the cron will fail fast with a Postgres error on its first upsert attempt -- the `onFailure` handler captures this gracefully and Inngest retries bounded at 3.

## User Setup Required

1. **Apply the 50-01 migration** (see 50-01-SUMMARY.md).
2. **Seed one `orqai_project_id` on an existing swarm** so the cron has something to sync:
   ```sql
   UPDATE projects
   SET orqai_project_id = '58205e70-6fc2-4f28-9b7f-aca40cb0e4be'  -- sample from live Orq.ai trace
   WHERE id = '<swarm_uuid>';
   ```
3. **Deploy to Vercel** (or trigger the Inngest function manually from the dev UI).
4. **Verify end-to-end** (see `50-VERIFICATION.md`).

## Next Phase Readiness

- Phase 51 (Hero Components) can now rely on `agent_events` having real data for its briefing panel + fleet cards, once the migration + seed are live.
- Phase 52 (Terminal + Kanban) gets a working stream of events via the Phase 49 provider.
- Phase 53 (Delegation graph + swimlanes) gets `parent_span_id` relationships preserved in each event.
