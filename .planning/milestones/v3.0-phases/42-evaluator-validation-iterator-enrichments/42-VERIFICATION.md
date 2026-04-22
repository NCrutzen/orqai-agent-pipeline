---
phase: 42-evaluator-validation-iterator-enrichments
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 28/28 mechanical anchors verified; 4 behaviors require live/human verification
human_verification:
  - test: "Live TPR/TNR measurement on real human-labeled dataset"
    expected: "Evaluator achieves TPR ≥ 90% AND TNR ≥ 90% on held-out test split (40-45%) against human gold labels; prevalence correction applied to observed rate"
    why_human: "Requires human-labeled annotation campaign (100+ labels, IAA ≥ 85%). No programmatic way to manufacture real labels — this is the core eval-science gate (EVLD-06/08)."
  - test: "Annotation Queue / Human Review creation via live MCP round-trip"
    expected: "evaluator-validator subagent invocation creates a real Annotation Queue in the Orq.ai workspace via MCP; queue surface visible in UI; 100+ labels assignable; train/dev/test split enforced"
    why_human: "Needs live Orq.ai workspace + MCP server + human annotators. File-level anchors present but live behavior must be smoke-tested (EVLD-09)."
  - test: "Sample rate applied at live guardrail promotion"
    expected: "Hardener computes sample_rate from 7-day median volume (<1K → 100%, 1K–100K → 30%, ≥100K → 10%) and applies it to guardrail deployment config"
    why_human: "Requires live volume telemetry + guardrail promotion event. Volume defaults documented in hardener.md + resources/sample-rate-volume-defaults.md but runtime application needs live run (ITRX-08)."
  - test: "Regression ⚠️ flag on actual before/after experiment pair"
    expected: "results-analyzer emits ⚠️ marker when any metric drops between two real experiment runs (capability or regression suite)"
    why_human: "Needs live experiment pair with intentional regression to trigger drop-detection code path (ITRX-04)."
---

# Phase 42: Evaluator Validation & Iterator Enrichments — Verification Report

**Phase Goal:** Tester / failure-diagnoser / iterator / hardener / results-analyzer + new evaluator-validator enforce eval-science methodology (TPR/TNR, prevalence correction, P0/P1/P2, sample_rate, etc.)
**Verified:** 2026-04-20
**Status:** human_needed (mechanical pass — live TPR/TNR measurement requires human labels)
**Re-verification:** No — initial verification (phase-close VERIFICATION.md existed as plan-09 artifact, but no prior whole-phase verification report)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | All 6 target subagent files exist and carry eval-science anchors | ✓ VERIFIED | 6/6 files present at `orq-agent/agents/{tester,failure-diagnoser,iterator,hardener,results-analyzer,evaluator-validator}.md` |
| 2 | 28/28 requirement anchor phrases (EVLD-01..11, ESCI-01..08, ITRX-01..09) grep-match in the correct files per CONTEXT distribution | ✓ VERIFIED | Independent 28-anchor sweep executed by verifier: "Summary: 28 checked, 0 missing" |
| 3 | 7/7 resource files populated across 3 subdirs | ✓ VERIFIED | `evaluator-validator/resources/{tpr-tnr-methodology.md, annotation-queue-setup.md, 4-component-judge-template.md}` + `iterator/resources/{action-plan-template.md, decision-trees.md}` + `hardener/resources/{sample-rate-volume-defaults.md, prevalence-correction.md}` |
| 4 | SKST lint full suite exits 0 silent-on-success | ✓ VERIFIED | `bash orq-agent/scripts/lint-skills.sh` → exit 0, zero stdout |
| 5 | Protected pipelines 3/3 SHA-256 byte-identical (orq-agent / prompt / architect) | ✓ VERIFIED | `bash orq-agent/scripts/check-protected-pipelines.sh` → "OK: orq-agent.sha256 matches / OK: prompt.sha256 matches / OK: architect.sha256 matches", exit 0 |
| 6 | New `evaluator-validator` subagent wired into `orq-agent/SKILL.md` index | ✓ VERIFIED | `grep -q "evaluator-validator" orq-agent/SKILL.md` → match present |
| 7 | Live TPR/TNR measurement on real human labels meets ≥ 90% gate | ? UNCERTAIN | Requires human-labeled dataset + live annotation campaign — see `human_verification[0]` |
| 8 | Live Annotation Queue creation via MCP round-trip succeeds | ? UNCERTAIN | Requires live Orq.ai workspace — see `human_verification[1]` |
| 9 | Live sample_rate applied at guardrail promotion | ? UNCERTAIN | Requires live volume telemetry + promotion — see `human_verification[2]` |
| 10 | Live regression ⚠️ flag fires on actual metric drop | ? UNCERTAIN | Requires live experiment pair — see `human_verification[3]` |

