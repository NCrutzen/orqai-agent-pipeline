-- Phase 1 Foundation (support-tickets swarm) — DATA-01..06 + ROUTE-03.
-- Single idempotent migration creating the Phase 1 data foundation for the
-- internal Moyne Roberts support-tickets pipeline. Aligned with canonical
-- cross-swarm registries from Phase 70+:
--   - public.pipeline_events (Phase 70 canonical telemetry — NOT altered here;
--     email_id is already nullable per 20260506a_pipeline_events.sql, and
--     support-tickets writes leave it NULL with payload in decision_details).
--   - public.swarms              (Phase 56.7 + 68 — INSERT one row).
--   - public.swarm_intents       (Phase 68 + 76 — INSERT 5 placeholder rows).
--
-- Trust boundaries (see plan 01-01 threat_model):
--   T-01-01 Tampering: pipeline_events not altered — cross-swarm email
--     ingest must keep working post-push. Task 2 verifies via smoke-test.
--   T-01-02/03 Tampering: swarms / swarm_intents INSERTs use ON CONFLICT so
--     existing debtor-email + sales-email rows are untouched.
--   T-01-04 EoP: All four new tables ENABLE ROW LEVEL SECURITY + service_role
--     ALL policy; selective authenticated SELECT for admin-view (Phase 5).
--     No anon policy — global anon revocation (20260520_harden_rls) holds.
--   T-01-06 Repudiation: Every CREATE uses IF NOT EXISTS, every INSERT uses
--     ON CONFLICT, every DROP POLICY uses IF EXISTS. Task 2 verifies by
--     re-running `supabase db push` and confirming no-op exit.
--   T-01-08 Tampering: Realtime publication ALTER guarded by pg_publication_tables
--     existence check (mirror pipeline_events pattern).
--
-- What this migration explicitly does NOT do (locked architectural alignment):
--   - Does NOT fork the canonical pipeline_events table (no per-swarm telemetry table).
--   - Does NOT fork the canonical swarm_intents table (no per-swarm intents table).
--   - Does NOT create a duplicate embeddings table under public.* (uses support.ticket_embeddings instead).
--   - Does NOT ALTER public.pipeline_events            — email_id already nullable.
--   - Does NOT grant any policy to anon or public.
--   - Does NOT use SECURITY DEFINER.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- (A) Extension guards — already enabled project-wide but make the dependency
--     explicit (matches 20260506a_pipeline_events.sql and 20260416_sales_kb.sql).
-- ───────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- ───────────────────────────────────────────────────────────────────────────
-- (B) Schema — support.* houses backend-only embedding store (mirror of
--     sales.kb_chunks pattern). service_role + authenticated USAGE so
--     PostgREST can route requests; row-level policy still gates reads.
-- ───────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS support;
GRANT USAGE ON SCHEMA support TO service_role, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- (C) public.support_tickets — primary entity. BRIEF.md write-path source.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id               uuid NOT NULL DEFAULT gen_random_uuid(),
  attempt                     int  NOT NULL DEFAULT 1,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- submitter context (M365 user-id placeholder until Project 2 ships)
  submitter_id                text NOT NULL,
  submitter_locale            text NULL,                   -- Whisper fills in Phase 2
  device_fingerprint          text NULL,
  submitted_at                timestamptz NOT NULL DEFAULT now(),

  -- raw submission payload
  video_storage_url           text NULL,                   -- nullable: text-only allowed in v1
  transcript                  text NULL,                   -- Phase 2 fills
  transcript_lang             text NULL,

  -- user-chosen submission type — SOURCE OF TRUTH for DATA-04 column-side enum.
  -- Different concept from swarm_intents.intent_key (which is Stage 3 router output).
  -- ROUTE-01 validates against this CHECK; consumer code reads the constant array
  -- from web/lib/automations/support-tickets/types.ts (added in Plan 02) which
  -- mirrors this CHECK verbatim.
  user_chosen_type            text NOT NULL CHECK (
    user_chosen_type IN ('bug','feature-request','info-request','question','other')
  ),

  -- Stage 3 proposed routing (filled in Phase 3)
  proposed_system             text NULL,
  proposed_assignee           text NULL,
  proposed_intent             text NULL,

  -- Final routing (ClickUp webhook fills in Phase 5)
  final_system                text NULL,
  final_assignee              text NULL,
  final_intent                text NULL,

  -- completeness / clarification loop (Phase 2/3)
  completeness_verdict        text NULL CHECK (
    completeness_verdict IS NULL OR completeness_verdict IN ('complete','incomplete')
  ),
  clarification_questions     jsonb NOT NULL DEFAULT '[]'::jsonb,
  clarification_responses     jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- duplicate detection (Phase 2)
  duplicate_of_ticket_id      uuid NULL,                   -- soft-ref to support_tickets.id (no FK per D-05)
  human_confirmed_duplicate   boolean NOT NULL DEFAULT false,

  -- ClickUp integration (Phase 4/5)
  clickup_task_id             text NULL,
  clickup_status              text NULL,
  time_to_resolve_minutes     integer NULL,

  -- Stage 0 safety hook (SAFETY-04 — Phase 2 populates)
  quarantine_state            text NULL,

  -- (submission_id, attempt) UNIQUE so clarification re-entries get a new row
  -- but the original submission_id stays stable across the loop.
  CONSTRAINT support_tickets_submission_attempt_uniq UNIQUE (submission_id, attempt)
);

