---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 01
subsystem: api
tags: [stage-2, entity-resolution, cherry-pick, inngest, nxt, registry-dispatch, resolveEntity]

# Dependency graph
requires:
  - phase: 90 (v8.2 donor branch workspace/v8.2-resolution-recall)
    provides: RESL-03 generic resolveEntity engine + loadStage2Resolver dispatch seam + debtor config+adapter refactor (28-test-green on donor)
provides:
  - Generic resolveEntity engine (LOCKED contract home) present in this workspace
  - loadStage2Resolver dispatch + STAGE2_RESOLVER_MODULES static map present in this workspace
  - debtor resolve-debtor.ts in config+adapter form (debtorP0Config + delegate), behaviour-neutral
  - Donor seam test suite running green in this workspace (port-equivalence + dispatch pass)
affects: [114-02, 114-03, 114-04, 114-05, sales-email-stage-2, no-engine-diff-check]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Registry-driven Stage 2 resolver dispatch via STATIC import map (bundler-safe; STAGE2_RESOLVER_MODULES)"
    - "Generic config-ordered resolveEntity engine; auto_safe_kinds:[] = self-auth no-op (STAGE2-02)"
    - "config+adapter resolver shape: debtorP0Config + thin adapter delegating to engine; LOCKED contract re-exported for back-compat"

key-files:
  created:
    - web/lib/swarms/dynamic.ts
    - web/lib/agentic-pipeline/resolve/engine.ts
    - web/lib/agentic-pipeline/resolve/config.ts
    - web/lib/agentic-pipeline/resolve/body-source.ts
    - web/lib/agentic-pipeline/resolve/forward-rate-paths.ts
    - web/lib/agentic-pipeline/resolve/steps/thread-inheritance.ts
    - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
    - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
    - web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/dispatch.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/body-source-selection.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/conversation-id-forward-rate.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/resolution-blocklists-seed.test.ts
  modified:
    - web/lib/automations/debtor-email/resolve-debtor.ts

key-decisions:
  - "D-03 dormant honored: Stage 2 worker keeps its static resolveDebtor import; no rewire, no sales-email branch"
  - "resolution-blocklists-seed.test.ts skipped (describe.skip + no-op loader stub) — debtor-track donor 20260601b, out of enabler-PR scope (D-01)"
  - "No donor migrations copied — resolution_config column already exists live (Phase 110 enrichment migration)"

patterns-established:
  - "Verbatim cherry-pick via git show donor:path > path — transplant, never rebuild the seam (RESEARCH Pitfall 1)"
  - "Behaviour-neutrality gate via port-equivalence.test.ts after transplant"

requirements-completed: [STAGE2-01, STAGE2-02]

# Metrics
duration: 5min
completed: 2026-06-04
---

# Phase 114 Plan 01: Stage 2 Resolver Seam Transplant Summary

**Transplanted the v8.2 RESL-03 resolver seam (generic resolveEntity engine + loadStage2Resolver dispatch + debtor config+adapter refactor + donor test suite) verbatim into this workspace, with the donor seam suite green (port-equivalence + dispatch pass) proving behaviour-neutrality.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-04T14:38:31Z
- **Completed:** 2026-06-04T14:43:10Z
- **Tasks:** 3
- **Files modified:** 15 (14 created + 1 refactored)

## Accomplishments
- 14 donor seam files (8 source + 6 test) cherry-picked verbatim from `origin/workspace/v8.2-resolution-recall` — no logic rebuilt
- `resolve-debtor.ts` refactored to the donor config+adapter form (`debtorP0Config` + thin adapter delegating to `resolveEntity`), behaviour-neutral; all debtor importers typecheck clean (full `tsc --noEmit` = 0 errors)
- Donor seam suite green in this workspace: 5 files pass / 1 skipped (16 tests pass / 3 skipped); `port-equivalence.test.ts` + `dispatch.test.ts` both green
- Stage 2 worker left un-rewired (D-03 dormant) — keeps its static `resolveDebtor` import; zero `if swarm === 'sales-email'` branches introduced

## Task Commits

1. **Task 1: Transplant the 14 donor seam files verbatim** - `da9ab1c5` (feat)
2. **Task 2: Apply the resolve-debtor.ts config+adapter refactor + reconcile importers** - `297f78c7` (refactor)
3. **Task 3: Run the donor seam suite green (behaviour-neutrality gate)** - `f1e18462` (test)

