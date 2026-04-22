---
phase: 42-evaluator-validation-iterator-enrichments
plan: 07
subsystem: testing
tags: [resources, evaluator-validation, iterator, hardener, tpr-tnr, prevalence-correction, annotation-queue, 4-component-judge]

requires:
  - phase: 34-skill-pack-refactor
    provides: Resources Policy (single-consumer co-located resources/ subdirs)
  - phase: 40-kb-memory-lifecycle
    provides: Precedent for commands/kb/resources/ pattern
  - phase: 39
    provides: Precedent for agents/dataset-generator/resources/ pattern
provides:
  - Iterator Action Plan template (ITRX-02, ITRX-07) with Evidence + Success Criteria fields
  - Three inspectable decision trees (ESCI-06): prompt fix vs evaluator, upgrade model, eval good enough
  - Volume-tier sample_rate defaults (ITRX-08) with safety-class override
  - Prevalence correction formula (EVLD-07) + worked example + clamping + quality-report rendering
  - TPR/TNR measurement methodology (EVLD-06) with confusion matrix + validation gate
  - Annotation Queue / Human Review MCP-first provisioning (EVLD-09) with polling + skew detection
  - 4-component judge prompt template (EVLD-03) with CoT-before-verdict contract + train-only few-shot rule
affects: [42-03 iterator, 42-04 hardener, 42-06 evaluator-validator, iterator.md, hardener.md, evaluator-validator.md]

tech-stack:
  added: []
  patterns:
    - "Per-subagent resources/ subdirectory for single-consumer long-form policy/template docs"
    - "Load-bearing verbatim anchor tokens (P0/P1/P2, 100%/30%/10%, TPR/TNR, 4-component, Annotation Queue, Human Review) for downstream grep-based validation"

key-files:
  created:
    - orq-agent/agents/iterator/resources/action-plan-template.md
    - orq-agent/agents/iterator/resources/decision-trees.md
    - orq-agent/agents/hardener/resources/sample-rate-volume-defaults.md
    - orq-agent/agents/hardener/resources/prevalence-correction.md
    - orq-agent/agents/evaluator-validator/resources/tpr-tnr-methodology.md
    - orq-agent/agents/evaluator-validator/resources/annotation-queue-setup.md
    - orq-agent/agents/evaluator-validator/resources/4-component-judge-template.md
  modified: []

key-decisions:
  - "ASCII decision trees rendered with box-drawing branches so the taken path can be annotated inline in the action plan"
  - "Annotation Queue polling floor set to 50 Pass / 50 Fail (above the 30/30 statistical minimum) to absorb IAA-filtering loss"
  - "Prevalence correction formula clamps to [0,1] post-compute and refuses to render when Youden index ≤ 0 (worse-than-random judge)"
  - "4-component template enforces reasoning-before-verdict in the JSON output contract to lock in chain-of-thought"

patterns-established:
  - "resources/ subdir per subagent (matches dataset-generator precedent); auto-excluded from lint default glob"
  - "Verbatim load-bearing anchor tokens in all resources — downstream tooling grep-validates presence rather than re-parsing prose"

requirements-completed: []

duration: 5 min
completed: 2026-04-21
---

# Phase 42 Plan 07: Resources Scaffold for Iterator / Hardener / Evaluator-Validator Summary

**Seven single-consumer resource files across three new per-subagent `resources/` subdirectories, carrying the load-bearing policy text (action-plan template, decision trees, sample-rate tiers, prevalence correction, TPR/TNR methodology, annotation-queue setup, 4-component judge template) referenced by Plans 03/04/06.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-21T05:55:29Z
- **Completed:** 2026-04-21T05:59:44Z
- **Tasks:** 3
- **Files created:** 7 (in 3 new directories)

## Accomplishments

