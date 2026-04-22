---
phase: 26-dataset-preparer
plan: 01
subsystem: testing
tags: [dataset, orqai, mcp, rest, augmentation, stratified-split, smoke-test]

# Dependency graph
requires:
  - phase: deployer
    provides: MCP-first/REST-fallback pattern, retry/backoff logic, YAML frontmatter annotation
provides:
  - dataset-preparer.md subagent with 8 internal phases
  - dataset-prep.json handoff contract schema for downstream subagents
affects: [experiment-runner, results-analyzer, prompt-editor]

# Tech tracking
tech-stack:
  added: []
  patterns: [MCP-first with selective REST override for row upload, smoke test before bulk upload, JSON file handoff contracts between subagents]

key-files:
  created: [orq-agent/agents/dataset-preparer.md]
  modified: []

key-decisions:
  - "REST preferred over MCP for row upload because MCP create_datapoints schema lacks messages top-level field"
  - "Smoke test is mandatory before bulk upload to catch silent null-score failures from missing messages field"
  - "Role inference moved into dataset-preparer (Phase 7) for single-pass efficiency with handoff contract"

patterns-established:
  - "Selective REST override: MCP-first for dataset creation, REST-preferred for operations where MCP schema is incomplete"
  - "Smoke test pattern: upload 1 row, run mini-experiment, verify non-null scores before committing to bulk upload"
  - "JSON handoff contracts: subagents write structured JSON files consumed by downstream subagents instead of in-memory state"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05]

# Metrics
duration: 2min
completed: 2026-03-11
---

# Phase 26 Plan 01: Dataset Preparer Summary

**258-line dataset-preparer.md subagent with 8 phases: pre-check, parse, augment, split, smoke-test, upload (REST-preferred for messages field), role inference, and JSON handoff contract**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-11T12:21:11Z
- **Completed:** 2026-03-11T12:23:37Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Created dataset-preparer.md (258 lines) extracting dataset preparation from the 771-line monolithic tester.md
- All 8 internal phases documented with clear, actionable instructions for the executing Claude agent
- Smoke test phase explicitly verifies non-null evaluator scores before bulk upload (fixes root cause of experiment timeouts)
- dataset-prep.json contract schema matches the 26-RESEARCH.md specification exactly
- 5 anti-patterns documented to prevent known pitfalls (SDK version, parallel uploads, messages placement, smoke test skip, output copying)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dataset-preparer.md with all 8 internal phases** - `06ce4fa` (feat)
2. **Task 2: Validate against requirements and tester.md extraction** - No changes needed (validation-only task, all requirements verified as covered)

## Files Created/Modified
- `orq-agent/agents/dataset-preparer.md` - Complete Claude Code subagent prompt for dataset preparation pipeline

## Decisions Made
- REST preferred for row upload over MCP because MCP `create_datapoints` schema lacks the `messages` top-level field that the experiment engine requires
- Smoke test uses the first agent passing pre-check (has `orqai_id`), with agent-key filter override
- Role inference placed in Phase 7 (after upload) to keep data pipeline phases sequential before writing the handoff contract

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- dataset-preparer.md ready for use by the rewritten test command (Phase 29)
- dataset-prep.json contract schema ready for experiment-runner (Phase 27) to consume
- MCP tool signatures for create_experiment remain LOW confidence -- must verify during Phase 27 execution

## Self-Check: PASSED

- FOUND: orq-agent/agents/dataset-preparer.md
- FOUND: commit 06ce4fa

---
*Phase: 26-dataset-preparer*
*Completed: 2026-03-11*
