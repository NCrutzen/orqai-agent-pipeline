-- Debtor email swarm: per-run audit + HITL verdict + self-training signal.
--
-- Written per blueprint in
--   Agents/debtor-email-swarm/blueprint.md §5
--   Agents/debtor-email-swarm/ORCHESTRATION.md (state machine)
--
-- One row per (email_id, body_version) invocation. Inngest writes incrementally:
--   classify-intent    → INSERT with intent + intent_version + confidence
--   fetch-document     → UPDATE tool_outputs.fetch (ok/not_found/transient)
--   generate-body      → UPDATE tool_outputs.body + body_version
--   create-draft       → UPDATE tool_outputs.draft + draft_url + status
--   persist-run        → final UPDATE status to terminal kanban state
--
-- Reviewer verdict lands later via /api/automations/debtor/verdict:
--   human_verdict, human_notes, verdict_set_at.

create schema if not exists debtor;

create table if not exists debtor.agent_runs (
  id                 uuid primary key default gen_random_uuid(),
  email_id           uuid not null,            -- email_pipeline.emails.id (soft ref)
  inngest_run_id     text,                     -- correlation across Orq/Inngest/Supabase
  entity             text not null check (entity in (
    'smeba', 'berki', 'sicli-noord', 'sicli-sud', 'smeba-fire'
  )),

  -- Intent-agent output
  intent             text check (intent in (
    'copy_document_request', 'payment_dispute', 'address_change',
    'peppol_request', 'credit_request', 'contract_inquiry',
    'general_inquiry', 'other'
  )),
  sub_type           text,                     -- invoice|credit_note|werkbon|contract|quote|null
  document_reference text,
  language           text check (language in ('nl', 'en', 'de', 'fr')),
  confidence         text check (confidence in ('low', 'medium', 'high')),
  urgency            text check (urgency in ('low', 'normal', 'high')),
  intent_version     text,                     -- e.g. 2026-04-23.v1
  reasoning          text,                     -- intent-agent explanation (≤500 chars)

  -- Body-agent output
  body_version       text,
  detected_tone      text check (detected_tone in ('neutral', 'de-escalation')),

  -- Tool outputs (fetchDocument metadata, createDraft screenshots, errors per step)
  tool_outputs       jsonb not null default '{}'::jsonb,
  draft_url          text,

  -- Kanban state machine — drives the JobBoard columns in the swarm page
  status             text not null check (status in (
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

  -- Human-in-the-loop verdict (NULL until reviewer labels it in iController/dashboard)
  human_verdict      text check (human_verdict in (
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
  human_notes        text,
  verdict_set_at     timestamptz,
  verdict_set_by     text,                     -- reviewer identifier

  -- Audit
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  completed_at       timestamptz                -- when status entered a terminal state
);

-- Primary lookup: dashboard-per-email drill-in.
create index if not exists agent_runs_email_id_idx
  on debtor.agent_runs (email_id, created_at desc);

-- Kanban column queries: WHERE status = 'X' ORDER BY created_at DESC.
create index if not exists agent_runs_status_idx
  on debtor.agent_runs (status, created_at desc);

-- Human-review queue: fast "unlabeled drafts" filter.
create index if not exists agent_runs_needs_verdict_idx
  on debtor.agent_runs (created_at desc)
  where human_verdict is null
    and status in ('copy_document_drafted', 'copy_document_needs_review',
                   'copy_document_failed_not_found', 'copy_document_failed_transient');

-- Analytics per intent — drives Autonomous Briefing metrics.
create index if not exists agent_runs_intent_idx
  on debtor.agent_runs (intent, created_at desc)
  where intent is not null;

-- Prompt-version A/B analytics: join on (intent_version, body_version, human_verdict).
create index if not exists agent_runs_versions_idx
  on debtor.agent_runs (intent_version, body_version)
  where intent_version is not null;

-- Entity scoping for per-mailbox dashboards.
create index if not exists agent_runs_entity_status_idx
  on debtor.agent_runs (entity, status, created_at desc);

-- GIN on tool_outputs for ad-hoc debugging ("find runs where fetchDocument errored with timeout").
create index if not exists agent_runs_tool_outputs_gin_idx
  on debtor.agent_runs using gin (tool_outputs);

-- Auto-maintain updated_at on every UPDATE.
create or replace function debtor.agent_runs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists agent_runs_set_updated_at on debtor.agent_runs;
create trigger agent_runs_set_updated_at
  before update on debtor.agent_runs
  for each row execute function debtor.agent_runs_set_updated_at();

-- Service role only; Vercel/Inngest writes use service role key.
alter table debtor.agent_runs enable row level security;

-- Realtime publication for the swarm-page JobBoard live updates.
-- Follows repo convention: see 20260423_fetch_requests.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'debtor'
      and tablename = 'agent_runs'
  ) then
    alter publication supabase_realtime add table debtor.agent_runs;
  end if;
end$$;

-- Circuit-breaker state for createIcontrollerDraft. Single row, keyed by name.
-- Inngest checks before each create-draft call; flips to 'open' on login_failed,
-- auto half-opens after 30 min, closes on a successful probe.
create table if not exists debtor.automation_state (
  key           text primary key,
  state         text not null check (state in ('closed', 'open', 'half_open')) default 'closed',
  opened_at     timestamptz,
  last_error    text,
  updated_at    timestamptz not null default now(),
  updated_by    text
);

alter table debtor.automation_state enable row level security;

insert into debtor.automation_state (key, state) values
  ('icontroller_drafter_breaker', 'closed')
on conflict (key) do nothing;
