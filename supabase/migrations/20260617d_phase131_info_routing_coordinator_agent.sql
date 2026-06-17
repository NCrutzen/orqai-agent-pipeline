-- Phase 131 Plan 02 (ROUTE-03) — register the `info-routing-coordinator` Orq
-- agent in public.orq_agents.
--
-- The agent is the Stage-3 DESTINATION classifier for the info-routing swarm
-- (info@smeba.nl): it reads a Stage-1-cleared actionable email and returns a
-- closed-list bucket + brand + categorical confidence. Mirrors the
-- debtor-intent-agent row shape (20260429g lines 54-88), with the CLAUDE.md
-- Orq-strict correction: the nullable `brand` uses `anyOf` with {"type":"null"},
-- NOT the ["string","null"] array-shorthand the legacy debtor row uses at
-- 20260429g:75 (that shorthand is rejected by Orq strict mode — learning
-- 3970bad9). Single-value literals use enum-with-one-value, never `const`.
--
-- SINGLE SOURCE OF TRUTH: the output_schema `bucket.enum` below is the codegen'd
-- DESTINATION_KEYS_BY_SWARM["info-routing"] from
-- web/lib/swarms/routing-destinations.generated.ts (Plan 01). It MUST stay in
-- lockstep with that file and with the Zod gate in
-- web/lib/automations/info-routing/coordinator-schema.ts. Adding a bucket =
-- INSERT a routing_destinations row + `npm run codegen` + re-PATCH the agent +
-- bump this seed.
--
-- ⚠ orqai_id is a PLACEHOLDER. The real Orq agent id is produced when the
-- operator runs web/scripts/orq/manage-info-routing-coordinator.ts (list_models
-- → create-bare → PATCH model.parameters → get_agent verify) and is filled in
-- here at the Plan-02 Task-3 blocking-human checkpoint BEFORE this migration is
-- applied to remote. ON CONFLICT (agent_key) DO UPDATE keeps the apply
-- idempotent if the placeholder is updated and re-applied.
--
-- Model routing (CLAUDE.md, list_models-validated by the manage script):
--   primary  = aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0  (Bedrock EU)
--   fallbacks= openai/gpt-4o-mini, google-ai/gemini-2.5-flash, mistral/mistral-large-2411

insert into public.orq_agents
  (agent_key, orqai_id, description, swarm_type, version,
   input_schema, output_schema, model_config, timeout_ms, enabled, notes)
values
  (
    'info-routing-coordinator',
    '01KVA6BAVS6QWJBHQVENB74R8S',
    'Stage 3 destination classifier for the info-routing swarm (info@smeba.nl). Routes a Stage-1-cleared actionable email onto a closed-list destination bucket (order_entry, verkoop, inspecties, storingen, opleidingen, sollicitaties, algemeen, or the unrouted sentinel) + brand (smeba | fire-control | berki | null) + categorical confidence. Chooses unrouted rather than guess when no destination clearly applies.',
    'info-routing',
    '2026-06-17.v1',
    -- input_schema: the email + Stage-1 context the coordinator passes in.
    jsonb_build_object(
      'type','object',
      'required', array['email'],
      'properties', jsonb_build_object(
        'email',    jsonb_build_object('type','object','description','subject + body + sender for the Stage-1-cleared actionable email'),
        'language', jsonb_build_object('type','string','description','best-effort detected language (nl|en|de|fr); advisory')
      )
    ),
    -- output_schema: the Discretion-3 closed-list shape. bucket enum is the
    -- codegen'd DESTINATION_KEYS_BY_SWARM['info-routing']; nullable brand uses
    -- anyOf (NEVER the array-shorthand). Single source of truth with
    -- coordinator-schema.ts + routing-destinations.generated.ts.
    jsonb_build_object(
      'type','object',
      'additionalProperties', false,
      'required', array['bucket','brand','confidence','reasoning'],
      'properties', jsonb_build_object(
        'bucket', jsonb_build_object(
          'type','string',
          'enum', array['algemeen','inspecties','opleidingen','order_entry','sollicitaties','storingen','unrouted','verkoop']
        ),
        'brand', jsonb_build_object(
          'anyOf', jsonb_build_array(
            jsonb_build_object('type','string','enum', array['smeba','fire-control','berki']),
            jsonb_build_object('type','null')
          )
        ),
        'confidence', jsonb_build_object('type','string','enum', array['low','medium','high']),
        'reasoning',  jsonb_build_object('type','string','maxLength', 200)
      )
    ),
    -- model_config: primary + fallbacks (list_models-validated by the manage
    -- script before any create/PATCH). temperature 0, bounded max_tokens.
    jsonb_build_object(
      'primary',   'aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0',
      'fallbacks', array['openai/gpt-4o-mini','google-ai/gemini-2.5-flash','mistral/mistral-large-2411'],
      'temperature', 0,
      'max_tokens', 600
    ),
    90000,
    true,
    'Phase 131 Plan 02 (ROUTE-03). Build via web/scripts/orq/manage-info-routing-coordinator.ts (list_models -> create-bare -> PATCH model.parameters -> get_agent verify). Studio JSON-schema Response Format set manually (Orq MCP exposes no tool CRUD). Fill orqai_id from Studio before applying. bucket enum is codegen DESTINATION_KEYS_BY_SWARM[info-routing]; brand nullable via anyOf (3970bad9). swarms.stage3_coordinator_agent_key already set by Plan 01 (20260617b).'
  )
on conflict (agent_key) do update set
  orqai_id      = excluded.orqai_id,
  description   = excluded.description,
  swarm_type    = excluded.swarm_type,
  version       = excluded.version,
  input_schema  = excluded.input_schema,
  output_schema = excluded.output_schema,
  model_config  = excluded.model_config,
  timeout_ms    = excluded.timeout_ms,
  enabled       = excluded.enabled,
  notes         = excluded.notes,
  updated_at    = now();
