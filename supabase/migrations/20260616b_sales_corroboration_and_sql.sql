-- Phase 120-03 Task 1 — sales-email corroboration opt-in + REST→SQL transport
-- switch + dedicated resolve_candidates allowlist entry for sales.
--
-- Three coordinated changes, all UPDATE-only on existing RLS-enabled tables (no
-- new table/policy; check:supabase stays 0 ERROR):
--
-- 1. public.swarms (sales-email) resolution_config:
--    - source.resolver_tool_id: 'nxt.rest_proxy' → 'nxt.resolve_candidates'
--      (D-09 transport switch — Plan 02 migrated the sales lookups to the SQL
--      resolver_index back-search; the config seam follows).
--    - ADD corroboration {min_signals:2, boost:'high',
--      auto_safe_alone_kinds:['quote_no','order_no','invoice_no']} so the sales
--      adapter's shared scoreCorroboration path fires (config-DATA gate, SWARM-02).
--    - version bumped to 2026-06-16.v1.
--    - Every other field preserved from the LIVE 2026-06-04.v1 row (verified live
--      2026-06-17: matches 20260604b).
--
-- 2. dry_run_config.stage_2_resolution = true PRESERVED (fail-closed — sales
--    Stage 2 stays dry-run until cut-over; corroboration changes confidence math
--    only, not the gate).
--
-- 3. swarm_noise_categories 'unknown' dispatch PRESERVED (Pitfall 6 — sales
--    Stage 2 event emission).
--
-- 4. public.zapier_tools: add a DEDICATED 'sales_resolution' intent to
--    nxt.resolve_candidates.allowed_for_intents (operator request 2026-06-17).
--    The sales back-search lookups call the tool with intent 'sales_resolution'
--    so sales resolution is allowlisted under its OWN intent (per-swarm audit),
--    not lumped with debtor's 'unknown'. Additive — 'unknown' (debtor number
--    back-search) and 'invoice_copy_request' are kept.

BEGIN;

-- 1. resolution_config: transport switch + corroboration opt-in.
UPDATE public.swarms
   SET resolution_config = jsonb_build_object(
         'version', '2026-06-16.v1',
         'source', jsonb_build_object(
           'kind', 'nxt',
           'resolver_tool_id', 'nxt.resolve_candidates',
           'fallback', 'live_nxt_views'
         ),
         'scope', jsonb_build_object(
           'environment_id', 'BX',
           'brand_mode', 'tiebreaker',
           'brand_scope', jsonb_build_array('SB')
         ),
         'precedence', jsonb_build_array(
           'sender_match',
           'offerte_match',
           'postcode_site_match',
           'factuur_match',
           'order_match'
         ),
         'auto_safe_kinds', jsonb_build_array(),
         'blocklist_ref', jsonb_build_object(
           'swarm_type', 'sales-email',
           'include_shared', false
         ),
         'llm_tiebreaker', false,
         -- D-06 corroboration opt-in (the shared scoreCorroboration path).
         'corroboration', jsonb_build_object(
           'min_signals', 2,
           'boost', 'high',
           'auto_safe_alone_kinds', jsonb_build_array('quote_no', 'order_no', 'invoice_no')
         )
       ),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- 2. Fail-closed Stage 2 dry-run gate PRESERVED (idempotent merge).
UPDATE public.swarms
   SET dry_run_config = COALESCE(dry_run_config, '{}'::jsonb)
                        || jsonb_build_object('stage_2_resolution', true),
       updated_at = now()
 WHERE swarm_type = 'sales-email';

-- 3. Sales Stage 2 dispatch event PRESERVED (Pitfall 6).
UPDATE public.swarm_noise_categories
   SET action = 'swarm_dispatch',
       swarm_dispatch = 'sales-email/stage-2.customer-resolve.requested'
 WHERE swarm_type = 'sales-email'
   AND category_key = 'unknown';

-- 4. Dedicated sales intent on the resolve_candidates allowlist (additive —
-- preserves the existing debtor entries). allowed_for_intents is text[]; append
-- 'sales_resolution' only when absent (idempotent).
UPDATE public.zapier_tools
   SET allowed_for_intents = array_append(
         COALESCE(allowed_for_intents, ARRAY[]::text[]),
         'sales_resolution'
       )
 WHERE tool_id = 'nxt.resolve_candidates'
   AND NOT ('sales_resolution' = ANY(COALESCE(allowed_for_intents, ARRAY[]::text[])));

COMMIT;
