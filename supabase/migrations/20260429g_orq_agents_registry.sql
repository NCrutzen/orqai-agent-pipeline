-- Phase 56-02 wave 3: Orq.ai agent registry.
--
-- Mirror of public.zapier_tools — single source of truth for which Orq agents
-- exist, what shape they take, and what they're allowed to do. Adding/swapping
-- an agent = INSERT/UPDATE one row; no env var, no Vercel deploy.
--
-- Multiple agents will follow as the swarm grows (intent, drafter, dispute,
-- address-change, peppol, etc. — see Agents/debtor-email-swarm/agents/).
-- Cross-cutting agents (label tiebreaker) live here too, with swarm_type
-- 'cross-cutting'.

create table if not exists public.orq_agents (
  agent_key      text primary key
                  check (agent_key ~ '^[a-z0-9][a-z0-9-]+[a-z0-9]$'),
  orqai_id       text not null unique,
  description    text not null,
  swarm_type     text not null,         -- 'debtor-email' | 'sales-email' | 'cross-cutting'
  version        text not null,         -- '2026-04-23.v1' or similar
  input_schema   jsonb not null default '{}'::jsonb,
  output_schema  jsonb not null default '{}'::jsonb,
  model_config   jsonb not null default '{}'::jsonb,  -- primary + fallbacks
  timeout_ms     int not null default 45000,          -- CLAUDE.md mandate
  enabled        boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orq_agents_swarm_idx
  on public.orq_agents (swarm_type, enabled);

create or replace function public.orq_agents_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orq_agents_updated_at on public.orq_agents;
create trigger orq_agents_updated_at
  before update on public.orq_agents
  for each row execute function public.orq_agents_set_updated_at();

grant select on public.orq_agents to anon, authenticated, service_role;
grant insert, update, delete on public.orq_agents to service_role;

-- Seed: 2 deployed agents from the debtor-email swarm (Phase 1) +
-- 1 placeholder for the existing label-tiebreaker (cross-cutting).

insert into public.orq_agents
  (agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, notes)
values
  (
    'debtor-intent-agent',
    '01KPWWA338NDNEJZQGJCTVPMY8',
    'Stage 2 LLM classifier on the unknown bucket. Routes to one of 8 actionable intents (copy_document_request, payment_dispute, address_change, etc.) and extracts a best-effort document_reference.',
    'debtor-email',
    '2026-04-23.v1',
    jsonb_build_object(
      'type','object',
      'required', array['email','language','entity_hint'],
      'properties', jsonb_build_object(
        'email',         jsonb_build_object('type','object','description','subject + body + sender'),
        'language',      jsonb_build_object('type','string','enum',array['nl','be-nl','en','de','fr']),
        'entity_hint',   jsonb_build_object('type','string','description','smeba | smeba-fire | sicli-noord | sicli-sud | berki | fire-control')
      )
    ),
    jsonb_build_object(
      'type','object',
      'required', array['intent','confidence','intent_version'],
      'properties', jsonb_build_object(
        'intent',             jsonb_build_object('type','string','enum',array['copy_document_request','payment_dispute','address_change','credit_request','contract_inquiry','peppol_request','general_inquiry','still_unknown']),
        'confidence',         jsonb_build_object('type','string','enum',array['high','medium','low']),
        'document_reference', jsonb_build_object('type',array['string','null']),
        'intent_version',     jsonb_build_object('type','string')
      )
    ),
    jsonb_build_object(
      'primary',  'anthropic/claude-haiku-4-5-20251001',
      'fallbacks', array['anthropic/claude-sonnet-4-6','openai/gpt-4o','google-ai/gemini-2.5-pro','mistral/mistral-large-latest'],
      'temperature', 0,
      'max_tokens', 600
    ),
    45000,
    true,
    'Spec: Agents/debtor-email-swarm/agents/debtor-intent-agent.md'
  ),
  (
    'debtor-copy-document-body-agent',
    '01KPWWCCEX26VYT9E21Q43XN4S',
    'Generates the HTML cover-letter body for an automated invoice-copy reply in iController. Pure LLM, single-shot, no tools. Output consumed verbatim by createIcontrollerDraft.',
    'debtor-email',
    '2026-04-23.v1',
    jsonb_build_object(
      'type','object',
      'required', array['email','language','entity','intent_result','fetched_document_metadata'],
      'properties', jsonb_build_object(
        'email',                     jsonb_build_object('type','object','description','subject + body + sender + email_id'),
        'language',                  jsonb_build_object('type','string','enum',array['nl','be-nl','en','de','fr']),
        'entity',                    jsonb_build_object('type','object','description','entity name + display name + register'),
        'intent_result',             jsonb_build_object('type','object','description','from intent agent'),
        'fetched_document_metadata', jsonb_build_object('type','object','description','from /fetch-document — invoice_id, invoice_number, customer_id, etc.')
      )
    ),
    jsonb_build_object(
      'type','object',
      'required', array['body_html','detected_tone','body_version'],
      'properties', jsonb_build_object(
        'body_html',     jsonb_build_object('type','string','description','HTML cover letter, ends with audit footer'),
        'detected_tone', jsonb_build_object('type','string','enum',array['neutral','de-escalation']),
        'body_version',  jsonb_build_object('type','string')
      )
    ),
    jsonb_build_object(
      'primary',  'anthropic/claude-sonnet-4-6',
      'fallbacks', array['openai/gpt-4o','google-ai/gemini-2.5-pro','anthropic/claude-sonnet-4-5','mistral/mistral-large-latest'],
      'temperature', 0,
      'max_tokens', 900
    ),
    45000,
    true,
    'Spec: Agents/debtor-email-swarm/agents/debtor-copy-document-body-agent.md. Idempotent on primary model only (temperature 0). Footer block with body_version + email_id is post-validated.'
  ),
  (
    'label-tiebreaker',
    'PLACEHOLDER_LABEL_TIEBREAKER_SLUG',
    'Multi-candidate disambiguation for the resolveDebtor pipeline (D-12 / D-13). Pre-fetched candidate context, never given tool-use access to NXT. Output post-validated against allowed candidate IDs.',
    'cross-cutting',
    '1.0',
    jsonb_build_object(
      'type','object',
      'required', array['email_subject','email_body','candidates'],
      'properties', jsonb_build_object(
        'email_subject', jsonb_build_object('type','string'),
        'email_body',    jsonb_build_object('type','string'),
        'candidates',    jsonb_build_object('type','array','description','customer_account_id + customer_name + (optional) contactperson_name + recent_invoices + last_interaction')
      )
    ),
    jsonb_build_object(
      'type','object',
      'required', array['selected_account_id','confidence','reason'],
      'properties', jsonb_build_object(
        'selected_account_id', jsonb_build_object('type','string'),
        'confidence',          jsonb_build_object('type','string','enum',array['high','medium','low']),
        'reason',              jsonb_build_object('type','string','minLength',1)
      )
    ),
    jsonb_build_object(
      'primary',  'anthropic/claude-sonnet-4-6',
      'fallbacks', array['openai/gpt-4o','google-ai/gemini-2.5-pro','anthropic/claude-sonnet-4-5']
    ),
    45000,
    false,  -- disabled until orqai_id is filled in (currently uses LABEL_TIEBREAKER_AGENT_SLUG env var)
    'Currently invoked via LABEL_TIEBREAKER_AGENT_SLUG env in lib/automations/debtor-email/llm-tiebreaker.ts. Wave 3 migrates to consume this row. Set orqai_id to the actual slug + flip enabled=true to activate registry path.'
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
  notes         = excluded.notes,
  updated_at    = now();
