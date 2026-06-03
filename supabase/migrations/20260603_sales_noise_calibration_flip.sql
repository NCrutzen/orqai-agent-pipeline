-- Phase 111 Plan 02 (STAGE1-01 / D-06). Sales-email Stage 1 noise-filter
-- calibration flip.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES
-- Flips EXACTLY the 3 "safe" core sales noise categories from action=
-- 'manual_review' → 'categorize_archive' in public.swarm_noise_categories,
-- scoped to swarm_type='sales-email':
--
--   * auto_reply      — automated reply boilerplate; no operator value.
--   * ooo_temporary   — temporary out-of-office; transient, no operator value.
--   * ooo_permanent   — permanent out-of-office / role-change bounce; no value.
--
-- This stops over-routing safe sales noise into manual review (a classification-
-- disposition change), per the Phase 111 calibration decision D-06.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DELIBERATELY DOES *NOT* DO (D-06 held-back categories)
-- Two of the 5 core sales keys stay at action='manual_review', with rationale:
--
--   * payment_admittance — a financial admittance (betalingstoezegging). It is
--     operator-visible business signal, not noise; auto-archiving it would hide
--     money-relevant mail from the operator. Stays manual_review.
--   * unknown            — the Stage 2/3 fall-through bucket. By construction it
--     is "everything the noise filter could not confidently classify." It must
--     NEVER auto-archive — doing so would silently drop unclassified real mail.
--     Stays manual_review.
--
-- This migration MUST NOT set either of those two keys to 'categorize_archive'.
-- The Plan 02 registry-assertion test (web/lib/swarms/__tests__/
-- sales-noise-calibration.test.ts) parses this file and fails if the flip set
-- is not exactly {auto_reply, ooo_temporary, ooo_permanent}.
--
-- ────────────────────────────────────────────────────────────────────────────
-- INERTNESS GUARANTEE (why this flip fires no live archive before Phase 112)
-- Flipping action='categorize_archive' changes only the classification
-- disposition. It fires NO live Outlook archive in Phase 111 because Plan 01
-- (this plan's depends_on) landed the dry-run gate retrofit:
--
--   * classifier-verdict-worker.ts now wraps the inline categorize/archive calls
--     in isStageBlocked(swarmRow, "stage_1_archive") (Plan 01 — Finding 1 fix).
--   * sales dry_run_config.stage_1_archive = blocked (Phase 110-04), and the
--     gate is fail-closed (missing flag = blocked).
--
-- => The categorize_archive branch is gated → inert. The production write (the
-- actual Outlook-archive side-effect + backfill) is deliberately separated to
-- Phase 112 / CLEANUP-01. Until then this is a registry-decision only.
--
-- ────────────────────────────────────────────────────────────────────────────
-- APPLY NOTE
-- This migration is NOT applied to the live DB by Plan 02. Plan 05's BLOCKING
-- schema-push task applies it (via MCP, against verified ref
-- mvqjhlxfvtqqubqgdvhz). Plan 02 only WRITES the file + the assertion test.
--
-- ────────────────────────────────────────────────────────────────────────────
-- RLS / SCHEMA NOTE
-- swarm_noise_categories is an EXISTING RLS-enabled table. This migration only
-- UPDATEs existing rows — no new table, no new policy, no RLS work. The existing
-- swarm_noise_categories policies cover all columns. No codegen (npm run codegen
-- covers swarm_intents only, NOT swarm_noise_categories — Finding 3). No Orq
-- Studio step (the stage-1-category-classifier category_key field is a plain
-- string, not an enum; the closed list is passed at call-time).
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- D-06 safe flip: exactly auto_reply, ooo_temporary, ooo_permanent.
update public.swarm_noise_categories
   set action = 'categorize_archive',
       updated_at = now()
 where swarm_type = 'sales-email'
   and category_key in ('auto_reply', 'ooo_temporary', 'ooo_permanent');

-- payment_admittance + unknown intentionally NOT flipped (D-06 rationale above).
-- payment_admittance = operator-visible financial admittance; unknown = Stage
-- 2/3 fall-through that must never auto-archive. Both stay action='manual_review'.

COMMIT;
