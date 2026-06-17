---
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
plan: 01
subsystem: api
tags: [stage-2, resolver, corroboration, typescript, vitest]

# Dependency graph
requires:
  - phase: 119-stage-2-resolver-foundation
    provides: generic resolve engine (resolveEntity, precedence steps, ResolutionConfig)
provides:
  - "Pure scoreCorroboration() + CorroborationSignal interface (corroborate.ts)"
  - "CorroborationConfig interface + optional corroboration field on ResolutionConfig"
  - "Config-gated collect-then-decide branch in resolveEntity (engine.ts)"
affects: [120-02-sales-corroboration, 120-03-config-seed, 120-04-correctness-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Config-gated capability: engine reads optional corroboration field; absent path byte-reachable verbatim (no-engine-diff protection)"
    - "Pure deterministic scorer: takes pre-fetched signals as args, no step.run/Date.now/crypto (replay-safe)"

key-files:
  created:
    - web/lib/agentic-pipeline/resolve/corroborate.ts
    - web/lib/agentic-pipeline/resolve/__tests__/corroboration-boost.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/corroboration-demote.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/corroboration-lone-signal.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/corroboration-collect.test.ts
  modified:
    - web/lib/agentic-pipeline/resolve/config.ts
    - web/lib/agentic-pipeline/resolve/engine.ts

key-decisions:
  - "AGREEMENT (D-04) evaluated BEFORE DISAGREEMENT (D-06) — agreeing >=min_signals customer boosts even when another customer carries an independent signal; disagreement-overrides-agreement deferred"
  - "min_signals floor: distinctKinds.size >= Math.max(2, config.min_signals) so a bad seed (min_signals=0) cannot auto-boost a lone signal (T-120-03)"
  - "capBelowAuto is enum-only (high->medium); never mutates a numeric threshold"
  - "isAutoEligibleStatus gate retained on boost path so a boosted candidate on a closed/re-keyed account never reaches AUTO (T-120-05)"

patterns-established:
  - "Capability-before-config: engine reads the corroboration field BEFORE any config seeds it (Pitfall 2)"
  - "Byte-reachable absent-corroboration branch keeps no-engine-diff auditable for non-opted-in swarms (D-10)"

requirements-completed: [CORR-01, CORR-02, CORR-03, CORR-04]

# Metrics
duration: ~25min
completed: 2026-06-17
---

# Phase 120-01: Engine Corroboration Capability Summary

**Config-expressible multi-signal corroboration for the generic Stage-2 resolver: pure scoreCorroboration helper (agreement boost / disagreement demote / lone-signal cap) plus a config-gated collect-then-decide branch in resolveEntity.**

## Performance

- **Duration:** ~25 min (incl. dependency install + permission recovery)
- **Completed:** 2026-06-17
- **Tasks:** 2
- **Files modified:** 7 (2 modified, 5 created)

## Accomplishments
- `CorroborationConfig` interface + optional `corroboration?` field on `ResolutionConfig` (free-form jsonb discipline, no codegen)
- Pure deterministic `scoreCorroboration()` + `CorroborationSignal` interface implementing D-04 boost, D-06 demote, D-07 lone-signal cap, with `min_signals` floor and `isAutoEligibleStatus` gate
- Config-gated `collect-then-decide` branch in `resolveEntity`: absent-corroboration path stays byte-reachable verbatim; present path collects one signal per precedence step (no short-circuit, no LLM) then scores

## Task Commits

1. **Task 1: CorroborationConfig field + pure scoreCorroboration helper** — `493451d4` (feat)
2. **Task 2: Config-gated collect-then-decide branch in the engine** — `95859d7b` (feat)

## Files Created/Modified
- `web/lib/agentic-pipeline/resolve/config.ts` — CorroborationConfig interface + optional corroboration field
- `web/lib/agentic-pipeline/resolve/corroborate.ts` — pure scoreCorroboration + CorroborationSignal
- `web/lib/agentic-pipeline/resolve/engine.ts` — config-gated collect-then-decide branch in resolveEntity
- `web/lib/agentic-pipeline/resolve/__tests__/corroboration-{boost,demote,lone-signal,collect}.test.ts` — unit proofs

## Decisions Made
- See key-decisions frontmatter. Followed plan as specified; agreement-first ordering and min_signals floor are LOCKED design choices proven by the demote test's agreement-first edge case.

## Deviations from Plan
None — plan executed as written.

## Issues Encountered
- **Environment:** `node_modules` was absent in `web/` (fresh workspace) and background subagents could not run `Bash` under the active permission mode, so the executor could not verify/commit. Resolved by installing deps (`npm ci`) and completing verification + atomic commits from the orchestrator. All code matches the plan's artifact contract.

## User Setup Required
None — no external service configuration required for this plan.

## Next Phase Readiness
- Engine corroboration capability is live and unit-proven; full resolve suite green (51 passed, 3 skipped), `tsc --noEmit` exit 0.
- Plan 120-02 can now route the sales adapter loop through the shared `scoreCorroboration` helper once its lookups return rows carrying `identifier_kind` + `is_unique_in_scope` (REST→SQL back-search migration).

---
*Phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm*
*Completed: 2026-06-17*
