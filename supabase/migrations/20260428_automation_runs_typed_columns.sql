-- Phase 60-00 (D-11, D-13, D-27). Promote queue-routing fields out of
-- automation_runs.result jsonb into typed top-level columns + add the four
-- composite indexes that serve the queue-page counts + cursor list. Backfill
-- runs against existing debtor-email-review rows; SET NOT NULL on
-- swarm_type is intentionally deferred to a follow-up migration after a
-- one-day clean-write window confirms no straggler rows arrive null.

alter table public.automation_runs
  add column if not exists swarm_type  text,
  add column if not exists topic       text,
  add column if not exists entity      text,
  add column if not exists mailbox_id  int;

-- Backfill from JSONB shape (verified vs route.ts:272-289).
-- mailbox_id mapping mirrors web/lib/automations/debtor-email/mailboxes.ts (ICONTROLLER_MAILBOXES).
update public.automation_runs ar
set
  swarm_type = coalesce(ar.swarm_type, 'debtor-email'),
  topic      = coalesce(ar.topic,      ar.result->'predicted'->>'category'),
  entity     = coalesce(ar.entity,     ar.result->>'entity'),
  mailbox_id = coalesce(
    ar.mailbox_id,
    case ar.result->>'source_mailbox'
      when 'debiteuren@smeba.nl'      then 4
      when 'debiteuren@smeba-fire.nl' then 5
      when 'debiteuren@sicli-noord.nl' then 15
      when 'debiteuren@sicli-sud.nl'   then 16
      when 'debiteuren@berki.nl'       then 171
      else null
    end
  )
where ar.automation = 'debtor-email-review'
  and ar.swarm_type is null;

-- Catch automation_runs rows that have no source_mailbox in result -- still
-- backfill swarm_type/topic/entity so the not-null follow-up has a clean run.
update public.automation_runs
set
  swarm_type = coalesce(swarm_type, 'debtor-email'),
  topic      = coalesce(topic,      result->'predicted'->>'category'),
  entity     = coalesce(entity,     result->>'entity')
where automation = 'debtor-email-review'
  and swarm_type is null;

-- TODO follow-up: once a 1-day clean-write window confirms zero straggler
-- nulls, ship a follow-up migration with
--   alter table public.automation_runs alter column swarm_type set not null;

-- Verification block (analog 20260423_mailbox_settings_expansion.sql:60-70).
do $$
declare
  missing_count int;
begin
  select count(*) into missing_count
    from public.automation_runs
   where automation = 'debtor-email-review'
     and swarm_type is null;
  if missing_count > 0 then
    raise warning
      'automation_runs has % debtor-email-review row(s) without swarm_type after backfill -- investigate before SET NOT NULL.',
      missing_count;
  end if;
end$$;

-- D-13/D-27 composite indexes.
create index if not exists automation_runs_status_swarm_idx
  on public.automation_runs (status, swarm_type);
create index if not exists automation_runs_status_entity_idx
  on public.automation_runs (status, entity);
create index if not exists automation_runs_status_mailbox_idx
  on public.automation_runs (status, mailbox_id);
create index if not exists automation_runs_swarm_status_created_idx
  on public.automation_runs (swarm_type, status, created_at desc);
