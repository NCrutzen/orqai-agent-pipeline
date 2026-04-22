# Phase 42: Evaluator Validation & Iterator Enrichments - Context

**Gathered:** 2026-04-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance 5 existing subagents with eval-science methodology:
- `orq-agent/agents/tester.md` — run-comparison table, overfitting warning (≥98% on <100 datapoints), capability vs regression suites, ≥95% warn
- `orq-agent/agents/failure-diagnoser.md` — 4-category classification (specification/generalization/dataset/evaluator), outcome-based grading, separation of dataset-quality vs evaluator-quality issues
- `orq-agent/agents/iterator.md` — P0/P1/P2 Action Plans, evaluator-version A/B, annotation-comment absorption, no-repeat-optimizer rule, decision trees
- `orq-agent/agents/hardener.md` — TPR/TNR ≥ 90% gate, sample_rate by volume, human-review-queue hook, prevalence correction
- `orq-agent/agents/results-analyzer.md` — regression ⚠ flag on any drop

Plus a new subagent:
- `orq-agent/agents/evaluator-validator.md` — full TPR/TNR validation pipeline (Annotation Queue creation, 100+ label collection guidance, train/dev/test split, TPR/TNR measurement, inter-annotator agreement)

Requirements: EVLD-01..11 + ESCI-01..08 + ITRX-01..09 = 28 IDs.
Tier: full.

</domain>

<decisions>
## Implementation Decisions

### Distribution across files (lint-anchored phrases in parens)
- **tester.md:** "run-comparison table" (ITRX-03), "overfitting" + "≥98%" + "<100" (ESCI-07), "capability suite" + "regression suite" (ESCI-04), "eval may be too easy" (ESCI-05), "isolated grader" (ESCI-03).
- **failure-diagnoser.md:** 4 classes "specification" + "generalization" + "dataset" + "evaluator" (ESCI-01), "outcome-based" + "no path grading" (ESCI-02), "dataset-quality" + "evaluator-quality" separation (ESCI-08).
- **iterator.md:** "P0" + "P1" + "P2" priority (ITRX-01), "Action Plan" section (ITRX-02), "evaluator-version A/B" (EVLD-11), "annotation comment" absorption (ITRX-09), "no-repeat" + "explicit override" (ITRX-05), decision trees "prompt fix vs evaluator" / "upgrade model" / "eval good enough" (ESCI-06), "Evidence" + "Success Criteria" fields on tickets (ITRX-07).
- **hardener.md:** "TPR ≥ 90%" + "TNR ≥ 90%" (EVLD-08), "sample_rate" with volume defaults "100%" / "30%" / "10%" (ITRX-08), "human-review-queue" hook (ITRX-06), "prevalence correction" formula (EVLD-07).
- **results-analyzer.md:** "⚠️" regression marker on any drop (ITRX-04).
- **evaluator-validator.md (new):** Annotation Queue + Human Review creation (EVLD-09), binary Pass/Fail default (EVLD-01), 4-component judge template (EVLD-03), human-label guidance (EVLD-04), train/dev/test split (EVLD-05), TPR/TNR (EVLD-06), inter-annotator agreement (EVLD-10), "one evaluator per failure mode" (EVLD-02), prevalence correction (EVLD-07).

### New resources
- `orq-agent/agents/evaluator-validator/resources/`:
  - `tpr-tnr-methodology.md`
  - `annotation-queue-setup.md`
  - `4-component-judge-template.md`
- `orq-agent/agents/iterator/resources/`:
  - `action-plan-template.md`
  - `decision-trees.md`
- `orq-agent/agents/hardener/resources/`:
  - `sample-rate-volume-defaults.md`
  - `prevalence-correction.md`

### Tier
- full (TPR/TNR needs human labels per PROJECT.md key decision "Tier-gate human-label dependencies").

### Claude's Discretion
- Which enhancements get standalone H2 sections vs inline bullets within existing sections.
- Exact decision-tree text (Claude authors from eval-science canon).
- Whether results-analyzer ⚠ marker is rendered as actual emoji `⚠️` or token `[WARN]`. Lean emoji — visible in terminal.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Tester/hardener/iterator/failure-diagnoser/results-analyzer all already post-Phase 34 SKST-conformant. Enhancements are additive.
- Phase 41 created prompt-optimization — iterator can cross-reference it.
- Phase 40 created memory-store-generator — pattern for new evaluator-validator.md subagent.

### Established Patterns
- Resources subdir per subagent with single-consumer docs.
- Binary Pass/Fail default (PROJECT.md Key Decision).
- AskUserQuestion for destructive actions (promotion gates).

### Integration Points
- `SKILL.md`: add evaluator-validator + 3 resources subdirs entry.
- `help.md`: no new user-facing command; iterator/hardener surfaces pick up via `/orq-agent:iterate` + `/orq-agent:harden`.

</code_context>

<specifics>
## Specific Ideas

### Sample-rate volume defaults
- <1K traces/day → 100%
- 1K–100K → 30%
- ≥100K → 10%

### Prevalence correction formula
`theta_hat = (p_observed + TNR − 1) / (TPR + TNR − 1)`

### 4-component judge template
```
<role>You are a grader for…</role>
<task>Score the following output against the criterion…</task>
<criterion>Pass if …; Fail if …</criterion>
<examples>Pass: … | Fail: …</examples>
<output>JSON: {"reasoning": "…", "verdict": "pass"|"fail"}</output>
```

### Train/dev/test split
- 10-20% train (few-shot examples)
- 40-45% dev (tuning)
- 40-45% test (TPR/TNR measurement)
- Disjoint; no dev/test leakage into few-shot

### Inter-annotator agreement threshold
- IAA < 85% flags the criterion for re-calibration before evaluator validation can proceed.

</specifics>

<deferred>
## Deferred Ideas

- Automatic re-calibration UI — platform feature; skill only flags.
- Multi-evaluator ensemble scoring — out of scope; one evaluator per failure mode.
- Guardrail cost projection — Phase 36 `/orq-agent:analytics` shows cost; hardener hints.

</deferred>
