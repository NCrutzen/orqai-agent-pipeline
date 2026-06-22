-- 20260615d — Record the sales attachment-extraction dispatch re-point.
--
-- Sibling of 20260615c (debtor). The sales attachment lever was activated
-- DIRECTLY on prod via the Supabase MCP on 2026-06-15 once the SugarCRM pause
-- was lifted (the 2026-06-04 archive incident that had kept sales bypassing the
-- extractor no longer applies — Sugar is decommissioned, Phase 115). This file
-- records that registry DML for repo history; it was never captured in a
-- migration (debtor was, via PR #91 / 20260615c). No behaviour change on apply.
--
-- Sales stays consistent with debtor: capture + extract on, and the sales
-- `unknown` bucket routes through the shared Stage-1.5 attachment extractor
-- (the canonically-named 'sales-email/attachments.extract.requested' event the
-- deployed extractor triggers on; main did NOT do the v8.2-only
-- `pipeline/attachments.*` rename). The extractor ALWAYS re-emits the registry
-- `attachment_config.stage2_dispatch_event`
-- ('sales-email/stage-2.customer-resolve.requested') after the extract step —
-- even with zero attachments or on failure — so the re-point is a transparent
-- interposition, never a dead-end.
--
-- Idempotent: IS DISTINCT FROM guards make re-application a no-op (the prod
-- state already matches; this file is documentation-as-code, not a state change).

BEGIN;

-- 1. Sales attachment EXTRACTION on (capture was already true). Future sales
--    captures seed extraction_status='pending' (was 'not_requested').
UPDATE public.swarms
   SET attachment_config = jsonb_set(attachment_config, '{extract}', 'true'::jsonb)
 WHERE swarm_type = 'sales-email'
   AND attachment_config->>'extract' IS DISTINCT FROM 'true';

-- 2. Route sales 'unknown' mail through the Stage-1.5 extractor.
UPDATE public.swarm_noise_categories
   SET swarm_dispatch = 'sales-email/attachments.extract.requested'
 WHERE swarm_type = 'sales-email'
   AND category_key = 'unknown'
   AND action = 'swarm_dispatch'
   AND swarm_dispatch IS DISTINCT FROM 'sales-email/attachments.extract.requested';

COMMIT;
