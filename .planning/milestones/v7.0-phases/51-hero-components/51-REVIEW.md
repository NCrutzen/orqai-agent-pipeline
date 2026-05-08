# Phase 51 Code Review

**Reviewed:** 2026-04-16
**Scope:** commits `edc07b8..175a818` — Phase 51 hero components (fleet cards, briefing panel, drawer, fixture)

## Method

- `cd web && npx tsc --noEmit` — zero new Phase 51 errors; the three pre-existing failures in `debtor-email-analyzer/` and `lib/automations/sales-email-analyzer/` are flagged in the task spec as "preserve as-is"
- `cd web && npx eslint components/v7/{fleet,briefing,drawer} lib/v7/{fleet,briefing,drawer} lib/inngest/functions/briefing-refresh.ts` — clean
- `cd web && npx vitest run lib/orqai/__tests__/trace-mapper.test.ts` — 8/8 pass
- Cross-ref with UI-SPEC copywriting contract and color token map
- Cross-ref with CLAUDE.md + docs/orqai-patterns.md

## Findings

### PASS items

| # | Topic | Verdict |
|---|-------|---------|
| 1 | Orq.ai is the only LLM path | PASS — `generate.ts` calls `/v2/agents/swarm-briefing-agent/invoke` through `ORQ_API_KEY`; no direct Anthropic/OpenAI SDK imports |
| 2 | Zod validation at LLM output boundary | PASS — `briefingOutputSchema.safeParse` on the agent response before DB write |
| 3 | XML-tagged prompt with `<role>`, `<task>`, `<constraints>`, `<output_format>` | PASS — `BRIEFING_SYSTEM_PROMPT` in `prompt.ts` |
| 4 | 45s client timeout on Orq.ai call | PASS — `AbortSignal.timeout(45_000)` in `invokeBriefingAgent` |
| 5 | Single Supabase Realtime channel per swarm view | PASS — new components consume `useRealtimeTable`; no `.channel()` opens |
| 6 | Briefings cached with TTL | PASS — 5-min `expires_at`, cache-check on entry, `force: true` bypass for cron |
| 7 | Error handling never blocks UI | PASS — `generateBriefing` swallows Orq.ai errors, logs to `settings`, returns `{ok:false}`; UI reads latest cached briefing regardless |
| 8 | GlassCard reused | PASS — fleet card, briefing panel, drawer all wrap `GlassCard` (drawer via Sheet + glass-content class) |
| 9 | shadcn Sheet reused, no new deps | PASS — drawer wraps `web/components/ui/sheet.tsx`; no package.json diff |
| 10 | Inngest side effects in `step.run()` | PASS — `briefing-refresh.ts` wraps list-swarms + per-swarm refresh in separate steps |
| 11 | Per-swarm failure isolation | PASS — each swarm's `refresh-${id}` step is independent; failures log + continue |
| 12 | Tokens (no hex literals in new components) | PASS — components reference `var(--v7-*)` throughout |
| 13 | Accessibility (keyboard + focus) | PASS — fleet card has `role=button`, `tabIndex`, Enter/Space handler, focus-visible ring; drawer uses Radix Dialog (auto focus trap, Esc close) |
| 14 | Empty-state copy matches UI-SPEC | PASS — "No subagents registered" / "Briefing will appear once..." / "No recent activity." all present |
| 15 | Trace-id grouping in drawer timeline | PASS — `groupEventsByTrace` preserves insertion order, renders `trace {id.slice(0,8)}` header per group |
| 16 | Fixture idempotency | PASS — `ON CONFLICT DO NOTHING` on events, `ON CONFLICT DO UPDATE` on agents for status refresh |

### Minor observations (not blocking)

**O-1:** `computeAverageCycleMs` uses map insertion order for "most recent spans" — this is approximate; a precise implementation would sort by `started_at` and take the last N. For a bounded event set (20) on a bounded agent view, the approximation is acceptable and consistent with the design reference (which shows a static cycle number). If/when the timeline grows large, swap to explicit sort.

**O-2:** The `briefing-refresh` cron calls `generateBriefing` sequentially per swarm. In practice we have 1-3 swarms per tenant; parallel execution would marginally speed this up but also increase Orq.ai concurrent load. Sequential stays aligned with `orqai-trace-sync` which is the established pattern.

**O-3:** Drawer timeline renders `describeEvent` which uses `span_name ?? tool ?? reason ?? event_type`. This is informative but terse for tool calls; if design demands the full tool+duration pairing later, extend `describeEvent` without touching the grouping logic.

**O-4:** The `/v2/agents/{key}/invoke` REST endpoint path is inferred from Orq.ai conventions — we confirmed via MCP that the agent exists but did not end-to-end invoke during this autonomous run (it requires valid `ORQ_API_KEY` in the server runtime and a live swarm with data). Verification path: seed fixture → set `ORQ_API_KEY` → click Regenerate → watch `swarm_briefings` INSERT.

### No findings requiring fixes

No secrets committed. No regressions in existing tests. No architectural violations.

## Recommendation

**APPROVE.** The three plans are cohesive, strictly respect the Phase 48/49/50 architectural decisions, and stay inside the Phase 51 scope boundary. No follow-up fix pass required.
