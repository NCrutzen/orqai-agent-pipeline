-- Phase 110 Plan 04 (D-10 / D-11). Per-stage dry-run governance on swarms.
--
-- Replaces the narrow debtor.labeling_settings.dry_run boolean — which today
-- does NOT gate the Stage 1 iController noise-cleanup (the confirmed 867-delete
-- footgun: stage-1-icontroller-noise-cleanup.ts opens
-- openIControllerSession("production", …) UNCONDITIONALLY) — with an explicit
-- per-stage governance map on the swarms registry row.
--
-- jsonb shape (map-of-flags so a NEW Stage 4 handler needs NO future migration):
--   dry_run_config = {
--     stage_1_archive:  bool,   -- block Stage 1 Outlook archive side-effect
--     stage_1_cleanup:  bool,   -- block Stage 1 iController noise delete
--     stage_3_labeling: bool,   -- block Stage 2/3 iController labeling write
--     stage_4_handlers: { "<handler-name>": bool }  -- per-handler block
--   }
-- Convention: a flag value of TRUE = BLOCKED (dry-run / no live side effect);
-- FALSE = LIVE. A MISSING flag is treated as TRUE (blocked / fail-closed) by the
-- workers, so a swarm with no explicit config is safe by default.
--
-- D-11 SEED — re-encode TODAY's effective reality WITHOUT changing behavior:
--
--   debtor-email:
--     stage_1_cleanup  = false  → LIVE. Re-encodes the existing hardcoded
--                                 "production" cleanup path (Pitfall 2). This
--                                 MUST stay false or debtor's live noise cleanup
--                                 is silently disabled.
--     stage_3_labeling = true   → GATED. Matches the uniform
--                                 labeling_settings.dry_run=true today (OQ-1:
--                                 verified 2026-06-03 — ALL 6 debtor mailboxes
--                                 are dry_run=true uniformly, so a single
--                                 per-swarm flag reproduces the effective value
--                                 exactly; no per-mailbox override layer needed).
--     stage_1_archive  = false  → debtor has no Stage 1 Outlook-archive
--                                 side-effect wired distinct from cleanup today.
--     stage_4_handlers = { "invoice-copy": true } → GATED. Matches the
--                                 classifier-invoice-copy-handler reading
--                                 settingsRow?.dry_run ?? true (=true today).
--
--   sales-email: every side-effect stage BLOCKED (all true), stage_4_handlers {}.
--                Sales has no live side effect until Phases 112/113/114.
--
-- Only ALTERs an existing RLS-enabled table (public.swarms); existing swarms
-- policies cover the new column. No new table, no new policy, no anon grant.

BEGIN;

ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS dry_run_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- debtor-email: re-encode current effective gating (D-11). stage_1_cleanup=false
-- keeps the live 867-delete cleanup LIVE; labeling + invoice-copy stay gated to
-- match labeling_settings.dry_run=true.
UPDATE public.swarms
   SET dry_run_config = jsonb_build_object(
         'stage_1_archive',  false,
         'stage_1_cleanup',  false,   -- LIVE (Pitfall 2 — do NOT flip to dry-run)
         'stage_3_labeling', true,    -- gated, matches uniform labeling_settings.dry_run=true (OQ-1)
         'stage_4_handlers', jsonb_build_object('invoice-copy', true)  -- gated
       ),
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

-- sales-email: all side-effect stages blocked. No live archive/cleanup/labeling
-- and no Stage 4 handlers until Phases 112/113/114 activate the funnel.
UPDATE public.swarms
   SET dry_run_config = jsonb_build_object(
         'stage_1_archive',  true,
         'stage_1_cleanup',  true,
         'stage_3_labeling', true,
         'stage_4_handlers', jsonb_build_object()
       ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

COMMIT;
