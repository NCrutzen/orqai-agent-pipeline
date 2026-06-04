-- ============================================================================
-- 20260602a_support_tickets_phase4_handlers.sql
--
-- Phase 4 (Stage 4 Handlers + i18n) — handler-side foundation. ONE idempotent
-- migration that:
--   §A. Adds vendor_email + vendor_signal_keywords to support_software_systems
--       (Phase 4 HANDLE-06 — vendor-signal detection + vendor-mail draft target).
--   §B. Adds stage4_completed_at, stage4_cost_cents, handler_executed,
--       outbound_clickup_task_id to support_tickets
--       (Phase 4 HANDLE-08 — per-submission handler audit trail).
--   §C. Finalizes swarm_intents.handler_event for swarm_type='support-tickets'
--       (Phase 4 — handler_status stays 'placeholder' until each handler is
--       shipped + graduated in code; see Plans 04-03..04-05).
--   §D. Seeds the clickup-create-task row in zapier_tools
--       (Plan 04-05 escalate-handler MUST fail-closed on the TODO_ placeholder
--       target_url until operator wires the Zap on the Zapier side).
--   §E. RAISE NOTICE verification block — informative output for the
--       human-verify checkpoint.
--
-- Idempotent: all ALTERs use IF NOT EXISTS, INSERT uses ON CONFLICT DO NOTHING,
-- UPDATE is guarded by a NULL/wrong-shape predicate so re-apply is a no-op.
-- Additive only — no DEFAULTs that touch existing rows, no DROP / RENAME /
-- DELETE. Existing RLS on the three target tables is inherited; no new policies
-- needed.
--
-- Apply via:
--   cd agent-workforce
--   npx supabase db query --linked --file supabase/migrations/20260602a_support_tickets_phase4_handlers.sql
--
-- Filename convention: YYYYMMDD<suffix>_<name>.sql (Phase 1 lesson).
-- Apply with `db query --linked --file`, NOT `db push` (Phase 2+3 proven path).
-- ============================================================================

-- §A. support_software_systems — vendor outreach extensions ------------------
-- Phase 4 HANDLE-06: vendor-signal detection (keyword match) + vendor-mail
-- draft target (vendor_email). Both NULLable; registry rows enrich over time.

alter table public.support_software_systems
  add column if not exists vendor_email          text,
  add column if not exists vendor_signal_keywords text[];

comment on column public.support_software_systems.vendor_email is
  'Phase 4 HANDLE-06: vendor support inbox. NULL until enriched. vendor-draft handler targets this address.';
comment on column public.support_software_systems.vendor_signal_keywords is
  'Phase 4 HANDLE-06: lowercase keywords that signal a vendor-side issue (e.g. {"server down","outage","login broken"}). Matched against transcript for vendor-draft routing.';

-- §B. support_tickets — handler audit trail ---------------------------------
-- Phase 4 HANDLE-08: per-submission handler audit. All NULLable until the
-- handler runs for that ticket.

alter table public.support_tickets
  add column if not exists stage4_completed_at      timestamptz,
  add column if not exists stage4_cost_cents        numeric(10,4),
  add column if not exists handler_executed         text,
  add column if not exists outbound_clickup_task_id text;

comment on column public.support_tickets.stage4_completed_at is
  'Phase 4 HANDLE-08: timestamp the stage-4 handler finished for this ticket. NULL until handler dispatch.';
comment on column public.support_tickets.stage4_cost_cents is
  'Phase 4 HANDLE-08: LLM + tool cost in cents (4 decimal places) attributable to the stage-4 handler run.';
comment on column public.support_tickets.handler_executed is
  'Phase 4 HANDLE-08: which handler key (matches swarm_intents.intent_key) actually ran for this ticket.';
comment on column public.support_tickets.outbound_clickup_task_id is
  'Phase 4 HANDLE-08: ClickUp task id returned by the clickup-create-task Zap (when handler_executed = clickup-escalate). NULL otherwise.';

