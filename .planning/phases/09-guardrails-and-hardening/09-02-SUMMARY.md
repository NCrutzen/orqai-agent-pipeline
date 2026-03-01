---
phase: 09-guardrails-and-hardening
plan: 02
subsystem: commands
tags: [agent-flag, deploy, test, iterate, harden, guardrails, skill-index]

# Dependency graph
requires:
  - phase: 08-prompt-iteration-loop
    provides: "Iterator subagent with Phase 2 diagnosis pipeline"
  - phase: 09-guardrails-and-hardening/01
    provides: "Harden command and hardener subagent definitions"
provides:
  - "--agent flag on deploy/test/iterate for per-agent incremental operations"
  - "Interactive agent picker on deploy when no --agent flag"
  - "SKILL.md updated with Phase 9 harden command, hardener, quality-report, command flags"
  - "Iterator guardrail violation feedback in diagnosis phase"
affects: [guardrails, deployment, testing, iteration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["--agent flag for per-agent scoping across commands", "interactive picker for deploy scope selection", "guardrail violation priority in iterator diagnosis"]

key-files:
  created: []
  modified:
    - "orq-agent/commands/deploy.md"
    - "orq-agent/commands/test.md"
    - "orq-agent/commands/iterate.md"
    - "orq-agent/SKILL.md"
    - "orq-agent/agents/iterator.md"

key-decisions:
  - "Deploy shows interactive picker when no --agent flag (LOCKED from CONTEXT.md)"
  - "Test and iterate support both positional arg and --agent flag for backward compatibility"
  - "Auto-deploy tool dependencies when deploying single agent"
  - "Guardrail violations surfaced with higher priority than regular evaluator failures in iterator"

patterns-established:
  - "--agent flag pattern: consistent across deploy, test, iterate, harden commands"
  - "--all flag: explicit full-swarm mode on test/iterate/harden"
  - "Guardrail violation feedback: iterator checks agent guardrails section before standard diagnosis"

requirements-completed: [GUARD-03]

# Metrics
duration: 3min
completed: 2026-03-01
---

# Phase 9 Plan 02: Per-Agent Flags and SKILL.md Updates Summary

**--agent flag added to deploy/test/iterate for incremental per-agent operations, SKILL.md updated with Phase 9 harden command and command flags table, iterator enhanced with guardrail violation feedback**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-01T17:17:25Z
- **Completed:** 2026-03-01T17:20:11Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added --agent flag to deploy, test, and iterate commands for per-agent incremental operations
- Deploy command shows interactive agent picker when no --agent flag is provided
- SKILL.md updated with harden command, hardener subagent, quality-report.json template, Command Flags section, and Phase 9 subagents table
- Iterator Phase 2 diagnosis now checks for guardrail violations with higher priority before standard evaluator failure analysis

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --agent flag to deploy, test, and iterate commands** - `886c53f` (feat)
2. **Task 2: Update SKILL.md and iterator guardrail integration** - `abe42b3` (feat)

## Files Created/Modified
- `orq-agent/commands/deploy.md` - Added --agent flag, interactive picker, scoped deployment with tool dependencies
- `orq-agent/commands/test.md` - Added --agent flag (backward compatible with positional arg), --all flag
- `orq-agent/commands/iterate.md` - Added --agent flag (backward compatible with positional arg), --all flag
- `orq-agent/SKILL.md` - Added harden command, hardener subagent, quality-report.json, Command Flags section, Phase 9 subagents table, updated capability tiers
- `orq-agent/agents/iterator.md` - Added guardrail violation checking in Phase 2 diagnosis (Step 2.2a)

## Decisions Made
- Deploy interactive picker is the default when no --agent flag (LOCKED decision from CONTEXT.md)
- Both positional arg and --agent flag supported on test/iterate for backward compatibility
- Tool dependencies auto-deployed when using --agent on deploy (no separate tool deploy needed)
- Guardrail violations are surfaced with higher priority than regular evaluator failures in iterator diagnosis

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three commands (deploy, test, iterate) support per-agent operations via --agent flag
- SKILL.md is a complete index of all commands, agents, and templates including Phase 9
- Iterator feeds guardrail violations into analysis for tighter feedback loop
- Ready for Phase 9 completion or further guardrails work

---
*Phase: 09-guardrails-and-hardening*
*Completed: 2026-03-01*
