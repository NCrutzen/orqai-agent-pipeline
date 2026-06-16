---
status: partial
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
source: [130-VERIFICATION.md, 130-05-SUMMARY.md]
started: 2026-06-16
updated: 2026-06-16
---

## Current Test

[2 items resolved, 1 superseded/removed, 2 remain — 1 operational confirmation + 1 future empirical measurement]

## Tests

### 1. Live end-to-end telemetry confirmation
expected: Under real Inngest worker execution, an info-routing `unknown` email through Stage 1 produces an `agent_runs` row with `swarm_type='info-routing'` and `rule_key='llm:{cat}:{conf}'` — no Postgres `23514`. If the email carries an actionable token and the LLM predicted a noise key, tool_outputs should carry `gated_to='unknown'` and `shared_block_rule='actionable_token'`.
result: [pending — operational confirmation, no code defect suspected]

### 2. Fix WR-01 — baseline sampler reads unset decision_details keys (CODE FIX)
expected: Baseline script maps subject/sender from email_pipeline.emails by email_id (CHUNK=200, sender_email column).
result: resolved (fixed in 130-04)

### 3. BEFORE labelled-sample baseline (per mailbox)
expected: (SUPERSEDED) The prior version required human labelling to anchor the NOISE-03 "before" measurement. This step is REMOVED by Plan 130-05: the wired hasActionableToken shared block-rule structurally prevents routable mis-archive (Pitfall 5), making the distribution metric sufficient. The baseline script no longer has a sample/compute/label flow. NOISE-03 is now measured fully automatically via the report mode reading info_unknown_pool_composition. No human labelling is required at any point.
result: superseded/removed (130-05 Task 3 — human-labelling step dropped; replaced by automated report mode)

### 4. Fix WR-02 — add Wilson upper bound for <20% assertion (CODE FIX)
expected: wilsonCiUpper exported from wilson.ts; NoiseFraction.wilson_ci_hi populated via wilsonCiUpper(n, noise) in computeNoiseFractions.
result: resolved (fixed in 130-04 — note: Wilson CI was subsequently also removed from the baseline script in 130-05 because the metric changed from a labelled sample fraction to a view census distribution; wilson.ts itself remains untouched and wilsonCiUpper remains exported for other callers)

### 5. Resolve WR-03 — hasActionableToken carve-out is prompt-only (DECISION)
expected: Wire hasActionableToken into classifier-screen-worker.ts as a real block-rule (option A), or formally accept prompt-only and correct docs/threat-model.
result: resolved (130-05 — option A chosen, reframed as SHARED swarm-agnostic block-rule; hasActionableToken imported at line 51, veto at lines 351-361; registry-gated on swarmRow.stage1_shared_block_rules?.includes('actionable_token'), no swarm_type literal; predicate relocated to web/lib/stage-1/actionable-tokens.ts; old path deleted; migration 20260616e adds stage1_shared_block_rules text[] to public.swarms with info-routing enrolled as first adopter; 5/5 worker tests green; stage-1-regex.md updated to three-layer enumeration with layer (b) marked WIRED)

### 6. AFTER empirical outcome: unknown-share <20% per mailbox
expected: After the six info-routing noise candidates accumulate N>=30 telemetry rows each and CLASSIFIER_CRON_MUTATE is flipped (operator-gated), run:
  npx tsx web/scripts/eval/info-unknown-pool-noise-baseline.ts report
and observe unknown_pct < 0.20 for each live mailbox (smeba, fire-control). No human labelling required — the script reads info_unknown_pool_composition directly. This is the NOISE-03 empirical success measurement.
result: [pending — future measurement; requires live traffic accrual + operator promotion; tooling is complete and automated]

## Summary

total: 6
passed: 0
issues: 0
resolved: 3 (WR-01, WR-02, WR-03)
superseded: 1 (test 3 — human-labelling step removed by Plan 05)
pending: 2 (test 1 live telemetry, test 6 empirical outcome)
skipped: 0
blocked: 0

## Gaps

None. All code-level decisions are resolved. The two pending items are:
- Test 1: operational confirmation (one live email through the worker; no code defect suspected)
- Test 6: future empirical outcome (accrues after promotion under real traffic; tooling is automated)
