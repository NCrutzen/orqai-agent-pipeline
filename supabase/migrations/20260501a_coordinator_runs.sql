-- Phase 65 D-11: coordinator_runs table holds Phase 65 persistence needs.
-- Joined to automation_runs by Bulk Review; partial_synthesis badge reads from here.
-- Per RESEARCH Pitfall 2: synthesis_dispatched_at is the atomic single-claim
-- guard exercised by the coordinator_complete_handler RPC.
-- Per RESEARCH Pitfall 5 / OQ4: cost_cents_total + tokens_total cover Phase 64
-- D-15 budget propagation under one shared run.

create table if not exists public.coordinator_runs (
  run_id                  uuid primary key,
  automation_run_id       uuid references public.automation_runs(id),
  email_id                text not null,
  swarm_type              text not null,
  ranked_intents          jsonb not null,
  escalation_decision     text not null check (escalation_decision in ('single_shot','orchestrator')),
  escalation_reason       text check (escalation_reason in ('low_confidence','high_intent_count','requires_orchestration_flag') or escalation_reason is null),
  expected_handlers       int  not null default 1,
  completed_handlers      int  not null default 0,
  failed_handlers         int  not null default 0,
  partial_synthesis       boolean not null default false,
  budget_run_id           text,
  synthesis_dispatched_at timestamptz,                -- RESEARCH Pitfall 2 race-guard
  cost_cents_total        int not null default 0,    -- RESEARCH Pitfall 5 / OQ4
  tokens_total            int not null default 0,
  created_at              timestamptz not null default now(),
  completed_at            timestamptz
);

create index if not exists coordinator_runs_run_idx          on public.coordinator_runs (run_id);
create index if not exists coordinator_runs_swarm_idx        on public.coordinator_runs (swarm_type, created_at desc);
create index if not exists coordinator_runs_automation_idx   on public.coordinator_runs (automation_run_id);
create index if not exists coordinator_runs_email_idx        on public.coordinator_runs (email_id);

-- RLS — service_role full, authenticated select (mirror swarm_registry pattern).
alter table public.coordinator_runs enable row level security;

drop policy if exists coordinator_runs_service_all on public.coordinator_runs;
create policy coordinator_runs_service_all   on public.coordinator_runs for all    to service_role using (true) with check (true);

drop policy if exists coordinator_runs_auth_select on public.coordinator_runs;
create policy coordinator_runs_auth_select   on public.coordinator_runs for select to authenticated using (true);

-- Realtime publication for Bulk Review live updates (mirror swarm_registry pattern).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coordinator_runs'
    ) then
      execute 'alter publication supabase_realtime add table public.coordinator_runs';
    end if;
  end if;
end $$;

grant select on public.coordinator_runs to authenticated;
grant all    on public.coordinator_runs to service_role;
