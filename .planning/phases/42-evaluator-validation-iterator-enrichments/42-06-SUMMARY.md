---
phase: 42-evaluator-validation-iterator-enrichments
plan: 06
subsystem: evaluator-science
tags: [evaluator-validator, tpr, tnr, annotation-queue, inter-annotator-agreement, llm-as-judge, binary-pass-fail, 4-component-template, skst]

requires:
  - phase: 40-kb-memory-lifecycle
    provides: memory-store-generator SKST pattern reused for new subagent
  - phase: 34-skill-structure
    provides: 9-section SKST format + lint-skills.sh enforcement
provides:
  - new evaluator-validator subagent encoding the TPR/TNR validation pipeline
  - canonical evaluator-validations/{name}.json artifact schema
  - binary Pass/Fail default for new LLM-as-judge evaluators
  - 4-component judge template (role, task, criterion, examples, CoT-before-answer JSON)
  - train/dev/test disjoint partition with few-shot isolation rule
  - inter-annotator-agreement computation with 85% re-calibration flag
  - one-evaluator-per-failure-mode auto-split rule
affects: [hardener-04, iterator, failure-diagnoser, results-analyzer, /orq-agent:iterate]

tech-stack:
  added: []
  patterns:
    - "evaluator-validations JSON contract between validator and hardener Phase 2.0 gate"
    - "MCP-first / REST-fallback for annotation-queues-create + annotations-list"
    - "disjoint train/dev/test split with fixed seed for reproducibility"
    - "CoT-before-answer JSON output for LLM-judges"

key-files:
  created:
    - orq-agent/agents/evaluator-validator.md
  modified: []

key-decisions:
  - "Binary Pass/Fail is the default for new LLM-as-judge evaluators; continuous scales require explicit justification persisted as scale_justification"
  - "One evaluator per failure mode — bundled criteria (AND-joined) are auto-split in Phase 1 with caller confirmation"
  - "Few-shot examples come from the train split only; dev/test labels are OFF-LIMITS — disjoint-split contract enforces held-out measurement validity"
  - "Test split requires ≥30 Pass AND ≥30 Fail; smaller test sets produce TPR/TNR confidence intervals too wide for the hardener's 0.90 promotion gate"
  - "Subagent records measured TPR/TNR; does NOT enforce 0.90 floor itself — that is the hardener Phase 2.0 gate's job. Validator sets validated=true only if TPR ≥ 0.90 AND TNR ≥ 0.90 AND IAA ≥ 0.85 (when applicable)"
  - "Inter-annotator agreement < 85% flags criterion for re-calibration; measuring TPR/TNR against unreliable labels is garbage-in-garbage-out"

patterns-established:
  - "evaluator-validations/{name}.json is the contract between evaluator-validator and hardener — without it, promotion gate has nothing to enforce"
  - "Resources subdir referenced by files_to_read: tpr-tnr-methodology.md, annotation-queue-setup.md, 4-component-judge-template.md (Plan 07 creates them)"

requirements-completed: [EVLD-01, EVLD-02, EVLD-03, EVLD-04, EVLD-05, EVLD-06, EVLD-09, EVLD-10]

duration: 9 min
completed: 2026-04-20
---

# Phase 42 Plan 06: Evaluator-Validator Subagent Summary

