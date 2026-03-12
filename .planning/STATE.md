---
gsd_state_version: 1.0
milestone: v0.3
milestone_name: milestone
status: unknown
last_updated: "2026-03-12T19:10:22.000Z"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 7
  completed_plans: 7
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** Any colleague can go from a use case description to deployed, tested agents on Orq.ai -- without touching a terminal or needing technical knowledge.
**Current focus:** V2.1 Experiment Pipeline Restructure -- Phase 31 (Prompt Editor)
**Previous milestones:** v0.3 shipped 2026-03-01 (11 phases, 28 plans), V2.0 shipped 2026-03-02 (7 phases, 11 plans), V3.0-V5.0 defined

## Current Position

Phase: 31 of 32 (Prompt Editor)
Plan: 1 of 1 in current phase
Status: Phase 31 complete
Last activity: 2026-03-12 -- Completed 31-01-PLAN.md (prompt-editor subagent)

Progress: [##########] 100% (Phase 31)

## Performance Metrics

**Velocity:**
- Total plans completed: 7
- Average duration: 2.3min
- Total execution time: 16min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 26 | 1 | 2min | 2min |
| 27 | 1 | 3min | 3min |
| 28 | 1 | 3min | 3min |
| 29 | 1 | 2min | 2min |
| 30 | 2 | 4min | 2min |
| 31 | 1 | 2min | 2min |

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
- [Phase 30]: Spec file path convention: {swarm_dir}/agents/{agent_key}.md with Glob fallback for non-standard layouts
- [Phase 31]: Evaluator IDs passed through from test-results.json to experiment-runner to skip re-resolution during holdout re-test
- [Phase 31]: Before scores snapshotted in memory before test-results.json update, preserving original values in comparison display
- [Phase 31]: Anti-pattern text reworded to avoid literal 'dataset-preparer' string for grep verification compatibility

### Blockers/Concerns

- @orq-ai/node@^3.14.45 does not exist on npm; v4.x dropped MCP binary -- all operations may fall through to REST

## Session Continuity

Last session: 2026-03-12
Stopped at: Completed 31-01-PLAN.md
Resume with: `/gsd:execute-phase 32` (or next phase)
Resume file: `.planning/phases/31-prompt-editor/31-01-SUMMARY.md`
