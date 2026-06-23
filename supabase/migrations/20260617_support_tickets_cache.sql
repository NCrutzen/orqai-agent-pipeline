-- 20260617_support_tickets_cache.sql
--
-- Local read-cache of the ClickUp "Support" list, so the "Mijn tickets" pages
-- read from Postgres instead of hitting the ClickUp API live on every render
-- (faster page loads + lower ClickUp API load).
--
-- WRITE PATH: the existing ClickUp webhook → Inngest event
-- (support-tickets/clickup-status.received) is consumed by a new
-- "support-tickets-clickup-cache-sync" function that upserts these rows.
-- READ PATH: the ticket pages query these tables via createAdminClient()
-- (service_role) and enforce ownership in code (email ∈ caller's M365 aliases),
-- mirroring the existing clickup-read-client IDOR model. Therefore these tables
-- are BACKEND-ONLY — no authenticated/anon policy (RLS denies them by default).
--
-- RLS (CLAUDE.md / _template.sql): every table ENABLEs RLS + has a
-- service_role-only FOR ALL policy. No anon/authenticated grants.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. support_tickets_cache — one row per ClickUp task on the Support list.
--    PK is the ClickUp task id (stable). `email` is the matched Email Address
--    custom field value, lowercased, used to filter a user's aliases on read.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets_cache (
  external_task_id  text PRIMARY KEY,
  email             text,                            -- lowercased; null when the field is unset
  title             text        NOT NULL DEFAULT '',
  raw_status        text        NOT NULL DEFAULT '',
  status_type       text,                            -- ClickUp status.type (open/closed/custom)
  ticket_group      text        NOT NULL DEFAULT 'open'
                      CHECK (ticket_group IN ('open', 'rejected', 'resolved')),
  description       text        NOT NULL DEFAULT '',
  assignee          text,
  summary           text        NOT NULL DEFAULT '',  -- ClickUp AI "Summary" field (solution input)
  date_created      timestamptz,
  date_updated      timestamptz,
  url               text,
  raw               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  synced_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_cache_email_idx
  ON public.support_tickets_cache (email);

ALTER TABLE public.support_tickets_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_cache_service_all ON public.support_tickets_cache;
CREATE POLICY support_tickets_cache_service_all
  ON public.support_tickets_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. support_ticket_comments — task comments, deduped by ClickUp comment id.
--    The sync function replaces a task's comment set on each update, so the
--    UNIQUE(external_task_id, clickup_comment_id) lets us upsert idempotently.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_task_id   text NOT NULL
                       REFERENCES public.support_tickets_cache (external_task_id)
                       ON DELETE CASCADE,
  clickup_comment_id text NOT NULL,
  author             text NOT NULL DEFAULT '',
  body               text NOT NULL DEFAULT '',
  commented_at       timestamptz,
  synced_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_comments_task_comment_uniq
    UNIQUE (external_task_id, clickup_comment_id)
);

CREATE INDEX IF NOT EXISTS support_ticket_comments_task_idx
  ON public.support_ticket_comments (external_task_id);

ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_comments_service_all ON public.support_ticket_comments;
CREATE POLICY support_ticket_comments_service_all
  ON public.support_ticket_comments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. support_ticket_solutions — LLM-generated customer-facing resolution,
--    one row per (task, locale). Populated read-through on the detail page so
--    we don't regenerate via Orq.ai every view. `source_hash` keys freshness:
--    if the summary/comments change while still resolved, the hash differs and
--    the detail page regenerates. When a ticket leaves "resolved", the sync
--    function deletes these rows (user requirement: drop the solution, recreate
--    it when the ticket is resolved again). FK cascade also clears them on
--    ticket deletion.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_solutions (
  external_task_id  text NOT NULL
                      REFERENCES public.support_tickets_cache (external_task_id)
                      ON DELETE CASCADE,
  locale            text NOT NULL,
  solution_text     text NOT NULL DEFAULT '',
  source_hash       text NOT NULL,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (external_task_id, locale)
);

ALTER TABLE public.support_ticket_solutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_solutions_service_all ON public.support_ticket_solutions;
CREATE POLICY support_ticket_solutions_service_all
  ON public.support_ticket_solutions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. support_ticket_translations — cached title/description translations, one
--    row per (task, field, locale). Populated READ-THROUGH on view (the list
--    localizes only the user's own tickets; detail localizes the open ticket) —
--    NOT pre-generated, since the Support list has ~1900 tickets and pre-
--    translating all × 3 locales would be thousands of mostly-unviewed Orq.ai
--    calls. `source_hash` keys freshness: when the source title/body changes,
--    the hash differs and the page re-translates on next view. FK cascade
--    clears these on ticket deletion.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_ticket_translations (
  external_task_id  text NOT NULL
                      REFERENCES public.support_tickets_cache (external_task_id)
                      ON DELETE CASCADE,
  field             text NOT NULL CHECK (field IN ('title', 'description')),
  locale            text NOT NULL,
  text              text NOT NULL DEFAULT '',
  source_hash       text NOT NULL,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (external_task_id, field, locale)
);

ALTER TABLE public.support_ticket_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_ticket_translations_service_all ON public.support_ticket_translations;
CREATE POLICY support_ticket_translations_service_all
  ON public.support_ticket_translations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
