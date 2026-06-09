-- Fix: missing table-level GRANTs on two Phase 114 generic-resolver tables.
--
-- Same class of bug as 20260609_email_attachments_grants_fix.sql: the creating
-- migrations enabled RLS and created the *_service_all (FOR ALL TO service_role)
-- + *_auth_select (FOR SELECT TO authenticated) policies, but OMITTED the
-- matching table-level GRANT statements. Postgres requires BOTH a grant and a
-- passing RLS policy; a policy without the underlying grant still denies.
--
--   * email_pipeline.resolution_audit  (20260604_generic_resolution_audit.sql)
--   * debtor.sender_customer_map        (Phase 114 generic resolver)
--
-- Symptom: "permission denied for table resolution_audit" (SQLSTATE 42501) for
-- service_role — hit live by the sales Stage 2 customer-resolver audit insert
-- (stage-2-customer-resolver.ts), which blocks EVERY sales Stage 2 (and thus all
-- sales Stage 3 verdicts). Debtor is unaffected: it uses the legacy resolveDebtor
-- + debtor.email_labels path, never these generic tables.
--
-- GRANT is idempotent; safe to re-run. Found via a repo-wide audit for the
-- policy-without-grant pattern across exposed schemas.

GRANT ALL    ON email_pipeline.resolution_audit TO service_role;
GRANT SELECT ON email_pipeline.resolution_audit TO authenticated;

GRANT ALL    ON debtor.sender_customer_map TO service_role;
GRANT SELECT ON debtor.sender_customer_map TO authenticated;
