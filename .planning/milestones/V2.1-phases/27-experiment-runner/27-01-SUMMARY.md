---
phase: 27-experiment-runner
plan: 01
subsystem: testing
tags: [experiment, orqai, rest, evaluator, polling, adaptive, holdout]

# Dependency graph
requires:
  - phase: dataset-preparer
    provides: dataset-prep.json handoff contract with per-agent dataset IDs, roles, status
provides:
  - experiment-runner.md subagent with 6 internal phases
  - experiment-raw.json handoff contract schema for downstream subagents
affects: [results-analyzer, prompt-editor]

# Tech tracking
tech-stack:
  added: []
  patterns: [REST-only for experiment creation/execution, MCP for polling/export, adaptive polling with backoff, category overlays attached to all experiments]

key-files:
  created: [orq-agent/agents/experiment-runner.md]
  modified: []

key-decisions:
  - "REST-only for experiments (LOCKED) -- skip MCP entirely for experiment creation and run triggering due to LOW-confidence MCP schema"
  - "Evaluator selection owned by experiment-runner -- reads role from dataset-prep.json and applies role-based mapping"
  - "Category overlays (toxicity, harmfulness) attached to ALL experiments -- results-analyzer slices by category from inputs.category metadata"
  - "Holdout re-test mode writes to experiment-raw-holdout.json (separate file) to avoid overwriting primary results"
  - "Evaluator IDs resolved at runtime via GET /v2/evaluators list-and-filter, never hardcoded"

patterns-established:
  - "REST-only override: experiments use REST exclusively while other operations follow MCP-first/REST-fallback"
  - "Adaptive polling: 10s start, +5s per poll, 30s max, 15-minute timeout per experiment"
  - "JSON handoff continuation: experiment-raw.json extends the dataset-prep.json -> experiment-raw.json -> results chain"

requirements-completed: [EXPR-01, EXPR-02, EXPR-03, EXPR-04, EXPR-05, EXPR-06]

# Metrics
duration: 3min
completed: 2026-03-11
---

# Phase 27 Plan 01: Experiment Runner Summary

**300-line experiment-runner.md subagent with 6 phases: read inputs, resolve evaluators via REST, create experiments via REST POST, execute triple runs with adaptive polling, export via MCP, and write experiment-raw.json**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-11T14:25:32Z
- **Completed:** 2026-03-11T14:28:34Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created experiment-runner.md (300 lines) replacing broken evaluatorq SDK experiment execution with direct REST API calls
- All 6 internal phases documented with clear, actionable instructions for the executing Claude agent
- REST-only for experiments resolves STATE.md blocker about MCP confidence for create_experiment
- Holdout re-test mode enables prompt-editor (Phase 31) to re-test without running dataset-preparer
- 7 anti-patterns documented to prevent all known pitfalls from V2.1 restructure

## Task Commits

Each task was committed atomically:

1. **Task 1: Create experiment-runner.md with 6 internal phases** - `20e715c` (feat)
2. **Task 2: Validate against requirements and tester.md extraction** - No changes needed (validation-only task, all 6 EXPR-* requirements verified as covered)

## Files Created/Modified
- `orq-agent/agents/experiment-runner.md` - Complete Claude Code subagent prompt for experiment execution pipeline

## Decisions Made
- REST-only for experiments (LOCKED) -- resolves STATE.md blocker about LOW-confidence MCP create_experiment schema
- Evaluator selection ownership stays in experiment-runner (reads role from dataset-prep.json, applies tester.md Phase 6 mapping)
- Category overlays (toxicity + harmfulness) attached to ALL experiments -- simplifies experiment creation, results-analyzer slices by category
- Holdout output naming: `experiment-raw-holdout.json` (separate file, avoids overwriting primary test results)
- Evaluator ID resolution at runtime via GET /v2/evaluators (never hardcoded, workspace-portable)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- experiment-runner.md ready for use by the rewritten test command (Phase 29)
- experiment-raw.json contract schema ready for results-analyzer (Phase 28) to consume
- STATE.md blocker about MCP create_experiment confidence resolved (REST-only approach bypasses it entirely)

## Self-Check: PASSED

- FOUND: orq-agent/agents/experiment-runner.md
- FOUND: commit 20e715c

---
*Phase: 27-experiment-runner*
*Completed: 2026-03-11*
