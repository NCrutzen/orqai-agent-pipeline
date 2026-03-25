---
phase: quick-260325-r2j
plan: 01
subsystem: agents
tags: [orqai, experiment-learnings, json-schema, evaluators, kb-tools, code-tools, api-endpoints]

requires:
  - phase: none
    provides: existing agent specs and reference files
provides:
  - "6 experiment learnings encoded in pipeline agent specs and references"
  - "json_schema strict mode guidance for structured output agents"
  - "Two-evaluator pattern mandatory guidance"
  - "portionOptimizer pattern for math-heavy agents"
  - "KB tool decision heuristic"
  - "API endpoint common pitfalls documentation"
affects: [spec-generator, researcher, tester, experiment-runner, dataset-preparer]

tech-stack:
  added: []
  patterns: [two-evaluator-pattern, portionOptimizer-pattern, kb-inline-vs-tool-heuristic, json-schema-strict-mode]

key-files:
  created: []
  modified:
    - orq-agent/references/orqai-agent-fields.md
    - orq-agent/references/orqai-evaluator-types.md
    - orq-agent/references/orqai-api-endpoints.md
    - orq-agent/agents/spec-generator.md
    - orq-agent/agents/researcher.md
    - orq-agent/agents/tester.md
    - orq-agent/agents/experiment-runner.md
    - orq-agent/agents/dataset-preparer.md

key-decisions:
  - "All 6 learnings encoded as guidance and anti-patterns, not as code changes -- these are documentation-level improvements to agent spec generation"
  - "Two-evaluator pattern added as mandatory validation step, not just recommendation"
  - "KB tool decision uses 5000-word threshold as heuristic boundary"

patterns-established:
  - "Two-evaluator pattern: every experiment must pair code + LLM evaluators"
  - "portionOptimizer pattern: LLM for selection/reasoning, code tool for math"
  - "KB inline vs tool heuristic: <5000 words static knowledge goes inline"

requirements-completed: [quick-task]

duration: 5min
completed: 2026-03-25
---

# Quick Task 260325-r2j: Apply Experiment Learnings Summary

**6 experiment learnings encoded across 3 reference files and 5 agent specs: json_schema strict mode, two-evaluator pattern, portionOptimizer for math, KB tool removal heuristic, and API endpoint pitfalls**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-25T18:33:47Z
- **Completed:** 2026-03-25T18:38:25Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added response_format field documentation with json_schema strict mode to orqai-agent-fields.md, including anti-pattern for json_object
- Added two-evaluator pattern (mandatory) section to orqai-evaluator-types.md with minimum evaluator sets by agent role
- Added common pitfalls section to orqai-api-endpoints.md covering evaluator IDs, messages field placement, and /execute endpoint
- Updated spec-generator.md with response format section, two-evaluator mandate, KB tool decision heuristic, portionOptimizer pattern, and expanded anti-patterns
- Updated researcher.md with portionOptimizer tool guidance, KB inline assessment, and anti-patterns
- Updated tester.md with two-evaluator validation rule and legacy note about evaluatorq SDK
- Updated experiment-runner.md with two-evaluator validation in Phase 2 and anti-pattern
- Updated dataset-preparer.md with json_schema anti-pattern note

## Task Commits

Each task was committed atomically:

1. **Task 1: Update reference files with experiment learnings** - `0974a5d` (docs)
2. **Task 2: Update agent specs with experiment learnings** - `b528587` (docs)

## Files Created/Modified
- `orq-agent/references/orqai-agent-fields.md` - Added response_format field and Response Format section with json_schema strict mode guidance
- `orq-agent/references/orqai-evaluator-types.md` - Added mandatory baseline row and Two-Evaluator Pattern section
- `orq-agent/references/orqai-api-endpoints.md` - Added Common Pitfalls section with 3 endpoint corrections
- `orq-agent/agents/spec-generator.md` - Added Response Format section, two-evaluator mandate, KB Tool Decision, portionOptimizer guidance, validation checklist item, anti-patterns
- `orq-agent/agents/researcher.md` - Added portionOptimizer and KB assessment to Tool Recommendations, KB assessment to Decision Framework, anti-pattern
- `orq-agent/agents/tester.md` - Added two-evaluator validation rule in Step 6.2, legacy note and anti-patterns
- `orq-agent/agents/experiment-runner.md` - Added two-evaluator validation in Phase 2, anti-pattern
- `orq-agent/agents/dataset-preparer.md` - Added json_schema anti-pattern

## Decisions Made
- All 6 learnings encoded as guidance and anti-patterns in documentation, not code changes
- Two-evaluator pattern positioned as mandatory validation step (not just a recommendation)
- KB tool decision heuristic uses ~5000 words as the threshold between inline and KB retrieval

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Learnings-to-Files Mapping

| Learning | Files Updated |
|----------|-------------|
| 1. json_schema strict mode | orqai-agent-fields.md, spec-generator.md, dataset-preparer.md |
| 2. A/B testing (evaluatorq legacy) | tester.md (legacy note + anti-pattern) |
| 3. Two-evaluator pattern | orqai-evaluator-types.md, spec-generator.md, tester.md, experiment-runner.md |
| 4. LLMs can't do math | spec-generator.md (code tools + anti-pattern), researcher.md (tool recs) |
| 5. KB tools unreliable | spec-generator.md (KB tool decision), researcher.md (context needs + anti-pattern) |
| 6. API endpoints | orqai-api-endpoints.md (common pitfalls) |

---
*Quick task: 260325-r2j*
*Completed: 2026-03-25*
