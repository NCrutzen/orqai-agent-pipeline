-- Phase 82.8 D-07: one-shot 30d backfill.
-- Pass A: Insert Stage 4 auto_archived_noise pipeline_events for tagged emails.
-- Pass B: Extract storage paths from existing 1h-signed URLs in email_labels.
-- Both passes are idempotent: re-running the migration is safe.

BEGIN;

-- ===== PASS A: Stage 4 telemetry backfill =====
INSERT INTO public.pipeline_events (
  swarm_type,
  stage,
  email_id,
  decision,
  decision_details,
  automation_run_id,
  triggered_by,
  created_at
)
SELECT
  'debtor-email',
  4,
  el.email_id,
  'auto_archived_noise',
  jsonb_build_object(
    'noise_category',          pe1.decision,
    'noise_category_unknown',  (pe1.decision IS NULL),
    'source_stage',            1,
    'archived_at',             el.labeled_at,
    'backfilled',              true
  ),
  NULL,                                   -- email_labels has no automation_run_id column (RESEARCH §1.1)
  'backfill',
  el.labeled_at
FROM debtor.email_labels el
LEFT JOIN public.pipeline_events pe1
  ON  pe1.email_id   = el.email_id
  AND pe1.stage      = 1
  AND pe1.swarm_type = 'debtor-email'
WHERE el.icontroller_tag_status = 'tagged'
  AND el.labeled_at >= NOW() - INTERVAL '30 days'
  AND el.email_id IS NOT NULL
  AND pe1.id IS NOT NULL                  -- 82.8-09: restrict to rows that had a Stage 1 event (excludes Stage 3 intent labels)
ON CONFLICT ON CONSTRAINT pipeline_events_one_per_stage_email DO NOTHING;

-- ===== PASS B: screenshot_*_path extraction from existing URLs =====
-- Format: .../object/sign/automation-screenshots/<path>?token=...
-- Only fills rows where the path is NULL (idempotent on re-run).
UPDATE debtor.email_labels
   SET screenshot_before_path =
         substring(screenshot_before_url FROM 'object/sign/automation-screenshots/(.+?)\?')
 WHERE screenshot_before_url IS NOT NULL
   AND screenshot_before_path IS NULL
   AND labeled_at >= NOW() - INTERVAL '30 days';

UPDATE debtor.email_labels
   SET screenshot_after_path =
         substring(screenshot_after_url FROM 'object/sign/automation-screenshots/(.+?)\?')
 WHERE screenshot_after_url IS NOT NULL
   AND screenshot_after_path IS NULL
   AND labeled_at >= NOW() - INTERVAL '30 days';

COMMIT;
