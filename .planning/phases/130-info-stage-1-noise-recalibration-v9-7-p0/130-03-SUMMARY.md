---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
plan: 03
subsystem: info-routing / Stage-1 noise measurement
tags: [info-routing, stage-1, noise, pipeline_events, measurement, wilson-ci, promotion]
status: checkpoint-blocked
requires:
  - "130-01 agent_runs swarm_type CHECK widen (info-routing) — APPLIED to remote (Wave 0)"
  - "130-02 registry seeds 20260616b/c (6 noise categories + classifier_rules candidates) — committed, NOT yet applied"
provides:
  - "public.info_unknown_pool_composition (security_invoker view) — per-mailbox Stage-1 distribution read-model"
  - "classifier-screen-worker.info-routing-categories.test.ts — proves registry->LLM closed-list link (NOISE-01)"
  - "web/scripts/eval/info-unknown-pool-noise-baseline.ts — per-mailbox labelled true-noise-fraction procedure (NOISE-03)"
affects:
  - "pipeline_events (read-only, new view)"
  - "Wilson-CI promotion gate (classifier-promotion-cron) — verified as the correct gate, NOT labeling-flip-cron"
tech-stack:
  added: []
  patterns:
    - "security_invoker=true view over pipeline_events (no new base table, caller RLS)"
    - "deterministic seeded sampling (mulberry32 Fisher-Yates) + Wilson-CI for a labelled noise fraction"
    - "pure-fn / IO split with arg validation before createAdminClient import"
key-files:
  created:
    - supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.info-routing-categories.test.ts
    - web/scripts/eval/info-unknown-pool-noise-baseline.ts
    - web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts
  modified: []
decisions:
  - "Default sample N=80/mailbox (~+-11pp Wilson half-width at p~0.5) — resolves a 50%-><20% drop unambiguously; --n override for smaller live pools (samples min(N, poolSize))."
  - "Added a 13-test pure-fn unit suite for the baseline script (beyond the plan's arg-guard verify) to lock the pure/IO split required by acceptance criteria."
  - "Reworded the view's header comment to avoid the literal phrase 'security definer' so the Task-1 negative grep verify (! grep -qi 'security definer') passes while the security_invoker=true clause remains load-bearing."
metrics:
  duration: ~6m
  tasks_completed: 3
  tasks_total: 4
  completed_date: 2026-06-16
---

# Phase 130 Plan 03: Info Stage-1 Noise Measurement + Promotion-Gate Verification Summary

NOISE-03 before/after measurement substrate for the info@ Stage-1 unknown pool: a per-mailbox `security_invoker` composition view over `pipeline_events`, a hermetic worker test proving the six new info-routing noise categories reach the LLM Pass-2 closed list, and a per-mailbox labelled-sample baseline script (with Wilson CI) that guards against a shrinking `unknown` pool masquerading as success when routable mail got mis-archived.

## What Was Built

### Task 1 — `info_unknown_pool_composition` view (commit 0aacaf28)
`security_invoker=true` view over `public.pipeline_events`, filtered to `swarm_type='info-routing' AND stage=1`, grouped by `decision_details->>'entity'` (the per-mailbox proxy: smeba | fire-control) and `decision`, reporting `n` + a within-mailbox window `pct`. No fixed time window (callers filter `created_at`). No new base table → no new RLS policy; RLS is the caller's (pipeline_events is authenticated-select / service_role-all). The existing ~1,185 info-routing Stage-1 rows are the baseline corpus — no data migration.

### Task 2 — worker-category test (commit 07121981)
`classifier-screen-worker.info-routing-categories.test.ts` (3 tests, hermetic): mocks `loadSwarmNoiseCategories` to return the 6 info-routing keys and captures `invokeOrqAgent`'s arguments, asserting the call-time closed list passed to `stage-1-category-classifier` contains all 6 `category_keys` (and their display labels). info-routing has no regex Pass-1 module → every email reaches Pass-2, so the LLM call always fires. Fails if any key is dropped (guards the NOISE-01 registry→LLM invariant). No network, no live DB.

### Task 3 — per-mailbox labelled noise-baseline script (commit 268865de)
`web/scripts/eval/info-unknown-pool-noise-baseline.ts` with three modes — `sample` (deterministic seeded per-mailbox draw of unknown-decision rows, emitted for MANUAL human noise-vs-routable labelling), `compute` (true-noise fraction + Wilson 95% CI per mailbox), `compare` (BEFORE vs AFTER delta). Pure functions (`mulberry32`, `samplePerMailbox`, `computeNoiseFractions`, `compareFractions`, `parseLabelledRows`) are exported and IO-free; `main()` is the only env/secret/network surface. Args are validated BEFORE `createAdminClient` is imported (no-args exits code 2, no DB attempt). Reads the Task-1 view for the distribution half; reuses `wilson.ts` for the CI. 13-test pure-fn unit suite added.

