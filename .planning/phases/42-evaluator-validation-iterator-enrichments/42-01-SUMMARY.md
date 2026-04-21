---
phase: 42-evaluator-validation-iterator-enrichments
plan: 01
subsystem: testing
tags: [orq-agent, tester, eval-science, overfitting, capability-suite, regression-suite, isolated-grader, run-comparison]

requires:
  - phase: 34-skst-conformance
    provides: Post-SKST tester.md baseline structure
  - phase: 41-prompt-optimization-cross-framework-comparison
    provides: Prior prompt-optimization iteration-loop reference
provides:
  - Run-comparison table emitted per iteration cycle (ITRX-03 anchor)
  - Overfitting warning rule (≥98% on <100 datapoints) (ESCI-07 anchor)
  - Capability vs regression suite split with graduation rule (ESCI-04 anchor)
  - Isolated graders per quality dimension (ESCI-03 anchor)
  - ≥95% warn anchor preserved byte-identical (ESCI-05)
affects: [42-02-failure-diagnoser, 42-03-iterator, 42-04-hardener, 42-05-results-analyzer, 42-06-evaluator-validator]

tech-stack:
  added: []
  patterns:
    - "Isolated grader per quality dimension (tool selection / argument quality / output interpretation)"
    - "Capability-to-regression graduation after 2 consecutive green runs"
    - "Overfitting guard on evaluator promotion (≥98% median on <100 datapoints)"
    - "Run-comparison H2 table appended to test-results.md per iteration"

key-files:
  created: []
  modified:
    - orq-agent/agents/tester.md

key-decisions:
  - "Graduation rule: 2 consecutive green runs moves capability item to regression suite"
  - "Overfitting guard flags run with overfitting_warning: true in test-results.json (does not auto-fail)"
  - "Run-comparison table lives under ## Run-Comparison Trend H2 at bottom of test-results.md"
  - "Isolated graders replace omnibus grader to localise defect class (tool vs argument vs interpretation)"

patterns-established:
  - "Additive enrichment of SKST-conformant agent files — zero deletions, insertions keyed to existing step boundaries"
  - "Lint-anchor discipline — phrases chosen to be grep-stable across refactors"

requirements-completed: [ITRX-03, ESCI-03, ESCI-04, ESCI-05, ESCI-07]

duration: 2 min
completed: 2026-04-21
---

# Phase 42 Plan 01: Tester.md Eval-Science Enrichments Summary

**Tester.md gains run-comparison trend table, overfitting guard on small datasets, capability/regression suite split with 2-green-run graduation, and isolated per-dimension graders — 8 lint anchors present verbatim.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T05:55:02Z
- **Completed:** 2026-04-21T05:56:27Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Inserted 4 new anchor-bearing H3 sections into tester.md without disturbing existing phase/step numbering
- Appended 4 Done When checkboxes referencing Phase 42 requirement IDs
- Preserved byte-identical ESCI-05 Constraints line ("eval may be too easy")
- Protected pipeline SHA-256 (orq-agent.md / prompt.md / architect.md) — 3/3 intact
- Lint-skills across all 5 SKST rules — clean

## Task Commits

1. **Task 1: add eval-science anchors to tester.md** — `e6718da` (feat)

## Files Created/Modified

- `orq-agent/agents/tester.md` — +51 lines: 4 new H3 sections + 4 Done When rows

## Lint Anchors (8/8 verbatim)

| Anchor | Count | Section |
|---|---|---|
| `run-comparison table` | 2 | Run-Comparison Table (ITRX-03) |
| `isolated grader` | 4 | Isolated Graders per Quality Dimension (ESCI-03) |
| `capability suite` | 3 | Capability Suites vs Regression Suites (ESCI-04) |
| `regression suite` | 3 | Capability Suites vs Regression Suites (ESCI-04) |
| `overfitting` | 3 | Overfitting Warning for Small Datasets (ESCI-07) |
| `≥98%` | 3 | Overfitting Warning (ESCI-07) |
| `<100` | 3 | Overfitting Warning (ESCI-07) |
| `eval may be too easy` | 1 | Constraints (ESCI-05, preserved) |

## Decisions Made

- **Graduation rule 2 consecutive green runs** — mirrors canonical eval-science practice for promoting items out of active probing. Tighter threshold would over-demote; looser lets flaky items hide in the regression suite.
- **Overfitting flag is non-fatal** — emits `overfitting_warning: true` but does not auto-fail the run; downstream iterator/evaluator-validator gates promotion. Keeps tester reporting layer thin.
- **Run-Comparison H2 at bottom of test-results.md** — append-only, preserves prior run history without diffing top-of-file report.
- **Three isolated graders (not two, not four)** — tool selection, argument quality, output interpretation matches the three failure-localisation axes that failure-diagnoser already consumes (Phase 42 ESCI-01 four-class split aligns with these via the "generalization/specification/dataset/evaluator" downstream mapping).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Ready for `42-02-PLAN.md` (failure-diagnoser enrichments: 4-category classification, outcome-based grading, dataset-quality vs evaluator-quality separation)
- tester.md now provides the run-comparison + overfitting + suite-split + isolated-grader hooks that failure-diagnoser and iterator will cross-reference
- No blockers

## Self-Check: PASSED

- `orq-agent/agents/tester.md` modified and committed as `e6718da` (verified via `git log --oneline | grep e6718da`)
- 8/8 grep anchors present verbatim (verified)
- `lint-skills.sh --file orq-agent/agents/tester.md` exit 0 (verified)
- `check-protected-pipelines.sh` 3/3 SHA-256 match (verified)

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
