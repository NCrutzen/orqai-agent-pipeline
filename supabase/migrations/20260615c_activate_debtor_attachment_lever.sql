-- 20260615c — Activate the debtor attachment-extraction recall lever.
--
-- Context: the attachment substrate (Phase 116), capture wiring, and the
-- resolver fold-in (incl. the filename signal, PR #90) are all already on main
-- and deployed to prod. The ONLY thing keeping the debtor recall lever dormant
-- was the live registry: debtor `extract=false` and the debtor `unknown`
-- dispatch bypassing the Stage-1.5 extractor. This migration flips both.
--
-- This was APPLIED DIRECTLY to prod via the Supabase MCP on 2026-06-15 (registry
-- DML, not auto-applied by CI); this file records it for repo history.
--
-- Debtor-only by design. Sales is deliberately left bypassing the extractor
-- (Sugar pause / 2026-06-04 archive incident) — activating sales is a separate
-- decision. Debtor stays dry_run=true: this changes routing/extraction only, no
-- live customer writes.
--
-- Safety: main's stage-1.5 extractor ALWAYS re-emits the registry
-- `attachment_config.stage2_dispatch_event` (debtor =
-- 'debtor-email/stage-2.customer-resolve.requested') after the extract step —
-- even with zero attachments or on extraction failure — so re-pointing the
-- debtor dispatch is a transparent interposition, never a dead-end. The target
-- event is the name main's deployed extractor triggers on
-- ('sales-email/attachments.extract.requested'); main did NOT do the
-- v8.2-only `pipeline/attachments.*` rename.
--
-- Idempotent: IS DISTINCT FROM guards make re-application a no-op.

BEGIN;

-- 1. Turn debtor attachment EXTRACTION on (capture was already true).
--    Future debtor captures seed extraction_status='pending' (was 'not_requested').
UPDATE public.swarms
   SET attachment_config = jsonb_set(attachment_config, '{extract}', 'true'::jsonb)
 WHERE swarm_type = 'debtor-email'
   AND attachment_config->>'extract' IS DISTINCT FROM 'true';

-- 2. Route debtor 'unknown' mail through the Stage-1.5 extractor.
UPDATE public.swarm_noise_categories
   SET swarm_dispatch = 'sales-email/attachments.extract.requested'
 WHERE swarm_type = 'debtor-email'
   AND category_key = 'unknown'
   AND action = 'swarm_dispatch'
   AND swarm_dispatch IS DISTINCT FROM 'sales-email/attachments.extract.requested';

COMMIT;
