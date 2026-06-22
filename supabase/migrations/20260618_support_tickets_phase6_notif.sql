-- 20260618_support_tickets_phase6_notif.sql
--
-- Phase 6 (notificatie-voorkeuren & e-mail-aflevering) — database foundation.
--
-- Creates two new tables:
--   A. support_notification_preferences — per-user e-mail toggle preferences
--      (master + 4 per-type booleans). Keyed on canonical lowercased login email
--      (the alias-lookup key per D-09). Defaults encode D-07.
--   B. support_ticket_last_seen — per-user per-ticket last-seen timestamp for
--      badge/unread tracking (D-03). Composite PK (user_email, external_task_id).
--
-- Also adds a dedup index on the EXISTING support_notifications table for
-- efficient ontdubbeling queries (D-10).
--
-- RLS (CLAUDE.md): every new public table has RLS enabled + a service_role FOR ALL
-- policy. Both tables are UI-readable so they also get an authenticated FOR SELECT
-- own-row policy keyed on auth.users.email. NEVER anon/public policies.
--
-- WRITE PATH: server actions and Inngest functions use createAdminClient()
-- (service_role). No INSERT/UPDATE policy for authenticated — ownership is
-- enforced in server-side code.
-- READ PATH: settings page / ticket pages may use createClient() (authenticated)
-- for their own rows via the _auth_select policy below.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A. support_notification_preferences
--    One row per user (keyed on canonical lowercased login email).
--    Defaults encode D-07:
--      email_enabled       = true  (master — all e-mail)
--      email_on_resolved   = true  (fire when ticket resolved/closed)
--      email_on_rejected   = true  (stored; UI shows "binnenkort" per D-11)
--      email_on_other_status = false  (status changes besides resolved/rejected)
--      email_on_reactions  = false  (stored; UI shows "binnenkort" per D-11)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_notification_preferences (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email            text        NOT NULL UNIQUE,   -- lowercased canonical login email; alias-lookup key (D-09)
  email_enabled         boolean     NOT NULL DEFAULT true,   -- master toggle
  email_on_resolved     boolean     NOT NULL DEFAULT true,
  email_on_rejected     boolean     NOT NULL DEFAULT true,   -- stored; UI "binnenkort" (D-11)
  email_on_other_status boolean     NOT NULL DEFAULT false,
  email_on_reactions    boolean     NOT NULL DEFAULT false,  -- stored; UI "binnenkort" (D-11)
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.support_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_notification_preferences_service_all
  ON public.support_notification_preferences;
CREATE POLICY support_notification_preferences_service_all
  ON public.support_notification_preferences
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can SELECT only their own row (settings page read path).
-- Writes go through server actions / Inngest using createAdminClient (service_role).
DROP POLICY IF EXISTS support_notification_preferences_auth_select
  ON public.support_notification_preferences;
CREATE POLICY support_notification_preferences_auth_select
  ON public.support_notification_preferences
  FOR SELECT
  TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

GRANT SELECT ON public.support_notification_preferences TO authenticated;
GRANT ALL    ON public.support_notification_preferences TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- B. support_ticket_last_seen
--    Badge / unread tracking: one row per (user_email, external_task_id).
--    external_task_id matches support_tickets_cache.external_task_id (ClickUp task id).
--    last_seen_at is upserted when a user opens a ticket detail page, clearing
--    the unread dot on the next list render (D-03).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_last_seen (
  user_email        text        NOT NULL,
  external_task_id  text        NOT NULL,   -- ClickUp task id (matches support_tickets_cache PK)
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_email, external_task_id)
);

ALTER TABLE public.support_ticket_last_seen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_last_seen_service_all
  ON public.support_ticket_last_seen;
CREATE POLICY support_ticket_last_seen_service_all
  ON public.support_ticket_last_seen
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can SELECT only their own rows (badge data on ticket list).
-- Writes (upsert on ticket open) go via createAdminClient (service_role).
DROP POLICY IF EXISTS support_ticket_last_seen_auth_select
  ON public.support_ticket_last_seen;
CREATE POLICY support_ticket_last_seen_auth_select
  ON public.support_ticket_last_seen
  FOR SELECT
  TO authenticated
  USING (user_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

GRANT SELECT ON public.support_ticket_last_seen TO authenticated;
GRANT ALL    ON public.support_ticket_last_seen TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Dedup index on EXISTING support_notifications table
--    Efficient query for checking whether a (ticket, kind) pair has already
--    been delivered — supports the D-10 ontdubbeling in email-notifier.ts.
--    No column changes; delivered_at already exists (per 20260526a_... line ~153).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS support_notifications_dedup_idx
  ON public.support_notifications (support_ticket_id, kind, delivered_at);

COMMIT;
