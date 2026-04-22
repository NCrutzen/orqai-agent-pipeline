---
phase: 42-evaluator-validation-iterator-enrichments
plan: 03
subsystem: testing
tags: [iterator, eval-science, action-plan, decision-trees, p0-p1-p2, evaluator-ab, annotations, no-repeat]

# Dependency graph
requires:
  - phase: 34-skill-structure-format-foundation
    provides: SKST-conformant iterator.md structure
  - phase: 41-prompt-optimization-cross-framework-comparison
    provides: optimizer_id concept referenced by no-repeat rule
provides:
  - P0/P1/P2 priority labeling on every iteration diff (ITRX-01)
  - Action Plan emission per iteration with Summary + Priority Improvements + Re-run Criteria (ITRX-02)
  - Evidence (datapoints, scores, run ID) + Success Criteria citation per ticket (ITRX-07)
  - Annotation-comment absorption into diff proposal reasons via MCP annotations-list (ITRX-09)
  - No-repeat optimizer rule with explicit override flag gated against audit-trail.md (ITRX-05)
  - Evaluator-version A/B: current + proposed evaluators attached as two columns on same re-test experiment (EVLD-11)
  - Three inspectable decision trees: prompt fix vs evaluator / upgrade model / eval good enough (ESCI-06)
affects: [iterator, failure-diagnoser, evaluator-validator, hardener]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Priority-tiered diff proposals (P0/P1/P2) with deferred execution of P1/P2 unless overridden"
    - "Structured Action Plan markdown artifact per iteration co-located in swarm dir"
    - "Inspectable decision trees rendered to disk for HITL review"
    - "No-repeat audit gate keyed on {agent_key, optimizer_id, prompt_hash} triple"
    - "A/B evaluator attachment for per-datapoint judgment comparison"

key-files:
  created: []
  modified:
    - orq-agent/agents/iterator.md

key-decisions:
  - "Phase 2.5 decision trees placed BEFORE Phase 3 proposals so the reasoning path is published before diffs are generated"
  - "Priority table scopes P0 to prompt-level, P1 to decomposition/tool/RAG, P2 to model/eval-set/FT — matches eval-science cost gradient"
  - "Evidence column mandates literal phrase 'run ID' (not 'trace ID') to align with MCP experiments API vocabulary"
  - "No-repeat gate enforced at Phase 4.0 prelude (before approval) so unnecessary diffs are never shown to the user"
  - "Evaluator-version A/B uses 2 column names eval_current/eval_proposed to match Orq.ai experiments-create evaluator array shape"

patterns-established:
  - "Insert sub-phases via decimal numbering (2.5, 3.5, 3.6, 3.7, 6.5) to preserve existing Phase N ordering byte-identical"
  - "Append Done When checkboxes with explicit requirement ID suffix (ITRX-XX / EVLD-XX / ESCI-XX) for traceability"

requirements-completed: [ITRX-01, ITRX-02, ITRX-05, ITRX-07, ITRX-09, EVLD-11, ESCI-06]

# Metrics
duration: 2 min
completed: 2026-04-21
---

# Phase 42 Plan 3: Iterator Enrichments Summary

