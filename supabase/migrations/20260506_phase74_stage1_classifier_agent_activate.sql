-- Phase 74 — Activate stage-1-category-classifier after Orq.ai
-- create -> PATCH -> get_agent ritual (CLAUDE.md cba7352b learning).
--
-- Orq slug: 01KQY3ZXEX17RSXFV3CMKRS0T7
-- Workspace: cura  ·  Path: Debtor Team/stage-1
-- URL: https://my.orq.ai/cura/agents/01KQY3ZXEX17RSXFV3CMKRS0T7
--
-- Verified 2026-05-06 via mcp__orqai-mcp__get_agent:
--   - model.id = aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0
--   - model.parameters.temperature = 0
--   - model.parameters.max_tokens = 400
--   - model.parameters.response_format = strict json_schema
--     (anyOf-nullable reasoning per CLAUDE.md 3970bad9)
--   - fallback_models = [openai/gpt-4o-mini, google-ai/gemini-2.5-flash],
--     each with its own response_format strict json_schema (so the JSON
--     contract holds across the entire failover chain).
--
-- Smoke test: invoke_agent on OOO fixture returned category_key='ooo_temporary'
-- with confidence='high'. (Note: MCP Responses API path returns code-fence
-- wrapped text; production code uses web/lib/automations/orq-agents/client.ts
-- which injects response_format strict per-call from orq_agents.output_schema,
-- bypassing this MCP-path quirk — same pattern proven by debtor-intent-agent.)

update public.orq_agents
set
  orqai_id   = '01KQY3ZXEX17RSXFV3CMKRS0T7',
  enabled    = true,
  notes      = 'Phase 74 active. Strict json_schema response_format persisted via PATCH (CLAUDE.md cba7352b). Cross-swarm.',
  updated_at = now()
where agent_key = 'stage-1-category-classifier';
