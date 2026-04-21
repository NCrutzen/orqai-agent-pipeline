---
phase: 42-evaluator-validation-iterator-enrichments
plan: 05
subsystem: testing
tags: [results-analyzer, regression-detection, iterator, evaluator, itrx-04]

requires:
  - phase: 34-skst-conformance
    provides: post-SKST conformant results-analyzer.md baseline
provides:
  - regression detection phase 2.5 in results-analyzer.md
  - regressions[] top-level array in test-results.json schema
  - warning marker rendering in test-results.md Delta column and terminal Status column
affects: [iterator, hardener, tester]

tech-stack:
  added: []
  patterns:
    - "Additive schema evolution: new top-level regressions[] array leaves all pre-existing test-results.json keys byte-identical so hardener parser continues to work"
    - "Per-evaluator delta comparison grounded in previous_run_id + previous_median (no ungrounded regression claims)"

key-files:
  created: []
  modified:
    - orq-agent/agents/results-analyzer.md

key-decisions:
  - "previous_test_results_path is optional; when null, regression detection is skipped and regressions[] emits as []"
  - "Delta threshold is 0 (ANY drop flags a regression) per ITRX-04 constraint anchor; no tolerance band"
  - "Warning marker prefixes Status column regardless of pass/fail so a passing-but-regressed agent is still flagged"
  - "Phase 8.2 Verbose Mode left untouched (plan only scoped 8.1); regression surfacing in compact mode is sufficient"

patterns-established:
  - "Regression rendering: warning marker in Delta column of test-results.md plus Status column of terminal compact summary"
  - "Grounding rule: never emit a regressions[] entry without both previous_median and previous_run_id"

requirements-completed: [ITRX-04]

duration: 2 min
completed: 2026-04-21
---

# Phase 42 Plan 05: Results-Analyzer Regression Flag Summary

**results-analyzer.md gains a Phase 2.5 regression detection step comparing current medians against a previous test-results.json, emitting a new top-level `regressions[]` array and rendering a literal ⚠️ marker in the test-results.md Δ column, the Regressions Detected H3, and the terminal compact Status column on any score drop (ITRX-04).**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T05:55:21Z
- **Completed:** 2026-04-21T05:57:29Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `previous_test_results_path` parameter row to the Parameters table
- Inserted new `## Phase 2.5: Detect Regressions Against Previous Run (ITRX-04)` between existing Phase 2 (Triple-Run Aggregation) and Phase 3 (Determine Pass/Fail) with 4 steps: Load Previous Run, Compute Deltas Per Evaluator, Handle New/Missing Evaluators, Grounding Requirement
- Extended Phase 6 test-results.json skeleton with `regressions: []` top-level key (alongside existing `results` and `summary`, no existing keys renamed)
- Added Step 6.4b documenting regressions[] population rules
- Added `Δ vs Prev` column to Phase 7.2 Evaluator Scores table with ⚠️ prefix rule for regressed evaluators and em-dash for no-previous-run case
- Added conditional `### ⚠️ Regressions Detected` H3 block above Phase 7.5 Summary when regressions[] is non-empty
- Added ⚠️ Status-column prefix rule to Phase 8.1 Compact Mode for any regressed agent
- Extended Done When checklist with 2 ITRX-04 items

## Task Commits

1. **Task 1: Add regression detection phase + ⚠️ rendering** - `ca0bcfc` (feat)

## Files Created/Modified
- `orq-agent/agents/results-analyzer.md` - Added Phase 2.5 regression detection, regressions[] schema, Δ column + H3 + Status-prefix rendering rules, extended Done When checklist

## Decisions Made
- **Delta threshold = 0:** Any negative delta is a regression. No tolerance band, matching the existing Constraints anchor `ALWAYS flag regressions with ⚠️ markers (Phase 42 ITRX-04)` which says "any drop."
- **Optional parameter:** `previous_test_results_path` defaults to null so results-analyzer remains backwards-compatible; when null, regressions[] emits empty.
- **Additive schema:** Added `regressions[]` top-level alongside existing `results` and `summary`; did not modify any hardener-parsed field.
- **Warning marker independent of pass/fail:** A passing agent that regressed still shows ⚠️ in its Status column so iterator/hardener can detect drift even when thresholds are still met.
- **Scope discipline on Phase 8.2:** Plan scoped marker addition to Phase 8.1 Compact Mode only. Phase 8.2 Verbose Mode left untouched.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial Edit of the Phase 2.5 insertion accidentally duplicated the `## Phase 3: Determine Pass/Fail` heading block immediately after the insertion. Fixed with a follow-up Edit before committing; verified via grep that Phase 3 heading appears exactly once. No downstream impact.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- results-analyzer.md is lint-clean and protected-pipeline SHA-256 3/3 intact (pipeline SHAs cover orq-agent, prompt, architect — results-analyzer is outside the protected set, so edits are expected).
- Iterator and hardener consumers can now rely on `regressions[]` being present (possibly empty) in test-results.json. Phase 42-04 (iterator enrichment) and Phase 42-03 (hardener enrichment) can integrate regression-aware logic.
- Remaining phase plans: 42-06, 42-07, 42-08, 42-09.

## Self-Check: PASSED

- orq-agent/agents/results-analyzer.md: FOUND (modified)
- Commit ca0bcfc: FOUND in `git log --oneline`
- Lint exit 0: VERIFIED
- Protected pipelines 3/3 match: VERIFIED
- Grep anchors ⚠️/regression/previous run: VERIFIED (9/22/11 occurrences)
- Constraint anchor "ALWAYS flag regressions with ⚠️ markers (Phase 42 ITRX-04)": BYTE-IDENTICAL

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
