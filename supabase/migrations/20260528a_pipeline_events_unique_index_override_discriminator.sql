-- Phase 03 (bulk-review-flow-ux) — gap-closure plan 03-04 / REQ-01, REQ-07
-- UAT GAP 2 (BLOCKER, Test 3): operators cannot Confirm/Override on real rows.
--
-- Background: the existing partial UNIQUE index `pipeline_events_one_per_stage_email`
-- (migration 20260513a) constrains EVERY row per (email_id, swarm_type, stage),
-- including operator override rows. Per the locked CON-pipeline-events-write-shape
-- contract, an operator override is an append-only SECOND pipeline_events row
-- (`override IS NOT NULL`, triggered_by='operator-override'); Axis 3 emits N such
-- rows. Because every already-processed email already has its original pipeline
-- emit (`override NULL`) at that stage, the operator's append INSERT collides with
-- the original emit → unique-constraint violation → operators cannot capture any
-- override on real rows.
--
-- Fix: narrow the partial predicate to `override IS NULL` so the dedupe applies
-- ONLY to original emits. Unlimited append-only override rows (incl. Axis-3 N-row
-- reorders + escalateStage3ToHuman) are then permitted, while the original emit
-- per group stays deduped exactly as before.
--
-- This is an INDEX-only change: no new table, no new column, no RLS/policy/GRANT
-- change (public.pipeline_events is already RLS-enabled, Phase 1/70), and no
-- dedupe DELETE (historical duplicates were already collapsed by 20260513a;
-- existing rows already satisfy the narrowed predicate — live DB confirms a single
-- override-bearing row). Atomic BEGIN/COMMIT: a recreate failure rolls back the drop.

BEGIN;

DROP INDEX IF EXISTS public.pipeline_events_one_per_stage_email;

CREATE UNIQUE INDEX pipeline_events_one_per_stage_email
  ON public.pipeline_events (email_id, swarm_type, stage)
  WHERE email_id IS NOT NULL AND override IS NULL;

COMMIT;
