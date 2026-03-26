---
phase: quick-260326-ann
plan: 03
subsystem: testing
tags: [ragas, evaluators, experiment-runner, tester, sdk-references, evaluatorq]

requires:
  - phase: quick-260326-ann-01
    provides: common optimization patterns (SDK refs, evaluator reconciliation)
provides:
  - RAGAS auto-selection for RAG agents in tester.md and experiment-runner.md
  - Reconciled evaluatorq/REST/deployments.invoke() experiment patterns
  - Corrected SDK references and env var mapping
affects: [tester, experiment-runner, dataset-preparer]

tech-stack:
  added: []
  patterns:
    - "RAGAS auto-selection: query_knowledge_base tool triggers faithfulness/context_precision/answer_relevancy"
    - "Three experiment patterns: REST primary, evaluatorq alternative, deployments.invoke() for A/B"

key-files:
  created: []
  modified:
    - orq-agent/agents/tester.md
    - orq-agent/agents/experiment-runner.md

key-decisions:
  - "evaluatorq is NOT legacy -- it was the root cause of V2.1 timeouts when used as ONLY method, but works for local custom scoring"
  - "Three experiment patterns documented: REST (primary), evaluatorq (alternative), deployments.invoke() (A/B testing)"
  - "RAGAS evaluators added only for agents with query_knowledge_base tool, not universally"

patterns-established:
  - "RAGAS auto-selection pattern: check agent tools for query_knowledge_base -> add faithfulness, context_precision, answer_relevancy"
  - "Evaluator set composition: role-based base + RAGAS overlay for RAG + category overlay for adversarial/edge"

requirements-completed: [OPT-02, OPT-10, OPT-14, OPT-15]

duration: 13min
completed: 2026-03-26
---

# Quick Task 260326-ann Plan 03: Testing Pipeline Agents Summary

**RAGAS evaluator auto-selection for RAG agents, evaluatorq/REST/deployments.invoke() pattern reconciliation, and SDK reference corrections in tester.md and experiment-runner.md**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-26T17:15:58Z
- **Completed:** 2026-03-26T17:29:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added RAGAS auto-selection (faithfulness, context_precision, answer_relevancy) for agents with `query_knowledge_base` tool in both tester.md and experiment-runner.md
- Reconciled evaluatorq from "LEGACY/DO NOT use" to "use with caution" with clear guidance on when each experiment pattern applies
- Documented deployments.invoke() as A/B Testing Mode alternative pattern in experiment-runner.md
- Removed bogus `^3.14.45` SDK version pin, replaced with correct installation guidance and env var mapping

## Task Commits

Each task was committed atomically:

1. **Task 1: Update tester.md with RAGAS auto-selection and corrected patterns** - `8bcdd33` (feat)
2. **Task 2: Update experiment-runner.md with RAGAS auto-selection and pattern corrections** - `5be7440` (feat)

## Files Created/Modified
- `orq-agent/agents/tester.md` - Added Step 6.2.1 RAGAS Auto-Selection, corrected SDK refs in header/Phase 5/Anti-Patterns, reconciled evaluatorq with 3 experiment patterns
- `orq-agent/agents/experiment-runner.md` - Added RAGAS Auto-Selection section, A/B Testing Mode, task.type REST-only note, reconciled evaluatorq and SDK references

## Decisions Made
- evaluatorq documented as "use with caution" rather than "DO NOT use" -- it caused V2.1 timeouts when used as the only execution method, but functions correctly for local custom evaluator scoring
- Three experiment patterns explicitly documented with clear use-case guidance: REST (primary pipeline path), evaluatorq (local custom scorers), deployments.invoke() (A/B model comparison)
- RAGAS evaluators only added for agents with `query_knowledge_base` tool, keeping non-RAG agent evaluator sets lean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Testing pipeline agents (tester.md, experiment-runner.md) now have consistent RAGAS auto-selection, corrected SDK references, and reconciled experiment patterns
- Ready for Plan 04 execution (deployer pipeline agents) or any remaining plans in this quick task

## Self-Check: PASSED

All files exist. All commits verified.

---
*Phase: quick-260326-ann*
*Completed: 2026-03-26*
