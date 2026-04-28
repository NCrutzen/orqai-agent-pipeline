-- Phase 60-00 (D-05). public.classifier_rules: cross-swarm whitelist store
-- driving the auto-action decision per (swarm_type, rule_key). Service-role
-- writes only (cron + dashboard server actions); reads via cache.ts module.

create table if not exists public.classifier_rules (
  id              uuid primary key default gen_random_uuid(),
  swarm_type      text not null,
  rule_key        text not null,
  kind            text not null check (kind in ('regex', 'agent_intent')),
  status          text not null check (status in (
    'candidate', 'promoted', 'demoted', 'manual_block'
  )) default 'candidate',
  n               int not null default 0,
  agree           int not null default 0,
  ci_lo           numeric,
  last_evaluated  timestamptz,
  promoted_at     timestamptz,
  last_demoted_at timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (swarm_type, rule_key)
);

create index if not exists classifier_rules_swarm_status_idx
  on public.classifier_rules (swarm_type, status);

-- Auto-maintain updated_at.
create or replace function public.classifier_rules_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists classifier_rules_set_updated_at on public.classifier_rules;
create trigger classifier_rules_set_updated_at
  before update on public.classifier_rules
  for each row execute function public.classifier_rules_set_updated_at();

alter table public.classifier_rules enable row level security;

-- Realtime publication so the /classifier-rules dashboard updates without polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'classifier_rules'
  ) then
    alter publication supabase_realtime add table public.classifier_rules;
  end if;
end$$;
