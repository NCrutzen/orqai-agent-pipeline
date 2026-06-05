-- Phase 116 code-review follow-up — WR-02 + WR-05.
--
-- ⚠️  NOT YET APPLIED TO REMOTE. The operator must apply this manually after
--     review. The prior 20260605_email_attachments.sql / 20260605b are already
--     applied; this is a NEW, additive migration (no edits to applied files).
--
-- WR-02 (doc-only): the extractor runs vision INLINE — there is no deferred
--   queue, so it never persists 'needs_vision'. Drop that value from the
--   column-comment contract so the documented status list matches reality
--   (the TS ExtractionStatus union and the Bulk Review badge map were updated
--   in the same review pass).
--
-- WR-05: the original authenticated SELECT policy was `USING (true)` over the
--   WHOLE table — including `extracted_text`, which holds vision-transcribed
--   CUSTOMER DOCUMENTS. Any authenticated user could read every swarm's
--   extracted document text across all mailboxes. The Bulk Review surface
--   actually reads attachments SERVER-SIDE via the service_role admin client
--   and selects ONLY metadata columns (attachment_id, filename, content_type,
--   size_bytes, extraction_status — see web/lib/bulk-review/hydrate.ts), never
--   extracted_text. So the broad authenticated grant is unused by the product
--   and over-exposes sensitive text.
--
--   Fix: REMOVE the table-level authenticated SELECT (service_role keeps FOR
--   ALL — backend reads are unaffected) and expose a metadata-only,
--   security_invoker view for any future client-side read. The view omits
--   extracted_text entirely, so transcribed customer documents are never
--   reachable by the authenticated role. There is still no per-swarm/mailbox
--   authz model in the DB (no such table exists repo-wide); a tighter per-swarm
--   policy is tracked as a follow-up todo and can layer onto the view later.

BEGIN;

-- WR-02 — refresh the documented status list (remove 'needs_vision').
COMMENT ON COLUMN email_pipeline.email_attachments.extraction_status IS
  $$extraction_status FREE TEXT (no codegen). Valid values:
  pending           queued for extraction (Stage-1 survivor, extract switch ON)
  not_requested     metadata captured but extract switch OFF for this swarm
  extracted         text-layer or vision extraction succeeded
  extraction_failed corrupt/password-protected/parse/render error (fail-soft)
  skipped_cap       over a global cap (size / pages / count) — fail-soft, visible
  unsupported       non-extractable type (docx/xlsx, reference/itemAttachment)
  source_gone       mail deleted/moved since ingest; binary unreachable (fail-soft)
  -- 'needs_vision' REMOVED (review WR-02): vision runs inline, no deferred queue.$$;

-- WR-05 — drop the over-broad authenticated SELECT on the base table. The
-- service_role FOR ALL policy (email_attachments_service_all) is untouched, so
-- all backend reads/writes (capture, extractor, backfill, hydrator) keep working.
DROP POLICY IF EXISTS email_attachments_auth_select ON email_pipeline.email_attachments;

-- WR-05 — metadata-only read surface for any future CLIENT-side use. No
-- extracted_text column → transcribed customer documents are never exposed to
-- the authenticated role. security_invoker = true so the caller's RLS applies.
CREATE OR REPLACE VIEW email_pipeline.email_attachments_meta
  WITH (security_invoker = true) AS
  SELECT
    id,
    created_at,
    swarm_type,
    email_id,
    attachment_id,
    filename,
    content_type,
    size_bytes,
    is_inline,
    extraction_status,
    updated_at
  FROM email_pipeline.email_attachments;

COMMENT ON VIEW email_pipeline.email_attachments_meta IS
  'WR-05: metadata-only, security_invoker view of email_attachments for client '
  'reads. Deliberately omits extracted_text (vision-transcribed customer '
  'documents) and storage_key. The base table no longer grants authenticated '
  'SELECT; sensitive columns are service_role-only.';

-- Authenticated may read the metadata view (the base-table RLS still applies via
-- security_invoker — and the base table now has no authenticated policy, so this
-- view read returns rows only once a per-swarm authenticated base policy is
-- added by the follow-up todo. Until then the view is service_role-readable and
-- safe-by-default: no broad customer-text exposure).
GRANT SELECT ON email_pipeline.email_attachments_meta TO authenticated;

COMMIT;
