-- Phase 82.8-10: re-source Stage 4 auto_archived_noise backfill.
--
-- Supersedes the Pass A INSERT in 20260518b_backfill_stage4_auto_archived_noise.sql.
-- Pass B (screenshot_*_path extraction in 20260518b) is unaffected and not repeated here.
--
-- Why this exists: 20260518b sourced from debtor.email_labels where
-- icontroller_tag_status='tagged'. That table is populated by the iController
-- tagger only, which is gated by env (dry-run in acceptance skips it; even prod
-- can fail intermittently). The Outlook-Graph archive that defines
-- "auto-archived" runs unconditionally inside classifier-verdict-worker.ts
-- (case 'categorize_archive'), so the true source signal is pipeline_events
-- stage=1 with a noise category whose action='categorize_archive'.
--
-- The live emit added by Plan 82.8-02 fires inside the same switch case in
-- classifier-verdict-worker.ts, so this backfill's gating condition matches
-- the live-write contract exactly.
--
-- Idempotent: ON CONFLICT (email_id, swarm_type, stage) WHERE email_id IS NOT NULL
-- DO NOTHING — uses the partial unique index pipeline_events_one_per_stage_email
-- (created by 20260513a). Re-running is a no-op.

BEGIN;

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
  pe1.email_id,
  'auto_archived_noise',
  jsonb_build_object(
    'noise_category',          pe1.decision,
    'noise_category_unknown',  (pe1.decision IS NULL),
    'source_stage',            1,
    'archived_at',             pe1.created_at,
    'backfilled',              true
  ),
  pe1.automation_run_id,
  'backfill',
  pe1.created_at
FROM public.pipeline_events pe1
JOIN public.swarm_noise_categories snc
  ON  snc.swarm_type   = pe1.swarm_type
  AND snc.category_key = pe1.decision
WHERE pe1.swarm_type = 'debtor-email'
  AND pe1.stage      = 1
  AND pe1.email_id IS NOT NULL
  AND pe1.created_at >= NOW() - INTERVAL '30 days'
  AND snc.action     = 'categorize_archive'
ON CONFLICT (email_id, swarm_type, stage) WHERE email_id IS NOT NULL DO NOTHING;

COMMIT;
