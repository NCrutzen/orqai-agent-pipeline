-- Phase 110 Plan 04 (SWARM-01 / D-04 / D-05). Sales-email full-funnel swarm
-- enrichment.
--
-- The sales-email swarms row is today a Stage-0/1-only shell (Phase 74 seed:
-- entity_brand=[], stage2_entity_resolver=null, stage3_coordinator_agent_key=
-- null, canonical_context_shape=null, side_effects=[]). This migration lifts it
-- to a FULL-FUNNEL config — mirroring the debtor backfill shape in
-- 20260504b_swarms_registry_generalisation.sql:42-58 — but every value is
-- FORWARD-REFERENCED and held INERT per D-05:
--
--   * empty swarm_intents  → Stage 3 no-ops until Phase 113 seeds intents.
--   * no RESL dispatch seam → Stage 2 no-ops until Phase 114 wires the resolver.
--   * side_effects = '[]'   → no Outlook archive until Phase 112.
--
-- So setting stage3_coordinator_agent_key / stage2_entity_resolver /
-- canonical_context_shape here changes NO runtime behavior; it only makes the
-- registry row describe the funnel the later phases will activate.
--
-- NOTE (resolution_config): the column ALREADY EXISTS (verified live 2026-06-03,
-- value null). We seed an INERT documented placeholder only — we do NOT bind a
-- concrete schema here, because the v8.2 RESL-03 track (Phase 114) owns the
-- canonical resolution_config shape and would migrate away from anything we
-- invent now (OQ-2 / cross-track v8.2 RESL-03 coordination). ADD COLUMN
-- IF NOT EXISTS is defensive/idempotent — it is a no-op since the column exists.
--
-- This migration only UPDATEs an existing RLS-enabled table (public.swarms);
-- the existing swarms policies cover all columns. No new table, no new policy.

BEGIN;

-- Defensive/idempotent: resolution_config already exists live (value null).
ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS resolution_config jsonb;

UPDATE public.swarms
   SET entity_brand = jsonb_build_array('smeba'),
       stage3_coordinator_agent_key = 'sales-intent-agent',
       -- OQ-2 / v8.2 RESL-03: inert planned resolver id. Stage 2 stays a no-op
       -- until Phase 114 wires the shared NXT resolver via per-swarm config.
       -- DO NOT treat this as a live binding before then.
       stage2_entity_resolver = '@/lib/automations/sales-email/resolve-customer',
       canonical_context_shape = jsonb_build_object(
         'version', '2026-06-03.sales.v1',
         'fields', jsonb_build_object(
           'customer_account_id', jsonb_build_object('type','string','nullable',true,'description','Stage 2 entity-resolution output (inert until Phase 114)'),
           'customer_name',       jsonb_build_object('type','string','nullable',true),
           'language',            jsonb_build_object('type','string','enum', jsonb_build_array('nl','en'), 'default','nl'),
           'entity_brand',        jsonb_build_object('type','string','default','smeba','description','Brand suffix used by handler agents'),
           'recent_documents',    jsonb_build_object('type','array','items', jsonb_build_object('type','object'),'default', jsonb_build_array())
         )
       ),
       -- INERT documented placeholder. v8.2 RESL-03 (Phase 114) owns the real
       -- shape; do NOT bind a schema here (OQ-2). The marker keeps the column
       -- discoverable without committing to a contract we'd have to migrate.
       resolution_config = jsonb_build_object(
         'status', 'inert_placeholder',
         'owner_track', 'v8.2-RESL-03',
         'activates_in_phase', 114,
         'note', 'Forward-reference only — no live binding until Phase 114 wires the shared resolver.'
       ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- D-05 holds the funnel inert: side_effects stays empty (no archive until 112)
-- and stage1_regex_module stays null (LLM-only Stage 1). We assert these rather
-- than re-write them so a future edit can't silently flip on a side effect here.
UPDATE public.swarms
   SET side_effects = '[]'::jsonb,
       stage1_regex_module = NULL
 WHERE swarm_type = 'sales-email';

COMMIT;
