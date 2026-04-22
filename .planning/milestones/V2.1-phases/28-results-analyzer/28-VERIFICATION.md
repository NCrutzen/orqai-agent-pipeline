---
phase: 28-results-analyzer
verified: 2026-03-12T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
---

# Phase 28: Results Analyzer Verification Report

**Phase Goal:** Users get clear, actionable test results with statistical rigor and backward-compatible output that hardener.md continues to consume without changes
**Verified:** 2026-03-12
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Results-analyzer computes median, sample variance, and Student's t 95% CI (t=4.303, df=2) for each evaluator per agent across 3 runs | VERIFIED | Phase 2 has explicit `T_CRIT=4.303`, sort+median (`SORTED[1]`), variance with `/2` (n-1 denominator), and CI centered on median |
| 2 | Results-analyzer determines pass/fail per evaluator per agent using role-based thresholds (structural=0.8, conversational=0.7, hybrid=0.75) with overall_pass = ALL pass | VERIFIED | Phase 3 Step 3.1 has locked threshold table, Step 3.3 `agent_pass = ALL evaluators pass`, Step 3.4 `overall_pass = ALL agents pass` |
| 3 | Results-analyzer produces category-sliced scoring when inputs.category metadata is present, omits category_scores when absent | VERIFIED | Phase 4 Steps 4.1–4.4: detects `inputs.category` presence, sets `category_scores: {}` when absent, builds per-category median + count + pass when present |
| 4 | Results-analyzer writes test-results.json that hardener.md can parse without modification (per_agent[].scores, .role, .evaluators_used, .category_scores, .worst_cases, .total_failure_count, overall_pass, top-level evaluators[]) | VERIFIED | Phase 6 Step 6.4 explicitly lists all hardener.md-critical fields and cross-references `orq-agent/templates/test-results.json`; hardener.md confirmed to read all same fields at lines 90–97 and 285 |
| 5 | Results-analyzer writes test-results.md with per-agent evaluator scores, category breakdown, worst cases, and next-step guidance | VERIFIED | Phase 7 Steps 7.1–7.5 define header, evaluator score table, conditional category breakdown table, worst cases section, and summary with actionable next steps |
| 6 | Results-analyzer prints compact terminal summary (agent_key \| role \| bottleneck_score \| PASS/FAIL) with verbose mode adding per-evaluator medians | VERIFIED | Phase 8 Steps 8.1–8.2 define compact and verbose table formats; category breakdown explicitly locked out of terminal (`LOCKED` comment at line 573) |

**Score:** 6/6 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `orq-agent/agents/results-analyzer.md` | Complete Claude Code subagent prompt for results analysis pipeline, min 250 lines | VERIFIED | File exists, 587 lines, valid YAML frontmatter (name, description, tools, model), `files_to_read` block present, 8 `## Phase` sections confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `orq-agent/agents/results-analyzer.md` | `experiment-raw.json` (disk) | Reads per-agent per-run per-evaluator scores with per_example data | WIRED | Pattern `experiment-raw.json` found; Phase 1 Step 1.1 reads it; holdout variant `experiment-raw-holdout.json` also wired |
| `orq-agent/agents/results-analyzer.md` | `dataset-prep.json` (disk) | Reads dataset metadata for test-results.json dataset section | WIRED | Pattern `dataset-prep.json` found; Phase 1 Step 1.2 reads it; graceful fallback for missing file documented |
| `orq-agent/agents/results-analyzer.md` | `orq-agent/templates/test-results.json` | Output schema reference — hardener.md parses this exact structure | WIRED | Template listed in `files_to_read` block; Phase 6 instructs "MUST match template exactly"; all template fields (`test_run_id`, `swarm_name`, `tested_at`, `dataset`, `evaluators`, `results.overall_pass`, `results.per_agent`, `summary`) present in Phase 6 JSON structure |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| ANLZ-01 | 28-01-PLAN.md | Results-analyzer computes triple-run aggregation (median, variance, 95% CI) | SATISFIED | Phase 2 covers all three statistics with correct formulas: median=sorted[1], sample variance /2, Student's t CI with t=4.303 |
| ANLZ-02 | 28-01-PLAN.md | Results-analyzer determines pass/fail per evaluator per agent against thresholds | SATISFIED | Phase 3 covers locked role-based thresholds, per-evaluator pass, per-agent pass, overall_pass, total_failure_count |
| ANLZ-03 | 28-01-PLAN.md | Results-analyzer produces category-sliced scoring from inputs.category metadata | SATISFIED | Phase 4 handles all three cases: category present (per-cat median+count+pass), absent (empty {}), partial (coverage note) |
| ANLZ-04 | 28-01-PLAN.md | Results-analyzer writes test-results.json preserving schema compatibility with hardener.md | SATISFIED | Phase 6 explicitly cross-references template and lists all fields hardener.md reads; field mapping output->actual_output documented |
| ANLZ-05 | 28-01-PLAN.md | Results-analyzer produces test-results.md and terminal summary table | SATISFIED | Phase 7 (test-results.md full report) and Phase 8 (terminal summary with compact+verbose modes) both fully specified |

No orphaned requirements. All 5 ANLZ-* IDs are mapped to Phase 28 in REQUIREMENTS.md traceability table and all are covered.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | — |

No TODO, FIXME, placeholder, stub, or empty implementation markers found. No Orq.ai API calls present (pure computation confirmed at line 27 and in Anti-Patterns section).

---

### Human Verification Required

#### 1. Statistical formula correctness under execution

**Test:** Provide a known experiment-raw.json with 3 runs (e.g., scores [0.8, 0.9, 1.0]) and verify the subagent computes median=0.9, mean=0.9, variance=0.01, stddev=0.1, margin=4.303*(0.1/sqrt(3))=0.2485, CI=[0.6515, 1.0] (clamped to [0.6515, 1.0])
**Expected:** Computed values match the formula exactly
**Why human:** The formulas are correctly specified in the prompt, but only a live execution of the subagent against a real input can verify the bash arithmetic produces numerically correct output

#### 2. Hardener.md end-to-end pipeline

**Test:** Run the full pipeline: experiment-runner -> results-analyzer -> hardener on a real swarm, confirm hardener reads test-results.json without errors or missing-field warnings
**Expected:** Hardener proceeds through its phases without schema-related failures
**Why human:** Backward compatibility is confirmed by field-matching analysis, but only live execution proves no implicit field shape assumptions were broken

---

### Gaps Summary

No gaps. All 6 observable truths are verified by codebase evidence. The sole deliverable (`orq-agent/agents/results-analyzer.md`) exists at 587 lines (more than double the 250-line minimum), contains all 8 required phases, correctly specifies all statistical methods, correctly specifies all hardener.md-required output fields, and has clean wiring to both input files and the output schema template. Commit cc53804 is confirmed present in git history.

---

_Verified: 2026-03-12_
_Verifier: Claude (gsd-verifier)_
