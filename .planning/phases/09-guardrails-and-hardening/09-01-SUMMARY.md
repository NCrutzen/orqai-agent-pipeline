---
phase: 09-guardrails-and-hardening
plan: 01
subsystem: pipeline
tags: [guardrails, quality-gates, orqai-api, evaluators, hardening]

# Dependency graph
requires:
  - phase: 08-prompt-iteration-loop
    provides: Iterator subagent and iterate command for prompt improvement
  - phase: 07-automated-testing
    provides: Tester subagent producing test-results.json with per-agent scores
  - phase: 06-orqai-deployment
    provides: Deployer subagent with MCP-first/REST-fallback and YAML frontmatter annotation
provides:
  - Hardener subagent with 6-phase pipeline for guardrail promotion and quality gates
  - /orq-agent:harden command for guardrail setup
  - quality-report.json template for structured quality gate results
affects: [09-02 incremental deployment, skill documentation]

# Tech tracking
tech-stack:
  added: []
  patterns: [guardrail promotion from test data, quality gate pre-deploy check, smart defaults per evaluator type]

key-files:
  created:
    - orq-agent/agents/hardener.md
    - orq-agent/commands/harden.md
    - orq-agent/templates/quality-report.json
  modified: []

key-decisions:
  - "Guardrail config stored in ## Guardrails markdown section in agent spec files (not YAML frontmatter) -- consistent with multi-field config pattern"
  - "Severity and threshold are application-layer fields stored in spec files only -- NOT sent to Orq.ai API (API accepts only id, execute_on, sample_rate)"
  - "Pre-built guardrails (orq_pii_detection, orq_harmful_moderation, orq_sexual_moderation) always suggested for conversational/hybrid agents"

patterns-established:
  - "Hardener subagent pattern: 6-phase pipeline matching deployer/tester/iterator structural conventions"
  - "Harden command pattern: 7-step command matching deploy/test/iterate structural conventions"
  - "Quality gate check: application-layer pre-deploy check comparing test scores against configurable thresholds"

requirements-completed: [GUARD-01, GUARD-02]

# Metrics
duration: 4min
completed: 2026-03-01
---

# Phase 9 Plan 01: Guardrails and Quality Gates Summary

**Hardener subagent with data-driven guardrail promotion from test results, HITL approval, native Orq.ai settings.guardrails attachment, and quality gate enforcement with configurable severity levels**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-01T17:17:23Z
- **Completed:** 2026-03-01T17:21:29Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Created hardener subagent with 6-phase pipeline: analyze test results, suggest guardrails with smart defaults, collect user approval (HITL), write config to spec files, attach via Orq.ai API, run quality gate checks
- Created /orq-agent:harden command with 7-step pipeline matching deploy/test/iterate structural pattern
- Created quality-report.json template for structured quality gate results with per-agent guardrail and production-readiness data

## Task Commits

Each task was committed atomically:

1. **Task 1: Create hardener subagent** - `035046c` (feat)
2. **Task 2: Create harden command** - `fec382b` (feat)

## Files Created/Modified
- `orq-agent/agents/hardener.md` - Hardener subagent with 6-phase guardrail promotion pipeline (498 lines)
- `orq-agent/commands/harden.md` - /orq-agent:harden command with capability gate, MCP check, subagent invocation (283 lines)
- `orq-agent/templates/quality-report.json` - Quality report template for structured output (32 lines)

## Decisions Made
- Guardrail config stored as `## Guardrails` markdown section in agent spec files (not YAML frontmatter) -- multi-field entries are cleaner in markdown table format
- Severity and threshold fields are application-layer only (stored in spec file) -- Orq.ai API guardrails array only accepts id, execute_on, sample_rate
- Pre-built guardrails (orq_pii_detection, orq_harmful_moderation, orq_sexual_moderation) always suggested for conversational/hybrid agents regardless of test results

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Hardener subagent and harden command ready for Phase 9 Plan 02 (incremental deployment with --agent flags)
- All four pipeline stages complete: deploy > test > iterate > harden
- Quality gate integration ready for deploy workflow enhancement

---
*Phase: 09-guardrails-and-hardening*
*Completed: 2026-03-01*
