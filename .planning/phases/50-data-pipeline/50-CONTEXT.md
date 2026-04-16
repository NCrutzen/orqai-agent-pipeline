# Phase 50: Data Pipeline - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous — decisions derived from milestone discussion, Phase 48/49 deliverables, live Orq.ai MCP verification)

<domain>
## Phase Boundary

Deliver the server-side ingestion pipeline that turns Orq.ai trace/span data into `agent_events` rows in Supabase so the Phase 49 Realtime UI actually has something to render. After this phase:

1. An Inngest cron function (`analytics/orqai-trace-sync`) runs on a short interval, pulls trace + span data from Orq.ai, and maps each span to one or more `agent_events` rows for the matching swarm.
2. Idempotency is enforced by span_id + event_type, so repeated cron runs never create duplicate rows.
3. Orq.ai API rate limits and 30-45s call budgets are respected via page-size caps, cursor-based pagination, a per-run cap, and explicit AbortSignal timeouts.
4. A Supabase caching table (`orqai_sync_state`) tracks the last-seen cursor/timestamp per swarm so each run only fetches new traces, not the full history.
5. Any new `agent_events` INSERTs automatically flow through the Phase 48 Realtime publication to the Phase 49 `SwarmRealtimeProvider`, which means the `/swarm/[swarmId]` placeholder grid will start receiving real data the moment the cron lands traces.

**Out of scope (later phases):**
- Consuming events in UI (fleet cards — 51; terminal + kanban — 52; delegation graph + swimlanes — 53)
- Ring buffer / bounded arrays in the provider (Phase 49 intentionally deferred this to Phase 52)
- Briefing narrative generation (Phase 51 uses the Orq.ai Briefing Agent)
- Backfilling historical traces beyond the first run's lookback window

**In scope but explicitly gated:**
- Mapping Orq.ai workspace `project_id` → Supabase `swarm_id`. Since our `projects` table has no `orqai_project_id` column today, we add one as part of this phase (additive, nullable). Traces without a mapping are skipped silently (logged, not errored).

</domain>

<decisions>
## Implementation Decisions

### MCP vs REST for Orq.ai
- **D-01:** Use the existing **Orq.ai MCP HTTP JSON-RPC endpoint** (`https://my.orq.ai/v2/mcp`) with `tools/call` method. This is the proven pattern from `web/lib/inngest/functions/orqai-collector.ts` and works with the standard `ORQ_API_KEY`. REST analytics endpoints require a workspace key we don't have.
- **D-02:** **MCP tool names verified live 2026-04-16** — resolves the STATE.md blocker. The canonical tools are:
  - `list_traces` — accepts filters (`start_time_after`, `start_time_before`, `project_id`, `limit`, `cursor`), returns `{ items, next_cursor, has_more }`, max `limit: 50`, sorted by `end_time` descending.
  - `list_spans` — requires `trace_id`, returns span tree items with `span_type`, `parent_id`, `start_time`, `end_time`, `name`. Max `limit: 50`, paginated.
  - `get_span` — single span by `span_id`, `mode: "compact" | "full"` (full retrieves input/output from storage — slower; use only when we need content).
- **D-03:** Wrap MCP calls in a tiny `callOrqaiMcp(toolName, args, signal?)` helper in `web/lib/orqai/mcp.ts` (shared with `orqai-collector.ts` eventually). Orq.ai internal retry is 31s so client timeout is **45s** per call (per CLAUDE.md).

### Cron Cadence & Freshness
- **D-04:** Cadence is **every 2 minutes** (`*/2 * * * *`). Rationale: V7's real-time feel requires sub-minute freshness; Inngest can run sub-minute crons but 2min is the minimum that leaves headroom for Vercel serverless cold starts + Orq.ai latency. Later phases can tune to 1min if needed. Step retries = 3 (matches `orqai-collector`).
- **D-05:** Each cron invocation only looks back **15 minutes** (sliding window) OR from the last-seen cursor — whichever is more conservative. This keeps per-run API cost bounded even if the sync falls behind.
- **D-06:** **Per-run page cap of 200 traces** (4 pages × 50-limit). If `has_more` after 200, log a warning and let the next tick continue — never fetch unbounded history in one cron tick.

