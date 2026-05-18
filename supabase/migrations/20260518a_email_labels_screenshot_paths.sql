-- Phase 82.8 — Stage 4 handled overview + Stage 1 before/after screenshots
-- Plan 82.8-01 / D-04
--
-- Adds storage-path columns to debtor.email_labels so the detail-pane can
-- sign URLs on demand instead of relying on the 1-hour signed URLs already
-- stored in screenshot_before_url / screenshot_after_url (which 403 after
-- the operator opens an email > 1h post-archive).
--
-- Existing _url columns are retained for back-compat. They will become
-- stale after 1h but are no longer read by the detail-pane once Plan 03
-- (capture-side path persistence) and Plan 04/05 (read-side join + strip)
-- land. Plan 07 backfills _path values for historical rows by regex'ing
-- the path out of the existing _url strings.

BEGIN;

ALTER TABLE debtor.email_labels
  ADD COLUMN IF NOT EXISTS screenshot_before_path text NULL;

ALTER TABLE debtor.email_labels
  ADD COLUMN IF NOT EXISTS screenshot_after_path  text NULL;

COMMENT ON COLUMN debtor.email_labels.screenshot_before_path
  IS 'Storage path in automation-screenshots bucket; signed on-demand by detail-pane. Phase 82.8 D-04.';

COMMENT ON COLUMN debtor.email_labels.screenshot_after_path
  IS 'Storage path in automation-screenshots bucket; signed on-demand by detail-pane. Phase 82.8 D-04.';

COMMIT;
