-- Phase 116 Plan 01 Task 2 (D-04 + D-13). Attachment config registry switches.
--
-- Two INDEPENDENT switches per swarm, registry-driven (D-04):
--   capture  — capture attachment metadata at ingest
--   extract  — run post-Stage-1 content extraction (download + parse/vision)
-- A swarm can capture metadata without paying for extraction.
--
-- Convention: a flag value of TRUE = ON (the intuitive polarity, unlike
-- dry_run_config's TRUE = BLOCKED). A swarm with no attachment_config (default
-- '{}') captures nothing and extracts nothing — safe/inert by default.
--
-- stage2_dispatch_event (MANDATORY, D-04 / SWARM-02): the downstream Stage 2
-- event the Plan 04 extractor re-emits after extraction. The extractor reads
-- this event name from THIS registry value, never from a code literal — so a
-- new swarm's downstream wiring is a registry UPDATE, not a code change. The
-- seeded values are copied byte-for-byte from the Stage 2 worker triggers in
-- web/lib/inngest/functions/stage-2-customer-resolver.ts (lines 56-57:
-- "debtor-email/stage-2.customer-resolve.requested",
-- "sales-email/stage-2.customer-resolve.requested").
--
-- caps: global defaults (Claude's-discretion) — over any cap → extraction
-- status 'skipped_cap' (fail-soft, visible; never silent truncation). They live
-- inside attachment_config.caps so a per-swarm override is a single jsonb edit
-- (D-04). The extractor and backfill READ these caps from the registry — they
-- are NEVER hardcoded in code.
--   max_size_bytes          = 26214400  (25 MiB attachment size cap)
--   max_attachments_per_mail= 20
--   max_vision_pages        = 15        (LLM-vision page cap for scans)
--   max_extracted_chars     = 200000    (extracted-text length cap)
--
-- Seeds:
--   sales-email  capture=true, extract=true  (full onboard).
--   debtor-email capture=true, extract=false (D-13 — metadata capture flips ON
--                via registry row only, proving the registry opt-in works for
--                real; extraction/backfill remain deferred. The dispatch event
--                is seeded for parity even though debtor doesn't route through
--                the extractor today).
--
-- Adoption for any FUTURE swarm is a registry UPDATE only — no code change.
-- No codegen impact: attachment_config is free-text/jsonb, not a literal-union
-- column. Only ALTERs an existing RLS-enabled table (public.swarms); existing
-- swarms policies cover the new column. No new table, policy, or anon grant.

BEGIN;

ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS attachment_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- sales-email: full onboard — metadata capture + content extraction ON.
UPDATE public.swarms
   SET attachment_config = jsonb_build_object(
         'capture', true,
         'extract', true,
         'stage2_dispatch_event', 'sales-email/stage-2.customer-resolve.requested',
         'caps', jsonb_build_object(
           'max_size_bytes', 26214400,
           'max_attachments_per_mail', 20,
           'max_vision_pages', 15,
           'max_extracted_chars', 200000
         )
       ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- debtor-email (D-13): metadata capture ON, extraction OFF. Proves the registry
-- opt-in works for real; dispatch event seeded for parity.
UPDATE public.swarms
   SET attachment_config = jsonb_build_object(
         'capture', true,
         'extract', false,
         'stage2_dispatch_event', 'debtor-email/stage-2.customer-resolve.requested',
         'caps', jsonb_build_object(
           'max_size_bytes', 26214400,
           'max_attachments_per_mail', 20,
           'max_vision_pages', 15,
           'max_extracted_chars', 200000
         )
       ),
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

COMMIT;
