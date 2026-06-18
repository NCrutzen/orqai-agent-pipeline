-- Phase 122-04 Task 1 — debtor-email resolution_config cross-brand-scope opt-in.
--
-- Adds the D-10 cross-brand-scope (`cross_scope`) field to the LIVE debtor
-- resolution_config so the Plan 02/03 cross-scope engine capability actually
-- fires (Pitfall 5: the engine reads swarms.resolution_config from the registry
-- at dispatch time — a cross_scope field the engine supports is INERT until the
-- live row carries it).
--
-- ADD-ONLY via jsonb `||` concat (Pitfall 5, LOCKED 2026-06-18): UNLIKE the
-- Phase 120-03 precedent 20260616a_debtor_corroboration_optin.sql — which
-- RESTATED the whole jsonb under operator decision W1 — this migration uses the
-- `||` merge operator to ADD ONLY the `cross_scope` key. Restating the full
-- jsonb here would risk re-introducing a precedence / auto_safe_kinds change the
-- live row never had; the `||` concat preserves every existing key (precedence,
-- auto_safe_kinds, scope, corroboration, …) VERBATIM and only layers cross_scope
-- on top. A post-apply query (Task 3) confirms precedence + auto_safe_kinds are
-- unchanged from before.
--
-- cross_scope payload (D-10 opt-in + D-03a strong-kind set):
--   enabled                 true   — master opt-in; cross-brand fallback is now considered.
--   auto_resolve_kinds              — the STRONG identifier kinds that may AUTO
--                                     cross-brand ALONE on a single distinct root,
--                                     without corroboration (D-03a): invoice_no,
--                                     customer_no, site_no.
--   allow_corroboration_auto true   — a cross-brand candidate corroborated by
--                                     ≥min_signals (D-03b) may AUTO even on a lone
--                                     weak kind.
--
-- UPDATE-only on the RLS-enabled public.swarms (existing service-role policies
-- cover all columns) — no new table, no new policy, no TO anon/public.
-- check:supabase stays 0 ERROR.

BEGIN;

UPDATE public.swarms
   SET resolution_config = resolution_config || '{
         "cross_scope": {
           "enabled": true,
           "auto_resolve_kinds": ["invoice_no", "customer_no", "site_no"],
           "allow_corroboration_auto": true
         }
       }'::jsonb,
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

COMMIT;