**Enriched `orq-agent/agents/iterator.md` with 5 new sub-phases (2.5, 3.5, 3.6, 3.7, 6.5) and a Phase 4 no-repeat prelude that wire in P0/P1/P2 priority tiers, a structured Action Plan artifact with Evidence + Success Criteria columns, annotation-comment absorption, no-repeat optimizer gating, evaluator-version A/B re-test attachment, and three inspectable decision trees (prompt fix vs evaluator / upgrade model / eval good enough).**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-21T05:55:11Z
- **Completed:** 2026-04-21T05:57:02Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Closed 7 requirements in a single file edit: ITRX-01, ITRX-02, ITRX-05, ITRX-07, ITRX-09, EVLD-11, ESCI-06
- Every proposed improvement now carries a P0/P1/P2 priority tier with a defined scope table (prompt vs decomposition vs model)
- Iteration now emits a structured `iteration-{N}-action-plan.md` with mandatory Evidence (eval_ids + scores + run ID) and Success Criteria (target re-run bottleneck + max iterations) columns
- HITL annotation comments are now pulled via MCP `annotations-list` and inlined into each diff proposal's `reason` field, closing the loop between human labels and prompt change justification
- No-repeat optimizer rule gates Phase 4 against `audit-trail.md`; explicit `--override` flag required to bypass, recorded as `override: true` for auditability
- Evaluator-quality issues now trigger an A/B re-test where current + proposed evaluators judge the same datapoints as two columns, enabling per-datapoint disagreement inspection
- Three decision trees (rendered from resources/decision-trees.md created by Plan 07) expose the iterator's reasoning path so reviewers can audit which branch was taken

## Task Commits

1. **Task 1: Add P0/P1/P2 priority, Action Plan schema, A/B, annotation, no-repeat, decision-tree anchors** — `8ff3bec` (feat)

**Plan metadata:** pending (docs commit with SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified

- `orq-agent/agents/iterator.md` — Added Phase 2.5 (Publish Decision Trees), Phase 3.5 (P0/P1/P2 Priority), Phase 3.6 (Action Plan Emission), Phase 3.7 (Absorb Annotation Comments), Phase 4.0 prelude (No-Repeat Optimizer Rule), Phase 6.5 (Evaluator-Version A/B), and 7 new Done When checkboxes. 113 line insertions, 0 deletions.

## Decisions Made

- Decision-tree publication placed at Phase 2.5 (before proposals in Phase 3) so the reasoning path is inspectable before diffs are authored — matches "no auto-promotion without HITL" invariant.
- Priority table scopes chosen to mirror the eval-science cost gradient: P0 = prompt wording (cheapest), P1 = structural (decomposition/tools/RAG), P2 = model/data/FT (most expensive). This keeps the iterator's default behavior in the low-cost regime.
- Evidence column mandates literal phrase `run ID` (not `trace ID` or `experiment ID`) to align with Orq.ai MCP experiments API vocabulary and the ITRX-07 anchor.
- No-repeat gate enforced at Phase 4 prelude (before approval display) so users are never shown diff proposals that would be blocked downstream — fail-fast principle.
- Evaluator A/B column names `eval_current` / `eval_proposed` chosen to match the Orq.ai `experiments-create --evaluators '[{name, prompt}, ...]'` shape shown in the EVLD-11 MCP sketch.

## Deviations from Plan

None — plan executed exactly as written. All 14 required anchors present verbatim, 5 new sub-phases inserted at the exact locations specified, existing YAML/Constraints/Anti-Patterns/Open-in-orq.ai/Documentation sections preserved byte-identical, 7 Done When checkboxes appended.

---

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Iterator.md now carries all 7 methodology anchors required by Phase 42 scope. Downstream Plan 07 (resources) will create `orq-agent/agents/iterator/resources/action-plan-template.md` and `decision-trees.md` that this plan references by path.
- Ready for Plan 04 (hardener.md enrichments: TPR/TNR ≥ 90% gate, sample_rate volume defaults, human-review-queue hook, prevalence correction).

## Self-Check: PASSED

- `orq-agent/agents/iterator.md` exists on disk with 113 new lines committed
- Commit `8ff3bec` present in `git log`
- Lint: `bash orq-agent/scripts/lint-skills.sh --file orq-agent/agents/iterator.md` → exit 0
- Protected pipelines: `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 SHA-256 match
- All 14 grep anchors verbatim present: P0, P1, P2, Action Plan, evaluator-version A/B, annotation comment, no-repeat, explicit override, prompt fix vs evaluator, upgrade model, eval good enough, Evidence, Success Criteria, run ID

---
*Phase: 42-evaluator-validation-iterator-enrichments*
*Completed: 2026-04-21*