-- §C. swarm_intents — finalize handler_event names --------------------------
-- Sets handler_event = 'support-tickets/<intent_key>.requested' for any
-- support-tickets row whose handler_event is NULL or does not match the
-- expected pattern. Pre-existing valid values are preserved (T-04-01-05).

update public.swarm_intents
  set handler_event = 'support-tickets/' || intent_key || '.requested',
      updated_at    = now()
  where swarm_type = 'support-tickets'
    and (handler_event is null
         or handler_event not like 'support-tickets/%.requested');

-- §D. zapier_tools — clickup-create-task seed -------------------------------
-- Plan 04-05 clickup-escalate-handler will call this tool. The target_url is
-- a TODO placeholder so Plan 04-05's fail-closed test can fire on the
-- 'TODO_' prefix until the operator wires the Zap (see notes column).
--
-- allowed_for_intents='{clickup-escalate}' is the authorization gate
-- (T-04-01-02 mitigation, reuses nxt-zap-client.ts default-deny pattern).

insert into public.zapier_tools (
  tool_id,
  description,
  backend,
  pattern,
  target_url,
  auth_method,
  auth_secret_env,
  auth_field_name,
  input_schema,
  output_schema,
  allowed_for_intents,
  enabled,
  notes
)
values (
  'clickup-create-task',
  'Create a ClickUp task in a given software-system list with assignee + body. Used by support-tickets clickup-escalate-handler.',
  'zapier',
  'sync',
  'TODO_set_from_zapier_dashboard',
  'body_field',
  'SUPPORT_CLICKUP_ZAP_SECRET',
  'auth',
  jsonb_build_object(
    'list_id', 'text',
    'assignee_user_id', 'text',
    'name', 'text',
    'description', 'text',
    'custom_fields', jsonb_build_object('submission_id', 'uuid')
  ),
  jsonb_build_object(
    'clickup_task_id', 'text',
    'clickup_task_url', 'text'
  ),
  array['clickup-escalate']::text[],
  true,
  'Operator must (1) configure the Zap on Zapier side, (2) UPDATE target_url with the Zap catch-hook URL, (3) set SUPPORT_CLICKUP_ZAP_SECRET in Vercel env. Until those 3 steps land, clickup-escalate-handler MUST fail-closed with a Kanban fallback row.'
)
on conflict (tool_id) do nothing;

-- §E. Verification block — RAISE NOTICE counts for human-verify checkpoint --
-- The migration runner will print these counts; the human-verify checkpoint
-- gates on them. Expected on a clean apply:
--   clickup_create_task_rows = 1
--   new_support_tickets_columns = 4
--   support_tickets_handler_event_rows = 5

do $$
declare
  v_clickup_rows           int;
  v_new_st_columns         int;
  v_handler_event_rows     int;
  v_new_sss_columns        int;
begin
  select count(*) into v_clickup_rows
    from public.zapier_tools
   where tool_id = 'clickup-create-task';

  select count(*) into v_new_st_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'support_tickets'
     and column_name in (
       'stage4_completed_at',
       'stage4_cost_cents',
       'handler_executed',
       'outbound_clickup_task_id'
     );

  select count(*) into v_new_sss_columns
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'support_software_systems'
     and column_name in ('vendor_email', 'vendor_signal_keywords');

  select count(*) into v_handler_event_rows
    from public.swarm_intents
   where swarm_type = 'support-tickets'
     and handler_event like 'support-tickets/%.requested';

  raise notice '== Phase 4 Plan 01 migration verification ==';
  raise notice 'zapier_tools.clickup-create-task rows: % (expect 1)', v_clickup_rows;
  raise notice 'support_tickets new columns present:   % of 4 (expect 4)', v_new_st_columns;
  raise notice 'support_software_systems new columns:  % of 2 (expect 2)', v_new_sss_columns;
  raise notice 'swarm_intents handler_event coverage:  % of 5 (expect 5)', v_handler_event_rows;

  if v_clickup_rows <> 1 or v_new_st_columns <> 4 or v_new_sss_columns <> 2 or v_handler_event_rows <> 5 then
    raise warning 'Phase 4 Plan 01 migration verification mismatch — review counts above.';
  end if;
end
$$;
