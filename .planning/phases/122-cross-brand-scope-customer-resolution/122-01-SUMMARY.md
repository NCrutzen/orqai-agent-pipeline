---
phase: 122-cross-brand-scope-customer-resolution
plan: 01
subsystem: testing
tags: [vitest, resolver, cross-scope, tdd, eval-gate, confidence]

requires:
  - phase: 120-resolver-correctness
    provides: resolver-correctness-gate.ts eval harness, corroboration-*.test.ts mock pattern, debtorP0Config
provides:
  - "RED unit tests pinning cross-scope AUTO + cross_scope_misroute + suggestie + opt-out before engine code (XSCOPE-01/02)"
  - "RED numericConfidence full-mapping guard (suggestie===0.7, medium stays 0.7) (D-06)"
  - "BUCKET_C eval-gate scoring scaffold + falsifiable PASS line in RERUN-FINDINGS.md (XSCOPE-03 objective gate)"
affects: [122-02, 122-03, 122-04]

tech-stack:
  added: []
  patterns:
    - "Frozen-spec TDD: behavior is a runnable failing assertion before any engine code (VALIDATION.md)"
    - "RED via runtime assertion (not TS compile error): tests use `as unknown as` casts so vitest/esbuild strips types and the unwidened engine returns unresolved/none"

key-files:
  created:
    - web/lib/agentic-pipeline/resolve/__tests__/cross-scope-auto.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/cross-scope-suggestie.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/cross-scope-optout.test.ts
    - web/lib/pipeline-events/__tests__/numeric-confidence-suggestie.test.ts
  modified:
    - web/scripts/eval/resolver-correctness-gate.ts

key-decisions:
  - "RED is a runtime assertion failure, not a TS compile error — `as unknown as` casts keep esbuild happy; the engine returns unresolved/none at this wave"
  - "Overlap resolution in targetClass: CONFIDENT_WRONG > BUCKET_C > BUCKET_B (so #85/#95/#97 stay confident-wrong, #67/#69/#70 classify bucket-C)"
  - "Task 2b required disabling tdd-guard (user-sanctioned 'tdd-guard off'): the eval harness is an integration script with no unit test, so the guard's failing-test-first rule was unsatisfiable"

patterns-established:
  - "Falsifiable PASS line: RERUN-FINDINGS.md emits the bucket-C PASS string ONLY when zero reachable rows are high+wrong; Plan 04 must_haves grep against it"

requirements-completed: [XSCOPE-01, XSCOPE-03]

duration: 12min
completed: 2026-06-18
---

# Phase 122-01: Wave-0 RED Tests + BUCKET_C Eval Gate Summary

**Four frozen-spec RED tests (cross-scope AUTO/misroute, suggestie, opt-out, numericConfidence) plus a BUCKET_C wrong-brand scoring scaffold that makes XSCOPE-03 objective for Plan 04.**

## Performance

- **Duration:** ~12 min (executor) + checkpoint resolution
- **Tasks:** 2 (Task 1, Task 2a, Task 2b)
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments
- Three cross-scope RED unit tests pinning Plan 02+03's contract (`suggestie` Confidence value, `cross_scope_misroute` annotation) before any engine code exists
- numericConfidence full-mapping RED guard: asserts `suggestie===0.7` (RED) while `medium===0.7` stays GREEN — pins that suggestie reuses the medium numeric slot without displacing it
- Extended `resolver-correctness-gate.ts` with a BUCKET_C set (9 wrong-brand rows), a `targetClass` branch, a `bucketCResolvedOrDemoted` filter, a console line, and a falsifiable PASS line + table in the generated RERUN-FINDINGS.md

## Task Commits

1. **Task 1: RED cross-scope AUTO + suggestie + opt-out tests** — `0ae142e9` (test)
2. **Task 2a: RED numericConfidence suggestie full-mapping guard** — `fdd5d645` (test)
3. **Task 2b: BUCKET_C eval-gate scoring scaffold** — `235a50d3` (test)

All committed with hooks (no `--no-verify`).

## RED failure modes (GREEN target for Plan 02+03)

| Test | RED assertions | Reason | GREEN by |
|---|---|---|---|
| cross-scope-auto.test.ts | `confidence==="high"` + non-null `cross_scope_misroute` | engine returns `unresolved`/`none`; `cross_scope_misroute` absent on type | Plan 02 (type) + Plan 03 (engine) |
| cross-scope-suggestie.test.ts | `confidence==="suggestie"` (≥2 roots, lone-weak, disagreeing) | `Confidence` has no `"suggestie"` value yet | Plan 02 + 03 |
| cross-scope-optout.test.ts | (GREEN guards) byte-identical SUGGEST drop, no misroute field | already satisfied at today's behavior — guards Pitfall 1 (no-engine-diff) | stays GREEN |
| numeric-confidence-suggestie.test.ts | `numericConfidence("suggestie")===0.7` (high/medium/low/none GREEN) | helper has no `"suggestie"` case | Plan 02 |

RED is a **runtime assertion failure**, not a TS compile error (tests cast via `as unknown as`). Net at this wave: 5 failing RED assertions + 3 green guards.

## Decisions Made
- See key-decisions frontmatter. The tdd-guard toggle was the one notable deviation (below).

## Deviations from Plan

### Checkpoint: tdd-guard blocked Task 2b (eval harness edit)

- **Found during:** Task 2b (BUCKET_C eval-gate extension)
- **Issue:** tdd-guard rejected the edit to `resolver-correctness-gate.ts` (net-new runtime behavior in a non-test file with no failing test). The eval harness is an integration script with no unit test, so the guard's "failing test first" rule was unsatisfiable; the auto-classifier also refused a scoped `ignorePatterns` exemption.
- **Resolution:** User selected the guard's sanctioned mid-session toggle ("tdd-guard off"). Orchestrator set `guardEnabled: false` in `.claude/tdd-guard/data/config.json`, the edit was made, committed with hooks, and the guard is re-enabled by the orchestrator after this plan.
- **Verification:** `grep -c "BUCKET_C\|bucketCResolvedOrDemoted\|bucket-C"` → 20; eval script tsc-compiles with no new errors.

## Issues Encountered
- None beyond the tdd-guard checkpoint above.

## Next Phase Readiness
- Plan 02 GREEN targets are documented in the RED-failure-modes table above. The `suggestie` Confidence value, `cross_scope_misroute` field, and `CrossScopeConfig` are the contracts to land.
- Eval gate is read-only scaffold; the live bucket-C re-run is deferred to Plan 04 (XSCOPE-03).

---
*Phase: 122-cross-brand-scope-customer-resolution*
*Completed: 2026-06-18*
