---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
plan: 05
subsystem: stage-1 / shared block-rule + NOISE-03 measurement
tags: [info-routing, stage-1, carve-out, swarm-agnostic, shared-block-rules, NOISE-03, NOISE-04, WR-03, REQ-6, gap-closure]
status: complete
gap_closure: true
requires:
  - "Phase 130-04 complete (NOISE-03 tooling fixes)"
  - "public.swarms registry (select(*) → swarmRow); existing tenant_domains text[] precedent"
provides:
  - "SHARED swarm-agnostic Stage-1 actionable-token block-rule, wired into classifier-screen-worker.ts (T-130-02-01 mitigation now real, not prompt-only)"
  - "swarms.stage1_shared_block_rules text[] adoption pool — info-routing first adopter; cross-swarm transferable (REQ-6, no swarm_type literal)"
  - "NOISE-03 re-scoped to automated unknown-share from info_unknown_pool_composition (zero human labelling)"
affects:
  - "classifier-screen-worker.ts LLM success path (~line 352): registry-gated veto forces actionable-token noise verdicts back to unknown"
  - "All swarms read stage1_shared_block_rules; only adopters are vetoed (debtor/sales/support-tickets = [] → untouched)"
tech-stack:
  added: []
  patterns:
    - "Shared-pool-with-adoption registry model (text[] of adopted rule keys) — mirrors tenant_domains; no codegen"
    - "Block-rule-FIRST carve-out wired upstream of all swarm-specific dispatch (REQ-6 registry gate, no swarm_type literal)"
---

# 130-05 SUMMARY — Swarm-agnostic shared Stage-1 carve-out + NOISE-03 re-scope (gap-closure)

Resolves the two operator decisions on the 130-HUMAN-UAT items: **WR-03 → option A** (wire the carve-out) and **NOISE-03 baseline → automated view-metric** (throw away human labelling). Reframed per the operator's swarm-agnostic directive: the carve-out is now a SHARED Stage-1 block-rule any swarm adopts via the registry, not an info-routing special-case.

## Tasks

- **Task 1 — Adoption-pool migration** (`20260616e_phase130_swarms_shared_block_rules.sql`, commit `d5b2ccc0`; APPLIED to remote `mvqjhlxfvtqqubqgdvhz` by orchestrator after operator authorization): `ALTER TABLE public.swarms ADD COLUMN stage1_shared_block_rules text[] NOT NULL DEFAULT '{}'` + enroll info-routing as `ARRAY['actionable_token']`. Additive, idempotent, no RLS/codegen impact. **Verified live:** info-routing=`['actionable_token']`; debtor-email/sales-email/support-tickets=`[]` (behaviour-neutral); 0 new ERROR advisors.
- **Task 2 — Wire the veto** (commit `4cab3182`): relocated the predicate `web/lib/info-routing/actionable-tokens.ts` → `web/lib/stage-1/actionable-tokens.ts` (swarm-neutral; no dangling old import, grep-clean). In `classifier-screen-worker.ts` (~line 352, LLM success path, upstream of the debtor live-archive block and Step 5, before the agent_runs INSERT): when `swarmRow.stage1_shared_block_rules?.includes('actionable_token')` AND the LLM returned a noise key AND `hasActionableToken(subject+body)` fires → force verdict back to `unknown`, recording `tool_outputs.shared_block_rule='actionable_token'` + `gated_to='unknown'`. REQ-6: registry gate, zero swarm_type literal. New test `classifier-screen-worker.actionable-carveout.test.ts` (5 tests): fire-on-subject, fire-on-body, NOT-adopted→no-veto (debtor/sales untouched), non-actionable→no-veto.
- **Task 3 — NOISE-03 re-scope + docs** (commit `2a52a6b3`): rewrote `info-unknown-pool-noise-baseline.ts` to a pure automated `report` mode computing per-mailbox unknown-share from `info_unknown_pool_composition` only — removed the sample→label→compute/Wilson flow and the human-labelling step (`wilson.ts` untouched). Updated test. `stage-1-regex.md`: carve-out section reframed as SHARED swarm-agnostic block-rule with per-swarm adoption, layer enumeration updated **two → three** layers (added the wired programmatic backstop as layer (b)), NOISE-03 measurement section rewritten to the automated metric, plus a forward-note pointing at a future phase to rework `classifier_rules`/`swarm_noise_categories` into the same shared-pool model. `130-CONTEXT.md` + `130-VALIDATION.md` NOISE-03/NOISE-04 criteria annotated SUPERSEDED.

## Deviations

- Registry mechanism upgraded from the originally-planned info-routing-only boolean flag to a swarm-agnostic `text[]` adoption pool (`stage1_shared_block_rules`) after the operator's "Stage 1 must be swarm-agnostic" directive. Better embodies "shared pool, transferable across swarms"; mirrors `tenant_domains`; no codegen.
- Executor stalled mid-Task-3 (stream watchdog, 600s) after committing Tasks 1-2 and editing the Task-3 files; the orchestrator finished Task 3 inline (committed the staged stage-1-regex.md + baseline rewrite + test, completed the CONTEXT/VALIDATION annotations the stall interrupted), ran tests, and applied + verified the migration.

## Verification

- `npx tsc --noEmit` → clean.
- vitest: worker veto test 5/5, relocated carve-out test, baseline test, info-routing-categories test — all green (43 across the touched files).
- No dangling `info-routing/actionable-tokens` import (grep-clean).
- Migration applied + live-verified (adoption state correct, advisors clean).

## Self-Check: PASSED
- FOUND: `web/lib/stage-1/actionable-tokens.ts` (relocated); old path gone.
- FOUND: worker gate `swarmRow.stage1_shared_block_rules?.includes("actionable_token")` (no swarm literal).
- FOUND commits: d5b2ccc0 (Task 1), 4cab3182 (Task 2), 2a52a6b3 (Task 3).
- Migration applied; debtor/sales/support-tickets behaviour-neutral.
