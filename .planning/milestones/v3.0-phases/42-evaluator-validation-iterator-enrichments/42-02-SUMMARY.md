---
phase: 42-evaluator-validation-iterator-enrichments
plan: 02
subsystem: testing
tags: [failure-diagnoser, classification, evaluator, dataset-quality, outcome-based, esci]

requires:
  - phase: 38-failure-taxonomy
    provides: TFAIL-03 upstream-first classification baseline
provides:
  - 4-category failure classification (specification/generalization/dataset/evaluator)
  - Outcome-based grading rule with no path grading
  - iteration-proposals.json schema with separated dataset_quality_issues[] and evaluator_quality_issues[] arrays
  - classification field on per_agent[].changes[] entries
affects: [iterator, prompt-editor, dataset-generator, evaluator-validator]

tech-stack:
  added: []
  patterns:
    - "Failure-mode classification BEFORE prompt-section mapping"
    - "Outcome vs path grading discipline for evaluator design"
    - "Layered action-plan arrays: prompt changes vs dataset curation vs evaluator validation"

key-files:
  created: []
  modified:
    - orq-agent/agents/failure-diagnoser.md

key-decisions:
  - "Phase 2.0 Classify Failure Mode inserted BEFORE Phase 2 Diagnose so classification gates diagnosis — not bolt-on"
  - "Preserved changes[] array for backwards compat; added two new sibling arrays rather than restructuring"
  - "classification field on each change entry is mandatory; tiebreaker prefers specification over generalization and upstream-fix-first"

patterns-established:
  - "Layer separation: changes[] = prompt-editor, dataset_quality_issues[] = dataset-generator curation, evaluator_quality_issues[] = evaluator-validator"
  - "Classification-before-diagnosis: every failure labeled into one of 4 classes before section-level proposals"

requirements-completed: [ESCI-01, ESCI-02, ESCI-08]

duration: 2min
completed: 2026-04-21
---

# Phase 42 Plan 02: Failure-Diagnoser Classification Enrichments Summary

**failure-diagnoser now classifies every failure into specification/generalization/dataset/evaluator, enforces outcome-based grading with no path grading, and splits iteration-proposals.json into three layer-specific action arrays.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T05:55:09Z
- **Completed:** 2026-04-21T05:56:45Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Inserted new `## Phase 2.0: Classify Failure Mode (ESCI-01)` section with 4-row class table (specification / generalization / dataset / evaluator) and tiebreaker rules (upstream-fix-first; specification wins over generalization on ties)
- Added `### Outcome-Based Grading Rule (ESCI-02)` inside Phase 3 with the verbatim phrases `outcome-based` and `no path grading` plus a ❌/✅ anti-example table forbidding tool-call-sequence encoding in evaluator logic
- Upgraded Phase 5 iteration-proposals.json schema to three sibling arrays: existing `changes[]` (now carrying a mandatory `classification` field), new `dataset_quality_issues[]`, new `evaluator_quality_issues[]`
- Added Done When checklist items for ESCI-01, ESCI-02, ESCI-08
- Preserved all existing Constraints phrases byte-identical (both Phase 42 ESCI-01 and ESCI-08 anchor lines intact)

## Task Commits

1. **Task 1: Add 4-category classification phase + outcome-based grading + dataset/evaluator separation** — `c7758d0` (feat)

## Files Created/Modified

- `orq-agent/agents/failure-diagnoser.md` — Added Phase 2.0 classification, outcome-based grading subsection in Phase 3, expanded Phase 5 schema with two new arrays and classification field, appended Done When items (+75 lines, 0 removed)

## Decisions Made

- **Inserted Phase 2.0 as a separate H2 rather than subfolding into Phase 2** — classification is a gate, not a substep. Keeps diagnosis clean of class reasoning.
- **Kept `changes[]` instead of renaming** — backwards compatibility with prompt-editor consumers. Added classification inside each entry rather than restructuring.
- **Emoji table for outcome-vs-path anti-examples** — consistent with other subagent files that use ❌/✅ for directive guidance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/failure-diagnoser.md` → exit 0
- `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 SHA-256 match (orq-agent, prompt, architect)
- 8 grep anchors all FOUND: `specification`, `generalization`, `dataset`, `evaluator`, `outcome-based`, `no path grading`, `dataset-quality`, `evaluator-quality`
- Constraints lines preserved byte-identical (Phase 42 ESCI-01 and ESCI-08 anchor phrases intact)
- Schema now documents 3 arrays: `changes[]`, `dataset_quality_issues[]`, `evaluator_quality_issues[]`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for Plan 03 (next subagent enrichment in Phase 42)
- iteration-proposals.json schema change is additive; downstream iterator consumer in Plan 03 can begin reading new arrays without breaking existing changes[] readers
- evaluator-validator subagent (planned later in Phase 42) has a concrete schema to write TPR/TNR findings into via `evaluator_quality_issues[]`

## Self-Check: PASSED

- File exists: `orq-agent/agents/failure-diagnoser.md` — FOUND
- Commit exists: `c7758d0` — FOUND
- All 8 anchors grep-present
- lint exit 0, protected-pipelines exit 0

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
