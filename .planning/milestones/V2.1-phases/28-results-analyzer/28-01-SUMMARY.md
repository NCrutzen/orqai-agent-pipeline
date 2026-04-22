---
phase: 28-results-analyzer
plan: 01
subsystem: testing
tags: [results, statistics, median, student-t, confidence-interval, category-slicing, pass-fail, hardener-compat]

# Dependency graph
requires:
  - phase: experiment-runner
    provides: experiment-raw.json handoff contract with per-agent per-run per-evaluator raw scores
  - phase: dataset-preparer
    provides: dataset-prep.json with dataset IDs, split counts, swarm_name
provides:
  - results-analyzer.md subagent with 8 internal phases
  - test-results.json output schema compatible with hardener.md
  - test-results.md human-readable report
  - Terminal summary (compact and verbose modes)
affects: [hardener, failure-diagnoser, test-command]

# Tech tracking
tech-stack:
  added: []
  patterns: [Student's t CI for small samples, median as central tendency, role-based uniform thresholds, scale normalization for cross-evaluator ranking, disk-based JSON handoff contracts]

key-files:
  created: [orq-agent/agents/results-analyzer.md]
  modified: []

key-decisions:
  - "Student's t-distribution (t=4.303, df=2) for 95% CI instead of z-distribution (1.96) -- correct for small n=3 samples"
  - "Median as central tendency (not mean) -- robust to outliers with 3 data points"
  - "Role-based thresholds applied uniformly to all evaluators (structural=0.8, conversational=0.7, hybrid=0.75) -- no per-evaluator exceptions"
  - "Category breakdown in test-results.md only, never in terminal output (LOCKED)"
  - "Scale normalization (1-5 -> 0-1 via (score-1)/4) for worst-case bottleneck ranking only -- reported scores stay in original scale"
  - "Field mapping: experiment-raw.json 'output' -> test-results.json 'actual_output' in worst_cases"

patterns-established:
  - "Pure computation subagent: no API calls, all inputs from disk, all outputs to disk + terminal"
  - "Graceful degradation: handles n=1 and n=2 runs, missing categories, missing expected_output"
  - "JSON handoff chain completion: dataset-prep.json -> experiment-raw.json -> test-results.json"

requirements-completed: [ANLZ-01, ANLZ-02, ANLZ-03, ANLZ-04, ANLZ-05]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 28 Plan 01: Results Analyzer Summary

**587-line results-analyzer.md subagent with 8 phases: read inputs, compute Student's t aggregation (median, sample variance, 95% CI), determine role-based pass/fail, category-slice scoring, identify worst cases, write hardener-compatible test-results.json, write test-results.md report, and print compact/verbose terminal summary**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T14:10:47Z
- **Completed:** 2026-03-12T14:13:55Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created results-analyzer.md (587 lines) as a pure computation subagent replacing tester.md Phase 8
- All 8 internal phases documented with clear instructions covering the full analysis pipeline
- Student's t CI with correct t-critical (4.303 for df=2) replaces tester.md's z-distribution (1.96)
- Hardener.md field compatibility verified -- all required fields present in test-results.json output spec
- Graceful handling of edge cases: n<3 runs, missing categories, missing expected_output, partial agent completions
- 9 anti-patterns documented to prevent all known pitfalls

## Task Commits

Each task was committed atomically:

1. **Task 1: Create results-analyzer.md subagent with phased execution** - `cc53804` (feat)
2. **Task 2: Validate against requirements and hardener.md compatibility** - No changes needed (validation-only task, all 5 ANLZ-* requirements verified as covered)

## Files Created/Modified
- `orq-agent/agents/results-analyzer.md` - Complete Claude Code subagent prompt for statistical aggregation and results analysis pipeline

## Decisions Made
- Student's t-distribution (t=4.303, df=2) for 95% CI -- correct for small n=3 samples (replaces tester.md's z=1.96)
- Role-based thresholds applied uniformly (no per-evaluator exceptions) per CONTEXT.md locked decision
- Category breakdown restricted to test-results.md only (never terminal) per CONTEXT.md locked decision
- Scale normalization ((score-1)/4 for 1-5 scale) used only for ranking, not for reported scores
- Graceful degradation for n<3 runs with adjusted df and t-critical values

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- results-analyzer.md ready for use by the rewritten test command (Phase 29)
- test-results.json output schema compatible with hardener.md (Phase 32) -- all fields verified
- Completes the dataset-prep.json -> experiment-raw.json -> test-results.json handoff chain
- failure-diagnoser (Phase 30) can read worst_cases from test-results.json

## Self-Check: PASSED

- FOUND: orq-agent/agents/results-analyzer.md
- FOUND: commit cc53804

---
*Phase: 28-results-analyzer*
*Completed: 2026-03-12*
