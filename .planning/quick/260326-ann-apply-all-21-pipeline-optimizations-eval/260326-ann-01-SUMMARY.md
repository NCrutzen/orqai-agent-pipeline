---
phase: quick-260326-ann
plan: 01
subsystem: references
tags: [orqai-api, agent-fields, evaluators, model-catalog, api-endpoints, multimodal, thinking, streaming, webhooks]

# Dependency graph
requires:
  - phase: quick-260325-r2j
    provides: "Initial agent-fields and evaluator-types references with json_schema and two-evaluator pattern"
provides:
  - "Complete agent field reference with model object, thinking, multimodal, deploy-time evaluators/guardrails"
  - "Complete evaluator catalog with 27 function, 19 LLM, 12 RAGAS evaluators plus custom evaluator API creation"
  - "API endpoints with memory store payload, streaming, webhooks, SDK/REST/MCP usage clarification"
  - "Model catalog with models-list ALL models warning and AI Router/load_balancer mention"
affects: [quick-260326-ann-02, quick-260326-ann-03, quick-260326-ann-04, deployer, spec-generator, experiment-runner]

# Tech tracking
tech-stack:
  added: []
  patterns: ["model-as-object with parameters", "deploy-time evaluator/guardrail attachment", "MCP vs REST vs SDK integration pattern"]

key-files:
  created: []
  modified:
    - orq-agent/references/orqai-agent-fields.md
    - orq-agent/references/orqai-evaluator-types.md
    - orq-agent/references/orqai-api-endpoints.md
    - orq-agent/references/orqai-model-catalog.md

key-decisions:
  - "Kept existing evaluators alongside new ones (additive, no removals) to avoid breaking experiment-runner name resolution"
  - "Placed new function evaluators grouped logically near existing contains/length evaluators rather than appended at end"
  - "SDK section restructured to three integration patterns (MCP/REST/SDK) instead of flat method table"

patterns-established:
  - "model-as-object: model field accepts string or {id, parameters, retry} object with thinking/cache/load_balancer"
  - "deploy-time attachment: settings.evaluators and settings.guardrails with {id, execute_on, sample_rate}"
  - "three integration patterns: MCP for CRUD, REST for experiments/KBs/memory, SDK for deployments.invoke and feedback"

requirements-completed: [OPT-01, OPT-05, OPT-08, OPT-09, OPT-10, OPT-13, OPT-17, OPT-18, OPT-19, OPT-20, OPT-21]

# Metrics
duration: 13min
completed: 2026-03-26
---

# Quick Task 260326-ann Plan 01: Reference Files Summary

**All 4 reference files updated with complete Orq.ai API surface: model-as-object parameters (thinking, cache, load_balancer), 27 function + 19 LLM evaluators, multimodal message format, memory store provisioning payload, streaming/webhooks docs, and SDK/REST/MCP integration patterns**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-26T17:16:00Z
- **Completed:** 2026-03-26T17:29:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Updated orqai-agent-fields.md with model-as-object (thinking, cache, load_balancer, retry), team_of_agents as {key, role} objects, settings.evaluators/guardrails/max_cost/tool_approval_required, Model Parameters section, and Multimodal Message Format section
- Updated orqai-evaluator-types.md with 8 new function evaluators (contains_all/any/none, length_between/greater/less, bert_score, contains_valid_link), 9 new LLM evaluators (grammar, pii, bot_detection, age_appropriate, etc.), custom evaluator API creation section, and expanded selection guidance
- Updated orqai-api-endpoints.md with memory store create payload, Deployments section, Streaming/Webhooks sections, restructured SDK integration patterns (MCP/REST/SDK), removed bogus ^3.14.45 version pin, added ORQ_KEY env var mapping
- Updated orqai-model-catalog.md with WARNING about models-list returning ALL 300+ models and AI Router/load_balancer recommendation

## Task Commits

Each task was committed atomically:

1. **Task 1: Update orqai-agent-fields.md and orqai-evaluator-types.md** - `eada292` (feat)
2. **Task 2: Update orqai-api-endpoints.md and orqai-model-catalog.md** - `5be7440` (feat)

## Files Created/Modified
- `orq-agent/references/orqai-agent-fields.md` - Added model-as-object parameters, settings fields, Model Parameters section, Multimodal Message Format section
- `orq-agent/references/orqai-evaluator-types.md` - Added 8 function evaluators, 9 LLM evaluators, custom evaluator API creation, expanded selection guidance
- `orq-agent/references/orqai-api-endpoints.md` - Added memory store payload, Deployments, Streaming, Webhooks sections; restructured SDK integration patterns
- `orq-agent/references/orqai-model-catalog.md` - Added models-list ALL models warning, AI Router/load_balancer in How to Choose

## Decisions Made
- Kept all existing evaluators alongside new ones (additive approach) to avoid breaking experiment-runner's runtime name resolution
- Placed new function evaluators logically grouped near existing similar evaluators (contains_all near contains, length_between near word_count)
- Restructured SDK section from flat method-mapping table to three-pattern integration guide (MCP/REST/SDK) for clearer pipeline guidance

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Plan Readiness
All 4 reference files are updated and serve as the foundation for Plans 02-04 which update downstream agent specs (deployer, spec-generator, experiment-runner, etc.).

---
## Self-Check: PASSED

All 4 modified files exist. SUMMARY.md created. Both task commits (eada292, 5be7440) verified in git log.

---
*Quick Task: 260326-ann*
*Completed: 2026-03-26*
