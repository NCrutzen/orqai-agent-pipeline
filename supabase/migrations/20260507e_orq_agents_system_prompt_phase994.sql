-- Phase 999.4 Fix C — orq_agents.system_prompt.
--
-- The Router-direct path (web/lib/automations/orq-agents/client.ts ::
-- invokeOrqModel) needs the agent's system prompt at request-build time
-- because it bypasses the Orq Agents-product runtime (which would otherwise
-- inject the prompt server-side).
--
-- Studio remains the editorial SSOT for prompts. Operators sync the prompt
-- text into this column via a one-line UPDATE whenever they change it in
-- Studio. The 60s in-memory cache (SYSTEM_PROMPT_CACHE_TTL_MS in client.ts)
-- bounds prompt-drift between Studio edit and Router-path consumption.
--
-- Population: Plan 03 / Wave 2 ships this migration BEFORE flipping Stage 0
-- + Stage 1 to invokeOrqModel. UPDATE statements that copy the current
-- Studio prompts into this column are owned by Operations (recorded in
-- SUMMARY.md as a deferred item if the prod sync is not yet done).

alter table public.orq_agents
  add column if not exists system_prompt text;

comment on column public.orq_agents.system_prompt is
  'Phase 999.4 Fix C — system prompt for the Router-direct path '
  '(invokeOrqModel). SSOT remains Studio; this column is a synced mirror. '
  '60s in-memory cache bounds prompt-drift. Required when the agent is '
  'invoked via /v2/router/chat/completions; ignored on the Agents-product path.';
