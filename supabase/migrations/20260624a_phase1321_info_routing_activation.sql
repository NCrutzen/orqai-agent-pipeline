-- Phase 132.1 Plan 03 Task 1 (D-fix re-flip + D-01 behavior-tracking enable) —
-- the info-routing router ACTIVATION migration.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ HARD DEPENDENCY — APPLY ONLY AFTER Plan 01's email_id resolution is deployed.
-- ─────────────────────────────────────────────────────────────────────────────
-- The (info-routing,'unknown') dispatch was first flipped to
-- action='swarm_dispatch' / swarm_dispatch='pipeline/coordinator.requested' as a
-- LIVE Management-API edit on 2026-06-17T06:38 with NO migration file (undocumented
-- drift). info-routing has stage2_entity_resolver=NULL (no Stage 2), so the
-- verdict-worker dispatch carried a Graph message_id but NO resolved DB email_id.
-- The coordinator's first step (createRun) then INSERTed agent_runs.email_id=NULL
-- → NOT NULL violation: EVERY info@ `unknown` verdict crashed Stage 3 (24 failures
-- in the 24h sampled; first 2026-06-17T06:52, 14 min after the edit). It was
-- reverted in 20260623c_revert_info_routing_unknown_dispatch.sql back to
-- action='manual_review', swarm_dispatch=NULL.
--
-- This migration RE-FLIPS the dispatch — but it is safe ONLY because Plan 01
-- (commit 049e6207 + a5526406) deployed the generic `email_id ?? resolve-from-
-- message_id` fallback at the coordinator entry, which throws BEFORE createRun on
-- an unresolvable id (fail-loud, no NULL INSERT). Re-flipping WITHOUT that fix
-- reproduces the exact 24-fail crash (RESEARCH Pitfall 2 / threat T-132.1-09).
-- Confirm 132.1-01-SUMMARY.md shows the fix shipped before applying.
--
-- TWO logically-coupled activation changes:
--
-- (1) D-fix — dispatch re-flip. Point (info-routing,'unknown') back at the
--     canonical Stage-3 fan-in event so the generic coordinator fires again. The
--     `unknown` row STAYS a swarm_noise_categories (Stage 1) row — destinations
--     live in routing_destinations, NEVER in swarm_intents (hard-separation
--     invariant). Scoped + idempotent on (swarm_type, category_key).
--
-- (2) D-01 — behavior-tracking enable. Turn on the 112.5 delta-sync for both
--     info@ mailboxes so operator corrections of the Plan-01 held-stamp become
--     ground-truth for the gate. jsonb `||` MERGE (NOT replace) so any sibling
--     keys already in behavior_tracking_config are PRESERVED (threat T-132.1-08).
--     112.5 reads `cfg.mailboxes ?? [cfg.mailbox]` (Phase 118 string-array form).
--
-- DOES NOT touch dry_run_config.stage_3_routing — info-routing has no
-- swarm_intents, so opening stage_3_routing would make the dispatcher throw on an
-- empty ranked[] (RESEARCH Pitfall 2 / lines 109+228). Leave it true/held.
-- DOES NOT touch stage_4_forward_buckets — that stays {} / all-held (D-04);
-- per-bucket release is the Plan-04 gated auto-flip, and the panic flip-back is
-- 20260624b_phase1321_forward_buckets_revert.sql.
--
-- No codegen: no new enum / registry literal-union is introduced.

BEGIN;

-- ── (1) D-fix — dispatch re-flip ─────────────────────────────────────────────
UPDATE public.swarm_noise_categories
   SET action         = 'swarm_dispatch',
       swarm_dispatch = 'pipeline/coordinator.requested',
       updated_at     = now()
 WHERE swarm_type   = 'info-routing'
   AND category_key = 'unknown';

-- ── (2) D-01 — behavior-tracking enable (jsonb || merge, siblings preserved) ──
-- `||` merges the two keys into the existing object; every other key already in
-- behavior_tracking_config (e.g. any thresholds / source filters) is preserved.
-- Idempotent: re-applying merges the same keys (no-op-equivalent).
UPDATE public.swarms
   SET behavior_tracking_config =
         behavior_tracking_config
         || '{"enabled": true, "mailboxes": ["info@smeba.nl", "info@fire-control.nl"]}'::jsonb,
       updated_at = now()
 WHERE swarm_type = 'info-routing';

COMMIT;
