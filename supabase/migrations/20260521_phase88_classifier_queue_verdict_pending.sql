-- Phase 88 D-02: verdict-pending scalar count for Stage 1 'Needs review' chip.
-- Replaces the previous client-side aggregation (topic !== 'skip' sum) in
-- noise-category-chip-strip.tsx with a server-side anti-join against
-- email_feedback.
--
-- Signal: row in automation_runs.status='predicted' for this swarm AND no
-- row in email_feedback at stage=1 for that email_id (canonical Stage 1
-- verdict marker per supabase/migrations/20260513c_email_feedback.sql).
--
-- JOIN-shape note (verified against migrations on 2026-05-20):
-- public.automation_runs has NO top-level email_id column. The email_id lives
-- inside result jsonb as result->>'email_id'. The regex guard before the
-- ::uuid cast is required because some legacy/smoke rows have non-UUID
-- synthetic email_id values (e.g. 'smoke-safe-2') which would otherwise crash
-- the cast at query time. Pattern mirrors
-- supabase/migrations/20260510_phase80_agent_runs_stuck_classifying_view.sql
-- lines 22-24.

create or replace function public.classifier_queue_verdict_pending(p_swarm_type text)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
  select count(*)::bigint
  from public.automation_runs ar
  where ar.status = 'predicted'
    and ar.swarm_type = p_swarm_type
    and (ar.result->>'email_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.email_feedback ef
      where ef.email_id = (ar.result->>'email_id')::uuid
        and ef.stage = 1
    );
$$;

revoke execute on function public.classifier_queue_verdict_pending(text) from public, anon;
grant execute on function public.classifier_queue_verdict_pending(text) to authenticated, service_role;
