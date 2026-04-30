-- Phase 64 BUDG-03 / D-17: 7-day rolling median for per-email cost outlier flag.
--
-- Bootstrap guard (Pitfall 6): is_cost_outlier=false when window has <100
-- samples. Without this, the very first run after deploy would always be
-- flagged "outlier" against a tiny sample, alarm-fatiguing operators.
--
-- Outlier definition: cost_cents > 3.0 * percentile_disc(0.5) over the past
-- p_window_days (default 7) of automation_runs whose result jsonb carries
-- a `cost_cents` key (i.e. only Stage 0 + future LLM-bearing runs).
--
-- Read-time pure SQL function: cheap to call from the loader on every page
-- render. No materialised view needed at this volume (low-thousands runs
-- per week per swarm; whole-window scan is sub-100ms with the existing
-- created_at b-tree on automation_runs).

create or replace function public.automation_runs_with_outlier(
  p_swarm_type text,
  p_window_days int default 7,
  p_min_samples int default 100,
  p_outlier_multiplier numeric default 3.0
)
returns table (
  id uuid,
  topic text,
  cost_cents int,
  median_cost_cents numeric,
  sample_count int,
  is_cost_outlier boolean,
  created_at timestamptz,
  result jsonb
)
language sql
stable
as $$
  with recent as (
    select
      id, topic, created_at, result,
      coalesce((result ->> 'cost_cents')::int, 0) as cost_cents
    from public.automation_runs
    where swarm_type = p_swarm_type
      and created_at > now() - make_interval(days => p_window_days)
      and result ? 'cost_cents'
  ),
  stats as (
    select
      count(*)::int as sample_count,
      percentile_disc(0.5) within group (order by cost_cents) as median_cost_cents
    from recent
  )
  select
    r.id,
    r.topic,
    r.cost_cents,
    s.median_cost_cents,
    s.sample_count,
    case
      when s.sample_count < p_min_samples then false
      when s.median_cost_cents = 0 then false
      else r.cost_cents > p_outlier_multiplier * s.median_cost_cents
    end as is_cost_outlier,
    r.created_at,
    r.result
  from recent r cross join stats s;
$$;

grant execute on function public.automation_runs_with_outlier(text, int, int, numeric) to service_role;
grant execute on function public.automation_runs_with_outlier(text, int, int, numeric) to authenticated;
