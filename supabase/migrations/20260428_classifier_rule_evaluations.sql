-- Phase 60-00 (D-06). Append-only audit table -- one row per rule per cron
-- run. Drives the dashboard CI-lo trend sparkline + flapping debug. Volume is
-- low (<=60 rows/day at full swarm coverage). Same-day re-trigger is
-- idempotent via UNIQUE(swarm_type, rule_key, evaluated_at::date).

create table if not exists public.classifier_rule_evaluations (
  id            uuid primary key default gen_random_uuid(),
  swarm_type    text not null,
  rule_key      text not null,
  n             int not null,
  agree         int not null,
  ci_lo         numeric not null,
  action        text not null check (action in (
    'no_change',
    'promoted',
    'demoted',
    'shadow_would_promote',
    'shadow_would_demote'
  )),
  evaluated_at  timestamptz not null default now()
);

-- Pitfall 7: idempotency for same-day re-runs (manual cron re-trigger).
create unique index if not exists classifier_rule_evaluations_daily_uniq
  on public.classifier_rule_evaluations
  (swarm_type, rule_key, ((evaluated_at at time zone 'UTC')::date));

create index if not exists classifier_rule_evaluations_lookup_idx
  on public.classifier_rule_evaluations (swarm_type, rule_key, evaluated_at desc);

alter table public.classifier_rule_evaluations enable row level security;
