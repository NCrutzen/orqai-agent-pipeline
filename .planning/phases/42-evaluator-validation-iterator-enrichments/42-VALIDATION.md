---
phase: 42
slug: evaluator-validation-iterator-enrichments
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-21
---

# Phase 42 — Validation Strategy

| Property | Value |
|----------|-------|
| Framework | bash + grep |
| Quick | `bash orq-agent/scripts/lint-skills.sh --file <path>` |
| Full | `bash orq-agent/scripts/lint-skills.sh && bash orq-agent/scripts/check-protected-pipelines.sh` |

## Per-Task Verification Map

| Task | Plan | Wave | Req | Command |
|------|------|------|-----|---------|
| 42-01-01 | 01 | 1 | tester enrichments | lint + grep: run-comparison, overfitting, capability suite, regression suite, eval may be too easy |
| 42-02-01 | 02 | 1 | failure-diagnoser | lint + grep: specification, generalization, dataset, evaluator, outcome-based, dataset-quality, evaluator-quality |
| 42-03-01 | 03 | 1 | iterator | lint + grep: P0, P1, P2, Action Plan, evaluator-version A/B, annotation comment, no-repeat, prompt fix vs evaluator |
| 42-04-01 | 04 | 1 | hardener | lint + grep: TPR ≥ 90%, TNR ≥ 90%, sample_rate, 100%, 30%, 10%, human-review-queue, prevalence correction |
| 42-05-01 | 05 | 1 | results-analyzer | lint + grep: ⚠ regression flag |
| 42-06-01 | 06 | 1 | evaluator-validator.md new | lint + grep: binary Pass/Fail, 4-component, train/dev/test, TPR, TNR, inter-annotator agreement, 85% |
| 42-07-01 | 07 | 1 | resources | 7 resource files exist across 3 subdirs |
| 42-08-01 | 08 | 2 | index | SKILL.md updated |
| 42-09-01 | 09 | 3 | verify | full suite + all 28 anchor families |

## Wave 0

- [ ] None — reuse Phase 34 scripts.

## Manual-Only Verifications

| Behavior | Req | Why Manual |
|----------|-----|------------|
| TPR/TNR measurement on real labels | EVLD-06 | Needs human-labeled dataset |
| Annotation Queue creation via MCP | EVLD-09 | Live workspace |
| Sample rate applied at promotion | ITRX-08 | Live guardrail deploy |
| Regression ⚠ on actual run | ITRX-04 | Live experiment |

**Approval:** pending
