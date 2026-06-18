---
phase: 122-cross-brand-scope-customer-resolution
plan: 02
subsystem: resolver
tags: [resolver, cross-scope, confidence, suggestie, types, contracts]

requires:
  - phase: 122-cross-brand-scope-customer-resolution
    plan: 01
    provides: "RED unit tests pinning suggestie + cross_scope_misroute + numericConfidence mapping"
provides:
  - "Confidence 5th value `suggestie` (D-06 4-tier operator scale) on engine.ts"
  - "ResolveResult.cross_scope_misroute? emit-only annotation (D-09)"
  - "CrossScopeConfig + ResolutionConfig.cross_scope? sub-config (D-10)"
  - "numericConfidence projects suggestie -> 0.7; widened worker confidence casts"
affects: [122-03, 122-04]

tech-stack:
  added: []
  patterns:
    - "Build-against-blueprints: contracts (types + numeric projection) land before engine logic so Plan 03 never reverse-engineers them"
    - "suggestie reuses the medium 0.7 numeric slot as a DISTINCT value — read path needs zero numeric change (D-07)"

key-files:
  created:
    - .planning/phases/122-cross-brand-scope-customer-resolution/122-02-SUMMARY.md
  modified:
    - web/lib/agentic-pipeline/resolve/engine.ts
    - web/lib/agentic-pipeline/resolve/config.ts
    - web/lib/pipeline-events/types.ts
    - web/lib/inngest/functions/stage-2-customer-resolver.ts

key-decisions:
  - "numericConfidence: the `suggestie` branch is placed BEFORE the `medium` branch and returns the same 0.7 — explicit separate branches, not a fall-through, so a future displacement names exactly which tier broke"
  - "Pitfall-4 audit: only the stage-2 worker uses an explicit `as \"high\"|...|\"none\"` cast on result.confidence; the other two numericConfidence callsites pass narrower subset types and stay assignable under the widened union (no edit needed)"

requirements-completed: [XSCOPE-02, XSCOPE-01]

duration: 8min
completed: 2026-06-18
---

# Phase 122 Plan 02: suggestie Confidence + cross-scope contracts Summary

**Landed the type/contract layer Phase 122 needs — the `suggestie` Confidence value (D-06), the emit-only `cross_scope_misroute` annotation (D-09), and the `CrossScopeConfig` sub-config (D-10) — and widened `numericConfidence` + the worker casts so `suggestie` projects to 0.7, turning the Plan-01 numericConfidence RED test GREEN.**

## Performance

- **Duration:** ~8 min (continuation executor; Task 1 was already committed `b1c00d9c`)
- **Tasks:** 2 (Task 1 pre-completed; Task 2 executed this session)
- **Files modified:** 4

## Accomplishments

- **Task 1 (pre-completed, `b1c00d9c`):** `Confidence` union += `"suggestie"`; `ResolveResult.cross_scope_misroute?` emit-only field; `EngineConfig` Partial Pick += `"cross_scope"`; `CrossScopeConfig` interface + `ResolutionConfig.cross_scope?` in config.ts. Verified present this session (engine.ts:86 has `suggestie`; config.ts has 2 `CrossScopeConfig` references).
- **Task 2 (this session, `8cef3fbb`):** widened `numericConfidence` param union to include `"suggestie"` and added `if (v === "suggestie") return 0.7;`; updated the JSDoc tier table (already carried the 4-tier scale from a prior edit, confirmed accurate). Widened both worker `result.confidence as ...` casts in `stage-2-customer-resolver.ts` to include `"suggestie"`.

## Task Commits

1. **Task 1: suggestie Confidence + cross_scope_misroute + CrossScopeConfig** — `b1c00d9c` (feat) — *pre-completed before this session*
2. **Task 2: widen numericConfidence + worker confidence casts for suggestie** — `8cef3fbb` (feat)

All committed with hooks (no `--no-verify`).

## Pitfall-4 audit trail (every union / numericConfidence callsite reviewed)

