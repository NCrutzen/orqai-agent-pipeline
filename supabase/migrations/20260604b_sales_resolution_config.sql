-- Phase 114-04 Task 2a — seed the REAL sales resolution_config (replace the
-- inert placeholder) + wire the sales Stage 2 swarm_dispatch event (Pitfall 6).
--
-- Replaces the inert documented placeholder seeded by
-- 20260603_sales_swarm_full_funnel_enrichment.sql
--   ({status:'inert_placeholder', activates_in_phase:114})
-- with the canonical ResolutionConfig jsonb the generic engine reads. The
-- column already exists live (added IF NOT EXISTS in the 20260603 migration);
-- this is an UPDATE only — no new table, no new policy (public.swarms is RLS-
-- enabled, existing policies cover all columns).
--
-- D-04 (data-driven precedence — NOT hand-curated): the precedence order below
-- is derived from the Plan 03 identifier-mining frequency report
-- (web/scripts/output/sales-identifier-mining.json). Among the identifier kinds
-- that have a working NXT lookup, ordered by mined frequency / confidence:
--   sender_match (cross-cutting, highest confidence when present)
--   → offerte_match    (offertenummer_sb 22% + smeq 4%, confirmed)
--   → postcode_site_match (postcode_site 55%, confirmed — highest-volume id)
--   → factuur_match    (factuurnummer 7%, confirmed, reuses debtor lookup D-11)
--   → order_match      (ordernummer 5% + werkorder 3%, candidate)
-- case_ref (18%, candidate) has NO account lookup — it's a thread-routing token,
-- a corroborating-only signal — so it is intentionally NOT in the precedence
-- stack in iteration 1 (corroboration is the D-06 fast-follow).
--
-- NOTE on precedence placement: offerte leads postcode despite lower volume
-- because an explicit offerte number is a higher-confidence single-account
-- signal than a postcode (which can map to multiple installation Sites). This
-- is a confidence ordering WITHIN the data-driven candidate set, not a
-- hand-curated identifier choice (the kinds themselves come from the report).
--
-- Iteration 1 = precedence-only + single-hit short-circuit (RESEARCH OQ-1):
-- llm_tiebreaker=false, no corroboration field (the engine would silently
-- ignore one — Pitfall 3).
--
-- ALSO seeds dry_run_config.stage_2_resolution = true (fail-closed — sales
-- Stage 2 audit write is blocked / dry-run until cut-over), and the sales
-- Stage 2 swarm_dispatch event on the 'unknown' noise category so the
-- classifier-verdict-worker actually emits a Stage 2 request for sales rows
-- (Pitfall 6 — without this, sales rows are silent at Stage 2; mirrors debtor's
-- 'unknown' → 'debtor-email/stage-2.customer-resolve.requested').

BEGIN;

-- 1. Real resolution_config (replace the inert placeholder).
UPDATE public.swarms
   SET resolution_config = jsonb_build_object(
         'version', '2026-06-04.v1',
         'source', jsonb_build_object(
           'kind', 'nxt',
           'resolver_tool_id', 'nxt.rest_proxy',
           'fallback', 'live_nxt_views'
         ),
         'scope', jsonb_build_object(
           'environment_id', 'BX',
           'brand_mode', 'tiebreaker',
           'brand_scope', jsonb_build_array('SB')
         ),
         -- D-04 data-driven precedence (see header). Sales identifier step kinds
         -- are sales-adapter-specific; the engine silently skips unknown names.
         'precedence', jsonb_build_array(
           'sender_match',
           'offerte_match',
           'postcode_site_match',
           'factuur_match',
           'order_match'
         ),
         -- STAGE2-02 no-op: no self-auth tier for sales.
         'auto_safe_kinds', jsonb_build_array(),
         'blocklist_ref', jsonb_build_object(
           'swarm_type', 'sales-email',
           'include_shared', false
         ),
         -- Iteration 1: no LLM tiebreaker (precedence-only; D-06 fast-follow).
         'llm_tiebreaker', false
       ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- 2. Fail-closed Stage 2 dry-run gate (blocked until cut-over). Merge into the
-- existing dry_run_config jsonb so the other stage flags are preserved.
UPDATE public.swarms
   SET dry_run_config = COALESCE(dry_run_config, '{}'::jsonb)
                        || jsonb_build_object('stage_2_resolution', true),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- 3. Pitfall 6 — emit the sales Stage 2 event. The 'unknown' fall-through bucket
-- is the Stage 2-triggering category for sales (mirrors debtor's 'unknown' →
-- swarm_dispatch). Flip its action to swarm_dispatch + set the stage-named event
-- so classifier-verdict-worker fires the Stage 2 request for sales rows.
UPDATE public.swarm_noise_categories
   SET action = 'swarm_dispatch',
       swarm_dispatch = 'sales-email/stage-2.customer-resolve.requested'
 WHERE swarm_type = 'sales-email'
   AND category_key = 'unknown';

COMMIT;
