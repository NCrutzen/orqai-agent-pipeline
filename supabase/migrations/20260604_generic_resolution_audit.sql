-- Phase 114 Plan 02 (D-12 / RESEARCH OQ-4) — swarm-agnostic Stage 2 resolution audit.
--
-- Sales Stage 2 resolutions (and every future swarm's) land in ONE generic
-- table — NOT a mirror of debtor.email_labels (which is debtor-specific). This
-- extends the registry-as-source-of-truth principle to the resolution audit
-- surface: a new swarm reuses this table by config, never a new table.
--
-- Schema placement: email_pipeline (PostgREST-exposed, alongside emails) keeps
-- the audit pipeline-scoped and queryable from the Bulk Review Stage 2 tab.
--
-- Columns are generic across swarms (offerte/order/Sites resolution for sales,
-- sender/factuur for debtor) — method/confidence are FREE TEXT, not generated
-- enums, so this table adds NO literal-union column and needs NO codegen.
--
-- RLS-mandatory (CLAUDE.md / _template.sql): ENABLE RLS + service_role FOR ALL
-- policy minimum. The authenticated SELECT policy enables the D-13 Bulk Review
-- read surface (Plan 04's discretion to wire) at low cost now. The anon role is
-- never granted a policy on this table.
--
-- Governance: writes to this table are gated by the stage_2_resolution dry-run
-- key (Plan 02 Task 1); sales is all-blocked by default until cut-over.

BEGIN;

-- 1. Table — swarm-agnostic resolution audit.
CREATE TABLE IF NOT EXISTS email_pipeline.resolution_audit (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  swarm_type          text NOT NULL,                 -- which swarm produced this resolution
  email_id            uuid,                           -- soft ref to email_pipeline.emails.id (nullable: no hard coupling)
  conversation_id     text,                           -- thread linkage
  method              text NOT NULL,                  -- ResolveMethod (free text): thread_inheritance | sender_match | identifier_match | llm_tiebreaker | unresolved | self_auth
  customer_account_id text,                           -- NULL = resolved-but-no-match (legal per context-shape contract)
  customer_name       text,
  confidence          text,                           -- high | medium | low | none (free text)
  entity_brand        text,                           -- e.g. 'smeba'
  dry_run             boolean NOT NULL DEFAULT true,  -- whether this was a gated/dry-run resolution
  trace               jsonb                           -- resolver-trace payload, free-form
);

-- 2. Enable RLS — required.
ALTER TABLE email_pipeline.resolution_audit ENABLE ROW LEVEL SECURITY;

-- 3a. Service role (backend code via createAdminClient) gets full access.
DROP POLICY IF EXISTS resolution_audit_service_all ON email_pipeline.resolution_audit;
CREATE POLICY resolution_audit_service_all
  ON email_pipeline.resolution_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3b. Authenticated SELECT — enables the D-13 Bulk Review Stage 2 read surface.
DROP POLICY IF EXISTS resolution_audit_auth_select ON email_pipeline.resolution_audit;
CREATE POLICY resolution_audit_auth_select
  ON email_pipeline.resolution_audit
  FOR SELECT
  TO authenticated
  USING (true);

-- 3c. anon role — intentionally NO policy added (it stays denied by default
--     under RLS; the harden_rls migration also revoked anon writes globally).

-- 4. Indexes.
-- 4a. Bulk Review feed: newest-first per swarm.
CREATE INDEX IF NOT EXISTS resolution_audit_swarm_created_idx
  ON email_pipeline.resolution_audit (swarm_type, created_at DESC);
-- 4b. Per-email lookups.
CREATE INDEX IF NOT EXISTS resolution_audit_email_idx
  ON email_pipeline.resolution_audit (email_id);

COMMIT;
