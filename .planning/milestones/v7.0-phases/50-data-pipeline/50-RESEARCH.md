# Phase 50: Data Pipeline - Research

**Researched:** 2026-04-16
**Mode:** Live MCP verification + pattern mining from Phase 48/49 precedents

## Orq.ai MCP Trace/Span API (Blocker Resolved)

### STATE.md blocker: "Orq.ai trace/span MCP tool names unverified"

**Resolution (live verification):**

| Tool | Endpoint Pattern | Key args | Returns |
|---|---|---|---|
| `list_traces` | `tools/call` on `https://my.orq.ai/v2/mcp` | `project_id`, `start_time_after`, `start_time_before`, `limit` (max 50), `cursor` | `{ items: Trace[], next_cursor: string, has_more: boolean }` |
| `list_spans` | same | `trace_id` (required), `limit`, `cursor` | same pagination shape |
| `get_span` | same | `span_id`, `mode: "compact" \| "full"` | single span object |

### Real Trace Shape (sampled 2026-04-16)

```jsonc
{
  "_id": "01KP9P322XYT2EK2GRXR0JMD6J",
  "trace_id": "01KP9P322X1KJ66V4BEABYCHJ8",
  "start_time": "2026-04-15T23:02:15.905Z",
  "end_time": "2026-04-15T23:02:17.369Z",
  "name": "EASY_email",
  "type": "trace",
  "attributes": {
    "gen_ai": {
      "operation": { "name": "EASY_email" },
      "usage": { "prompt_tokens": 6052, "total_tokens": 6071, "completion_tokens": 19 }
    },
    "leading_span": { "span_id": "...", "span_type": "span.deployment" },
    "orq": {
      "project_id": "58205e70-6fc2-4f28-9b7f-aca40cb0e4be",
      "workspace_id": "f63fb3a2-24a8-4f6a-8b5d-7973de21262d",
      "billing": { "total_cost": 0.0018407 },
      "duration": 1464
    }
  },
  "input": "...",
  "output": "..."
}
```

### Span Types Observed
- `span.deployment` — top-level deployment run
- `span.chat_completion` — direct LLM call
- `span.agent` — agent execution (expected; seen in MCP schema docs)
- Tool calls appear as sub-spans under `span.agent` with span names

## Rate Limits & Timeouts

- Orq.ai does not publish hard rate limit numbers publicly; the MCP endpoint returns HTTP 429 on throttle.
- Internal Orq.ai retry: 31s (per CLAUDE.md)
- Our client timeout: 45s via `AbortSignal.timeout(45000)`
- Inngest function retries: 3 (default)

## Idempotency Strategy

Two layers:
1. **Watermark** (fast path) — `orqai_sync_state.last_end_time` excludes already-synced traces at the API call level.
2. **Unique constraint** (safety net) — partial unique index on `(span_id, event_type) WHERE span_id IS NOT NULL` + `INSERT ... ON CONFLICT DO NOTHING`.

Why both: the watermark can race if a trace's end_time is exactly equal to last_end_time, or if Orq.ai re-surfaces a trace due to eventual consistency. The unique index makes re-runs free.

## Mapping Decisions

Derived directly from the live trace sample:
- `agent_name` ← `attributes.gen_ai.operation.name` (e.g., `EASY_email`)
- `span_id` ← span-level `_id`
- `parent_span_id` ← span-level `parent_id` (spans have this; trace-level does not)
- `started_at` / `ended_at` ← span `start_time` / `end_time`
- `content` JSONB ← lean payload: `{ trace_id, provider, model, duration_ms, cost_usd, tool?, token_usage? }`

## Inngest Cron Budget

Phase 50 ticks every 2 minutes. Per tick budget:
- 1 swarm iteration: ~2-6 API calls (1 list_traces + per-trace list_spans; assume avg 3 traces → 4 calls)
- 45s timeout per call
- Worst case: 10 swarms × 4 calls × 45s = 30min → INFEASIBLE in one tick

Therefore:
- **Parallelize per-swarm fetches** via `Promise.all` inside a single step (each swarm is independent)
- **Page cap** of 200 traces/run caps API calls
- **Step budget**: keep total below Vercel free-tier 10s cold-start + Inngest 60s generous per-step budget

Realistic steady state (< 50 traces / 2min across workspace):
- ~1-3 API calls per swarm per tick
- Total ~5-15 calls per tick workspace-wide
- Comfortably under any plausible rate limit

## Zod Schema for Raw MCP Responses

```ts
const TraceItemSchema = z.object({
  _id: z.string(),
  trace_id: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  name: z.string().nullable().optional(),
  attributes: z.object({
    orq: z.object({
      project_id: z.string().nullable().optional(),
    }).passthrough(),
    gen_ai: z.object({
      operation: z.object({ name: z.string() }).optional(),
    }).passthrough().optional(),
    leading_span: z.object({
      span_id: z.string(),
      span_type: z.string(),
    }).optional(),
  }).passthrough(),
}).passthrough();
```

`.passthrough()` survives Orq.ai shape drift; only the fields we actually read are validated.

## Why Not Use Orq.ai Webhooks

Orq.ai does not expose trace-event webhooks as of 2026-04. Cron polling is the only path. This matches the architectural decision in PROJECT.md: "Orq.ai data flows through Inngest cron to Supabase, never client-to-Orq.ai."

## Open Questions

None blocking. All architectural decisions locked in CONTEXT.md.

---

*Phase: 50-data-pipeline*
*Research: 2026-04-16*
