-- ============================================================================
-- 20260602b_support_tickets_phase5_outbound.sql
--
-- Phase 5 (Outbound ClickUp sync + admin view) — schema foundation.
-- ONE additive, idempotent migration that:
--   §A. Adds support_software_systems.last_clickup_sync_at
--       (Phase 5 ADMIN-03 — admin-view renders registry sync-status).
--   §B. RAISE NOTICE verification block — informative output for the
--       human-verify checkpoint.
--
-- ────────────────────────────────────────────────────────────────────────────
-- COLUMNS PHASE 5 REUSES FROM EARLIER MIGRATIONS (DO NOT RECREATE)
-- ────────────────────────────────────────────────────────────────────────────
-- From Phase 1 (20260526a_support_tickets_phase1.sql):
--   support_tickets:
--     final_system, final_assignee, final_intent    (lines 86-88)
--     clickup_task_id, clickup_status               (lines 102-103)
--     time_to_resolve_minutes                       (line 104)
--   support_notifications:
--     kind, payload, support_ticket_id, submission_id (table created §E)
--   support_software_systems:
--     id, system_key, display_name, clickup_list_id,
--     default_assignee_user_id, vendor_locale, enabled,
--     created_at, updated_at, vendor_email, vendor_signal_keywords
--
-- From Phase 4 (20260602a_support_tickets_phase4_handlers.sql):
--   support_tickets:
--     outbound_clickup_task_id  (§B, line 55) — correlation key the inbound
--     webhook (Plans 05-02/05-03) joins on; NOT the same as clickup_task_id.
--
-- Phase 5 consumers:
--   Plan 05-03 (outbound Inngest fn) reads outbound_clickup_task_id and writes
--   to support_notifications using kind/payload columns.
--   Plan 05-04 (admin view) reads support_software_systems including
--   last_clickup_sync_at to render sync-status badges.
-- ────────────────────────────────────────────────────────────────────────────
--
-- Idempotent: ALTER uses IF NOT EXISTS so re-apply is a no-op.
-- Additive only — no DROP / RENAME / DELETE / DEFAULT touching existing rows.
-- Existing RLS on support_software_systems (service_role ALL + authenticated
-- SELECT, Phase 1 service_all policy) is inherited; adding a column needs no
-- new policy (T-05-01-02 mitigation).
--
-- Apply via:
--   cd agent-workforce
--   npx supabase db query --linked --file supabase/migrations/20260602b_support_tickets_phase5_outbound.sql
--
-- NOTE: The agent sandbox classifier blocks --linked DB writes. This file is
-- committed as the deliverable; the operator applies it with the command above.
-- ============================================================================

-- §A. support_software_systems — registry sync-status column ----------------
-- Phase 5 ADMIN-03: timestamp of last successful ClickUp registry sync.
-- The admin-view renders a sync-status badge from this value:
--   NULL        → "never synced"
--   < 24h ago   → "synced"
--   >= 24h ago  → "sync stale"
-- Plan 05-05 (admin sync action) writes this column after a successful sync.

alter table public.support_software_systems
  add column if not exists last_clickup_sync_at timestamptz;

comment on column public.support_software_systems.last_clickup_sync_at is
  'Phase 5 ADMIN-03: timestamp of last successful ClickUp registry sync; admin-view renders sync-status from this. NULL = never synced.';

-- §B. Verification block — RAISE NOTICE count for human-verify checkpoint ---
-- The migration runner will print this count.
-- Expected on a clean apply:
--   last_clickup_sync_at_column = 1

do $$
declare
  v_sync_col int;
begin
  select count(*) into v_sync_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'support_software_systems'
     and column_name  = 'last_clickup_sync_at';

  raise notice '== Phase 5 Plan 01 migration verification ==';
  raise notice 'support_software_systems.last_clickup_sync_at present: % (expect 1)', v_sync_col;

  if v_sync_col <> 1 then
    raise warning 'Phase 5 Plan 01 migration verification mismatch — last_clickup_sync_at column not found.';
  end if;
end
$$;