### Trace → agent_events mapping
- **D-07:** Mapping semantics (one Orq.ai span → 1-2 `agent_events` rows):
  | span_type | event_type(s) emitted | Notes |
  |---|---|---|
  | `span.agent` | `thinking` (start) + `done` (end) | Covers the "agent is processing" signal; `parent_span_id` drives delegation graph |
  | `span.chat_completion` | `thinking` → `done` | LLM calls — collapsed to a single pair |
  | `span.deployment` | `thinking` → `done` | Deployment runs (top-level trace leading span) |
  | `span.tool_call` / function call | `tool_call` + `tool_result` | Extract tool name into `content.tool` |
  | span with error | `error` | Derived from span status / attributes.error flag |
  | span with `parent_id` indicating delegation | extra `delegation` event on parent | Enables Phase 53 delegation graph |
- **D-08:** `agent_name` is derived from span `attributes.gen_ai.operation.name` (the entity key like `EASY_email`) with fallback to `name`. `swarm_id` comes from Orq.ai `orq.project_id` → our `projects.orqai_project_id` mapping.
- **D-09:** `content` JSONB stores the raw span payload we care about (`trace_id`, `span_id`, `provider`, `model`, `duration_ms`, `cost_usd`, `tool?`, `token_usage?`). We keep it lean — `get_span` in `full` mode is ONLY called when a span is flagged `error` (so we can surface the input/output in the UI later); normal traces don't need the heavy payload.
- **D-10:** `started_at` / `ended_at` come from span `start_time` / `end_time`. `created_at` is DB default.

### Idempotency
- **D-11:** **Unique constraint** on `(span_id, event_type)` added via a supplementary migration (`20260416_agent_events_idempotency.sql`). This lets us `INSERT ... ON CONFLICT DO NOTHING` per event from the cron. Spans without `span_id` (edge case) fall back to `(trace_id, agent_name, event_type, started_at)` dedupe — rare, but defended.
- **D-12:** Before insert, the mapper checks the `orqai_sync_state` watermark to short-circuit when a trace is older than the last sync boundary. The unique constraint is the safety net, not the primary filter.

### Rate Limit Handling
- **D-13:** MCP endpoint returns HTTP errors for rate limits; catch `429` and non-2xx inside the fetch helper. Retries are handled two ways:
  - Inngest function-level: `retries: 3` on `createFunction` (matches existing cron functions).
  - Per-request: we rely on Orq.ai's 31s internal retry + our 45s timeout; no custom backoff layer. If a 429 bubbles up, the step fails and Inngest retries the whole step.
- **D-14:** Caching layer is **only the sync-state watermark** — we do NOT cache trace payloads anywhere (they would duplicate `agent_events`). The "Supabase caching layer" of DATA-03 is implemented as the `orqai_sync_state` table holding last-seen cursor + last-end-time per swarm.

### Swarm ↔ Orq.ai Project Mapping
- **D-15:** Add nullable column `projects.orqai_project_id TEXT` (with an index). Nullable so existing swarms without Orq.ai integration still work.
- **D-16:** The cron iterates each swarm that has `orqai_project_id IS NOT NULL`, calls `list_traces({ project_id, start_time_after: watermark, limit: 50 })`, and processes pages until empty or cap reached. One Inngest step per swarm keeps step memoization granular (fail in swarm B retries B only).
- **D-17:** If no swarms have an `orqai_project_id` yet, the cron no-ops cleanly and logs `0 swarms synced` — not a failure.

