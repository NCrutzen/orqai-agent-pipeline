# Phase 51: Hero Components - Research

**Researched:** 2026-04-16
**Mode:** Auto (autonomous)

## 1. Orq.ai Briefing Agent design

### Agent spec

- **Key:** `swarm-briefing-agent`
- **Role:** Summarize swarm health and surface bottlenecks in plain English for a non-technical executive audience
- **Primary model:** `anthropic/claude-sonnet-4-6`
- **Fallback chain:** `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, `google/gemini-2.5-flash`
- **Max iterations:** 3 (this is not an agent-as-tool swarm; we want a single response with internal deliberation)
- **Max execution time:** 45 seconds
- **Tools:** none (self-contained reasoning; all context comes in the prompt)
- **Response format:** `json_schema` with the Zod schema mirrored to JSON Schema

### Prompt (XML-tagged, per docs/orqai-patterns.md)

```
<role>
You are the Briefing Agent for an AI swarm control room at Moyne Roberts.
You produce concise, plain-English narratives for non-technical executives who
monitor multiple AI agent swarms running in production. Your voice is calm,
factual, and directive -- like a chief of staff, not a marketer.
</role>

<task>
Given structured metrics for ONE swarm, produce a briefing with:
- a single-sentence headline (what is true RIGHT NOW about this swarm)
- a 2-4 sentence summary explaining health, bottlenecks, and trends
- 0-5 alerts (info/warn/critical) for items that need attention
- 0-3 suggested actions management could take to unblock the swarm
</task>

<context>
Swarm name: {swarm_name}
Time window: last 30 minutes

Agents: {agents_json}           // [{ name, role, status, active_jobs, queue_depth, error_count }]
Jobs by stage: {jobs_json}      // { backlog, ready, progress, review, done }
Recent events: {events_summary} // { thinking: N, tool_call: N, done: N, error: N }
Last briefing: {last_briefing_or_null}  // the previous briefing for continuity
</context>

<constraints>
- Headline <= 90 characters, no emoji, no trailing punctuation beyond a period
- Summary 2-4 sentences, no lists inside summary (lists belong in alerts/actions)
- If errors > 0, at least ONE alert must mention it
- If all jobs are done/ready and no errors, the briefing is still informative (celebrate quiet)
- Never invent metrics not in the input
- Use present tense
- Do NOT name individual human operators
</constraints>

<output_format>
Respond ONLY with JSON matching the provided schema. No prose before or after.
{
  "headline": string,
  "summary": string,
  "alerts": [{ "severity": "info" | "warn" | "critical", "message": string }],
  "suggested_actions": [{ "action": string, "rationale": string }]
}
</output_format>
```

### JSON Schema (for `response_format.json_schema`)

```json
{
  "name": "briefing",
  "strict": true,
  "schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "headline": { "type": "string", "maxLength": 90 },
      "summary":  { "type": "string" },
      "alerts": {
        "type": "array",
        "maxItems": 5,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "severity": { "enum": ["info", "warn", "critical"] },
            "message":  { "type": "string" }
          },
          "required": ["severity", "message"]
        }
      },
      "suggested_actions": {
        "type": "array",
        "maxItems": 3,
        "items": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "action":    { "type": "string" },
            "rationale": { "type": "string" }
          },
          "required": ["action", "rationale"]
        }
      }
    },
    "required": ["headline", "summary", "alerts", "suggested_actions"]
  }
}
```

### Zod mirror (`web/lib/v7/briefing/schema.ts`)

```ts
import { z } from "zod";

export const briefingAlertSchema = z.object({
  severity: z.enum(["info", "warn", "critical"]),
  message: z.string().min(1),
});

export const briefingActionSchema = z.object({
  action: z.string().min(1),
  rationale: z.string().min(1),
});

export const briefingOutputSchema = z.object({
  headline: z.string().min(1).max(140),
  summary: z.string().min(1),
  alerts: z.array(briefingAlertSchema).max(5),
  suggested_actions: z.array(briefingActionSchema).max(3),
});

export type BriefingOutput = z.infer<typeof briefingOutputSchema>;
```

We allow a slightly higher max length on Zod (140) than the JSON Schema (90) as slack for model drift -- the JSON Schema constrains generation, Zod validates. A 100-char headline passes Zod but is truncated in UI via `line-clamp-2`.

### Why Orq.ai and not direct Anthropic/OpenAI

- CLAUDE.md: direct LLM API keys forbidden for ad-hoc LLM calls. Orq.ai Router is the only path.
- Orq.ai manages model routing, fallbacks, cost tracking, retries
- Agent deployed once, can be versioned, iterated via Orq.ai Studio
- Traces flow into the same `agent_events` pipeline (Phase 50) -- meta-observability

### Invocation path

We already have `callOrqaiMcp` from Phase 50. The Agents API equivalent over MCP is to:

1. `create_agent` (once, at deploy time) with the prompt + schema + model chain
2. At runtime, call an agent execution tool -- in the Orq.ai MCP surface this is typically achieved by invoking the agent key. If MCP lacks a direct `invoke_agent` tool, fall back to the REST endpoint `POST https://api.orq.ai/v2/agents/{id}/invoke` with the same bearer auth.

