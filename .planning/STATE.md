---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: unknown
last_updated: "2026-03-11T14:33:40.433Z"
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- without touching a terminal or needing technical knowledge.
**Current focus:** V2.1 Experiment Pipeline Restructure -- Phase 27 (Experiment Runner)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V3.0-V5.0 defined

## Current Position

Phase: 27 of 32 (Experiment Runner)
Plan: 1 of 1 in current phase
Status: Phase 27 complete
Last activity: 2026-03-11 -- Completed 27-01-PLAN.md (experiment-runner.md subagent)

Progress: [##########] 100% (Phase 27)

## Performance Metrics

**Velocity:**
- Total plans completed: 2
- Average duration: 2.5min
- Total execution time: 5min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 26 | 1 | 2min | 2min |
| 27 | 1 | 3min | 3min |

## Accumulated Context

### Decisions

- [V2.1]: Replace evaluatorq SDK with native Orq.ai MCP create_experiment tool (task.type: "agent")
- [V2.1]: Break tester.md (771 lines) into dataset-preparer, experiment-runner, results-analyzer
- [V2.1]: Break iterator.md (544 lines) into failure-diagnoser, prompt-editor
- [V2.1]: Use MCP tools for dataset/evaluator operations with REST fallback
- [V2.1]: Intermediate JSON files as subagent handoff contracts (not in-memory state)
- [P26]: REST preferred over MCP for row upload -- MCP create_datapoints schema lacks messages top-level field
- [P26]: Smoke test mandatory before bulk upload to catch silent null-score failures
- [P26]: Role inference moved into dataset-preparer for single-pass efficiency with handoff contract
- [P27]: REST-only for experiments (LOCKED) -- skip MCP entirely for experiment creation/execution due to LOW-confidence MCP schema
- [P27]: Evaluator selection owned by experiment-runner -- reads role from dataset-prep.json, applies role-based mapping
- [P27]: Category overlays (toxicity, harmfulness) attached to ALL experiments -- results-analyzer slices by category
- [P27]: Holdout re-test mode writes to experiment-raw-holdout.json (separate file)
- [P27]: Evaluator IDs resolved at runtime via GET /v2/evaluators list-and-filter

### Blockers/Concerns

- @orq-ai/node@^3.14.45 does not exist on npm; v4.x dropped MCP binary -- all operations may fall through to REST

## Session Continuity

Last session: 2026-03-11
Stopped at: Completed 27-01-PLAN.md
Resume with: `/gsd:execute-phase 28` (or next phase)
Resume file: `.planning/phases/27-experiment-runner/27-01-SUMMARY.md`
