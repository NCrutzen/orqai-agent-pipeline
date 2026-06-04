-- Phase 116 Plan 01 Task 1 (D-06). Swarm-agnostic email attachments table.
--
-- Every swarm's attachments (sales offertes/PO's/tekeningen, debtor invoice
-- copies, future swarms) land in ONE generic table — one row per attachment:
-- metadata + extraction status + extracted text + storage key. This mirrors the
-- Phase 114 D-12 generic email_pipeline.resolution_audit precedent: a NEW swarm
-- onboards by a registry row, NEVER a new table. Adoption is a registry opt-in,
-- not a code or schema change (SWARM-02).
--
-- Schema placement: email_pipeline (PostgREST-exposed, alongside emails) keeps
-- the attachment corpus pipeline-scoped and queryable from Bulk Review.
--
-- extraction_status is FREE TEXT (mirrors resolution_audit.method), NOT a
-- generated enum, so this table adds NO literal-union column and needs NO
-- codegen (npm run codegen && git diff --exit-code stays clean). Valid values
-- are documented in the column comment below.
--
-- RLS-mandatory (CLAUDE.md / _template.sql): ENABLE RLS + service_role FOR ALL
-- (backend writes) + authenticated FOR SELECT (D-08 Bulk Review detail-pane
-- read surface). The anon role is NEVER granted a policy on this table — it
-- stays denied by default under RLS, and the 20260520_harden_rls migration
-- revoked anon writes globally.
--
-- Storage: a PRIVATE bucket 'email-attachments' holds the raw binaries
-- (downloaded from Graph only when extraction fires, post-Stage-1). The bucket
-- is public=false; storage.objects policies grant service_role FOR ALL scoped
-- to bucket_id and grant NO anon / NO public access. Precedent private bucket:
-- 'support-tickets-frames'. Binaries are read only by backend extraction code.

BEGIN;

-- 1. Table — swarm-agnostic email attachments (one row per attachment).
CREATE TABLE IF NOT EXISTS email_pipeline.email_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  swarm_type        text NOT NULL,                  -- which swarm captured this attachment
  email_id          uuid,                           -- soft ref to email_pipeline.emails.id (nullable: no hard FK coupling, mirrors resolution_audit)
  attachment_id     text NOT NULL,                  -- Graph attachment id
  filename          text,
  content_type      text,
  size_bytes        bigint,
  is_inline         boolean NOT NULL DEFAULT false,  -- inline (signature/logo) attachments excluded from extraction
  -- extraction_status FREE TEXT (no codegen). Valid values:
  --   pending           queued for extraction (Stage-1 survivor, extract switch ON)
  --   not_requested     metadata captured but extract switch OFF for this swarm
  --   extracted         text-layer or vision extraction succeeded
  --   needs_vision      text layer empty; queued for LLM-vision fallback
  --   extraction_failed corrupt/password-protected/parse error (fail-soft)
  --   skipped_cap       over a global cap (size / pages / count) — fail-soft, visible
  --   unsupported       non-extractable type (docx/xlsx, reference/itemAttachment)
  --   source_gone       mail deleted/moved since ingest; binary unreachable (fail-soft)
  extraction_status text NOT NULL DEFAULT 'pending',
  extracted_text    text,
  storage_key       text,                           -- deterministic ${email_id}/${attachment_id}.<ext>; NULL until binary stored
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Idempotent ingest/backfill upserts (mirrors email_thread_messages onConflict).
  CONSTRAINT email_attachments_email_attachment_uk UNIQUE (email_id, attachment_id)
);

-- 2. Enable RLS — required.
ALTER TABLE email_pipeline.email_attachments ENABLE ROW LEVEL SECURITY;

-- 3a. Service role (backend code via createAdminClient) gets full access.
DROP POLICY IF EXISTS email_attachments_service_all ON email_pipeline.email_attachments;
CREATE POLICY email_attachments_service_all
  ON email_pipeline.email_attachments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3b. Authenticated SELECT — enables the D-08 Bulk Review detail-pane read.
DROP POLICY IF EXISTS email_attachments_auth_select ON email_pipeline.email_attachments;
CREATE POLICY email_attachments_auth_select
  ON email_pipeline.email_attachments
  FOR SELECT
  TO authenticated
  USING (true);

-- 3c. anon role — intentionally NO policy added (it stays denied by default
--     under RLS; the harden_rls migration also revoked anon writes globally).

-- 4. Indexes.
-- 4a. Bulk Review feed: newest-first per swarm.
CREATE INDEX IF NOT EXISTS email_attachments_swarm_created_idx
  ON email_pipeline.email_attachments (swarm_type, created_at DESC);
-- 4b. Per-email lookups (Stage 2 concat, detail-pane).
CREATE INDEX IF NOT EXISTS email_attachments_email_idx
  ON email_pipeline.email_attachments (email_id);

-- 5. Private Storage bucket for attachment binaries.
-- 5a. Create the bucket (idempotent). public=false → no anon/public URL access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 5b. storage.objects RLS — service_role FOR ALL scoped to this bucket.
--     NO anon, NO public policy: the bucket is private and read only by backend.
DROP POLICY IF EXISTS email_attachments_objects_service_all ON storage.objects;
CREATE POLICY email_attachments_objects_service_all
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'email-attachments')
  WITH CHECK (bucket_id = 'email-attachments');

COMMIT;
