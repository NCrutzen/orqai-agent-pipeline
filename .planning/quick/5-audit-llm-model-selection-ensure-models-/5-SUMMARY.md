---
phase: quick-5
plan: 01
subsystem: agent-pipeline
tags: [model-selection, mcp, orq-api, dynamic-models]

# Dependency graph
requires:
  - phase: quick-4
    provides: KB generator and /orq-agent:kb command
provides:
  - Dynamic model selection via live API fetch across all commands and subagents
  - Model catalog freshness warning directing to live API
  - Graceful fallback to static catalog when API unreachable
affects: [orq-agent commands, orq-agent subagents, model catalog]

# Tech tracking
tech-stack:
  added: []
  patterns: [MCP-first/REST-fallback for model fetching, dynamic picker with static fallback]

key-files:
  created: []
  modified:
    - orq-agent/commands/prompt.md
    - orq-agent/commands/deploy.md
    - orq-agent/commands/research.md
    - orq-agent/agents/spec-generator.md
    - orq-agent/agents/researcher.md
    - orq-agent/agents/architect.md
    - orq-agent/references/orqai-model-catalog.md

key-decisions:
  - "MCP-first/REST-fallback pattern reused from deployer for model fetching consistency"
  - "Static catalog preserved as fallback and recommendation guide, not removed"
  - "Subagents validate models against live API, falling back to catalog with confidence downgrade"

patterns-established:
  - "Dynamic model fetch: all model pickers fetch from models-list MCP or GET /v2/models before presenting options"
  - "Graceful degradation: live fetch failure falls back to static catalog with visible warning"

requirements-completed: [QUICK-5]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Quick Task 5: Audit LLM Model Selection Summary

**Dynamic model selection via live MCP/REST API fetch across all orq-agent commands and subagents, replacing hardcoded static model pickers**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T17:53:17Z
- **Completed:** 2026-03-02T17:56:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Audited all hardcoded model references across 6 files, categorized into must-fix (3), add-validation (4), and already-correct (2)
- Replaced static model pickers in prompt.md (3-option chat model menu), deploy.md (4-option embedding model menu), and research.md (hardcoded default) with dynamic API-fetched model lists
- Added live model validation to spec-generator, researcher, and architect subagents
- Added prominent freshness warning to model catalog clarifying it is a recommendation guide, not source of truth

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and document all hardcoded model references** - No commit (audit-only, no files modified)
2. **Task 2: Replace hardcoded model pickers with live API fetch pattern** - `79018e3` (feat)
3. **Task 3: Add live model validation to subagents and update catalog** - `68e611b` (feat)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `orq-agent/commands/prompt.md` - Dynamic model picker using MCP/REST fetch, replaced static a/b/c/d menu
- `orq-agent/commands/deploy.md` - Dynamic embedding model picker using MCP/REST fetch, replaced static 4-option menu
- `orq-agent/commands/research.md` - Added model fetch step for dynamic default model selection
- `orq-agent/agents/spec-generator.md` - Model validation against live API before generating specs
- `orq-agent/agents/researcher.md` - Model recommendations validated against live API, added MCP tools note
- `orq-agent/agents/architect.md` - Model validation against live models-list when MCP available
- `orq-agent/references/orqai-model-catalog.md` - Freshness warning and live API reference added

## Decisions Made
- Reused the MCP-first/REST-fallback pattern from deployer.md for consistency across the skill
- Kept static model catalog as a fallback (not removed) -- it serves as recommendation guide and graceful degradation path
- Subagents that cannot fetch live models downgrade their confidence to MEDIUM instead of failing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All model selection is now dynamic across the orq-agent skill
- No blockers for future work

---
*Quick Task: 5-audit-llm-model-selection*
*Completed: 2026-03-02*