CREATE INDEX IF NOT EXISTS support_tickets_submitter_submitted_idx
  ON public.support_tickets (submitter_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_user_chosen_type_idx
  ON public.support_tickets (user_chosen_type);
CREATE INDEX IF NOT EXISTS support_tickets_clickup_task_partial_idx
  ON public.support_tickets (clickup_task_id) WHERE clickup_task_id IS NOT NULL;

COMMENT ON TABLE public.support_tickets IS
  'Phase 1 (support-tickets swarm) — primary ticket entity. One row per submission attempt; (submission_id, attempt) stable across clarification re-entries. user_chosen_type CHECK is the source-of-truth for DATA-04 column-side enum.';

-- ───────────────────────────────────────────────────────────────────────────
-- (D) public.support_software_systems — empty registry per DATA-05.
--     Phase 2/4 ClickUp sync populates rows.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_software_systems (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_key               text NOT NULL UNIQUE,
  display_name             text NOT NULL,
  clickup_list_id          text NULL,
  default_assignee_user_id text NULL,
  vendor_locale            text NULL,
  enabled                  boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_software_systems IS
  'Phase 1 (support-tickets swarm) — registry of software systems used inside Moyne Roberts. Empty at Phase 1; Phase 2/4 ClickUp sync populates rows.';

-- ───────────────────────────────────────────────────────────────────────────
-- (E) public.support_notifications — empty per DATA-06.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_ticket_id  uuid NOT NULL,                       -- soft-ref to support_tickets.id (no FK per D-05)
  submission_id      uuid NULL,
  kind               text NOT NULL,                       -- e.g. 'status_change','clarification_requested'
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivered_at       timestamptz NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notifications_ticket_created_idx
  ON public.support_notifications (support_ticket_id, created_at DESC);

COMMENT ON TABLE public.support_notifications IS
  'Phase 1 (support-tickets swarm) — outbound notification queue for status changes, clarification requests, etc. Empty at Phase 1; Phase 2+ populates.';

-- ───────────────────────────────────────────────────────────────────────────
-- (F) support.ticket_embeddings — DATA-03. Mirror of sales.kb_chunks pattern
--     (HNSW + vector_cosine_ops + GIN metadata). Backend-only.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS support.ticket_embeddings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       uuid NOT NULL,                          -- soft-ref to public.support_tickets.id (no FK per D-05)
  source_key      text NOT NULL UNIQUE,                   -- idempotent upsert key
  summary_text    text NOT NULL,
  resolution_text text NULL,
  final_intent    text NULL,
  final_system    text NULL,
  embedding       vector(1536) NULL,                      -- NULL until embed job runs in Phase 2
  metadata        jsonb DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_embeddings_hnsw_idx
  ON support.ticket_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS ticket_embeddings_metadata_gin_idx
  ON support.ticket_embeddings USING gin (metadata);

CREATE INDEX IF NOT EXISTS ticket_embeddings_ticket_id_idx
  ON support.ticket_embeddings (ticket_id);

COMMENT ON TABLE support.ticket_embeddings IS
  'Phase 1 (support-tickets swarm) — backend-only semantic KB of resolved tickets. Mirror of sales.kb_chunks pattern (HNSW vector_cosine_ops m=16 ef_construction=64 + GIN metadata). Phase 2 embed job populates.';

-- ───────────────────────────────────────────────────────────────────────────
-- (G) RLS + GRANTs — all four new tables. service_role full; authenticated
--     SELECT on three public tables (admin-view in Phase 5); no policy on
--     support.ticket_embeddings (backend-only). No anon. No public.
-- ───────────────────────────────────────────────────────────────────────────

-- support_tickets
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_service_all ON public.support_tickets;
CREATE POLICY support_tickets_service_all ON public.support_tickets
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS support_tickets_auth_select ON public.support_tickets;
CREATE POLICY support_tickets_auth_select ON public.support_tickets
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.support_tickets TO authenticated;
GRANT ALL    ON public.support_tickets TO service_role;

-- support_software_systems
ALTER TABLE public.support_software_systems ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_software_systems_service_all ON public.support_software_systems;
CREATE POLICY support_software_systems_service_all ON public.support_software_systems
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS support_software_systems_auth_select ON public.support_software_systems;
CREATE POLICY support_software_systems_auth_select ON public.support_software_systems
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.support_software_systems TO authenticated;
GRANT ALL    ON public.support_software_systems TO service_role;

-- support_notifications
ALTER TABLE public.support_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_notifications_service_all ON public.support_notifications;
CREATE POLICY support_notifications_service_all ON public.support_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS support_notifications_auth_select ON public.support_notifications;
CREATE POLICY support_notifications_auth_select ON public.support_notifications
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.support_notifications TO authenticated;
GRANT ALL    ON public.support_notifications TO service_role;

-- support.ticket_embeddings — backend-only (no authenticated policy).
ALTER TABLE support.ticket_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ticket_embeddings_service_all ON support.ticket_embeddings;
CREATE POLICY ticket_embeddings_service_all ON support.ticket_embeddings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON support.ticket_embeddings TO service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- (H) updated_at triggers — for tables that mutate. Mirror of
--     public.swarms_set_updated_at plpgsql pattern (20260429b_swarm_registry.sql).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.support_tickets_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_set_updated_at();

CREATE OR REPLACE FUNCTION public.support_software_systems_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS support_software_systems_updated_at ON public.support_software_systems;
CREATE TRIGGER support_software_systems_updated_at
  BEFORE UPDATE ON public.support_software_systems
  FOR EACH ROW EXECUTE FUNCTION public.support_software_systems_set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- (I) Realtime publication — guarded ALTER pattern. Only the three public
--     tables (admin-view consumes). support.ticket_embeddings is backend-only.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'support_tickets'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'support_software_systems'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_software_systems';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'support_notifications'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.support_notifications';
    END IF;
  END IF;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- (J) Swarm registry seed — one row in public.swarms where swarm_type='support-tickets'.
--     Uses ON CONFLICT (swarm_type) DO UPDATE so the migration is re-runnable
--     and bumps updated_at, but never collides with existing debtor-email /
--     sales-email rows (different swarm_type primary key).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.swarms (
  swarm_type, display_name, description, review_route, source_table, enabled,
  ui_config, stage1_regex_module, stage2_entity_resolver,
  stage3_coordinator_agent_key, canonical_context_shape, entity_brand
) VALUES (
  'support-tickets',
  'Support Tickets',
  'Internal MR support pipeline — submissions → Stage 0/1/2/3/4 → ClickUp',
  '/automations/support-tickets/review',
  'support_tickets',
  true,
  jsonb_build_object(
    'tree_levels',  jsonb_build_array('user_chosen_type','proposed_system','submitter_id'),
    'row_columns',  jsonb_build_array(
      jsonb_build_object('key','submitted_at',     'label','Submitted',  'width',140),
      jsonb_build_object('key','submitter_id',     'label','Submitter',  'width',180),
      jsonb_build_object('key','user_chosen_type', 'label','User Type',  'width',140),
      jsonb_build_object('key','proposed_intent',  'label','Intent',     'width',180),
      jsonb_build_object('key','clickup_task_id',  'label','ClickUp',    'width',160)
    ),
    'drawer_fields', jsonb_build_array(
      'submitted_at','submitter_id','user_chosen_type','transcript',
      'proposed_system','proposed_intent','final_system','final_intent',
      'clickup_task_id','clickup_status'
    ),
    'default_sort',  'submitted_at desc'
  ),
  '@/lib/automations/support-tickets/stage-1-router',  -- Plan 02 creates this module
  NULL,  -- stage2_entity_resolver — Phase 2 sets
  NULL,  -- stage3_coordinator_agent_key — Phase 3 sets
  jsonb_build_object(
    'version', '2026-05-26.v1',
    'fields', jsonb_build_object(
      'prior_tickets_same_user',    jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array(), 'description','Phase 2 entity-resolution: prior tickets by submitter_id'),
      'prior_tickets_same_system',  jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array(), 'description','Phase 2 entity-resolution: prior tickets touching the same software system'),
      'similar_tickets',            jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array(), 'description','Phase 2 KB search: semantically similar resolved tickets from support.ticket_embeddings'),
      'prior_clarifications',       jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array(), 'description','Phase 2/3: clarification Q/A history for this submission_id across attempts')
    )
  ),
  jsonb_build_array('moyne-roberts')
)
ON CONFLICT (swarm_type) DO UPDATE SET
  display_name                 = excluded.display_name,
  description                  = excluded.description,
  review_route                 = excluded.review_route,
  source_table                 = excluded.source_table,
  enabled                      = excluded.enabled,
  ui_config                    = excluded.ui_config,
  stage1_regex_module          = excluded.stage1_regex_module,
  stage2_entity_resolver       = excluded.stage2_entity_resolver,
  stage3_coordinator_agent_key = excluded.stage3_coordinator_agent_key,
  canonical_context_shape      = excluded.canonical_context_shape,
  entity_brand                 = excluded.entity_brand,
  updated_at                   = now();

-- ───────────────────────────────────────────────────────────────────────────
-- (K) Swarm intents seed — 5 placeholder rows. handler_status='placeholder'
--     so Stage 3 dispatch writes Kanban human-lane rows instead of firing
--     Inngest events (per 20260507_phase76_swarm_intents_handler_status.sql).
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.swarm_intents
  (swarm_type, intent_key, handler_agent_key, handler_event, requires_orchestration, handler_status)
VALUES
  ('support-tickets', 'clarification-needed', NULL, 'support-tickets/clarification.requested',    false, 'placeholder'),
  ('support-tickets', 'duplicate',            NULL, 'support-tickets/duplicate.requested',        false, 'placeholder'),
  ('support-tickets', 'info-answer',          NULL, 'support-tickets/info-answer.requested',      false, 'placeholder'),
  ('support-tickets', 'clickup-escalate',     NULL, 'support-tickets/clickup-escalate.requested', false, 'placeholder'),
  ('support-tickets', 'vendor-draft',         NULL, 'support-tickets/vendor-draft.requested',     false, 'placeholder')
ON CONFLICT (swarm_type, intent_key) DO NOTHING;

COMMIT;
