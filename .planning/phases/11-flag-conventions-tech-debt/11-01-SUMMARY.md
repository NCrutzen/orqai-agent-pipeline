---
phase: 11-flag-conventions-tech-debt
plan: 01
subsystem: cli
tags: [flag-conventions, tech-debt, orchestrator, commands]

# Dependency graph
requires:
  - phase: 09-guardrails-and-hardening
    provides: harden.md command with positional arg syntax
provides:
  - Consistent --agent flag convention across all commands
  - Sequential step numbering in orchestrator (0-7)
  - TOOLS.md passed to Wave 3 dataset-gen and readme-gen
  - agentic-patterns.md in orchestration-generator files_to_read
affects: [orq-agent commands, orchestrator pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: [flag-only CLI convention for per-agent workflows]

key-files:
  created: []
  modified:
    - orq-agent/commands/harden.md
    - orq-agent/commands/test.md
    - orq-agent/commands/iterate.md
    - orq-agent/commands/orq-agent.md
    - orq-agent/agents/orchestration-generator.md
    - .planning/STATE.md

key-decisions:
  - "All commands use --agent flag exclusively (no positional args)"
  - "Step numbering sequential 0-7 with Tool Resolver at Step 5"

patterns-established:
  - "Flag convention: --agent {key} for per-agent, --all for explicit full swarm"

requirements-completed: [GUARD-03]

# Metrics
duration: 3min
completed: 2026-03-02
---

# Phase 11 Plan 01: Flag Conventions and Tech Debt Summary

**Unified --agent flag convention across all commands, sequential orchestrator step numbering (0-7), and TOOLS.md/agentic-patterns.md reference fixes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T10:10:45Z
- **Completed:** 2026-03-02T10:14:01Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Aligned harden.md to --agent flag convention with --all support (matching deploy/test/iterate)
- Removed all positional argument references and backward compatibility notes from test.md and iterate.md
- Renumbered orchestrator steps from 5.5/5/6 to sequential 5/6/7
- Added TOOLS.md to Wave 3 dataset-generator and readme-generator inputs
- Added agentic-patterns.md to orchestration-generator files_to_read
- Updated STATE.md decision and marked all v0.3 tech debt as resolved

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix flag conventions, step numbering, and files_to_read references** - `0371bb4` (feat)
2. **Task 2: Consistency sweep and STATE.md update** - `f7391a0` (chore)

## Files Created/Modified
- `orq-agent/commands/harden.md` - Changed from positional [agent-key] to --agent flag convention
- `orq-agent/commands/test.md` - Removed positional arg and backward compat notes
- `orq-agent/commands/iterate.md` - Removed positional arg and backward compat notes
- `orq-agent/commands/orq-agent.md` - Renumbered steps 5.5->5, 5->6, 6->7; added TOOLS.md to Wave 3
- `orq-agent/agents/orchestration-generator.md` - Added agentic-patterns.md to files_to_read
- `.planning/STATE.md` - Updated decision and marked tech debt resolved

## Decisions Made
- All commands use --agent flag exclusively for per-agent workflows (no positional args)
- Step 5.5 in hardener.md left untouched (different file, own internal numbering)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All v0.3 tech debt items resolved
- CLI flag conventions fully consistent across deploy, test, iterate, harden
- Orchestrator pipeline references complete

---
*Phase: 11-flag-conventions-tech-debt*
*Completed: 2026-03-02*
