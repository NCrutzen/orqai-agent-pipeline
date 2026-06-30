-- Phase 132.2 (V9.7.x) — forward-grade ground truth for the autoflip.
--
-- The forward-autoflip now grades each routing bucket on where mail was ACTUALLY
-- forwarded (memory `forward-match-as-wilson-ground-truth`), reading an
-- accumulated ledger of `forward_observed` rows in swarm_review_signals. Grading
-- must read the OBSERVED bucket back per row; the existing columns carry only the
-- predicted bucket (category_key) and the source mailbox. Add a nullable jsonb
-- column to hold the self-sufficient observation payload:
--   { observed_bucket, observed_to_address, predicted_bucket }
--
-- No new policy: swarm_review_signals already has RLS enabled +
-- `swarm_review_signals_service_all` (FOR ALL TO service_role). Nullable →
-- backfill-safe. No codegen (DB types are not codegen-tracked here).

BEGIN;

ALTER TABLE public.swarm_review_signals
  ADD COLUMN IF NOT EXISTS observed_meta jsonb;

COMMENT ON COLUMN public.swarm_review_signals.observed_meta IS
  'Phase 132.2 forward-grade: { observed_bucket, observed_to_address, predicted_bucket } for forward_observed* rows. Null for non-forward signals.';

COMMIT;