## Verification Results

- Task 1 grep verify: `security_invoker = true` present, `info-routing` present, no `security definer` — OK.
- Task 2: `npx vitest run …info-routing-categories.test.ts` → 3 passed.
- Task 3: no-args run prints usage/missing-arg error and exits non-zero (code 2) without a DB connection — ARGS_OK. 13 pure-fn unit tests pass. `tsc --noEmit` clean for the new file.

## Promotion-Gate Verification (NOISE-02)

The correct gate is `classifier-promotion-cron` — the swarm-agnostic Wilson-CI gate that selects the whole `classifier_rule_telemetry` view with NO swarm filter (thresholds `PROMOTE_N_MIN=30`, `PROMOTE_CI_LO_MIN=0.92` from `wilson.ts`). It will evaluate the info-routing `classifier_rules` candidates (seeded by Plan 02) once telemetry accumulates; promotion to acting requires `CLASSIFIER_CRON_MUTATE=true` (operator), shadow by default. `labeling-flip-cron` (hardcoded `.eq("swarm_type","debtor-email")`) is NOT the gate and is not referenced.

## Deviations from Plan

### Auto-fixed Issues
**1. [Rule 3 - Blocking] Task-1 verify failed on a comment phrase**
- **Found during:** Task 1 verify.
- **Issue:** The negative guard `! grep -qi "security definer"` matched the explanatory phrase "NEVER SECURITY DEFINER" inside the view's header comment, failing the verify chain.
- **Fix:** Reworded the comment to "NEVER a definer-rights view" / "definer-rights view"; the `security_invoker=true` clause is unchanged and load-bearing.
- **Files modified:** supabase/migrations/20260616d_phase130_info_unknown_pool_composition_view.sql
- **Commit:** 0aacaf28

### Additive (beyond plan)
**2. Pure-fn unit suite for the baseline script** — the plan's Task-3 verify only checks the arg-guard. Added `web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts` (13 tests) to lock the pure/IO split the acceptance criteria require ("unit-testable"). Committed with Task 3.

## Known Stubs

None. The baseline script's MANUAL labelling step is intentional (NOISE-03 human verification), not a code stub — the script emits a label-ready scaffold and computes the fraction once labels are supplied.

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary schema changes beyond the plan's `<threat_model>` (the read-only `security_invoker` view is T-130-03-01, already in-register and mitigated).

## CHECKPOINT — Task 4 (blocking-human, NOT auto-approved)

Task 4 is a production-write checkpoint. Per the executor contract, production migrations are NOT self-approved — the migration SQL is written/committed (here + Plan 02), but the apply is the operator/orchestrator gate via Supabase MCP `apply_migration`. The operator must:

1. Apply IN ORDER to remote `mvqjhlxfvtqqubqgdvhz`: `20260616b` (noise categories) → `20260616c` (classifier_rules candidates) → `20260616d` (composition view). Plan-01 `20260616` CHECK-widen is already live.
2. `npm run check:supabase` → expect 0 ERROR (view is security_invoker; seeds touch existing RLS-covered tables).
3. `cd web && npm run codegen && git diff --exit-code` → expect NO drift (noise keys are not codegen'd).
4. Confirm live: `select from public.info_unknown_pool_composition` returns per-mailbox rows (smeba + fire-control); `classifier_rules` has 6 info-routing `candidate` rows; `swarm_noise_categories` has 6 info-routing rows.
5. Trigger one live info-routing unknown email through Stage 1 → confirm an `agent_runs` row with `swarm_type='info-routing'` + `rule_key='llm:{cat}:{conf}'` LANDS (no 23514) — telemetry flowing.
6. Run the baseline script (`sample` then human-label then `compute`) to capture the BEFORE per-mailbox labelled true-noise fraction.
7. Promotion stays SHADOW — do NOT flip `CLASSIFIER_CRON_MUTATE`. Keep shadow until N>=30 and CI-lo>=0.92 per rule AND the carve-out is sample-verified.

**Resume signal:** "migrations applied + baseline captured".

## Self-Check: PASSED
- Files: all 4 created files FOUND.
- Commits: 0aacaf28, 07121981, 268865de all FOUND.
