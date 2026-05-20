-- Phase 88 D-02 (revised post-UAT 2026-05-20). Rebuilds the two Stage 1 chip-
-- strip count RPCs on the same data source the visible row list reads from
-- (pipeline_events_email_summary + predicted-status join) so chip counts
-- match what operators see.
--
-- History:
--   - 2026-04-28: classifier_queue_counts ran over automation_runs.status=
--     'predicted'. Counts included rows already auto-handled (status moved
--     to 'completed') and rows outside the Stage 0 'safe' window. UI list
--     reads from pipeline_events_email_summary + predicted-status filter,
--     so chip counts drifted by up to 12× from visible-list lengths.
--   - 2026-05-20 (this migration, initial draft): added a verdict-pending
--     RPC anti-join on automation_runs + email_feedback. UAT showed it
--     was worse (198 for debtor-email vs 9 visible). Reverted before apply.
--   - 2026-05-20 (this migration, current): rebuild BOTH RPCs on the
--     pipeline_events_email_summary path used by the loader at
--     web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:711-808.
--
-- Semantic model (mirrors the loader exactly):
--   1. Take pipeline_events_email_summary rows for the swarm with
--      stage_0_decision='safe'. The view aggregates every email with a
--      Stage 1 emit, including auto-handled ones.
--   2. Filter to emails whose automation_runs row is still status=
--      'predicted' (i.e. awaiting operator review). Bridge:
--      automation_runs.result->>'message_id' = email_pipeline.emails.source_id
--      → email_pipeline.emails.id = pipeline_events_email_summary.email_id.
--   3. classifier_queue_counts groups the result by topic/entity/mailbox_id.
--      classifier_queue_verdict_pending returns the total scalar count.
--
-- Hard-separation invariant (RFC docs/agentic-pipeline/README.md):
--   Stage 1 chip-strip counts ONLY. No swarm_intents touch here; the
--   topic comes from automation_runs.topic which is the Stage 1 noise
--   classifier output, not Stage 3 intent.

create or replace function public.classifier_queue_counts(p_swarm_type text)
returns table (
  swarm_type text,
  topic      text,
  entity     text,
  mailbox_id int,
  count      bigint
)
language sql
stable
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
  with predicted as (
    select
      ar.id as automation_run_id,
      ar.topic,
      ar.entity,
      ar.mailbox_id,
      ar.result->>'message_id' as message_id
    from public.automation_runs ar
    where ar.swarm_type = p_swarm_type
      and ar.status = 'predicted'
  ),
  predicted_emails as (
    select
      e.id as email_id,
      p.topic,
      p.entity,
      p.mailbox_id
    from predicted p
    join email_pipeline.emails e on e.source_id = p.message_id
  )
  select
    p_swarm_type as swarm_type,
    pe.topic,
    pe.entity,
    pe.mailbox_id,
    count(distinct s.email_id)::bigint as count
  from public.pipeline_events_email_summary s
  join predicted_emails pe on pe.email_id = s.email_id
  where s.swarm_type = p_swarm_type
    and s.stage_0_decision = 'safe'
  group by pe.topic, pe.entity, pe.mailbox_id;
$$;

revoke execute on function public.classifier_queue_counts(text) from public, anon;
grant execute on function public.classifier_queue_counts(text) to authenticated, service_role;

create or replace function public.classifier_queue_verdict_pending(p_swarm_type text)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
  with predicted_emails as (
    select e.id as email_id
    from public.automation_runs ar
    join email_pipeline.emails e on e.source_id = ar.result->>'message_id'
    where ar.swarm_type = p_swarm_type
      and ar.status = 'predicted'
  )
  select count(distinct s.email_id)::bigint
  from public.pipeline_events_email_summary s
  join predicted_emails pe on pe.email_id = s.email_id
  where s.swarm_type = p_swarm_type
    and s.stage_0_decision = 'safe';
$$;

revoke execute on function public.classifier_queue_verdict_pending(text) from public, anon;
grant execute on function public.classifier_queue_verdict_pending(text) to authenticated, service_role;
