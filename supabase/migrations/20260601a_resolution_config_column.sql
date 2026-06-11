-- Phase 90 (P0 resolver substrate) — D-03/D-04/D-05.
--
-- Adds the per-swarm `swarms.resolution_config` jsonb column (the registry the
-- generic engine reads in Plan 05 and the dispatch flip toggles in Plan 06) and
-- backfills the debtor-email row with the P0 config = TODAY'S behaviour
-- (D-02 behaviour-neutral). No new resolution logic; this is registry data only.
--
-- The column inherits public.swarms' existing RLS — no new table, no new policy.
-- Mirror precedent: 20260504b_swarms_registry_generalisation.sql:10-15 (ALTER ADD
-- nullable jsonb) + :44-85 (per-swarm UPDATE backfill WHERE swarm_type='debtor-email').
--
-- D-02: the precedence array MUST be today's order (thread_inheritance FIRST,
-- as in resolve-debtor.ts:120). Do NOT flip it — the self-auth/invoice-outrank
-- precedence inversion is P1 (RESL-14), not P0. P0 only makes the ordering
-- orderable-as-data so P1 can flip it without a code change.
-- auto_safe_kinds is [] because P0 has no separate self-auth tier yet
-- (P1 adds aanmaning/klantnummer/werkbon).
--
-- D-05 / RESL-06 (Berki BB+IN): debtor-email is the single swarm row for all 4
-- active mailboxes, so scope.brand_scope cannot live uniformly on the row. The
-- Berki BB+IN widening is therefore carried as a PER-MAILBOX override map
-- (scope.brand_scope_by_mailbox keyed by source_mailbox) on the same single
-- swarm row (chosen alternative (a) per the plan — keep it data, no dedicated
-- Berki swarm row). The engine resolves the per-mailbox brand_scope from
-- debtor.labeling_settings.brand_id (primary/tiebreaker brand, unchanged) and,
-- for debiteuren@berki.nl, widens it to ['BB','IN'] from this map, then passes
-- it to zapier.dbo.resolve_candidates as the @brand_scope tiebreaker. The
-- top-level scope.brand_scope stays NULL (no swarm-wide brand pre-filter —
-- brand_mode is 'tiebreaker', NEVER 'hard_filter', per §0.4 / §0.10 A11).

BEGIN;

ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS resolution_config jsonb;  -- Phase 90: nullable, free-form per-swarm (Router rows stay NULL)

COMMENT ON COLUMN public.swarms.resolution_config IS
  'Phase 90 (D-03/D-04/D-05): per-swarm resolver config — scope (env=BX hard / brand tiebreaker; Berki BB+IN as a per-mailbox override map), precedence order (data, D-02 today''s order), auto_safe_kinds, blocklist_ref, source seam (D-04 forward-compat for the V10.0 SugarCRM adapter — the resolution_sources table waits until a non-NXT backend). NULL = Router shape (stage2_entity_resolver=NULL, engine never invoked).';

-- Backfill the debtor-email P0 config = TODAY'S behaviour (D-02 behaviour-neutral).
-- brand_scope_by_mailbox carries the Berki BB+IN widening as data (D-05/RESL-06).
UPDATE public.swarms SET resolution_config = '{
  "version": "2026-06-01.v1",
  "source": {"kind":"nxt","resolver_tool_id":"nxt.resolve_candidates","fallback":"live_nxt_views"},
  "scope": {"environment_id":"BX","brand_mode":"tiebreaker","brand_scope":null,"brand_scope_by_mailbox":{"debiteuren@berki.nl":["BB","IN"]}},
  "precedence": ["thread_inheritance","sender_match","identifier_match"],
  "auto_safe_kinds": [],
  "blocklist_ref": {"swarm_type":"debtor-email","include_shared":true},
  "llm_tiebreaker": true
}'::jsonb
WHERE swarm_type = 'debtor-email';

COMMIT;
