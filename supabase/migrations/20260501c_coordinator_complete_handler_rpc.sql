-- Phase 65 D-04 — fan-in RPC. Atomic increment + atomic single-claim of synthesis dispatch.
-- Caller (Stage 4 handler) emits debtor-email/synthesis.requested only when claim_synthesis=true.
-- Per RESEARCH OQ2: app-side emit, not pg_net (keeps Inngest concurrency + replay safety in app code).
--
-- Threat T-65-01: SECURITY DEFINER + set search_path = public (prevents search_path hijack);
-- revoke all from public; grant execute to service_role only.
-- Threat T-65-02: race condition mitigated by single-row UPDATE with
--   `where synthesis_dispatched_at is null and completed_handlers >= expected_handlers`
-- (Postgres atomic UPDATE — second simultaneous caller gets v_claimed=NULL → false).

create or replace function public.coordinator_complete_handler(
  p_run_id uuid,
  p_failed boolean default false
)
returns table(completed_handlers int, expected_handlers int, claim_synthesis boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed int;
  v_expected  int;
  v_claimed   boolean;
begin
  -- 1. Atomic increment.
  update public.coordinator_runs
     set completed_handlers = coordinator_runs.completed_handlers + 1,
         failed_handlers    = coordinator_runs.failed_handlers + case when p_failed then 1 else 0 end
   where run_id = p_run_id
   returning coordinator_runs.completed_handlers, coordinator_runs.expected_handlers
     into v_completed, v_expected;

  if not found then
    raise exception 'coordinator_runs row not found for run_id=%', p_run_id using errcode = 'P0002';
  end if;

  -- 2. Atomic single-claim of synthesis dispatch (Pitfall 2 race-guard).
  -- Only one caller wins; second simultaneous handler gets v_claimed=NULL → false.
  update public.coordinator_runs
     set synthesis_dispatched_at = now()
   where run_id = p_run_id
     and synthesis_dispatched_at is null
     and coordinator_runs.completed_handlers >= coordinator_runs.expected_handlers
   returning true into v_claimed;

  return query select v_completed, v_expected, coalesce(v_claimed, false);
end;
$$;

revoke all on function public.coordinator_complete_handler(uuid, boolean) from public;
grant execute on function public.coordinator_complete_handler(uuid, boolean) to service_role;