**Score:** 6/6 mechanical truths verified; 4 live-behavior truths deferred to human verification.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/agents/tester.md` | Modified — run-comparison table, overfitting ≥98%/<100, capability vs regression suite, eval may be too easy, isolated grader | ✓ VERIFIED | 5 anchors present (ITRX-03, ESCI-07, ESCI-04, ESCI-05, ESCI-03) |
| `orq-agent/agents/failure-diagnoser.md` | Modified — 4-class (specification/generalization/dataset/evaluator), outcome-based, dataset-quality vs evaluator-quality | ✓ VERIFIED | 3 anchors present (ESCI-01, ESCI-02, ESCI-08) |
| `orq-agent/agents/iterator.md` | Modified — P0/P1/P2 Action Plans, evaluator-version A/B, annotation comment, no-repeat, prompt fix vs evaluator, Evidence | ✓ VERIFIED | 7 anchors present (ITRX-01, ITRX-02, EVLD-11, ITRX-09, ITRX-05, ESCI-06, ITRX-07) |
| `orq-agent/agents/hardener.md` | Modified — TPR ≥ 90%, sample_rate volume tiers, human-review-queue, prevalence correction | ✓ VERIFIED | 4 anchors present (EVLD-08, ITRX-08, ITRX-06, EVLD-07) |
| `orq-agent/agents/results-analyzer.md` | Modified — ⚠️ regression flag | ✓ VERIFIED | 1 anchor present (ITRX-04) |
| `orq-agent/agents/evaluator-validator.md` | NEW — binary Pass/Fail, 4-component template, 100+ labels, train/dev/test, TPR, Annotation Queue, inter-annotator agreement, one evaluator per failure mode | ✓ VERIFIED | 8 anchors present (EVLD-01, 02, 03, 04, 05, 06, 09, 10) |
| `orq-agent/agents/evaluator-validator/resources/tpr-tnr-methodology.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/evaluator-validator/resources/annotation-queue-setup.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/evaluator-validator/resources/4-component-judge-template.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/iterator/resources/action-plan-template.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/iterator/resources/decision-trees.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/hardener/resources/sample-rate-volume-defaults.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/agents/hardener/resources/prevalence-correction.md` | NEW | ✓ EXISTS | Present |
| `orq-agent/SKILL.md` | Modified — evaluator-validator + 3 resources dirs registered | ✓ VERIFIED | `grep "evaluator-validator"` match present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `orq-agent/SKILL.md` | `orq-agent/agents/evaluator-validator.md` | index entry | ✓ WIRED | SKILL.md references `evaluator-validator` |
| `orq-agent/agents/evaluator-validator.md` | `evaluator-validator/resources/*` | per-subagent resources subdir pattern | ✓ WIRED | Subdir + 3 files present alongside subagent (pattern established Phase 40) |
| `orq-agent/agents/iterator.md` | `iterator/resources/*` | per-subagent resources subdir pattern | ✓ WIRED | Subdir + 2 files present |
| `orq-agent/agents/hardener.md` | `hardener/resources/*` | per-subagent resources subdir pattern | ✓ WIRED | Subdir + 2 files present |
| Protected pipelines (`orq-agent.md`, `prompt.md`, `architect.md`) | SHA-256 sidecars | `check-protected-pipelines.sh` | ✓ WIRED | 3/3 match — Phase 42 edits touched zero protected files |

### Requirements Coverage

All 28 requirement IDs declared across plans 01-09 verified at file-level.

| Requirement | Source Plan | File | Anchor | Status |
|-------------|-------------|------|--------|--------|
| EVLD-01 | 42-06 | evaluator-validator.md | binary Pass/Fail | ✓ SATISFIED (file) |
| EVLD-02 | 42-06 | evaluator-validator.md | one evaluator per failure mode | ✓ SATISFIED |
| EVLD-03 | 42-06 | evaluator-validator.md | 4-component | ✓ SATISFIED |
| EVLD-04 | 42-06 | evaluator-validator.md | 100+ | ✓ SATISFIED |
| EVLD-05 | 42-06 | evaluator-validator.md | train/dev/test | ✓ SATISFIED |
| EVLD-06 | 42-06 | evaluator-validator.md | TPR | ✓ SATISFIED (file); ? NEEDS HUMAN (live measurement) |
| EVLD-07 | 42-04 | hardener.md | prevalence correction | ✓ SATISFIED |
| EVLD-08 | 42-04 | hardener.md | TPR ≥ 90% | ✓ SATISFIED (file); ? NEEDS HUMAN (live gate enforcement) |
| EVLD-09 | 42-06 | evaluator-validator.md | Annotation Queue | ✓ SATISFIED (file); ? NEEDS HUMAN (live MCP round-trip) |
| EVLD-10 | 42-06 | evaluator-validator.md | inter-annotator agreement | ✓ SATISFIED |
| EVLD-11 | 42-03 | iterator.md | evaluator-version A/B | ✓ SATISFIED |
| ESCI-01 | 42-02 | failure-diagnoser.md | specification | ✓ SATISFIED |
| ESCI-02 | 42-02 | failure-diagnoser.md | outcome-based | ✓ SATISFIED |
| ESCI-03 | 42-01 | tester.md | isolated grader | ✓ SATISFIED |
| ESCI-04 | 42-01 | tester.md | capability suite | ✓ SATISFIED |
| ESCI-05 | 42-01 | tester.md | eval may be too easy | ✓ SATISFIED |
| ESCI-06 | 42-03 | iterator.md | prompt fix vs evaluator | ✓ SATISFIED |
| ESCI-07 | 42-01 | tester.md | overfitting | ✓ SATISFIED |
| ESCI-08 | 42-02 | failure-diagnoser.md | dataset-quality | ✓ SATISFIED |
| ITRX-01 | 42-03 | iterator.md | P0 | ✓ SATISFIED |
| ITRX-02 | 42-03 | iterator.md | Action Plan | ✓ SATISFIED |
| ITRX-03 | 42-01 | tester.md | run-comparison table | ✓ SATISFIED |
| ITRX-04 | 42-05 | results-analyzer.md | ⚠️ | ✓ SATISFIED (file); ? NEEDS HUMAN (live drop detection) |
| ITRX-05 | 42-03 | iterator.md | no-repeat | ✓ SATISFIED |
| ITRX-06 | 42-04 | hardener.md | human-review-queue | ✓ SATISFIED |
| ITRX-07 | 42-03 | iterator.md | Evidence | ✓ SATISFIED |
| ITRX-08 | 42-04 | hardener.md | sample_rate | ✓ SATISFIED (file); ? NEEDS HUMAN (live promotion) |
| ITRX-09 | 42-03 | iterator.md | annotation comment | ✓ SATISFIED |

**Coverage:** 28/28 mechanical (file-level anchor match). 4 IDs (EVLD-06, EVLD-09, ITRX-04, ITRX-08) additionally flagged for live-behavior human verification per plan-09 deferred-smoke table. No orphaned requirements — every declared ID maps to a plan.

### Anti-Patterns Found

None detected. Mechanical sweep clean:
- Lint (SKST-01..10 + MSEL-02 + references-multi-consumer) exit 0 silent.
- Protected-pipeline SHA-256 unchanged — zero edits to `orq-agent.md` / `prompt.md` / `architect.md`.
- No TODO/FIXME/placeholder scan requested (phase is skill/subagent markdown, not source code); SKST lint already gates this class of defect on `.md` skill files.

### Human Verification Required

Mechanical file-level verification passes all 28 anchors. Live/behavioral verification of 4 items cannot be performed programmatically:

#### 1. Live TPR/TNR measurement (EVLD-06, EVLD-08)

**Test:** Run `evaluator-validator` subagent against a real human-labeled dataset (100+ labels, IAA ≥ 85%) with train/dev/test split (10-20% / 40-45% / 40-45%). Measure TPR and TNR on the test split. Apply prevalence correction `theta_hat = (p_observed + TNR − 1) / (TPR + TNR − 1)`.
**Expected:** Evaluator achieves TPR ≥ 90% AND TNR ≥ 90%; hardener refuses promotion if either falls below threshold.
**Why human:** Requires human annotation campaign — there is no way to synthesize real labels.

#### 2. Annotation Queue / Human Review live MCP round-trip (EVLD-09)

**Test:** Invoke evaluator-validator subagent in a live Orq.ai workspace via MCP. Confirm an Annotation Queue is created, surfaced in the UI, and that 100+ labels can be assigned.
**Expected:** Queue visible in workspace; labels assignable; train/dev/test split enforced on queue contents.
**Why human:** Needs live Orq.ai workspace + MCP server + human annotators.

#### 3. Sample rate applied at live guardrail promotion (ITRX-08)

**Test:** Promote a guardrail via hardener in a live workspace with known 7-day median traffic. Verify `sample_rate` in deployment config matches the volume tier (<1K → 100%, 1K–100K → 30%, ≥100K → 10%).
**Expected:** Deployment config carries the correct sample_rate; guardrail samples at that rate in live traffic.
**Why human:** Requires live volume telemetry + guardrail promotion event.

#### 4. Regression ⚠️ flag on actual experiment pair (ITRX-04)

**Test:** Run two experiments A → B where B intentionally regresses on a metric. Run `results-analyzer` on the pair.
**Expected:** results-analyzer emits ⚠️ marker adjacent to the regressed metric.
**Why human:** Requires live experiment pair; drop detection is runtime behavior.

### Gaps Summary

No blocking gaps. Mechanical verification is complete and green across all six gate dimensions:

1. All 6 target subagent files exist (5 enhanced + 1 new).
2. All 28 requirement anchors (EVLD-01..11, ESCI-01..08, ITRX-01..09) grep-match at expected file locations.
3. All 7 resource files present across 3 subdirs.
4. SKST lint full suite exits 0 silent-on-success.
5. Protected pipelines 3/3 SHA-256 byte-identical (orq-agent / prompt / architect unchanged).
6. SKILL.md wires new `evaluator-validator` subagent.

The only items not mechanically verifiable are live-behavior checks — these require human labels (TPR/TNR), live Orq.ai workspace (Annotation Queue MCP), live volume telemetry (sample_rate), and live experiment pairs (regression ⚠️). These are properly scoped to `/gsd:verify-work 42` manual-smoke batch, consistent with the tier=full / "TPR/TNR needs human labels" decision recorded in CONTEXT.md and the plan-09 deferred-smoke table.

Phase goal **achieved mechanically**. Pending human verification for 4 live-behavior items before full sign-off.

---

*Verified: 2026-04-20*
*Verifier: Claude (gsd-verifier)*
