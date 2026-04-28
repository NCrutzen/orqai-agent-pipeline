-- Phase 60-00 (D-13). RPC powering the queue-page tree counts. Single
-- round-trip GROUP BY (swarm_type, topic, entity, mailbox_id) over rows in
-- status='predicted'. Stable function -> Postgres can plan with the
-- (status, swarm_type) and (swarm_type, status, created_at desc) indexes.

create or replace function public.classifier_queue_counts(p_swarm_type text)
returns table (
  swarm_type text,
  topic      text,
  entity     text,
  mailbox_id int,
  count      bigint
)
language sql stable as $$
  select
    ar.swarm_type,
    ar.topic,
    ar.entity,
    ar.mailbox_id,
    count(*)::bigint as count
  from public.automation_runs ar
  where ar.status = 'predicted'
    and ar.swarm_type = p_swarm_type
  group by ar.swarm_type, ar.topic, ar.entity, ar.mailbox_id;
$$;

grant execute on function public.classifier_queue_counts(text) to authenticated, service_role;
