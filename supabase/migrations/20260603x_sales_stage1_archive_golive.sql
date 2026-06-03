-- Phase 112 Plan 02 (CLEANUP-01 / D-01 / D-02 / D-03). Sales-email Stage 1
-- Outlook-archive GO-LIVE flip.
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHAT THIS DOES
-- Flips EXACTLY one per-stage governance flag — dry_run_config.stage_1_archive
-- from true (BLOCKED / dry-run) → false (LIVE) — scoped to swarm_type=
-- 'sales-email' in public.swarms.
--
-- Convention (web/lib/pipeline-gating/dry-run-gate/index.ts):
--   flag TRUE  = BLOCKED (dry-run / no live side effect)
--   flag FALSE = LIVE
--   flag MISSING = treated as BLOCKED (fail-closed)
--
-- Setting stage_1_archive=false ACTIVATES the going-forward live Outlook
-- archive in the inline verdict-worker path (classifier-verdict-worker.ts):
--   archiveLive = !!category.outlook_label && !isStageBlocked(swarm, "stage_1_archive")
-- The inline path already does categorize + archive swarm-agnostically (Phase
-- 111 WR-01 retrofit) and sales auto_reply/ooo_* carry outlook_label. This flip
-- is therefore the SINGLE go-live trigger — NO code change, NO new side-effect
-- descriptor, NO swarms.side_effects row, NO new worker (D-03/D-04).
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY jsonb_set (NOT a whole-column replace) — RESEARCH A2 / CLAUDE.md
-- dry_run_config is a jsonb OBJECT with four sibling flags:
--   stage_1_archive, stage_1_cleanup, stage_3_labeling, stage_4_handlers
-- A whole-column UPDATE (SET dry_run_config = '{...}') would CLOBBER the three
-- siblings. jsonb_set(dry_run_config, '{stage_1_archive}', 'false') mutates
-- ONLY the stage_1_archive key and preserves the rest. (Contrast Phase 111's
-- flip 20260603_sales_noise_calibration_flip.sql which used a plain whole-column
-- `SET action = ...` because action is a scalar text column, not a jsonb object.)
--
-- ────────────────────────────────────────────────────────────────────────────
-- WHY scoped WHERE swarm_type = 'sales-email' (only) — D-02 / RESEARCH A2
-- This flip MUST NOT touch the debtor swarm. debtor's
-- dry_run_config.stage_1_cleanup = false (LIVE — the production iController
-- cleanup path) was deliberately preserved at Phase 110-04 and must stay
-- untouched. An unscoped UPDATE public.swarms would re-flip debtor flags. The
-- WHERE clause is the tenancy guard.
--
-- ────────────────────────────────────────────────────────────────────────────
-- APPLY NOTE
-- This migration is NOT applied by the plan. It is written-but-unapplied. A
-- [BLOCKING] human-gated checkpoint task in Plan 112-03 applies it via Supabase
-- MCP `apply_migration` against verified ref mvqjhlxfvtqqubqgdvhz (Agent-
-- Workforce org) AFTER the canary lands and the operator approves what arrived
-- in verkoop@smeba.nl (D-01 canary → operator-gated full flip / D-02). Pulling
-- this trigger is the first write to live customer mail for sales; it is a
-- human action, never auto-applied mid-execution.
--
-- Note: the registry cache (registry.ts SWARM_CACHE, 60s TTL) serves the
-- pre-flip blocked value for up to ~60s after apply — live archive begins
-- within ~60s of the apply (acceptable lag; do not add cache-busting code).
--
-- ────────────────────────────────────────────────────────────────────────────
-- RLS / SCHEMA NOTE
-- swarms is an EXISTING RLS-enabled table. This migration only UPDATEs an
-- existing row — no new table, no new policy, no RLS work. The existing swarms
-- policies cover all columns. No codegen (npm run codegen covers swarm_intents
-- only, NOT dry_run_config — Finding / RESEARCH Runtime State Inventory).
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- D-02 go-live flip: stage_1_archive true(blocked) → false(live), sales only.
-- jsonb_set touches ONLY '{stage_1_archive}'; siblings (stage_1_cleanup,
-- stage_3_labeling, stage_4_handlers) are preserved (RESEARCH A2).
UPDATE public.swarms
   SET dry_run_config = jsonb_set(dry_run_config, '{stage_1_archive}', 'false'::jsonb),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
