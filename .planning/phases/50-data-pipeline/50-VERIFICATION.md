---
phase: 50-data-pipeline
status: code_complete_pending_human
mode: autonomous
verified_by: Claude Opus 4.6
completed: 2026-04-16
---

# Phase 50: Data Pipeline -- Verification

## Status: CODE COMPLETE, DB MIGRATION + HUMAN VERIFICATION PENDING

All code and tests are in place and passing. The migration is written and committed. Final end-to-end verification is blocked on:

1. **Applying the 50-01 migration to Supabase** (Management API token is expired)
2. **Seeding one `projects.orqai_project_id`** so the cron has data to sync
3. **One cron tick running in production** (or manual trigger via Inngest dev UI)

## Must-Haves (from CONTEXT.md)

| # | Requirement | Evidence | Status |
|---|---|---|---|
| 1 | Inngest cron `analytics/orqai-trace-sync` defined | `web/lib/inngest/functions/orqai-trace-sync.ts` exports `syncOrqaiTraces` with `{ cron: "*/2 * * * *" }` | PASS |
| 2 | Registered in Inngest serve route | `web/app/api/inngest/route.ts` imports + adds to functions[] | PASS |
| 3 | MCP tool names verified | `list_traces` + `list_spans` + `get_span` confirmed live via MCP call 2026-04-16 (real trace retrieved) | PASS (blocker resolved) |
| 4 | Maps span -> agent_events rows | Pure `spansToAgentEvents` in `trace-mapper.ts` + 8 unit tests | PASS |
| 5 | Idempotent on re-run | Partial unique index `agent_events_span_event_idx` + `onConflict: "span_id,event_type", ignoreDuplicates: true` | PASS (code); verify after migration applied |
| 6 | Rate-limit / cost bounded | 45s client timeout, 200 traces/run cap, 50 spans/trace cap, per-swarm isolation, Inngest retries=3 | PASS |
| 7 | Supabase caching layer | `orqai_sync_state` watermark table (last_end_time + last_cursor per swarm) | PASS |
| 8 | Realtime propagation to UI | agent_events is REPLICA IDENTITY FULL + in supabase_realtime publication (Phase 48) -- Phase 49's SwarmRealtimeProvider subscribes automatically | PASS (inherited from Phase 48/49) |
| 9 | All side effects in step.run | Verified: load-mapped-swarms, load-watermarks, sync-swarm-${id}, record-failure -- every admin client call is inside a named step | PASS |
| 10 | Zod validates raw MCP responses | `ListTracesResponseSchema.safeParse` + `ListSpansResponseSchema.safeParse` at every API boundary | PASS |
| 11 | No client-to-Orq.ai calls | All Orq.ai access lives in `web/lib/inngest/functions/` server-side only | PASS (architectural) |
| 12 | TypeScript clean | `npx tsc --noEmit` shows no new errors in Phase 50 files | PASS |
| 13 | Unit tests pass | 8/8 vitest tests green | PASS |

## Deferred: Human Verification (production)

**Trigger:** After the migration from 50-01 is applied to Supabase.

### Steps

1. **Apply migration** (user action):
   ```bash
   # Option A: Supabase Studio SQL editor -- paste the contents of
   # supabase/migrations/20260416_trace_sync.sql and run.
   #
   # Option B: with a valid Management API token:
   SQL=$(cat supabase/migrations/20260416_trace_sync.sql | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))")
   curl -X POST "https://api.supabase.com/v1/projects/mvqjhlxfvtqqubqgdvhz/database/query" \
     -H "Authorization: Bearer <CURRENT_SBP_TOKEN>" \
     -H "Content-Type: application/json" \
     -d "{\"query\": $SQL}"
   ```

2. **Verify schema applied**:
   ```sql
   SELECT indexname FROM pg_indexes WHERE indexname = 'agent_events_span_event_idx';
   SELECT column_name FROM information_schema.columns
     WHERE table_name = 'projects' AND column_name = 'orqai_project_id';
   SELECT * FROM orqai_sync_state LIMIT 0;
   ```

