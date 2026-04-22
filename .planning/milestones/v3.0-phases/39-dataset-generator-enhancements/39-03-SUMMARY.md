---
phase: 39-dataset-generator-enhancements
plan: 03
subsystem: skills
tags: [dataset-generator, adversarial, coverage, shapes, rag, multi-turn, resources-policy]

requires:
  - phase: 34-skill-structure-format-foundation
    provides: Resources Policy (single-consumer resources/ subdir auto-excluded from lint default glob)
  - phase: 39-dataset-generator-enhancements
    provides: dataset-generator.md body that will cite these resources (Plan 01/02)
provides:
  - 8-vector adversarial catalog (DSET-02) with 3+ concrete examples per vector
  - Coverage rule definitions + exact remediation phrase (DSET-03)
  - Dataset shape templates: single, multi-turn, rag (DSET-05/06/07)
affects: [39-dataset-generator-enhancements, 42-eval-science, results-analyzer]

tech-stack:
  added: []
  patterns:
    - "Per-skill resources/ subdir for single-consumer long-form content (Phase 34 Resources Policy; precedent: observability, trace-failure-analysis)"
    - "Grep-anchored resource files — vector slugs, remediation phrase, and shape JSON keys appear verbatim for lint/test discoverability"

key-files:
  created:
    - orq-agent/agents/dataset-generator/resources/adversarial-vectors.md
    - orq-agent/agents/dataset-generator/resources/coverage-rules.md
    - orq-agent/agents/dataset-generator/resources/shapes.md
  modified: []

key-decisions:
  - "8 adversarial vector slugs rendered as H2 headings verbatim so downstream lint/grep can anchor per-vector coverage"
  - "Remediation phrase 'Coverage check failed:' pinned verbatim in coverage-rules.md — the grep anchor the rest of the phase depends on"
  - "Shape JSON examples carry the literal keys expected_source_chunk_ids and perturbation_scenario so the dataset-generator.md body can cite them without re-inlining"

patterns-established:
  - "Single-consumer resources/ co-located under agents/<name>/resources/ follows Phase 34 Resources Policy (outside lint default glob)"
  - "Adversarial tagging contract: every datapoint in category=adversarial carries adversarial_vector: <slug> verbatim from the 8-slug list"

requirements-completed: [DSET-02, DSET-03, DSET-06, DSET-07]

duration: 2min
completed: 2026-04-21
---

# Phase 39 Plan 03: Dataset-Generator Resources Summary

**Single-consumer resources/ subdir for dataset-generator — 8-vector adversarial catalog, coverage rules with verbatim remediation phrase, and single/multi-turn/rag shape templates.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T04:44:41Z
- **Completed:** 2026-04-21T04:46:47Z
- **Tasks:** 1
- **Files modified:** 3 (all new)

## Accomplishments

- Created `orq-agent/agents/dataset-generator/resources/` with 3 lean markdown resources the dataset-generator.md body can cite by path without inlining long-form content.
- `adversarial-vectors.md` catalogs all 8 DSET-02 vectors (persona-breaking, instruction-override, language-switching, formality-mismatch, refusal, format-forcing, multi-turn-manipulation, contradiction) with definition + 3 concrete example inputs + expected behavior per vector.
- `coverage-rules.md` codifies Rule 1 (min count ≥2) and Rule 2 (max share 30%) and pins the exact remediation phrase `Coverage check failed:` that downstream lint and tooling anchors on.
- `shapes.md` provides concrete JSON examples for `single`, `multi-turn` (with `messages` + `perturbation_scenario`), and `rag` (with `expected_source_chunk_ids`) shapes plus a shape-selection heuristic.
- Resources subdir confirmed outside lint default glob per Phase 34 Resources Policy — full-suite lint still green, protected-pipeline 3/3 SHA-256 still matching.

## Task Commits

1. **Task 1: Create 3 resource files under dataset-generator/resources/** - `2e75277` (feat)

## Files Created/Modified

- `orq-agent/agents/dataset-generator/resources/adversarial-vectors.md` — 8 adversarial vectors × definition + 3 examples + expected behavior + generation guidance (15-20% coverage, ≥3 per vector).
- `orq-agent/agents/dataset-generator/resources/coverage-rules.md` — Rule 1 (min count), Rule 2 (max share), verbatim remediation messages with the `Coverage check failed:` prefix, worked example across 10→16 datapoints, skip-conditions for promote-trace / flat / curation modes.
- `orq-agent/agents/dataset-generator/resources/shapes.md` — JSON templates for `single` / `multi-turn` / `rag` plus perturbation scenario list (`topic-drift-then-return`, `contradictory-followup`, `partial-context-gap`, `rapid-topic-switch`) and shape-selection heuristic.

## Decisions Made

- **Vector slug rendering:** Each of the 8 vectors rendered as an H2 whose heading text is the exact slug (`## persona-breaking`, `## instruction-override`, …). Downstream tagging (`adversarial_vector: <slug>`) stays in sync with the catalog via grep, not via a separate mapping table.
- **Remediation phrase verbatim:** `Coverage check failed:` pinned with an inline note that it is a lint/grep anchor and MUST NOT be reworded. The two remediation strings in coverage-rules.md are byte-stable except for the substituted value name and percentage.
- **Multi-turn example depth:** `topic-drift-then-return` rendered as a full 4-message conversation (not a stub) so the dataset-generator.md body can reference a concrete example of the turn sequence without maintaining its own inline JSON.
- **RAGAS vocabulary named explicitly:** `faithfulness`, `context_precision`, `answer_relevancy` listed by name in shapes.md so the forward-link to Phase 42 eval-science is greppable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Resources are ready to be cited by path from `orq-agent/agents/dataset-generator.md` when the subagent body is extended for DSET-02/03/05/06/07 in the remaining Phase 39 plans.
- All grep anchors the plan specifies are in place: 8 vector slugs, `Coverage check failed:` phrase, `shape: multi-turn` / `shape: rag`, `expected_source_chunk_ids`, `perturbation_scenario`.
- Full-suite lint (`bash orq-agent/scripts/lint-skills.sh`) exits 0; protected pipelines check (`bash orq-agent/scripts/check-protected-pipelines.sh`) exits 0 with all 3 SHA-256 matches.

## Self-Check: PASSED

- `orq-agent/agents/dataset-generator/resources/adversarial-vectors.md` — FOUND
- `orq-agent/agents/dataset-generator/resources/coverage-rules.md` — FOUND
- `orq-agent/agents/dataset-generator/resources/shapes.md` — FOUND
- Commit `2e75277` — FOUND in `git log`
- Lint suite exit 0 — VERIFIED
- Protected pipelines 3/3 SHA-256 match — VERIFIED
- All 15 grep anchors (8 vectors + `Coverage check failed:` + `shape: multi-turn` + `shape: rag` + `expected_source_chunk_ids` + `perturbation_scenario`) — GREEN

---
*Phase: 39-dataset-generator-enhancements*
*Completed: 2026-04-21*
