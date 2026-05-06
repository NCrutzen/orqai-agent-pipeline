-- Phase 74-05 — sales-email ingest tool registered in public.zapier_tools.
--
-- Operator decision (2026-05-06): option-a (Zapier-driven, production
-- wiring). The existing Zapier zap "MR || Sales email analyzer" polls
-- SugarCRM (Emails module, 1-min cadence) and POSTs new records to
-- /api/automations/sales-email/ingest. Step 3 of that zap (previously a
-- direct Orq.ai call) is replaced by this Vercel ingest route.
--
-- Auth: shared-secret body field (per CLAUDE.md zapier-patterns.md —
-- Catch Hooks don't expose request headers reliably in Zapier's field
-- picker). Env var name: SALES_EMAIL_INGEST_WEBHOOK_SECRET (the registry
-- holds the env-var NAME, not the value).
--
-- input_schema describes the SugarCRM Emails-record subset the route
-- consumes; the SugarAI trigger's record shape is the source-of-truth.

insert into public.zapier_tools (
  tool_id,
  description,
  backend,
  pattern,
  target_url,
  auth_method,
  auth_secret_env,
  auth_field_name,
  input_schema,
  output_schema,
  enabled,
  notes
) values (
  'sales-email-ingest',
  'Receive new SugarCRM Emails records and emit stage-0/email.received for the sales-email swarm. Replaces Step 3 of the legacy "MR || Sales email analyzer" zap (which called Orq.ai directly).',
  'vercel',
  'sync',
  'https://agent-workforce.vercel.app/api/automations/sales-email/ingest',
  'body_field',
  'SALES_EMAIL_INGEST_WEBHOOK_SECRET',
  'auth',
  jsonb_build_object(
    'type', 'object',
    'required', array['auth', 'id'],
    'properties', jsonb_build_object(
      'auth',             jsonb_build_object('type','string','description','Shared secret matching SALES_EMAIL_INGEST_WEBHOOK_SECRET env var.'),
      'id',               jsonb_build_object('type','string','description','SugarCRM Emails record id (used as source_id; stable across retries).'),
      'name',             jsonb_build_object('type',array['string','null'],'description','SugarCRM "name" field === email subject.'),
      'description',      jsonb_build_object('type',array['string','null'],'description','Plain-text body.'),
      'description_html', jsonb_build_object('type',array['string','null'],'description','HTML body (used as fallback when description is empty).'),
      'from_addr_name',   jsonb_build_object('type',array['string','null']),
      'from_addr_email',  jsonb_build_object('type',array['string','null']),
      'date_entered',     jsonb_build_object('type',array['string','null'],'description','ISO timestamp; fallback for received_at.'),
      'date_sent',        jsonb_build_object('type',array['string','null'],'description','ISO timestamp; preferred for received_at.'),
      'message_id',       jsonb_build_object('type',array['string','null'],'description','RFC 822 message-id if SugarCRM has it; otherwise route synthesizes sugar:<id>.')
    )
  ),
  jsonb_build_object(
    'type','object',
    'properties', jsonb_build_object(
      'ok',                  jsonb_build_object('type','boolean'),
      'automation_run_id',   jsonb_build_object('type','string'),
      'email_id',            jsonb_build_object('type',array['string','null']),
      'source_id',           jsonb_build_object('type','string'),
      'error',               jsonb_build_object('type',array['string','null'])
    )
  ),
  true,
  'Phase 74-05. swarm_type=''sales-email'' and entity=null are hardcoded inside the route at the ingest boundary (D-01/D-02 — registry-driven downstream workers must NEVER re-derive these literals).'
)
on conflict (tool_id) do update set
  description     = excluded.description,
  backend         = excluded.backend,
  pattern         = excluded.pattern,
  target_url      = excluded.target_url,
  auth_method     = excluded.auth_method,
  auth_secret_env = excluded.auth_secret_env,
  auth_field_name = excluded.auth_field_name,
  input_schema    = excluded.input_schema,
  output_schema   = excluded.output_schema,
  enabled         = excluded.enabled,
  notes           = excluded.notes,
  updated_at      = now();
