-- Phase 123 (RESL-UNIFY-05) — retire the 2 legacy Stage-2 lookup tools.
--
-- WHY: Stage 2 entity resolution is now unified on the single generic
-- nxt.resolve_candidates substrate (Plans 01-03 rewired both debtor + sales
-- production paths off lookupSenderToAccount/lookupIdentifierToAccount; Plan 03
-- deleted the wrapper defs/types/schemas/literals from nxt-zap-client.ts — repo
-- grep 0, tsc 0, full vitest green). The 2 zapier_tools rows + the widened
-- CHECK constraints are now dead surface. This migration removes them.
--
-- SUPERSEDES — DO NOT EDIT HISTORY:
--   Migration 20260610a (Phase 91 RESL-01/03) ADDED contact_lookup +
--   identifier_lookup (tool_id) and sender_to_account + identifier_to_account
--   (lookup_kind) so the resolve_candidates roll-out could coexist with the
--   legacy tools during capability-before-removal. That coexistence window is
--   closed. This migration widens those 2 CHECK constraints BACK to the
--   surviving 2-value sets. Migration history is APPEND-ONLY: 20260610a (and
--   every other historical migration) stays byte-unchanged — this file is the
--   forward correction, not an edit.
--
-- nxt_database_check is deliberately UNCHANGED (per 20260610a — the engine still
-- sends 'nxt_benelux_prod' on resolve_candidates until RESL-16 consolidates onto
-- environment_id).
--
-- RLS: this migration is DELETE-only on public.zapier_tools and ALTER (constraint
-- swap) on debtor.nxt_lookup_requests. Both tables already have RLS enabled with
-- service_role policies — DELETE/ALTER on an already-RLS-enabled table needs NO
-- new policy (CLAUDE.md). No table is created; no grant changes.
--
-- ⚠️ PRE-FLIGHT CAVEAT (constraint re-add can FAIL — see T-123-10):
--   A `drop constraint … add constraint … check (…)` re-validates EVERY existing
--   row. If any historical debtor.nxt_lookup_requests row still carries a retired
--   value — tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup') OR
--   lookup_kind IN ('sender_to_account','identifier_to_account') — the ADD
--   CONSTRAINT step below will FAIL and roll back the whole transaction.
--
--   The Task 2 apply step MUST run this pre-flight FIRST:
--
--     SELECT count(*) FROM debtor.nxt_lookup_requests
--      WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup')
--         OR lookup_kind IN ('sender_to_account','identifier_to_account');
--
--   • count = 0 → apply this migration AS WRITTEN (DELETE + both constraint swaps).
--   • count > 0 → those rows are inert historical audit data. Apply ONLY the
--     DELETE FROM public.zapier_tools statement, KEEP the wide constraints from
--     20260610a, and RECORD THE DEVIATION. A follow-up cleanup can prune the
--     stale request rows, after which the constraint widen-back can land. Do NOT
--     force the constraint swap over live legacy rows — no failed migration, no
--     outage (T-123-10 mitigation).

BEGIN;

-- (1) Delete the 2 retired tool rows from the zapier_tools routing registry.
--     WHERE-scoped to the 2 explicit retired ids ONLY — the surviving tool ids
--     (nxt.candidate_details, nxt.resolve_candidates) are untouched (T-123-11).
DELETE FROM public.zapier_tools
 WHERE tool_id IN ('nxt.contact_lookup', 'nxt.identifier_lookup');

-- (2) Widen tool_id CHECK back to the surviving 2-value set.
--     (Pre-flight count MUST be 0 — see caveat above.)
ALTER TABLE debtor.nxt_lookup_requests
  DROP CONSTRAINT nxt_lookup_requests_tool_id_check,
  ADD CONSTRAINT nxt_lookup_requests_tool_id_check CHECK (tool_id IN (
    'nxt.candidate_details',
    'nxt.resolve_candidates'
  ));

-- (3) Widen lookup_kind CHECK back to the surviving 2-value set.
--     (Pre-flight count MUST be 0 — see caveat above.)
ALTER TABLE debtor.nxt_lookup_requests
  DROP CONSTRAINT nxt_lookup_requests_lookup_kind_check,
  ADD CONSTRAINT nxt_lookup_requests_lookup_kind_check CHECK (lookup_kind IN (
    'candidate_details',
    'resolve_candidates'
  ));

COMMIT;
