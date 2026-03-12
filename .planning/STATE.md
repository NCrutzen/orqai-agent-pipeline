---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: unknown
last_updated: "2026-03-12T17:52:19Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- without touching a terminal or needing technical knowledge.
**Current focus:** V2.1 Experiment Pipeline Restructure -- Phase 30 (Failure Diagnoser)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V3.0-V5.0 defined

## Current Position

Phase: 30 of 32 (Failure Diagnoser)
Plan: 1 of 1 in current phase
Status: Phase 30 complete
Last activity: 2026-03-12 -- Completed 30-01-PLAN.md (failure-diagnoser subagent with 5-phase pipeline)

Progress: [##########] 100% (Phase 30)

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 2.6min
- Total execution time: 13min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 26 | 1 | 2min | 2min |
| 27 | 1 | 3min | 3min |
| 28 | 1 | 3min | 3min |
| 29 | 1 | 2min | 2min |
| 30 | 1 | 3min | 3min |

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
- [P28]: Student's t-distribution (t=4.303, df=2) for 95% CI -- correct for small n=3 samples
- [P28]: Role-based thresholds applied uniformly to all evaluators (no per-evaluator exceptions)
- [P28]: Category breakdown in test-results.md only, never in terminal output (LOCKED)
- [P28]: Scale normalization for worst-case ranking only -- reported scores stay in original scale
- [P28]: Field mapping: experiment-raw.json 'output' -> test-results.json 'actual_output'
- [Phase 29]: Removed old Step 4 (Pre-check Deployment) -- dataset-preparer Phase 1 handles deployment verification
- [Phase 29]: mcp_available forwarded to dataset-preparer only -- experiment-runner REST-only (LOCKED P27), results-analyzer no API calls
- [Phase 29]: Stale file cleanup includes test-results.md alongside 3 JSON handoff files
- [Phase 30]: Failure-diagnoser writes iteration-proposals.json but never modifies spec files (scope boundary with prompt-editor)
- [Phase 30]: Guardrail violations diagnosed with higher priority before regular evaluator failures
- [Phase 30]: Both approved and rejected agents included in iteration-proposals.json for complete audit trail
- [Phase 30]: Agents without XML tags get structural improvement proposal (add XML tags around logical sections)

### Blockers/Concerns

- @orq-ai/node@^3.14.45 does not exist on npm; v4.x dropped MCP binary -- all operations may fall through to REST

## Session Continuity

Last session: 2026-03-12
Stopped at: Completed 30-01-PLAN.md
Resume with: `/gsd:execute-phase 31` (or next phase)
Resume file: `.planning/phases/30-failure-diagnoser/30-01-SUMMARY.md`