- Iterator resources (2): action-plan template with Evidence + Success Criteria + P0/P1/P2 columns; three ASCII decision trees (prompt fix vs evaluator, upgrade model, eval good enough).
- Hardener resources (2): volume-tier sample_rate table (100% / 30% / 10% with <1K, 1K–100K, ≥100K tiers) + safety override list; prevalence-correction formula with derivation, worked example, clamping, and quality-report rendering spec.
- Evaluator-validator resources (3): TPR/TNR methodology with confusion matrix (TP/FN/TN/FP) + validation gate + train/dev/test leakage anti-pattern; Annotation Queue / Human Review MCP-first provisioning (annotation-queues-create → REST fallback POST /v2/annotation-queues) with 50/50 polling floor + skew detection; 4-component judge template (role/task/criterion/examples) with reasoning-before-verdict JSON contract.
- lint-skills.sh exits 0 (resources/ subdirs auto-excluded by default glob as predicted).
- check-protected-pipelines.sh 3/3 SHA-256 matches.

## Task Commits

1. **Task 1: Create iterator resources (2 files)** — `641b1ef` (feat)
2. **Task 2: Create hardener resources (2 files)** — `46a603a` (feat)
3. **Task 3: Create evaluator-validator resources (3 files)** — `5b62f0b` (feat)

## Files Created/Modified

- `orq-agent/agents/iterator/resources/action-plan-template.md` — ITRX-02/ITRX-07 template with Summary, Priority Improvements (5-col table), Re-run Criteria, P0/P1/P2 definitions.
- `orq-agent/agents/iterator/resources/decision-trees.md` — ESCI-06 three ASCII decision trees with verbatim decision tokens.
- `orq-agent/agents/hardener/resources/sample-rate-volume-defaults.md` — ITRX-08 volume-tier table, safety-override list, worked example, cost projection formula, volume-lookup paths.
- `orq-agent/agents/hardener/resources/prevalence-correction.md` — EVLD-07 theta_hat formula + derivation + worked example (0.80 → 0.828) + worse-than-random edge case + clamping + quality-report column spec.
- `orq-agent/agents/evaluator-validator/resources/tpr-tnr-methodology.md` — EVLD-06 confusion matrix, TPR/TNR formulas, 30/30 minimum sample, validation gate, train/dev/test leakage anti-pattern.
- `orq-agent/agents/evaluator-validator/resources/annotation-queue-setup.md` — EVLD-09 MCP-first provisioning, schema options, queue URL emission, 50/50 polling floor, 70/30 skew detection, Annotation Queue vs Human Review distinction.
- `orq-agent/agents/evaluator-validator/resources/4-component-judge-template.md` — EVLD-03 XML-tag template, reasoning-before-verdict rule, train-only few-shot rule, worked `helpfulness` example.

## Decisions Made

- **Reasoning-before-verdict enforced in JSON contract** — forces CoT to materialize before pass/fail commit; malformed verdict-first responses are retried.
- **50/50 polling floor for Annotation Queues** — exceeds EVLD-06 30/30 statistical floor to absorb IAA-filtering losses without stalling validation.
- **Prevalence-correction clamping + worse-than-random guard** — clamp theta_hat to [0,1] and refuse correction rendering when `TPR + TNR ≤ 1` (Youden ≤ 0); show `N/A — re-calibrate` in quality-report instead.
- **Verbatim anchor tokens over prose paraphrase** — downstream tooling greps for `P0`, `100%`, `theta_hat`, `4-component`, etc. rather than re-parsing; resources written to guarantee these substrings appear.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0
**Impact on plan:** Plan was a clean scaffold of self-contained resource files; no implementation surprises.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Resources are in place ready to be referenced by subagent prompts in Plans 03 (iterator enrichments), 04 (hardener enrichments), and 06 (new evaluator-validator subagent).
- lint-skills.sh and check-protected-pipelines.sh both clean; safe to layer further plans on top.
- No blockers.

## Self-Check: PASSED

- All 7 key-files exist on disk (ls confirmed).
- Task commits `641b1ef`, `46a603a`, `5b62f0b` present in `git log`.
- All 20 grep anchors verified during task verification steps.
- lint-skills.sh exit 0; check-protected-pipelines.sh exit 0.

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