3. **Seed a mapping** on any real swarm:
   ```sql
   UPDATE projects SET orqai_project_id = '58205e70-6fc2-4f28-9b7f-aca40cb0e4be' WHERE id = '<a real projects.id>';
   ```
   (The UUID above is a live Orq.ai project_id observed via MCP on 2026-04-16.)

4. **Deploy to Vercel** (next push deploys the cron) OR trigger manually via Inngest dashboard.

5. **Wait up to 2 minutes** for the first tick.

6. **Verify agent_events populated**:
   ```sql
   SELECT COUNT(*), MIN(created_at), MAX(created_at)
   FROM agent_events WHERE swarm_id = '<swarm_uuid>';
   ```
   Expect count > 0 within one tick (assuming the Orq.ai project has recent traffic).

7. **Verify watermark advanced**:
   ```sql
   SELECT swarm_id, last_end_time, last_synced_at, last_error, last_inserted_count
   FROM orqai_sync_state WHERE swarm_id = '<swarm_uuid>';
   ```
   Expect `last_error IS NULL`, `last_synced_at` recent, `last_end_time` within the trace timestamps.

8. **Verify UI integration** -- open `/swarm/<swarmId>` in the browser:
   - No 400s in devtools network tab.
   - The Phase 49 `SwarmRealtimeProvider` starts receiving postgres_changes INSERT events as new rows land on each cron tick.
   - (Visible consumption comes later: Phase 52 terminal, Phase 53 graph. For now, just confirm the channel receives events -- open the React DevTools and inspect `SwarmRealtimeContext` value.)

9. **Verify idempotency** -- wait for a second tick. `SELECT COUNT(*) FROM agent_events WHERE swarm_id = '<swarm_uuid>';` should only grow by the count of brand-new traces; existing rows should NOT be duplicated.

### Resume signal

`"Phase 50 sync verified"` -- adds PASS to the `deferred_human` items and updates the phase status to `complete`.

## Artifacts

| Path | Kind |
|---|---|
| `supabase/migrations/20260416_trace_sync.sql` | Migration |
| `web/lib/orqai/mcp.ts` | Shared MCP helper |
| `web/lib/orqai/trace-mapper.schema.ts` | Zod schemas |
| `web/lib/orqai/trace-mapper.ts` | Pure mapper |
| `web/lib/orqai/__tests__/trace-mapper.test.ts` | Unit tests (8 pass) |
| `web/lib/inngest/functions/orqai-trace-sync.ts` | Cron function |
| `web/app/api/inngest/route.ts` | Serve registration (modified) |

## Commits

```
45a982e feat(50-01): add V7 trace sync migration
860bf9f feat(50-01): extract shared Orq.ai MCP HTTP helper
cccbd19 feat(50-01): add Zod schemas for Orq.ai trace/span payloads
d839c55 feat(50-01): add pure trace-to-agent-events mapper
f7bc274 test(50-01): unit tests for trace mapper with real-shape fixtures
d7da751 feat(50-02): add orqai-trace-sync Inngest cron function
e1702e6 feat(50-02): register syncOrqaiTraces in Inngest serve route
```

## Self-Check

- [x] Migration file present and syntactically valid (reviewed)
- [x] All Phase 50 code compiles (tsc clean aside from pre-existing noise)
- [x] All Phase 50 tests pass (8/8)
- [x] Cron registered in Inngest serve()
- [x] Every side effect inside `step.run()`
- [x] Idempotency via partial unique index + ON CONFLICT DO NOTHING
- [x] Rate limit defences (timeout, page cap, per-swarm isolation, retries)
- [x] Error path writes to DB rather than throwing (per-swarm isolation)
- [x] MCP tool names verified live (blocker from STATE.md resolved)
- [ ] Migration applied to Supabase (blocked -- expired Management API token)
- [ ] End-to-end trace-to-UI flow verified in production (blocked on migration)

---

*Phase: 50-data-pipeline*
*Verification: 2026-04-16 (code complete; human verification pending migration apply)*
