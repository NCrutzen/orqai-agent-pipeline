-- Phase 74 — Stage 1 LLM category classifier agent registry row.
-- D-05 (cross-cutting), D-06 (strict json_schema, anyOf-nullable reasoning).
--
-- orqai_id is a placeholder. Plan 03 runs the Studio + MCP ritual:
--   list_models -> create_agent -> Studio JSON Schema tool ->
--   update_agent -> get_agent verify
-- and only then UPDATEs orqai_id with the real slug AND flips enabled=true.
--
-- The on-conflict clause below intentionally OMITS orqai_id and enabled
-- so that re-running this migration does not stomp Plan 03's activation.

insert into public.orq_agents (
  agent_key, orqai_id, description, swarm_type, version,
  input_schema, output_schema, model_config, timeout_ms, enabled, notes
) values (
  'stage-1-category-classifier',
  'PLACEHOLDER_STAGE1_CLASSIFIER_SLUG',
  'Swarm-agnostic Stage 1 LLM category classifier. Reads enabled swarm_categories at call time and emits one of (category_key, "unknown") with confidence low/medium/high. Phase 74.',
  'cross-cutting',
  '2026-05-06.v1',
  jsonb_build_object(
    'type','object',
    'required', array['subject','body_text','categories'],
    'properties', jsonb_build_object(
      'subject',    jsonb_build_object('type','string'),
      'body_text',  jsonb_build_object('type','string'),
      'categories', jsonb_build_object(
        'type','array',
        'items', jsonb_build_object(
          'type','object',
          'required', array['category_key','display_label'],
          'properties', jsonb_build_object(
            'category_key',  jsonb_build_object('type','string'),
            'display_label', jsonb_build_object('type','string')
          )
        )
      )
    )
  ),
  jsonb_build_object(
    'type','object',
    'required', array['category_key','confidence','reasoning'],
    'additionalProperties', false,
    'properties', jsonb_build_object(
      'category_key', jsonb_build_object('type','string'),
      'confidence',   jsonb_build_object('type','string','enum', array['low','medium','high']),
      'reasoning',    jsonb_build_object('anyOf', jsonb_build_array(
        jsonb_build_object('type','string'),
        jsonb_build_object('type','null')
      ))
    )
  ),
  jsonb_build_object(
    'primary',  'aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0',
    'fallbacks', array['openai/gpt-4o-mini','google-ai/gemini-2.5-flash'],
    'temperature', 0,
    'max_tokens', 400
  ),
  45000,
  false,  -- enabled=false until orqai_id is set in Studio AND get_agent verified
  'D-05/D-06 (Phase 74). Strict json_schema with anyOf-nullable reasoning. Activate via UPDATE orqai_id=<slug>, enabled=true after MCP ritual: list_models -> create_agent -> Studio JSON Schema tool -> update_agent -> get_agent verify.'
)
on conflict (agent_key) do update set
  description   = excluded.description,
  swarm_type    = excluded.swarm_type,
  version       = excluded.version,
  input_schema  = excluded.input_schema,
  output_schema = excluded.output_schema,
  model_config  = excluded.model_config,
  timeout_ms    = excluded.timeout_ms,
  notes         = excluded.notes,
  updated_at    = now();
