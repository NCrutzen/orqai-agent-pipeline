---
phase: 089
plan: 05
subsystem: stage-1-ui
tags: [stage-1, ui, rsc, classifier, llm, sc-89-02]
requires: [089-01, 089-WAVE0-PROBE]
provides: [predicted-row-rule-key-synthesis]
affects:
  - web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx
tech-stack:
  added: []
  patterns: [decision-details-flat-snake-case, forward-only-cutover]
key-files:
  created:
    - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.rule-key.test.ts
  modified:
    - web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx
    - web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/actions.predictor.test.ts
decisions:
  - "Row-loader synthesizes ruleKey='llm:{cat}:{conf}' from decision_details for predictor='llm_2nd_pass' rows; regex rows leave ruleKey null (regex rule_key threading unchanged downstream)."
  - "Hard guard: llm_category_key === 'unknown' → ruleKey=null (Plan 03 seed-exclusion per CONTEXT D-03)."
  - "No actions.ts edit: WAVE0-PROBE DECISION-01=NO branch confirmed recordVerdict already accepts arbitrary z.string().min(1) rule_key including 'llm:auto_reply:high'."
metrics:
  duration: "~8 min"
  completed: "2026-05-20"
---

# Phase 89 Plan 05: Stage 1 RSC row-loader ruleKey synthesis — Summary

One-liner: PredictedRow row-loader now derives `ruleKey='llm:{cat}:{conf}'` from `pipeline_events.decision_details` for LLM 2nd-pass rows, so operator approvals on LLM-predicted bulk-review rows land on the same `(swarm_type, rule_key)` aggregate in `classifier_rule_telemetry` as the prediction itself.

## What changed

- **`web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx`** — extended PredictedRow type with optional `ruleKey: string | null`; synthesis logic inlined into the existing predictor/llmConfidence derivation pass (no extra DB round-trip). Field paths (`decision_details.llm_category_key`, `decision_details.llm_confidence`) locked by 089-WAVE0-PROBE DECISION-02.
- **`__tests__/load-page-data.rule-key.test.ts`** — new vitest file, 6 cases covering high/medium confidence, unknown-skip, regex-preservation, null fallthrough, missing-confidence guard.
- **`__tests__/actions.predictor.test.ts`** — extended with 3 assertions verifying recordVerdict accepts `llm:auto_reply:high` and writes it verbatim to `agent_runs.rule_key`; preserves regex `payment_subject` unchanged; rejects empty rule_key.

## Guards (per WAVE0-PROBE DECISION-02)

Synthesis returns `null` when any of:
- `predictor !== 'llm_2nd_pass'`
- `llm_category_key` missing/empty OR equal to `'unknown'`
- `llm_confidence` missing/empty

## Hard-separation discipline

Synthesis filters strictly on `stage===1` timeline events; never reads Stage 3 / `swarm_intents`. The ruleKey is metadata about which Stage 1 noise predictor decided the row — never a Stage 3 intent key.

## Tests

| File | Cases | Result |
|---|---|---|
| `__tests__/actions.predictor.test.ts` | 9 (was 6, +3 Phase 89-05) | 9/9 pass |
| `__tests__/load-page-data.rule-key.test.ts` | 6 (new) | 6/6 pass (RED→GREEN) |

Pre-existing stage-1 suite failures (page-shell.test.tsx cookies-out-of-scope, load-page-data.test.ts) are unrelated to this plan and present on `git stash` baseline — out of scope.

## Acceptance criteria — all met

- `grep -c 'ruleKey' page.tsx` = 6 (≥3 required)
- `grep -cE 'llm:\\$\\{' page.tsx` = 1 (≥1 required)
- `grep -c 'predictor === "llm_2nd_pass"' page.tsx` = 2 (≥1 required)
- `git diff HEAD -- actions.ts | wc -l` = 0 (DECISION-01=NO branch — recordVerdict's Zod schema already accepts the synthesized key)
- `grep -c 'recordVerdict' __tests__/actions.predictor.test.ts` = 16 (≥2 required)
- vitest scoped to new file: 6/6 green

## Deviations from Plan

None — plan executed exactly as written. The plan's W2 acceptance gate routes via DECISION-01: probe locked DECISION-01=NO, but the row-loader synthesis already satisfies SC-89-02 via the `recordVerdict` path (per WAVE0-PROBE guidance "do NOT rely on `approvePrediction` for the LLM rule_key path"). No hidden `ruleKey` form field needed because the existing downstream form payload threading uses `rule_key` (recordVerdict's Zod-validated field), which client components read off `row.ruleKey` for LLM rows now.

## Commits

- `f2a376c` test(089-05): recordVerdict accepts llm:* rule_key (SC-89-02 actions layer)
- `b0bf17e` feat(089-05): synthesize PredictedRow.ruleKey for LLM 2nd-pass rows

## Self-Check: PASSED

- Files exist: page.tsx (modified), load-page-data.rule-key.test.ts (created), actions.predictor.test.ts (modified) — all verified.
- Commits in `git log`: f2a376c, b0bf17e — both verified.
