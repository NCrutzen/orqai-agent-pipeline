-- Phase 132.1 Plan 03 Task 3 (D-02) — the ONE-FLAG forward-bucket panic revert.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ARMED, NOT APPLIED. Do NOT run this during normal activation.
-- ─────────────────────────────────────────────────────────────────────────────
-- This is the single-statement "flip everything back to fully dry" lever. The
-- forward loop is fail-closed: `isForwardBucketReleased` releases a bucket ONLY on
-- an explicit `stage_4_forward_buckets[bucket] === true`; an empty map / missing
-- entry / false → HELD (web/lib/pipeline-gating/dry-run-gate/index.ts:108-135,
-- INVERSE polarity). During graduated rollout an operator (or the Plan-04 gated
-- auto-flip monitoring) ARMS one bucket at a time by patching its entry to true.
-- THIS migration is the referenced revert lever: it resets the entire release map
-- to `{}` in a single statement, returning ALL info-routing forward buckets to
-- held in one move.
--
-- Sibling-safe: uses jsonb_set on EXACTLY the {stage_4_forward_buckets} path, so
-- every other dry_run_config key — stage_3_routing (must stay true/held),
-- stage_3_intent_label, stage_3_labeling, … — is preserved untouched
-- (threat T-132.1-08 no-clobber). Single UPDATE, idempotent (re-running re-sets
-- the map to {}).
--
-- Apply ONLY when reverting a release: run this file (or the equivalent
-- Management-API statement) to hold every bucket again. The activation migration
-- (20260624a) intentionally leaves stage_4_forward_buckets at its {} / all-held
-- seed, so under normal activation this file is never needed.

BEGIN;

UPDATE public.swarms
   SET dry_run_config = jsonb_set(dry_run_config, '{stage_4_forward_buckets}', '{}'::jsonb),
       updated_at     = now()
 WHERE swarm_type = 'info-routing';

COMMIT;