Plan 51-02 tests both paths during execution; if MCP direct invoke exists we use it, otherwise REST. Zod validation sits on the response regardless.

### Cache TTL: 5 minutes

- Briefings are not per-request; multiple tabs hitting the same swarm inside 5 min get the same briefing
- `expires_at = now() + INTERVAL '5 minutes'`
- Server action checks for an unexpired row before calling Orq.ai -- returns the cached narrative immediately
- The 30-minute Inngest cron (BRIEF-02) forces a fresh generation regardless of cache, writing a new row and letting the old rows age out (we do NOT delete; keep history for audit)

### Error handling

- On Orq.ai failure: log to `settings` table (`orqai_briefing_last_error`), return last non-expired briefing OR last briefing overall (even if expired), never throw
- On Zod parse failure: log to `settings` with the raw output, same fallback behavior
- UI: never blocks on generation; renders whatever cached briefing exists + the "Regenerate" button

## 2. Radix Sheet vs Drawer (shadcn)

- We already have `web/components/ui/sheet.tsx` (Radix Dialog under the hood, `side="right"` slide-in)
- shadcn also has a `drawer` component backed by vaul (mobile-oriented, snap points, pull-to-close). Heavier; mobile UX not in scope for V7.0
- Decision: **reuse Sheet**. Drawer-style styling is achieved via a `className` override on `SheetContent` that sets our V7 glass-bg, 28px radius, and 16px margin insets from viewport edges
- Sheet supports `showCloseButton` prop so we can disable the default and render our pill-shaped "Close" button to match the reference
- Focus trap, Esc-to-close, and focus restore are handled by Radix Dialog automatically

## 3. Context vs URL state for drawer

- URL state would mean `/swarm/[swarmId]?agent=qualifier-agent` -- deep-linkable but complicates navigation
- Drawer is ephemeral and shouldn't live in navigation history
- Phase 49 already established a swarm-view-scoped Context (SwarmRealtimeContext)
- Decision: **React Context** (`DrawerContext`) with `{ openAgent: string | null, setOpenAgent: (n) => void }`. Mounted in the shell at the same level as the Realtime provider so any leaf component can consume it

## 4. Card composition from existing V7 components

- `GlassCard` is the only primitive; it's intentionally thin (1 div + token classes)
- Fleet card and briefing panel both wrap GlassCard and add layout-specific class names
- We do NOT build a heavier "Card" abstraction -- composition stays explicit

## 5. Communication timeline grouping by `trace_id`

- `agent_events.content` is JSONB; we cast via Zod in-memory to extract `trace_id` and `span_name`
- Grouping: sort events by `created_at` desc, take last 5 FOR this agent, then groupBy `trace_id` preserving insertion order
- If 5 events span 3 traces, render 3 group headers with respective events below
- If `trace_id` is missing (edge case), group under "no trace" with `--v7-faint`

## 6. Inngest briefing-refresh cron

- ID: `analytics/briefing-refresh`
- Cron: `*/30 * * * *` (every 30 minutes)
- Retries: 3
- Body:
  1. `step.run("list-swarms", ...)` -- find all projects with at least one `swarm_agents` row (skip empty swarms)
  2. For each swarm, `step.run(`refresh-${swarmId}`, ...)` calling the shared `generateBriefing(swarmId)` helper
  3. Per-swarm failures caught and logged, never break the run
- Registered in `web/app/api/inngest/route.ts` alongside `orqaiTraceSync` and existing functions

## 7. Test data fixture

File: `supabase/fixtures/51-test-data.sql`

