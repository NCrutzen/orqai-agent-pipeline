-- Phase 04-07: ClickUp create-task async-callback rework.
--
-- Reworks the clickup-create-task Zapier integration from the broken `sync`
-- pattern to the proven `async_callback` pattern (mirrors debtor.nxt_lookup_requests).
--
-- Why: a Zapier Catch Hook CANNOT return a synchronous custom response.
-- The sync pattern in clickup-zap-client.ts parsed { clickup_task_id,
-- clickup_task_url } from the POST response — which will never arrive.
--
-- This migration:
--   1. Creates public.support_clickup_create_requests (tracking table for Realtime wait)
--   2. Enables RLS + service_role ALL policy (CLAUDE.md mandatory pattern)
--   3. Adds the table to the supabase_realtime publication (required for Realtime waiter)
--   4. Updates zapier_tools row: pattern='async_callback', callback_route set
--
-- Additive + idempotent.

-- ---------------------------------------------------------------------------
-- 1. Tracking table
-- ---------------------------------------------------------------------------

create table if not exists public.support_clickup_create_requests (
  id                 uuid primary key,
  submission_id      uuid,
  status             text not null default 'pending'
                     check (status in ('pending', 'done', 'error')),
  clickup_task_id    text,
  clickup_task_url   text,
  error              text,
  payload            jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists support_clickup_create_requests_status_idx
  on public.support_clickup_create_requests (status, created_at desc);

create index if not exists support_clickup_create_requests_submission_idx
  on public.support_clickup_create_requests (submission_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. RLS (mandatory — CLAUDE.md: RLS verplicht op elke nieuwe tabel)
-- ---------------------------------------------------------------------------

alter table public.support_clickup_create_requests enable row level security;

-- Service-role-only: backend automation writes only, no authenticated/anon access.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'support_clickup_create_requests'
      and policyname = 'support_clickup_create_requests_service_all'
  ) then
    execute $policy$
      create policy support_clickup_create_requests_service_all
        on public.support_clickup_create_requests
        for all
        to service_role
        using (true)
        with check (true)
    $policy$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Realtime publication (required for Realtime waiter in clickup-zap-client.ts)
-- ---------------------------------------------------------------------------

-- Mirror of debtor.nxt_lookup_requests pattern:
--   alter publication supabase_realtime add table debtor.nxt_lookup_requests;
alter publication supabase_realtime add table public.support_clickup_create_requests;

-- ---------------------------------------------------------------------------
-- 4. Update zapier_tools registry row
-- ---------------------------------------------------------------------------

update public.zapier_tools
set
  pattern        = 'async_callback',
  callback_route = '/api/automations/support-tickets/clickup-create/callback',
  updated_at     = now()
where tool_id = 'clickup-create-task';

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------

do $$
declare
  v_table_exists  boolean;
  v_rls_enabled   boolean;
  v_policy_exists boolean;
  v_tool_pattern  text;
  v_tool_route    text;
begin
  select exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'support_clickup_create_requests'
  ) into v_table_exists;

  select relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'support_clickup_create_requests'
  into v_rls_enabled;

  select exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'support_clickup_create_requests'
      and policyname = 'support_clickup_create_requests_service_all'
  ) into v_policy_exists;

  select pattern, callback_route
  from public.zapier_tools
  where tool_id = 'clickup-create-task'
  into v_tool_pattern, v_tool_route;

  raise notice '04-07 verification: table=% rls=% policy=% tool_pattern=% callback_route=%',
    v_table_exists, v_rls_enabled, v_policy_exists, v_tool_pattern, v_tool_route;

  if not v_table_exists then
    raise exception '04-07: support_clickup_create_requests table missing';
  end if;
  if not v_rls_enabled then
    raise exception '04-07: RLS not enabled on support_clickup_create_requests';
  end if;
  if not v_policy_exists then
    raise exception '04-07: service_role policy missing on support_clickup_create_requests';
  end if;
  if v_tool_pattern <> 'async_callback' then
    raise exception '04-07: zapier_tools pattern not updated (got: %)', v_tool_pattern;
  end if;
end;
$$;