### Architecture
- **D-18:** File layout:
  ```
  web/lib/orqai/mcp.ts                       # Shared MCP HTTP helper
  web/lib/orqai/trace-mapper.ts              # Pure mapping: span[] → AgentEventInsert[]
  web/lib/orqai/trace-mapper.schema.ts       # Zod schemas for raw Orq.ai trace/span shapes
  web/lib/inngest/functions/orqai-trace-sync.ts  # The cron function
  supabase/migrations/20260416_trace_sync.sql    # orqai_sync_state table + orqai_project_id col + unique constraint
  ```
- **D-19:** The mapper is a **pure function** (no I/O) so it's trivially unit-testable with vitest. The Inngest function only wires it to I/O.

### Inngest Hygiene (per docs/inngest-patterns.md)
- **D-20:** Every side effect inside `step.run()`. Fetches, DB reads, DB writes — each is its own named step so Inngest checkpointing works on replay.
- **D-21:** Large outputs: the per-trace spans list can be up to ~50 items × few KB. We keep raw span arrays as memoized step returns (under Inngest's default 64KB-ish per-step cap — verified; the trace sample above is ~5KB). If a trace balloons, we switch to Supabase-storage-and-reference per the docs. For now, in-memory is fine.
- **D-22:** Idempotency check in DB is the `ON CONFLICT DO NOTHING` — no separate "did we already process" step needed because the unique constraint handles re-runs.

### Error handling
- **D-23:** `onFailure` handler logs to Supabase `settings` (key-value store used elsewhere) with `{ key: "orqai_trace_sync_last_error", value: { error, swarm_id, timestamp } }`. No alerting in this phase — Phase 51's briefing agent can surface this later.
- **D-24:** Per-swarm failures are caught and logged, never break the whole cron run. A broken mapping in swarm A must not block swarm B.

### Verification Strategy
- **D-25:** Vitest unit tests for `trace-mapper.ts` with sample trace fixtures (derived from the real MCP trace we already retrieved).
- **D-26:** Integration verification:
  1. Temporarily link an Orq.ai workspace project_id to one `projects` row (manual SQL).
  2. Trigger the Inngest function manually via its dev endpoint OR wait for the cron.
  3. Verify `agent_events` rows appear with correct `swarm_id`, `event_type`, `span_id`.
  4. Open `/swarm/[swarmId]` — the `SwarmRealtimeProvider` should receive postgres_changes INSERT events immediately (count > 0 in `events` array).
- **D-27:** `cd web && npx tsc --noEmit` must pass; `next build` is not required (Turbopack pre-existing issue).

### Claude's Discretion
- Exact internal structure of the mapper (one big switch vs strategy pattern)
- Whether to emit `waiting` events at all in V1 (no Orq.ai span maps cleanly; defer)
- Whether to write a tiny admin-only API route to seed `orqai_project_id` on a swarm, or just document the SQL update (probably SQL only — this is a one-time setup action per swarm)
- Zod schema strictness: `.passthrough()` on attributes objects to survive Orq.ai shape drift
- Test framework conventions follow existing vitest setup in `web/test-setup.ts`

### Folded Todos
None — no relevant todos surfaced.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase dependencies
- `.planning/phases/48-foundation/48-02-SUMMARY.md` — `agent_events` schema + REPLICA IDENTITY FULL + publication
- `.planning/phases/49-navigation-realtime/49-01-SUMMARY.md` — `SwarmRealtimeProvider` consumes `agent_events` via postgres_changes (destination for our writes)
- `.planning/phases/49-navigation-realtime/49-CONTEXT.md` — D-11 decision that all four V7 tables are on a single channel filtered by `swarm_id`
- `supabase/migrations/20260415_v7_foundation.sql` — destination schema with CHECK constraint on `event_type`

### Existing code patterns to mirror
- `web/lib/inngest/functions/orqai-collector.ts` — canonical reference for MCP HTTP JSON-RPC pattern, `callMcpTool` helper, step-per-stage structure
- `web/lib/inngest/functions/dashboard-aggregator.ts` — canonical reference for cron + Zod validation + admin client writes
- `web/lib/inngest/client.ts` — Inngest client factory
- `web/app/api/inngest/route.ts` — where new function gets registered in the `serve()` call
- `web/lib/supabase/admin.ts` — service-role client for writes (bypasses RLS)

### Project constraints
- `CLAUDE.md` — Orq.ai Router is the only LLM path; Inngest for crons; Supabase for DB
- `docs/inngest-patterns.md` — all side effects in step.run, DB idempotency, large output handling
- `docs/orqai-patterns.md` — XML-tagged prompts (not relevant here — no LLM calls), 45s client timeout, Zod validation
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02, DATA-03 acceptance criteria

### Orq.ai MCP tools (verified 2026-04-16)
- `list_traces` — ` https://my.orq.ai/v2/mcp` tools/call with `{ name: "list_traces", arguments: { project_id, start_time_after, limit, cursor } }`
- `list_spans` — `{ name: "list_spans", arguments: { trace_id, limit, cursor } }`
- `get_span` — `{ name: "get_span", arguments: { span_id, mode: "compact"|"full" } }` — only used for error spans in this phase

### Environment variables (already in production)
- `ORQ_API_KEY` — Orq.ai auth
- `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` — admin client
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Inngest registration (already used by existing crons)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `callMcpTool` in `orqai-collector.ts` — extract into `web/lib/orqai/mcp.ts` and import from both cron files (removes copy-paste).
- `createAdminClient` — the only sane way to write `agent_events` from server (RLS bypass).
- Inngest client from `web/lib/inngest/client.ts` — shared.
- `serve()` registration pattern in `api/inngest/route.ts` — one line addition.

### Established Patterns
- Step names are kebab-case verbs (`fetch-workspace-overview`, `compute-metrics`)
- `inngest.createFunction({ id: "namespace/action", retries: 3 }, { cron: "..." }, handler)` is the canonical shape
- Zod schemas live next to the code that uses them (not in a global schemas dir)
- Functional mappers are importable and unit-testable; Inngest functions thin.

### Integration Points
- Register new function in `web/app/api/inngest/route.ts` `functions: []` array
- Migration executed via Supabase Management API (Phase 48 pattern) — we'll create the SQL file and run it
- No frontend changes needed — Phase 49 `SwarmRealtimeProvider` picks up INSERTs automatically

</code_context>

<specifics>
## Specific Ideas

- Cron id: `analytics/orqai-trace-sync` (matches `analytics/orqai-collect` namespace)
- New function registered in `serve()` array alongside `collectOrqaiAnalytics`
- `orqai_sync_state` table columns: `swarm_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE`, `last_end_time TIMESTAMPTZ`, `last_cursor TEXT`, `last_synced_at TIMESTAMPTZ DEFAULT NOW()`, `last_error TEXT`, `last_inserted_count INT`
- Unique constraint: `CREATE UNIQUE INDEX agent_events_span_event_idx ON agent_events(span_id, event_type) WHERE span_id IS NOT NULL;` — partial index lets null-span rows exist
- Mapper signature: `export function spansToAgentEvents(spans: OrqaiSpan[], swarmId: string): AgentEventInsert[]`
- Mapper is pure; tests sit in `web/lib/orqai/__tests__/trace-mapper.test.ts`
- Fixtures use the real span shape we pulled via MCP (stored as JSON in test file)

</specifics>

<deferred>
## Deferred Ideas

- Backfill mode (sync last 30d once per swarm) — manual script if needed
- Per-model cost aggregation from spans — later phase, Phase 51 briefing can compute this
- Streaming trace updates via Orq.ai webhooks (if they offer them) — not available as of now
- Alerts on sync failures — Phase 51 briefing agent's job
- Ring buffer for `agent_events` accumulation — Phase 52 (terminal + ring buffer)
- Circuit breaker around Orq.ai outages — Inngest retries + 45s timeout is sufficient for this phase

### Reviewed Todos (not folded)
None.

</deferred>

---

*Phase: 50-data-pipeline*
*Context gathered: 2026-04-16*
