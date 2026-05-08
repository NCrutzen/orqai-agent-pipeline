---
phase: 51-hero-components
plan: 02
subsystem: AI briefing (LLM + UI + cron)
tags: [orqai, inngest, supabase, zod, server-actions, v7]

requires:
  - phase: 48
    provides: swarm_briefings table, GlassCard
  - phase: 49
    provides: useRealtimeTable
  - phase: 50
    provides: callOrqaiMcp helper pattern
provides:
  - Orq.ai Briefing Agent (key swarm-briefing-agent, id 01KPAC1HF11NHSVN2BY03Q36SV)
  - generateBriefing helper (cache-aware, Zod-validated, never throws for callers)
  - regenerateBriefingAction server action
  - <BriefingPanel> with KPI grid + Regenerate button
  - analytics/briefing-refresh Inngest cron (*/30 * * * *)
affects: [51-03, 52, 53]

tech-stack:
  added: []
  patterns:
    - dedicated-orqai-agent-per-llm-task
    - five-minute-ttl-cache-for-llm-output
    - revalidatePath-after-server-action
    - json-schema-with-zod-mirror

key-files:
  created:
    - web/lib/v7/briefing/schema.ts
    - web/lib/v7/briefing/prompt.ts
    - web/lib/v7/briefing/generate.ts
    - web/lib/v7/briefing/actions.ts
    - web/components/v7/briefing/kpi-grid.tsx
    - web/components/v7/briefing/briefing-panel.tsx
    - web/lib/inngest/functions/briefing-refresh.ts
  modified:
    - web/app/api/inngest/route.ts

key-decisions:
  - "Orq.ai Briefing Agent deployed with anthropic/claude-sonnet-4-6 primary + 3 fallbacks"
  - "5-minute expires_at TTL on swarm_briefings; force:true bypass for the 30-min cron"
  - "UI never blocks on Orq.ai failure -- latest cached briefing is always rendered"
  - "Blocked KPI uses priority=urgent as proxy until a dedicated field lands"

patterns-established:
  - "web/lib/v7/briefing/ split into schema / prompt / generate / actions"
  - "settings-table-keyed error logging (orqai_briefing_last_error)"
  - "generate helper shared between server action and cron"

requirements-completed: [BRIEF-01, BRIEF-02, BRIEF-03]

duration: ~25min
completed: 2026-04-16
commit_range: 19483cb..91a13ab
---

# Phase 51 Plan 02 Summary

**Orq.ai Briefing Agent + server action + client panel + 30-min cron.**

## Accomplishments

- Briefing Agent deployed via `mcp__orqai-mcp__create_agent`. Key: `swarm-briefing-agent`, id `01KPAC1HF11NHSVN2BY03Q36SV`. Model: `anthropic/claude-sonnet-4-6` with fallbacks `openai/gpt-4o-mini`, `anthropic/claude-haiku-4-5`, `google/gemini-2.5-flash`. Response format: `json_schema` (strict). Instructions: XML-tagged per `docs/orqai-patterns.md`.
- `schema.ts` declares `briefingOutputSchema` (Zod) + `briefingJsonSchema` (JSON Schema mirror for the Orq.ai `response_format`).
- `prompt.ts` builds the user message with structured swarm context (agents, jobs, events, last briefing).
- `generate.ts` is the core: gathers input via `createAdminClient`, calls the agent via `/v2/agents/swarm-briefing-agent/invoke` with 45s AbortSignal timeout, Zod-validates, checks the 5-min cache before calling, inserts into `swarm_briefings`, logs failures to `settings.orqai_briefing_last_error`, and never throws for callers.
- `actions.ts` is the thin `"use server"` wrapper used by the Regenerate form; calls `revalidatePath` after generation.
- `kpi-grid.tsx` derives 4 counts from `useRealtimeTable("jobs")`.
- `briefing-panel.tsx` reads the latest briefing via `useRealtimeTable("briefings")`, parses the JSON narrative, renders headline + summary + alerts + KPI grid + "Updated X ago" + Regenerate button (with `useTransition` pending state).
- `briefing-refresh.ts` Inngest cron fires every 30 min, iterates swarms with agents, calls `generateBriefing(swarmId, { force: true })` per swarm in isolated steps.
- `api/inngest/route.ts` registers the new function.

## Verification

- `cd web && npx tsc --noEmit` — no new errors
- Orq.ai Briefing Agent fetched via `mcp__orqai-mcp__get_agent` post-creation; instructions + model + fallbacks confirmed

## Deviations from Plan

- Plan mentioned a dedicated `deploy-agent.ts` helper. We deployed the agent directly via MCP during execution instead; the key is documented here and the agent is idempotent-by-key, so a future script is not required.
- Plan also mentioned a `scripts/deploy-briefing-agent.ts`. Skipped for the same reason — the agent is already live.

## User Setup Required

1. Apply `supabase/fixtures/51-test-data.sql` via Supabase Studio SQL editor to seed test rows.
2. Ensure `ORQ_API_KEY` is present in Vercel env for the invoke path; same env var is already used by Phase 50.
3. Open `/swarm/f8df0bce-ed24-4b77-b921-7fce44cabbbb` after deploy to validate the UI end-to-end.

## Next Plan Readiness

51-03 ready: Sheet primitive in place, GlassCard + tokens inherited, realtime events feed populated after fixture apply.
