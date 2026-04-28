-- Phase 60-00 (D-01, D-23). Absorbs Phase 55-05: rename debtor.agent_runs ->
-- public.agent_runs as the cross-swarm telemetry discriminator. swarm_type
-- column added so sales-email / planning / order-entry can land in the same
-- table. Backfills existing debtor rows; drops the old debtor.agent_runs at
-- the end of the migration. The single call-site
-- (web/lib/automations/debtor-email/triage/agent-runs.ts) is updated in the
-- same commit.

create table if not exists public.agent_runs (
  id                  uuid primary key default gen_random_uuid(),

  -- Cross-swarm discriminator (D-00, D-01).
  swarm_type          text not null check (swarm_type in (
    'debtor-email', 'sales-email', 'planning', 'order-entry'
  )),

  -- Cross-link back to the originating automation_runs row (D-13/D-27).
  automation_run_id   uuid references public.automation_runs(id),

  email_id            uuid not null,
  inngest_run_id      text,
  entity              text not null check (entity in (
    'smeba', 'berki', 'sicli-noord', 'sicli-sud', 'smeba-fire'
  )),

  -- Rule that fired at predict-time (D-22/D-23). Free-text so regex AND
  -- agent-intent rule_keys (`intent:copy_invoice`) coexist.
  rule_key            text,

  -- Intent-agent output
  intent              text check (intent in (
    'copy_document_request', 'payment_dispute', 'address_change',
    'peppol_request', 'credit_request', 'contract_inquiry',
    'general_inquiry', 'other'
  )),
  sub_type            text,
  document_reference  text,
  language            text check (language in ('nl', 'en', 'de', 'fr')),
  confidence          text check (confidence in ('low', 'medium', 'high')),
  urgency             text check (urgency in ('low', 'normal', 'high')),
  intent_version      text,
  reasoning           text,

  -- Body-agent output
  body_version        text,
  detected_tone       text check (detected_tone in ('neutral', 'de-escalation')),

  -- Tool outputs
  tool_outputs        jsonb not null default '{}'::jsonb,
  draft_url           text,

  -- Kanban state machine
  status              text not null check (status in (
    'classifying',
    'routed_human_queue',
    'fetching_document',
    'generating_body',
    'creating_draft',
    'copy_document_drafted',
    'copy_document_needs_review',
    'copy_document_failed_not_found',
    'copy_document_failed_transient',
    'login_failed_blocked',
    'done'
  )) default 'classifying',

  -- Human-in-the-loop verdict
  human_verdict       text check (human_verdict in (
    'approved',
    'edited_minor',
    'edited_major',
    'rejected_wrong_intent',
    'rejected_wrong_reference',
    'rejected_wrong_attachment',
    'rejected_wrong_language',
    'rejected_wrong_tone',
    'rejected_other'
  )),
  human_notes         text,
  verdict_set_at      timestamptz,
  verdict_set_by      text,

  -- D-25: hand-labels on unknown-rows store the corrected category for
  -- future rule-mining (Phase 61+).
  corrected_category  text,

  -- Audit
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists agent_runs_email_id_idx
  on public.agent_runs (email_id, created_at desc);

create index if not exists agent_runs_needs_verdict_idx
  on public.agent_runs (created_at desc)
  where human_verdict is null;

create index if not exists agent_runs_swarm_idx
  on public.agent_runs (swarm_type);

create index if not exists agent_runs_swarm_rule_idx
  on public.agent_runs (swarm_type, rule_key)
  where rule_key is not null;

create index if not exists agent_runs_automation_run_idx
  on public.agent_runs (automation_run_id)
  where automation_run_id is not null;

-- Auto-maintain updated_at on every UPDATE.
create or replace function public.agent_runs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.agent_runs_set_updated_at();

-- Service role only; RLS on, no client-write policies.
alter table public.agent_runs enable row level security;

-- Realtime publication for live dashboards.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'agent_runs'
  ) then
    alter publication supabase_realtime add table public.agent_runs;
  end if;
end$$;

-- Backfill from debtor.agent_runs if the old table still exists. Safe re-run:
-- ON CONFLICT(id) DO NOTHING.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'debtor' and table_name = 'agent_runs'
  ) then
    insert into public.agent_runs (
      id, swarm_type, email_id, inngest_run_id, entity,
      intent, sub_type, document_reference, language, confidence, urgency,
      intent_version, reasoning, body_version, detected_tone,
      tool_outputs, draft_url, status,
      human_verdict, human_notes, verdict_set_at, verdict_set_by,
      created_at, updated_at, completed_at
    )
    select
      id, 'debtor-email', email_id, inngest_run_id, entity,
      intent, sub_type, document_reference, language, confidence, urgency,
      intent_version, reasoning, body_version, detected_tone,
      tool_outputs, draft_url, status,
      human_verdict, human_notes, verdict_set_at, verdict_set_by,
      created_at, updated_at, completed_at
    from debtor.agent_runs
    on conflict (id) do nothing;
  end if;
end$$;

-- Drop the legacy table; the call-site rename in
-- web/lib/automations/debtor-email/triage/agent-runs.ts lands in the same
-- commit so no live code references it after this migration applies.
drop table if exists debtor.agent_runs cascade;

-- Verification: surface a warning if any debtor-email row was missed.
do $$
declare
  legacy_count int;
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'debtor' and table_name = 'agent_runs'
  ) then
    select count(*) into legacy_count from debtor.agent_runs;
    if legacy_count > 0 then
      raise warning 'debtor.agent_runs still has % row(s) post-migration; investigate before dropping.', legacy_count;
    end if;
  end if;
end$$;
