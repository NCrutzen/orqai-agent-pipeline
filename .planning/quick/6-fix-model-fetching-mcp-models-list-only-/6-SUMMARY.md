---
phase: quick-6
plan: 01
subsystem: agent-pipeline
tags: [mcp, models-list, model-selection, orq-agent]

# Dependency graph
requires:
  - phase: quick-5
    provides: Live model fetching via MCP and API added to all model selection points
provides:
  - MCP-only model selection across all commands and subagents
  - Graceful failure when MCP unavailable (no silent fallback to stale data)
  - Static catalog demoted to format reference only
affects: [orq-agent commands, orq-agent subagents, model catalog reference]

# Tech tracking
tech-stack:
  added: []
  patterns: [MCP-only model selection with graceful failure, no fallback chain]

key-files:
  created: []
  modified:
    - orq-agent/commands/prompt.md
    - orq-agent/commands/deploy.md
    - orq-agent/commands/research.md
    - orq-agent/agents/spec-generator.md
    - orq-agent/agents/researcher.md
    - orq-agent/agents/architect.md
    - orq-agent/agents/dataset-generator.md
    - orq-agent/templates/agent-spec.md
    - orq-agent/references/orqai-model-catalog.md

key-decisions:
  - "MCP models-list is the single source of truth for model selection -- no API fallback, no catalog fallback"
  - "When MCP unavailable, model selection/validation fails gracefully with clear message rather than silently degrading"
  - "Static catalog retained as format reference only (provider/model-name patterns)"

patterns-established:
  - "MCP-only pattern: all model selection uses MCP models-list exclusively, fails with message if unavailable"

requirements-completed: [QUICK-6]

# Metrics
duration: 4min
completed: 2026-03-02
---

# Quick Task 6: Fix Model Fetching Summary

**MCP models-list enforced as sole model source across all commands and subagents, removing 3-tier fallback chain (MCP -> REST API -> static catalog)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-02T18:06:46Z
- **Completed:** 2026-03-02T18:10:17Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Removed REST API (`GET /v2/models`) fallback from all model selection flows in commands and subagents
- Removed static catalog (`orqai-model-catalog.md`) fallback from all model selection and validation flows
- Added graceful failure messages when MCP unavailable (stops execution, does not silently degrade)
- Preserved API key validation probes in deploy.md Step 4.2 (connectivity check, not model selection)
- Demoted static model catalog to format reference only with clear header note

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove API and catalog fallbacks from command model pickers** - `4f2910e` (feat)
2. **Task 2: Remove API and catalog fallbacks from subagents and update catalog/template references** - `0e34982` (feat)

## Files Created/Modified
- `orq-agent/commands/prompt.md` - MCP-only model fetch in Section 2.0, removed fallback default
- `orq-agent/commands/deploy.md` - MCP-only embedding model fetch in Section 3.5.2, removed static fallback list
- `orq-agent/commands/research.md` - MCP-only model fetch in Step 0.5, removed fallback flag and catalog reference
- `orq-agent/agents/spec-generator.md` - MCP-only model validation, removed REST and catalog fallbacks
- `orq-agent/agents/researcher.md` - MCP-only model validation in rules and anti-patterns sections
- `orq-agent/agents/architect.md` - MCP-only model validation in blueprint rules
- `orq-agent/agents/dataset-generator.md` - MCP-only model ID validation in self-validation and constraints
- `orq-agent/templates/agent-spec.md` - MODEL and FALLBACK_MODELS source changed from catalog to MCP models-list
- `orq-agent/references/orqai-model-catalog.md` - Header changed to FORMAT REFERENCE ONLY, removed live availability note

## Decisions Made
- MCP is the hard requirement for model selection -- when unavailable, operations stop with a clear message rather than silently using stale data from REST API or static catalog
- API key validation via `/v2/models` in deploy/test/harden/iterate left completely untouched (connectivity checks, not model selection)
- Static catalog file retained but clearly demoted to format reference only

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed additional fallback references not in plan**
- **Found during:** Task 1 (prompt.md) and Task 1 (research.md)
- **Issue:** Step 3 in prompt.md had "anthropic/claude-sonnet-4-5 as ultimate fallback if API was unreachable" and research.md Step 3 had same pattern
- **Fix:** Removed the fallback default since MCP failure stops execution before these steps are reached
- **Files modified:** orq-agent/commands/prompt.md, orq-agent/commands/research.md
- **Committed in:** 4f2910e (Task 1 commit)

**2. [Rule 2 - Missing Critical] Cleaned model catalog reference in researcher decision framework**
- **Found during:** Task 2 verification
- **Issue:** researcher.md line 74 referenced "model catalog" in model selection decision framework
- **Fix:** Updated to reference MCP models-list tool instead
- **Files modified:** orq-agent/agents/researcher.md
- **Committed in:** 0e34982 (Task 2 commit)

**3. [Rule 2 - Missing Critical] Updated spec-generator pre-output validation checklist**
- **Found during:** Task 2 (spec-generator.md)
- **Issue:** Validation checklist still referenced "validated against catalog as fallback"
- **Fix:** Updated to reference MCP models-list with SKIPPED flag pattern
- **Files modified:** orq-agent/agents/spec-generator.md
- **Committed in:** 0e34982 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 missing critical)
**Impact on plan:** All auto-fixes necessary for completeness -- additional fallback references that the plan's line-specific edits did not cover. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All model selection paths now use MCP exclusively
- Static catalog can be safely referenced for format patterns without risk of being used for model selection

---
*Quick Task: 6*
*Completed: 2026-03-02*
