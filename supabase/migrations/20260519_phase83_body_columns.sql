-- Phase 83 D-03: persist full thread body + unique-body separately.
-- body_text (legacy, == stripped uniqueBody) is preserved for one release
-- per D-10 dual-write policy.
ALTER TABLE email_pipeline.emails
  ADD COLUMN IF NOT EXISTS body_full_text   TEXT NULL,
  ADD COLUMN IF NOT EXISTS body_unique_text TEXT NULL;

COMMENT ON COLUMN email_pipeline.emails.body_full_text IS
  'Plain-text rendering of Graph body.content (full thread including quoted history). Phase 83 D-03.';
COMMENT ON COLUMN email_pipeline.emails.body_unique_text IS
  'Plain-text rendering of Graph uniqueBody.content (new part only, quoted replies stripped). Phase 83 D-03.';