| Callsite | Action | Why |
|---|---|---|
| `lib/pipeline-events/types.ts:122` numericConfidence param union | **WIDENED** + added `suggestie` branch | The projection helper; now returns 0.7 for suggestie |
| `lib/inngest/functions/stage-2-customer-resolver.ts:~425` cast | **WIDENED** to add `"suggestie"` | Explicit `as "high"|...|"none"` cast on `result.confidence`; would have dropped suggestie to the `none` arm |
| `lib/inngest/functions/stage-2-customer-resolver.ts:~581` cast | **WIDENED** to add `"suggestie"` | Same explicit cast, second emit site |
| `lib/inngest/functions/classifier-screen-worker.ts:465` | **NO CHANGE** | Passes `llmConfidence: "low"|"medium"|"high"|null` — a strict subset of the widened union, stays assignable |
| `lib/inngest/functions/debtor-email-coordinator.ts:381` | **NO CHANGE** | Passes `top.confidence` (coordinator confidence, no `suggestie` producible) — assignable under the widened union |
| `engine.ts:86` `Confidence` union | landed in Task 1 (`b1c00d9c`) | The source-of-truth enum that gained `suggestie` |

No exhaustive `switch` over Confidence exists in the resolve tree that would silently drop the new tier; the only exhaustive projection is `numericConfidence`, now handled.

## Verification

- `npx vitest run lib/pipeline-events/__tests__/numeric-confidence-suggestie.test.ts` → **GREEN** (1 passed). `numericConfidence("suggestie") === 0.7` and `numericConfidence("medium") === 0.7` both hold — no displacement (D-06 regression guard satisfied).
- `npx tsc --noEmit -p tsconfig.json` → **no error** referencing `numericConfidence`, `pipeline-events/types`, the worker casts, `engine.ts`, or `config.ts`.
- `grep "swarm_type ===|swarm ===" lib/agentic-pipeline/resolve/` → **none** (SWARM-02 holds; no swarm-name branch introduced).
- Full `lib/pipeline-events` + `lib/agentic-pipeline/resolve` suites: **75 passed, 3 skipped, 4 failed** — all 4 failures are in `cross-scope-auto.test.ts` and `cross-scope-suggestie.test.ts`, failing on **logic assertions** (`expected 'none' to be 'suggestie'` / `'high'`), NOT on missing types or tsc errors.

## Plan-01 cross-scope tests: now fail only on LOGIC (not types)

Confirmed per the plan's `<output>` requirement: the cross-scope tests (`cross-scope-auto.test.ts`, `cross-scope-suggestie.test.ts`) no longer fail on missing `suggestie`/`cross_scope_misroute` types — they compile and run, and fail purely because the engine returns `none`/`unresolved` (no cross-scope decision logic yet). That decision logic is **Plan 03's GREEN target**. `cross-scope-optout.test.ts` is GREEN. `numeric-confidence-suggestie.test.ts` is GREEN.

## Deviations from Plan

None — Task 2 executed exactly as written. Task 1 was already committed (`b1c00d9c`) before this session per the orchestrator handoff; verified present and consistent with the plan's Task 1 acceptance criteria.

## Issues Encountered

- None.

## Next Phase Readiness

- The `suggestie` Confidence value, `cross_scope_misroute` annotation, and `CrossScopeConfig` types exist and compile; Plan 03 can type its cross-scope helper + drop-site wiring against them. The two cross-scope RED tests are the precise GREEN target for Plan 03 (root-uniqueness D-08, strong-kind/corroboration bar D-03/D-04).

## Self-Check: PASSED

- FOUND: web/lib/pipeline-events/types.ts
- FOUND: web/lib/inngest/functions/stage-2-customer-resolver.ts
- FOUND commit: 8cef3fbb (Task 2)
- FOUND commit: b1c00d9c (Task 1)

---
*Phase: 122-cross-brand-scope-customer-resolution*
*Completed: 2026-06-18*