## Files Created/Modified
- `web/lib/swarms/dynamic.ts` - loadStage2Resolver dispatch + STAGE2_RESOLVER_MODULES static map (60s TTL cache, last-known-good, fail-loud Stage2ResolverLoadError)
- `web/lib/agentic-pipeline/resolve/engine.ts` - generic resolveEntity engine, LOCKED contract home; auto_safe_kinds:[] = self-auth no-op
- `web/lib/agentic-pipeline/resolve/config.ts` - ResolutionConfig TS mirror (free-form jsonb, no codegen)
- `web/lib/agentic-pipeline/resolve/body-source.ts` - per-source body selection helper (pure, replay-safe)
- `web/lib/agentic-pipeline/resolve/forward-rate-paths.ts` - forward-rate path helper (transplanted with the seam)
- `web/lib/agentic-pipeline/resolve/steps/{thread-inheritance,sender-match,identifier-match}.ts` - the ported 4-layer step modules
- `web/lib/agentic-pipeline/resolve/__tests__/*.test.ts` - 6 donor test files (self-auth-noop, port-equivalence, dispatch, body-source-selection, conversation-id-forward-rate, resolution-blocklists-seed)
- `web/lib/automations/debtor-email/resolve-debtor.ts` - now config+adapter: debtorP0Config + resolveDebtor delegating to resolveEntity; re-exports LOCKED contract + resolveEntity (393 deletions of inline pipeline → 77 insertions)

## Decisions Made
- **D-03 dormant** (default recommendation honored): the Stage 2 worker keeps its static `resolveDebtor` import. resolve-debtor remains a re-export shim so all importers (stage-2 worker, resolver-trace, label-email route) keep working unchanged. No worker rewire, no equality dry-run harness needed in this plan.
- **No donor migrations transplanted:** the `resolution_config` column already exists live (added by `20260603_sales_swarm_full_funnel_enrichment.sql`); donor `20260601a..f` are debtor-track / SQL-substrate cutover, HELD per D-01.

## Deviations from Plan

None - plan executed exactly as written.

The `resolution-blocklists-seed.test.ts` skip was anticipated and prescribed by the plan (Task 1 note): the test imports `../blocklists` (the debtor-track loader from donor `20260601b`) which does not exist in this enabler-PR. Because the missing module is a static import, the suite fails to *load* (not just at assertion time), so a per-`it.skip` is insufficient — I neutralized the import with a no-op loader stub and `describe.skip`, carrying the exact comment the plan specified (`// Phase 114: resolution_blocklists is debtor-track (donor 20260601b), not in this enabler-PR scope (D-01)`). The donor artifact is preserved (not deleted). This is the single legitimately-skipped test the plan permits.

## Issues Encountered
- **Test path filter:** `npm test -- web/lib/...` found no files because vitest runs from `web/`. Resolved by using the web-relative path `npm test -- lib/agentic-pipeline/resolve`. (Mechanical, no code impact.)

## STAGE2-01 / no-Engine-diff posture
- `engine.ts`, `config.ts`, `body-source.ts`, `forward-rate-paths.ts`, and `steps/*` are byte-identical to the donor transplant — zero edits after the Task-1 commit (verified: `git diff --name-only HEAD~1 -- web/lib/agentic-pipeline/resolve/` shows only the test file). The no-Engine-diff measurement gate (Plan 05 Task 2) starts from this clean transplant.
- The single dispatch-map registration line for sales is NOT added in this plan (that is Plan 04's sales onboarding) — `STAGE2_RESOLVER_MODULES` carries only the two donor entries (debtor-email + engine).

## Next Phase Readiness
- The seam (engine + dispatch + config + steps + body-source) is present and behaviour-neutral in this workspace — the enabler-PR foundation (D-01) is in place. Plans 02–05 can build on it: generic resolution audit table + stage_2 gate key (Plan 02), sales resolver adapter + lookups (Plan 04), no-Engine-diff guard + corroboration defer tripwire (Plan 05).
- **Cross-track note (D-02):** `workspace/v8.2-resolution-recall` (39 ahead / 233 behind main) must rebase after the enabler merge — the cherry-picked subset becomes a no-op on rebase. (Tracked for the v8.2 workspace STATE.)
- No blockers.

## Self-Check: PASSED

---
*Phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof*
*Completed: 2026-06-04*
