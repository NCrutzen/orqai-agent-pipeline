-- Phase 130 Plan 05 Task 1 (WR-03, REQ-6) — SHARED swarm-agnostic Stage-1
-- block-rule adoption pool on public.swarms.
--
-- Operator directive: Stage 1 must be swarm-AGNOSTIC so swarms can profit from
-- each other's rules. A rule written once lives in a SHARED POOL and is
-- transferable across swarms via per-swarm ADOPTION (opt-in), never a
-- swarm-specific special-case (no `swarm_type === 'info-routing'` literal).
--
-- Mechanism: a text[] column `stage1_shared_block_rules` — the set of shared
-- Stage-1 block-rule keys this swarm has ADOPTED. Membership of 'actionable_token'
-- enables the hasActionableToken carve-out in classifier-screen-worker.ts
-- (forces an LLM noise verdict back to 'unknown' when subject/body carries an
-- actionable token). Empty array (the DEFAULT for every existing swarm) = no
-- adoption = behaviour-neutral. A second shared block-rule tomorrow is a pure
-- registry UPDATE — no schema change.
--
-- Registry-as-source-of-truth: NO codegen. `gen-intent-types.ts` reads
-- swarm_intents (Stage 3) only; there is no swarms.*.generated.ts. loadSwarm
-- does select("*"), so this text[] column reaches swarmRow at runtime
-- automatically — exactly like the existing tenant_domains text[] column.
--
-- Security: additive column on an existing table. No new base table → existing
-- public.swarms RLS is unchanged; no new policy needed. No SECURITY DEFINER.
--
-- Behaviour-neutral on apply: the column defaults '{}' for every existing
-- swarm (debtor-email, sales-email, planning, order-entry), so none of them is
-- vetoed by the carve-out. Only the info-routing row is enrolled as the first
-- adopter. The worker gate (Plan 05 Task 2) makes the carve-out effective only
-- for an adopting swarm.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + an UPDATE that is a no-op if re-run.

BEGIN;

ALTER TABLE public.swarms
  ADD COLUMN IF NOT EXISTS stage1_shared_block_rules text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.swarms.stage1_shared_block_rules IS 'Phase 130 WR-03 — SHARED, swarm-agnostic Stage-1 block-rule adoption pool. Set of shared block-rule keys this swarm has adopted (opt-in). Membership of ''actionable_token'' makes classifier-screen-worker veto any LLM noise verdict back to unknown when hasActionableToken matches subject/body. Default empty = no adoption = behaviour-neutral. REQ-6 registry gate (no swarm_type literal); cross-swarm transferable.';

-- Enroll info-routing as the FIRST adopter of the shared actionable-token rule.
-- Every other swarm keeps the default '{}' → no veto → provably untouched.
UPDATE public.swarms
  SET stage1_shared_block_rules = ARRAY['actionable_token'],
      updated_at = now()
  WHERE swarm_type = 'info-routing';

COMMIT;
