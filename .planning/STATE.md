# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- without touching a terminal or needing technical knowledge.
**Current focus:** V2.1 Experiment Pipeline Restructure -- Phase 26 (Dataset Preparer)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V3.0-V5.0 defined

## Current Position

Phase: 26 of 32 (Dataset Preparer)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-10 -- Roadmap created for V2.1 (7 phases, 24 requirements)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

### Decisions

- [V2.1]: Replace evaluatorq SDK with native Orq.ai MCP create_experiment tool (task.type: "agent")
- [V2.1]: Break tester.md (771 lines) into dataset-preparer, experiment-runner, results-analyzer
- [V2.1]: Break iterator.md (544 lines) into failure-diagnoser, prompt-editor
- [V2.1]: Use MCP tools for dataset/evaluator operations with REST fallback
- [V2.1]: Intermediate JSON files as subagent handoff contracts (not in-memory state)

### Blockers/Concerns

- MCP tool signatures for create_experiment, create_datapoints are LOW confidence -- must verify against live MCP server during Phase 27
- @orq-ai/node@^3.14.45 does not exist on npm; v4.x dropped MCP binary -- all operations may fall through to REST
- Dataset rows currently missing required `messages` field -- root cause of experiment timeouts (fix in Phase 26)

## Session Continuity

Last session: 2026-03-10
Stopped at: Roadmap created for V2.1 milestone (7 phases, 24 requirements mapped)
Resume with: `/gsd:plan-phase 26`
