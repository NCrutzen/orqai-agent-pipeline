-- Phase 82.4 — Feedback capture infrastructure (v8.0 stabilisation)
-- Plan 82.4-01 / FB-01
--
-- Creates the durable write target for operator feedback captured by the
-- per-stage sidebar prose-notes textarea + confirm-correct chip + override
-- dropdown wiring (Plans 82.4-02, 82.4-03, 82.4-04). Read by Option Z
-- stage-tab list loader (Plan 82.4-05) and nightly snapshot cron
-- (Plan 82.4-07).
--
-- Natural key includes created_at — multiple revisions per
-- (email_id, stage, operator_id) are allowed by design. V9.0 synthesis
-- reads the latest row per (email_id, stage) by default.
--
-- Trust boundaries:
--   T-82.4-01-01 Tampering: operator_id is server-stamped from
--     auth.getUser().id in the POST route. RLS denies anon and
--     authenticated entirely; service_role only.
--   T-82.4-01-02 Information Disclosure: prose_notes can contain customer
--     references the operator typed. Service-role-only RLS keeps it off
--     the wire to the browser; reads go through createAdminClient.
-- Idempotency: CREATE TABLE/INDEX IF NOT EXISTS + DROP/CREATE POLICY make
-- this safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.email_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        uuid NOT NULL,
  stage           smallint NOT NULL CHECK (stage BETWEEN 0 AND 3),
  verdict         text NOT NULL CHECK (verdict IN ('confirm','override','unclear')),
  corrected_value text NULL,
  prose_notes     text NULL,
  operator_id     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_feedback_email_id_stage_idx
  ON public.email_feedback (email_id, stage);

CREATE INDEX IF NOT EXISTS email_feedback_operator_created_at_idx
  ON public.email_feedback (operator_id, created_at DESC);

ALTER TABLE public.email_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_feedback_service_all ON public.email_feedback;
CREATE POLICY email_feedback_service_all ON public.email_feedback
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT ALL ON public.email_feedback TO service_role;
