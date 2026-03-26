---
phase: quick-260326-ann
plan: 04
subsystem: agents
tags: [deployer, hardener, memory-stores, guardrails, evaluators, webhooks, streaming, feedback-api]

requires:
  - phase: quick-260326-ann-03
    provides: "Updated architect, spec-generator, evaluator references"
provides:
  - "Memory store provisioning in deployer (Phase 1.6)"
  - "Corrected team_of_agents format ({key, role} objects)"
  - "Deploy-time evaluator/guardrail attachment via settings arrays"
  - "response_format in deployer comparison allowlists"
  - "SDK anti-pattern fix (removed bogus ^3.14.45 pin)"
  - "Post-deploy streaming and webhook recommendations"
  - "Guardrail format detail with evaluator vs guardrail distinction"
  - "Annotations/Feedback API section in hardener"
  - "Webhook post-harden recommendation"
affects: [deployer, hardener, deploy-command, harden-command]

tech-stack:
  added: []
  patterns:
    - "Memory store provisioning follows KB pattern (REST-only, cache-first)"
    - "Evaluators monitor, guardrails enforce -- same schema, different arrays"
    - "Platform IDs stored in spec files for re-deploy without re-resolution"

key-files:
  created: []
  modified:
    - orq-agent/agents/deployer.md
    - orq-agent/agents/hardener.md

key-decisions:
  - "Memory store failure is WARNING not blocker (unlike KBs) -- stores are referenced by key at runtime, not wired by ID"
  - "Evaluators in settings.evaluators (monitor), guardrails in settings.guardrails (block) -- same format, different purpose"
  - "Platform IDs written to spec file Guardrails table so deployer can skip re-resolution on re-deploy"

patterns-established:
  - "REST-only provisioning pattern: memory stores follow same cache-first, list-then-create pattern as KBs and tools"
  - "Post-deploy/post-harden recommendation sections: non-automatable Studio features documented as advisory notes"

requirements-completed: [OPT-06, OPT-07, OPT-08, OPT-09, OPT-10, OPT-11, OPT-20, OPT-21]

duration: 12min
completed: 2026-03-26
---

# Quick Task 260326-ann Plan 04: Deploy/Harden Agents Summary

**Deployer gains memory store provisioning, evaluator/guardrail deploy-time attachment, corrected team_of_agents format; hardener gains detailed guardrail API format, annotations/feedback API, and webhook recommendations**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-26T17:16:54Z
- **Completed:** 2026-03-26T17:29:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Deployer now provisions memory stores in Phase 1.6 (REST-only, cache-first, WARNING on failure)
- Deployer uses correct {key, role} object format for team_of_agents (removed try-strings-first anti-pattern)
- Both deployer and hardener document settings.evaluators vs settings.guardrails distinction with Control Tower integration
- Deployer includes response_format in create payload and both comparison allowlists
- Removed bogus @orq-ai/node ^3.14.45 version pin with corrected SDK guidance
- Both agents have post-deploy/post-harden webhook and streaming recommendations
- Hardener has Annotations and Feedback section with SDK feedback.create method and defect types

## Task Commits

Each task was committed atomically:

1. **Task 1: Update deployer.md with memory stores, evaluators/guardrails, and corrections** - `eada292` (feat)
2. **Task 2: Update hardener.md with settings.guardrails API and feedback/webhook notes** - `5be7440` (feat)

## Files Created/Modified
- `orq-agent/agents/deployer.md` - Memory store provisioning, corrected team_of_agents, evaluator/guardrail attachment, response_format, streaming/webhook recommendations, SDK fix
- `orq-agent/agents/hardener.md` - Detailed guardrail format, evaluator vs guardrail distinction, annotations/feedback API, webhook recommendation

## Decisions Made
- Memory store creation failure is a WARNING (not a blocker) because memory stores are referenced by key at runtime, unlike KBs which wire knowledge_id into agent payloads
- Evaluators (monitor-only) go in settings.evaluators; guardrails (can block) go in settings.guardrails -- same schema, different runtime behavior
- Platform IDs included in spec file Guardrails table so deployer can include guardrails in re-deploy without calling GET /v2/evaluators again

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate settings block in deployer create payload**
- **Found during:** Task 1 (evaluator/guardrail addition)
- **Issue:** Adding settings.evaluators/guardrails to the payload created a duplicate settings key (original had a separate settings block with tools)
- **Fix:** Merged into single settings block with all fields (tools, evaluators, guardrails, max_cost, tool_approval_required)
- **Files modified:** orq-agent/agents/deployer.md
- **Verification:** Manual review confirms single settings block in payload
- **Committed in:** eada292 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary merge to avoid invalid duplicate JSON key. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 plans in this quick task can now proceed to completion
- Deployer and hardener are aligned on the new settings.evaluators/guardrails API pattern
- Memory store provisioning follows established KB/tool patterns for consistency

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: quick-260326-ann*
*Completed: 2026-03-26*
