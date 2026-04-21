---
phase: 39-dataset-generator-enhancements
plan: 01
subsystem: dataset-generation
tags: [dataset-generator, adversarial, coverage, curation, multi-turn, rag, promote-trace, skst]

requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST 9-section structure in dataset-generator.md
provides:
  - Two-Step Generation Mode documented in dataset-generator subagent (DSET-01)
  - 8-vector adversarial catalog with verbatim names (DSET-02)
  - Coverage Rules with 'Coverage check failed:' remediation phrase (DSET-03)
  - Curation Mode 4 with AskUserQuestion confirm-before-delete (DSET-04)
  - Dataset shapes single/multi-turn/rag with category + dimension_values (DSET-05/06/07)
  - Promote-From-Trace shape preserving input/output/intermediate_steps/metadata (DSET-08)
  - 2 new Constraints lines citing Phase 39 DSET-01 and DSET-08
affects: [39-dataset-generator-enhancements Plans 02/03, 42-results-analyzer (slice by dimension_values), 40-curation consumers]

tech-stack:
  added: []
  patterns:
    - "Subagent body extension: new content subsections inserted between Self-Validation Checklist and Few-Shot Example <examples> block to keep checklist adjacent to generation body"
    - "Grep-anchor discipline: exact 8-vector names + 'Coverage check failed:' remediation phrase are verbatim lint anchors"
    - "Constraints block append-only: new Phase 39 constraints citing DSET requirement IDs added without replacing existing V2.0 constraint lines"

key-files:
  created: []
  modified:
    - orq-agent/agents/dataset-generator.md

key-decisions:
  - "Insert DSET-01..08 sections AFTER Self-Validation Checklist and BEFORE <examples> block — keeps checklist adjacent to the generation body the LLM will read"
  - "Constraints block append-only (no replacement of existing V2.0 lines) — DSET-03/04/05/02 already present from Phase 34; only DSET-01 (dimensions/tuples artifacts) and DSET-08 (trace-preservation) added this plan"
  - "Resources not created this plan — resources/*.md (adversarial-vectors.md, coverage-rules.md, shapes.md) referenced by path; creation lives in downstream plan per Phase 39 parallel_safety"

patterns-established:
  - "Verbatim grep anchors are the mechanical lint-surface: exact vector names + 'Coverage check failed:' phrase + shape: multi-turn / shape: rag — DO NOT paraphrase"
  - "Two-Step Mode is inspection-first: dimensions.md and tuples.md MUST exist before NL generation runs"

requirements-completed: [DSET-01, DSET-02, DSET-03, DSET-04, DSET-05, DSET-06, DSET-07, DSET-08]

duration: 1 min
completed: 2026-04-21
---

# Phase 39 Plan 01: Extend dataset-generator with DSET-01..08 sections Summary

**7 new content subsections (Two-Step Mode, 8-vector adversarial catalog, Coverage Rules, Curation Mode 4, Dataset Shapes, Promote-From-Trace) plus 2 appended Constraints lines landed in dataset-generator.md with all 9 SKST sections preserved and 16/16 grep anchors green.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-21T04:44:31Z
- **Completed:** 2026-04-21T04:45:37Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- dataset-generator.md grew from 460 to 533 lines (+73 insertions) without touching any existing V2.0 content
- All 16 grep anchors return exit 0: 8 vector names (persona-breaking, instruction-override, language-switching, formality-mismatch, refusal, format-forcing, multi-turn-manipulation, contradiction), "Coverage check failed:", Two-Step Generation Mode, Curation Mode 4, Promote-From-Trace, shape: multi-turn, shape: rag, expected_source_chunk_ids, intermediate_steps
- `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/dataset-generator.md` exits 0 (SKST-01..10 + MSEL-02 + snapshot-pinned-models all pass)
- `bash orq-agent/scripts/check-protected-pipelines.sh` exits 0 (orq-agent/prompt/architect SHA-256 3/3 match)
- All 9 SKST headings present (When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution, Constraints)

## Task Commits

1. **Task 1: Extend dataset-generator subagent with DSET-01..08 sections** — `e9bfcef` (feat)

## Files Created/Modified

- `orq-agent/agents/dataset-generator.md` — Added 7 new content subsections between Self-Validation Checklist and <examples> block + 2 Constraints lines appended (Phase 39 DSET-01 + DSET-08). +73 lines, 0 deletions.

## Decisions Made

- **Insertion point:** sections placed AFTER Self-Validation Checklist and BEFORE `<examples>` — keeps the generation body adjacent to the checklist the LLM reads immediately before emitting output
- **Constraints append-only:** kept the 4 existing V2.0 constraint lines (DSET-03/04/05/02 citations already present from Phase 34) and appended only the two new ones (DSET-01 dimensions/tuples artifacts; DSET-08 trace preservation) so no grep anchor upstream breaks
- **Resources deferred:** adversarial-vectors.md / coverage-rules.md / shapes.md are referenced by path but not created here — creation belongs to a downstream plan per phase parallel_safety (disjoint file sets)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can proceed (datasets.md command extension with --mode/--shape/--trace-id flags) — subagent body now documents the sections the command will flag-expose
- Plan 03 can proceed (resources/ subdir creation: adversarial-vectors.md, coverage-rules.md, shapes.md) — paths already referenced by the subagent
- Phase 42 results-analyzer gains dimension_values slice surface for downstream wiring

---
*Phase: 39-dataset-generator-enhancements*
*Completed: 2026-04-21*

## Self-Check: PASSED

- FOUND: orq-agent/agents/dataset-generator.md (modified, 533 lines)
- FOUND: commit e9bfcef (feat(39-01): add DSET-01..08 sections to dataset-generator subagent)
- FOUND: all 16 grep anchors
- FOUND: all 9 SKST section headings
- FOUND: lint-skills.sh --file exit 0
- FOUND: check-protected-pipelines.sh exit 0
