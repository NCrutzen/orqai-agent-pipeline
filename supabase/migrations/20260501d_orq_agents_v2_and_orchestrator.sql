-- Phase 65 Plan 02: register/update Orq agent rows for ranked coordinator + orchestrator + synthesis.
--
-- Studio is the source of truth for prompt + response_format binding (set inline via
-- model.parameters.response_format on each agent — see .planning/phases/65-stage-3-ranked-multi-intent-coordinator/.orq-agents/*.json).
-- The rows below mirror Studio's output_schema so web/lib/automations/orq-agents/client.ts:invokeOrqAgent
-- can do defence-in-depth zod validation BEFORE/AFTER Orq's own json_schema enforcement.
--
-- Mandatory rules (CLAUDE.md):
--   - All nullable fields use anyOf only (per learning 3970bad9 — array-shorthand variants rejected by Orq strict mode).
--   - All model IDs verified by list_models pre-flight 2026-05-03 (snapshot:
--     .planning/phases/65-stage-3-ranked-multi-intent-coordinator/65-list-models-snapshot.json).
--   - Per CLAUDE.md historical errata: agents MUST NOT reference deprecated/non-existent model IDs.
--
-- Idempotent: UPDATE statement is targeted; INSERTs use ON CONFLICT (agent_key) DO UPDATE.

-- ----------------------------------------------------------------------------
-- 1) UPDATE debtor-intent-agent → v2 (D-01, D-12).
--    orqai_id stays (01KQECK191GE21CH8D8KEMTM9J — replace-in-place per D-01).
-- ----------------------------------------------------------------------------
update public.orq_agents
   set version       = '2026-05-01.v2',
       description   = 'Phase 65 D-12 ranked-intent coordinator (Stage 3). Outputs ordered list of intents (1..5 entries) with confidence. Replaces single-label v1 schema. Multilingual NL/EN/DE/FR.',
       model_config  = jsonb_build_object(
         'primary',     'anthropic/claude-sonnet-4-5-20250929',
         'fallbacks',   jsonb_build_array(
           'aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
           'openai/gpt-4o',
           'google-ai/gemini-2.5-pro',
           'mistral/mistral-large-2411'
         ),
         'temperature', 0.0
       ),
       output_schema = jsonb_build_object(
         'type', 'object',
         'additionalProperties', false,
         'required', jsonb_build_array('ranked','language','urgency','intent_version'),
         'properties', jsonb_build_object(
           'ranked', jsonb_build_object(
             'type', 'array',
             'minItems', 1,
             'maxItems', 5,
             'items', jsonb_build_object(
               'type', 'object',
               'additionalProperties', false,
               'required', jsonb_build_array('intent','confidence','document_reference','sub_type','reasoning'),
               'properties', jsonb_build_object(
                 'intent',     jsonb_build_object('type','string','enum', jsonb_build_array('copy_document_request','payment_dispute','address_change','peppol_request','credit_request','contract_inquiry','general_inquiry','other')),
                 'confidence', jsonb_build_object('type','string','enum', jsonb_build_array('low','medium','high')),
                 'document_reference', jsonb_build_object('anyOf', jsonb_build_array(
                   jsonb_build_object('type','string','maxLength',64),
                   jsonb_build_object('type','null')
                 )),
                 'sub_type', jsonb_build_object('anyOf', jsonb_build_array(
                   jsonb_build_object('type','string','enum', jsonb_build_array('invoice','credit_note','werkbon','contract','quote')),
                   jsonb_build_object('type','null')
                 )),
                 'reasoning', jsonb_build_object('type','string','maxLength',200)
               )
             )
           ),
           'language',       jsonb_build_object('type','string','enum', jsonb_build_array('nl','en','de','fr')),
           'urgency',        jsonb_build_object('type','string','enum', jsonb_build_array('low','normal','high')),
           'intent_version', jsonb_build_object('type','string','const','2026-05-01.v2')
         )
       ),
       notes = 'Phase 65 D-12. Inline model.parameters.response_format set in Orq Studio (json_schema strict). Cache invalidation via intent_version literal flip from v1.',
       updated_at = now()
 where agent_key = 'debtor-intent-agent';

-- ----------------------------------------------------------------------------
-- 2) INSERT debtor-orchestrator-agent (D-03).
--    orqai_id = 01KQPA63RJ726GA6399K3NDGTK (created via REST API 2026-05-03).
-- ----------------------------------------------------------------------------
insert into public.orq_agents
  (agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, notes)
values
  (
    'debtor-orchestrator-agent',
    '01KQPA63RJ726GA6399K3NDGTK',
    'Phase 65 D-03 orchestrator-planner. Runs only on Stage 3 escalation. Input: email + ranked intents + PipelineStageContext. Output: per-handler execution plan with context_payload extraction.',
    'debtor-email',
    '2026-05-01.v1',
    jsonb_build_object(
      'type','object',
      'required', jsonb_build_array('email','ranked_intents','pipeline_context'),
      'properties', jsonb_build_object(
        'email',            jsonb_build_object('type','object','description','subject + body + sender + email_id'),
        'ranked_intents',   jsonb_build_object('type','array','description','coordinator output ranked[] entries'),
        'pipeline_context', jsonb_build_object('type','object','description','PipelineStageContext (Phase 64 D-13)')
      )
    ),
    jsonb_build_object(
      'type','object',
      'additionalProperties', false,
      'required', jsonb_build_array('handlers','ordering','notes'),
      'properties', jsonb_build_object(
        'handlers', jsonb_build_object(
          'type','array',
          'minItems', 1,
          'maxItems', 5,
          'items', jsonb_build_object(
            'type','object',
            'additionalProperties', false,
            'required', jsonb_build_array('handler_key','intent','context_payload'),
            'properties', jsonb_build_object(
              'handler_key',     jsonb_build_object('type','string'),
              'intent',          jsonb_build_object('type','string','enum', jsonb_build_array('copy_document_request','payment_dispute','address_change','peppol_request','credit_request','contract_inquiry','general_inquiry','other')),
              'context_payload', jsonb_build_object('type','object','additionalProperties', true)
            )
          )
        ),
        'ordering', jsonb_build_object('type','string','enum', jsonb_build_array('parallel','sequential')),
        'notes',    jsonb_build_object('anyOf', jsonb_build_array(
          jsonb_build_object('type','string','maxLength',500),
          jsonb_build_object('type','null')
        ))
      )
    ),
    jsonb_build_object(
      'primary',     'anthropic/claude-sonnet-4-5-20250929',
      'fallbacks',   jsonb_build_array(
        'aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'openai/gpt-4o',
        'google-ai/gemini-2.5-pro',
        'mistral/mistral-large-2411'
      ),
      'temperature', 0.0
    ),
    45000,
    true,
    'Phase 65 D-03. Inline json_schema strict (debtor_orchestrator_response_v1) set in Studio. Spec: docs/agentic-pipeline/stage-3-coordinator.md.'
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

-- ----------------------------------------------------------------------------
-- 3) INSERT synthesis-agent (D-06; swarm_type='cross-cutting' alongside label-tiebreaker).
--    orqai_id = 01KQPA6TQ5Z2JXQW8WGM3XKATC (created via REST API 2026-05-03).
-- ----------------------------------------------------------------------------
insert into public.orq_agents
  (agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, notes)
values
  (
    'synthesis-agent',
    '01KQPA6TQ5Z2JXQW8WGM3XKATC',
    'Phase 65 D-06 cross-cutting synthesis. Input: HandlerOutput[] from N parallel Stage 4 handlers. Output: single body_html + detected_tone + synthesis_version, ready for iController draft.',
    'cross-cutting',
    '2026-05-01.v1',
    jsonb_build_object(
      'type','object',
      'required', jsonb_build_array('run_id','handler_outputs','partial_synthesis'),
      'properties', jsonb_build_object(
        'run_id',            jsonb_build_object('type','string','description','coordinator_runs.run_id (UUID)'),
        'handler_outputs',   jsonb_build_object('type','array','description','HandlerOutput[] from web/lib/agentic-pipeline/types.ts'),
        'partial_synthesis', jsonb_build_object('type','boolean','description','true when not all handlers completed (D-05)')
      )
    ),
    jsonb_build_object(
      'type','object',
      'additionalProperties', false,
      'required', jsonb_build_array('body_html','detected_tone','synthesis_version'),
      'properties', jsonb_build_object(
        'body_html',         jsonb_build_object('type','string','minLength',1),
        'detected_tone',     jsonb_build_object('type','string','enum', jsonb_build_array('neutral','de-escalation')),
        'synthesis_version', jsonb_build_object('type','string','const','2026-05-01.v1')
      )
    ),
    jsonb_build_object(
      'primary',     'anthropic/claude-sonnet-4-5-20250929',
      'fallbacks',   jsonb_build_array(
        'aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
        'openai/gpt-4o',
        'google-ai/gemini-2.5-pro',
        'mistral/mistral-large-2411'
      ),
      'temperature', 0.0
    ),
    45000,
    true,
    'Phase 65 D-06. Inline json_schema strict (synthesis_response_v1) set in Studio. Cross-cutting like label-tiebreaker — first non-debtor consumer is sales-email Phase 73 (zero code change expected).'
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