**New `orq-evaluator-validator` subagent encoding the full TPR/TNR validation pipeline — Annotation Queue creation, 100+ balanced label collection, disjoint train/dev/test split, binary-first 4-component judge template, TPR/TNR measurement on ≥30/≥30 held-out test, inter-annotator agreement with 85% re-calibration flag, and emission of `evaluator-validations/{name}.json` consumed by the hardener Phase 2.0 promotion gate.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-20T05:55:24Z
- **Completed:** 2026-04-20T06:04:00Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- Authored `orq-agent/agents/evaluator-validator.md` (495 lines) with full 9 SKST sections and 7-phase execution flow.
- Encoded the binary-Pass/Fail default (EVLD-01), one-evaluator-per-failure-mode auto-split (EVLD-02), 4-component judge template with CoT-before-answer JSON (EVLD-03), 100+ balanced label guidance (EVLD-04), disjoint train/dev/test partition with few-shot isolation (EVLD-05), TPR/TNR measurement on ≥30/≥30 held-out test (EVLD-06), Annotation Queue creation via MCP/REST (EVLD-09), and inter-annotator agreement with 85% flag (EVLD-10).
- Defined the canonical `evaluator-validations/{name}.json` schema consumed by the hardener Phase 2.0 TPR/TNR ≥ 0.90 gate.
- Verified all 9 grep anchors present verbatim: `binary Pass/Fail`, `4-component`, `train/dev/test`, `TPR`, `TNR`, `inter-annotator agreement`, `85%`, `Annotation Queue`, `one evaluator per failure mode`.
- Confirmed `lint-skills.sh --file` exit 0 and `check-protected-pipelines.sh` 3/3 SHA-256 intact.

## Task Commits

1. **Task 1: Author new evaluator-validator.md subagent with 9 SKST sections + 7 phases** — `43ce896` (feat)

## Files Created/Modified

- `orq-agent/agents/evaluator-validator.md` — new subagent: 9 SKST sections (Constraints, When to use, When NOT to use, Companion Skills, Done When, Destructive Actions, Anti-Patterns, Open in orq.ai, Documentation & Resolution) + 7 phases (Intake + split, Judge Prompt Generation, Create Annotation Queue, Guide Label Collection, Split Labels, Measure TPR/TNR, Compute IAA + Emit JSON). Also includes a Decision Framework and Output Format blocks.

## Decisions Made

- **Binary default is hard, continuous requires explicit justification.** The constraint is framed as NEVER rather than SHOULD so new LLM-judges are born binary — matches the project-wide Key Decision and keeps the validation pipeline falsifiable.
- **Validator records, hardener enforces.** The 0.90 TPR/TNR floor lives in the hardener's Phase 2.0 gate; the validator writes whatever was measured and sets `validated: true` only when both the floor and the 85% IAA check (when applicable) pass. This keeps the validator focused on measurement, not policy.
- **Few-shot isolation is the disjoint-split contract.** The judge prompt's `<examples>` block is populated EXCLUSIVELY from the train split. Dev and test are off-limits — this is explicitly called out in Phase 2.3 and Phase 5.4 and surfaced in the Anti-Patterns table.
- **IAA is conditional.** If only one annotator labeled every item, IAA is skipped (not flagged) with `iaa_skipped_reason` populated — avoids blocking single-annotator validations while still enforcing the 85% threshold when ≥2 annotators labeled overlapping items.

## Deviations from Plan

None — plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** None. All 9 grep anchors landed verbatim, 9 SKST sections in the exact order the lint script requires, 7 phases matching the plan's specification, destructive-actions block added, and the artifact schema matches the plan's `<interfaces>` contract with hardener Plan 04.

## Issues Encountered

- Noticed `orq-agent/agents/evaluator-validator/resources/tpr-tnr-methodology.md` already exists as an untracked stray from an earlier aborted pass. This is Plan 07's deliverable territory; left untouched so Plan 07 owns it. Did NOT commit the resources directory from Plan 06.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 07 creates the three resource docs referenced by `<files_to_read>`: `tpr-tnr-methodology.md`, `annotation-queue-setup.md`, `4-component-judge-template.md`.
- Plan 04 (hardener Phase 2.0 TPR/TNR gate) consumes the `evaluator-validations/{name}.json` schema emitted by this subagent.
- Plan 03 (iterator `evaluator-version A/B`) uses this subagent to produce challenger judges.
- No blockers for subsequent plans.

## Self-Check: PASSED

- FOUND: `orq-agent/agents/evaluator-validator.md` on disk (495 lines).
- FOUND: commit `43ce896` in git log.
- FOUND: 9/9 grep anchors verbatim in the new file.
- FOUND: lint-skills.sh --file → exit 0.
- FOUND: check-protected-pipelines.sh → 3/3 SHA-256 match, exit 0.

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-20*
