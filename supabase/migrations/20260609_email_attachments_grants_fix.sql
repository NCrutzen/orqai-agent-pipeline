-- Fix: missing table-level GRANTs on email_pipeline.email_attachments.
--
-- 20260605_email_attachments.sql created the table with RLS enabled and the
-- policies email_attachments_service_all (FOR ALL TO service_role) and
-- email_attachments_auth_select (FOR SELECT TO authenticated) — but it OMITTED
-- the matching table-level GRANT statements. Postgres requires BOTH a GRANT and
-- a passing RLS policy; a policy without the underlying grant still denies.
--
-- Symptom: "permission denied for table email_attachments" (SQLSTATE 42501) for
-- service_role — hit by the sales Stage 3 retro reconstructInput attachment-text
-- fold (Phase 113 Pitfall 4), and it would equally deny the authenticated UI
-- read surface. Sibling email_pipeline.emails has these grants; this aligns
-- email_attachments with that convention and with the phase87 retro pattern
-- (GRANT ALL -> service_role, GRANT SELECT -> authenticated).
--
-- GRANT is idempotent; safe to re-run.

GRANT ALL    ON email_pipeline.email_attachments TO service_role;
GRANT SELECT ON email_pipeline.email_attachments TO authenticated;
