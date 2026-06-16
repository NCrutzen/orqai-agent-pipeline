---
status: partial
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
source: [130-VERIFICATION.md, 130-REVIEW.md]
started: 2026-06-16
updated: 2026-06-16
---

## Current Test

[awaiting human testing / follow-up fixes]

## Tests

### 1. Live end-to-end telemetry confirmation
expected: Under real Inngest worker execution (not just the DDL roundtrip the orchestrator already proved), an info-routing `unknown` email through Stage 1 produces an `agent_runs` row with `swarm_type='info-routing'` and `rule_key='llm:{cat}:{conf}'` — no Postgres `23514`. Confirms the worker write path end-to-end.
result: [pending]

### 2. Fix WR-01 — baseline sampler reads unset decision_details keys (CODE FIX)
expected: `web/scripts/eval/info-unknown-pool-noise-baseline.ts` maps `subject`/`sender` from `decision_details.subject` / `decision_details.from`, but the Stage-1 writer (`classifier-screen-worker.ts:449`) never sets those keys — every label scaffold row emits `null` subject/sender, forcing the human to label from the LLM's own reasoning (circular — the exact Pitfall-5 failure the script exists to prevent). Fix: look up `email_pipeline.emails` by `email_id` (already selected but unused) to populate subject/sender. MUST land before test 3.
result: [pending]

### 3. BEFORE labelled-sample baseline (per mailbox)
expected: After WR-01 fix, run the baseline script `sample` → human-label → `compute` for both mailboxes (smeba, fire-control) to capture the per-mailbox true-noise fraction of the `unknown` pool BEFORE promotion. This is the NOISE-03 "before" anchor; without it the ~50%→<20% claim is unmeasurable.
result: [pending]

### 4. Fix WR-02 — add Wilson upper bound for <20% assertion (CODE FIX)
expected: The baseline script computes only `wilsonCiLower`. NOISE-03's success criterion is that the AFTER noise share is *below* 20%, which needs the Wilson *upper* bound. Add `wilson_ci_hi` so the AFTER measurement can substantiate the `<20%` upper-bound claim.
result: [pending]

### 5. Resolve WR-03 — hasActionableToken carve-out is prompt-only (DECISION)
expected: `hasActionableToken` is documented (and threat model T-130-02-01 claims it) as the PRODUCTION carve-out backstop the screen-worker calls, but `classifier-screen-worker.ts` has zero import/call sites — the programmatic NOISE-04 guard is dead code; the carve-out runs only via the LLM prompt + Wilson shadow. DECIDE: either (a) wire `hasActionableToken` into the screen-worker as a real block-rule-first guard, or (b) formally accept prompt-only enforcement and correct the docs/threat-model claim. The boundary test currently gives false confidence either way until this is resolved.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

- WR-01 and WR-02 are code defects in the NOISE-03 measurement tooling (not pure human-test items) — they gate the BEFORE baseline (test 3) and the <20% success proof. Recommended path: a small gap-closure round (`/gsd:plan-phase 130 --gaps`) to fix WR-01 + WR-02 before capturing the baseline.
- WR-03 is an open decision affecting the NOISE-04 effectiveness claim and threat-model accuracy.
- The phase's registry infrastructure (NOISE-01/02/05) is fully built, applied to production, and verified — these gaps concern the measurement/carve-out enforcement layer, not the seeded rules.
