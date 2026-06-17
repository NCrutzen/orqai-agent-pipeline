-- Phase 120-03 Task 1 — debtor-email resolution_config corroboration opt-in.
--
-- Adds the D-06 multi-signal corroboration field to the LIVE debtor
-- resolution_config so the Plan 01 engine capability actually fires (Pitfall 2:
-- a corroboration field the engine reads is inert until the live row carries it).
--
-- W1 (Phase 120-03, LOCKED 2026-06-17): this seed is built from the ACTUAL LIVE
-- row queried from project mvqjhlxfvtqqubqgdvhz on 2026-06-17 — NOT from the
-- in-tree 20260601a migration. The live debtor row is the P0 config (precedence
-- [thread_inheritance, sender_match, identifier_match], auto_safe_kinds []),
-- llm_tiebreaker true, resolver_tool_id nxt.resolve_candidates. The plan's stated
-- "Phase-91 inverted live row" assumption did NOT match production (live is P0);
-- per the operator decision (AskUserQuestion 2026-06-17) we take the live value
-- VERBATIM and ADD only `corroboration`, so live behavior is preserved (no AUTO-
-- tier change) and corroboration is layered on top. The auto_safe_alone_kinds
-- list (customer_no, site_no, invoice_no) names the lone identifier kinds that
-- KEEP high confidence on their own (D-07); it is the corroboration sub-config,
-- independent of the (empty) top-level auto_safe_kinds.
--
-- UPDATE-only on the RLS-enabled public.swarms (existing policies cover all
-- columns) — no new table, no new policy. check:supabase stays 0 ERROR.

BEGIN;

UPDATE public.swarms
   SET resolution_config = '{
         "version": "2026-06-16.v1",
         "source": {
           "kind": "nxt",
           "resolver_tool_id": "nxt.resolve_candidates",
           "fallback": "live_nxt_views"
         },
         "scope": {
           "environment_id": "BX",
           "brand_mode": "tiebreaker",
           "brand_scope": null,
           "brand_scope_by_mailbox": { "debiteuren@berki.nl": ["BB", "IN"] }
         },
         "precedence": ["thread_inheritance", "sender_match", "identifier_match"],
         "auto_safe_kinds": [],
         "blocklist_ref": { "swarm_type": "debtor-email", "include_shared": true },
         "llm_tiebreaker": true,
         "corroboration": {
           "min_signals": 2,
           "boost": "high",
           "auto_safe_alone_kinds": ["customer_no", "site_no", "invoice_no"]
         }
       }'::jsonb,
       updated_at = now()
 WHERE swarm_type = 'debtor-email';

COMMIT;
