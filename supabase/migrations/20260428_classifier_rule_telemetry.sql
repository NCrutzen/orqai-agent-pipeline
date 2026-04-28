-- Phase 60-00 (RESEARCH Open Q #4). View decoupling the promotion cron from
-- the agent_runs JSONB shape. Cron reads (swarm_type, rule_key, n, agree)
-- and feeds wilsonCiLower(n, agree). Service-role only.

create or replace view public.classifier_rule_telemetry as
select
  ar.swarm_type,
  ar.rule_key,
  count(*)::int                                                                  as n,
  count(*) filter (where ar.human_verdict in ('approved', 'edited_minor'))::int  as agree
from public.agent_runs ar
where ar.rule_key is not null
  and ar.human_verdict is not null
group by ar.swarm_type, ar.rule_key;

grant select on public.classifier_rule_telemetry to service_role;