```sql
-- Seed 3 swarm_agents for EASY Email Agent Swarm
INSERT INTO swarm_agents (id, swarm_id, agent_name, role, status, metrics, skills) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_intake',
   'Triages inbound emails and routes them to specialists',
   'active',
   '{"active_jobs": 4, "queue_depth": 2, "error_count": 0}'::jsonb,
   '["Email parsing", "Intent detection", "Priority scoring"]'::jsonb),
  ('22222222-2222-2222-2222-222222222222',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_draft',
   'Drafts replies using templates and recent customer history',
   'idle',
   '{"active_jobs": 0, "queue_depth": 0, "error_count": 0}'::jsonb,
   '["Template fill", "Tone matching", "Context retrieval"]'::jsonb),
  ('33333333-3333-3333-3333-333333333333',
   'f8df0bce-ed24-4b77-b921-7fce44cabbbb',
   'EASY_compliance',
   'Verifies replies meet policy and flags risky sends',
   'error',
   '{"active_jobs": 1, "queue_depth": 3, "error_count": 2}'::jsonb,
   '["Policy check", "PII scan", "Escalation"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  metrics = EXCLUDED.metrics,
  skills = EXCLUDED.skills,
  updated_at = NOW();

-- Seed 12 agent_events across 3 trace_ids
INSERT INTO agent_events (id, swarm_id, agent_name, event_type, span_id, parent_span_id, content, started_at, ended_at) VALUES
  -- trace trace-aaaa-1111 (intake -> draft delegation)
  ('aaaa1111-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake', 'thinking',    'span-aaaa-01', NULL,           '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-01","span_name":"Parse inbound"}'::jsonb, NOW() - INTERVAL '14 minutes', NOW() - INTERVAL '13 minutes 50 seconds'),
  ('aaaa1111-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake', 'done',        'span-aaaa-01', NULL,           '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-01","span_name":"Parse inbound"}'::jsonb, NULL,                           NOW() - INTERVAL '13 minutes 50 seconds'),
  ('aaaa1111-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake', 'tool_call',   'span-aaaa-02', 'span-aaaa-01', '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-02","tool":"priority_score"}'::jsonb,     NOW() - INTERVAL '13 minutes 45 seconds', NULL),
  ('aaaa1111-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_intake', 'tool_result', 'span-aaaa-02', 'span-aaaa-01', '{"trace_id":"trace-aaaa-1111","span_id":"span-aaaa-02","tool":"priority_score"}'::jsonb,     NULL,                                   NOW() - INTERVAL '13 minutes 40 seconds'),
  -- trace trace-bbbb-2222 (draft cycle)
  ('bbbb2222-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',  'thinking',    'span-bbbb-01', NULL,           '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-01","span_name":"Compose reply"}'::jsonb, NOW() - INTERVAL '8 minutes',   NOW() - INTERVAL '7 minutes 30 seconds'),
  ('bbbb2222-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',  'tool_call',   'span-bbbb-02', 'span-bbbb-01', '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-02","tool":"fetch_history"}'::jsonb,      NOW() - INTERVAL '7 minutes 30 seconds', NULL),
  ('bbbb2222-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',  'tool_result', 'span-bbbb-02', 'span-bbbb-01', '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-02","tool":"fetch_history"}'::jsonb,      NULL,                                   NOW() - INTERVAL '7 minutes 20 seconds'),
  ('bbbb2222-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_draft',  'done',        'span-bbbb-01', NULL,           '{"trace_id":"trace-bbbb-2222","span_id":"span-bbbb-01","span_name":"Compose reply"}'::jsonb, NULL,                                   NOW() - INTERVAL '7 minutes'),
  -- trace trace-cccc-3333 (compliance error)
  ('cccc3333-0000-0000-0000-000000000001', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'thinking',    'span-cccc-01', NULL,           '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-01","span_name":"Policy review"}'::jsonb, NOW() - INTERVAL '4 minutes',   NOW() - INTERVAL '3 minutes 45 seconds'),
  ('cccc3333-0000-0000-0000-000000000002', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'tool_call',   'span-cccc-02', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-02","tool":"pii_scan"}'::jsonb,           NOW() - INTERVAL '3 minutes 45 seconds', NULL),
  ('cccc3333-0000-0000-0000-000000000003', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'tool_result', 'span-cccc-02', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-02","tool":"pii_scan","error":"SSN detected"}'::jsonb, NULL,                 NOW() - INTERVAL '3 minutes 35 seconds'),
  ('cccc3333-0000-0000-0000-000000000004', 'f8df0bce-ed24-4b77-b921-7fce44cabbbb', 'EASY_compliance', 'error',       'span-cccc-03', 'span-cccc-01', '{"trace_id":"trace-cccc-3333","span_id":"span-cccc-03","reason":"Escalation required"}'::jsonb, NULL,                               NOW() - INTERVAL '3 minutes 20 seconds')
ON CONFLICT (id) DO NOTHING;
```

12 events across 3 traces, covering all four event types the UI needs. Idempotent INSERT via `ON CONFLICT DO NOTHING` -- re-running the fixture is safe.

## 8. Existing patterns I'll mirror

- `orqai-collector.ts` + `orqai-trace-sync.ts` -- Inngest function file layout, step naming, retry config
- `dashboard-aggregator.ts` -- Zod + admin client write pattern
- `swarm-realtime-provider.tsx` -- React Context boundary pattern for DrawerContext

---

*Research complete 2026-04-16.*
