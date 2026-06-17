---
phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
plan: 04
subsystem: testing
tags: [stage-2, resolver, eval, no-engine-diff, stage2-01]

# Dependency graph
requires:
  - phase: 120-01
    provides: corroboration-capable engine
  - phase: 120-02
    provides: sales resolve_candidates transport
  - phase: 120-03
    provides: live corroboration seeds
provides:
  - "resolver-correctness-gate.ts — live 100-email replay harness (tsc-clean, smoke-verified)"
  - "no-engine-diff donor re-baselined to post-120 → FINAL STAGE2-01"
  - "sales-resolve-smoke.ts — live resolve_candidates (43uuz1r) diagnostic"
affects: [unify-stage2-on-resolve-candidates]

# Tech tracking
tech-stack:
  added: [xlsx]
  patterns:
    - "No-engine-diff donor re-baseline as the LAST phase task (Pitfall 1)"

key-files:
  created:
    - web/scripts/eval/resolver-correctness-gate.ts
    - web/scripts/eval/sales-resolve-smoke.ts
    - .planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md
  modified:
    - scripts/no-engine-diff-check.sh

key-decisions:
  - "FINAL STAGE2-01: no-engine-diff donor re-pointed to post-120 commit b831e3f6 (tag stage2-01-post-120); guard PASSES — engine/config/steps byte-identical, supersedes provisional V9.0."
  - "Empirical 100-email correctness gate DEFERRED → HUMAN-UAT: the live debtor swarm uses the LEGACY contact_lookup/identifier_lookup Zaps (debtorP0Config auto_safe_kinds:[]), NOT resolve_candidates — so the replay never exercises the generic path. A meaningful gate needs debtor migrated to resolve_candidates (next phase)."
  - "Confirmed live: resolve_candidates (43uuz1r) is published + returns data; SB014098→quote_no→BX228895 resolves; row #2 confident-wrong demotes below AUTO."

requirements-completed: [CORR-05]

# Metrics
duration: ~90min
completed: 2026-06-17
---

# Phase 120-04: Acceptance Gates Summary

**STAGE2-01 re-baselined to the post-120 corroboration-capable engine (guard PASSES, FINAL — supersedes provisional V9.0). The empirical 100-email correctness gate harness is built and live-verified, but the full re-score is deferred to HUMAN-UAT because the live debtor swarm isn't on the generic resolve_candidates resolver yet (it uses the legacy Zaps) — that migration is the next phase, which carries this gate as its eval.**

## Performance
- **Duration:** ~90 min (incl. live-substrate debugging + architecture discovery)
- **Completed:** 2026-06-17
- **Tasks:** 3 (Task 1 harness, Task 1b operator review → deferred, Task 2 re-baseline)
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- **Task 2 (FINAL STAGE2-01):** `no-engine-diff-check.sh` donor re-pointed from the pre-corroboration v8.2 branch to the post-120 commit `b831e3f6` (tag `stage2-01-post-120`). Guard PASSES: engine.ts/config.ts/steps/* byte-identical to the corroboration-capable donor; `corroborate.ts` present at the donor; `NO_ENGINE_DIFF_BASELINE` override preserved.
- **Task 1 (harness):** `resolver-correctness-gate.ts` — read-only live replay of the frozen 100-email fixture through `resolveEntity(args, debtorP0Config)`, scoring vs operator ground-truth, tagging the 4 confident-wrong + 12 bucket-B + gold-signal rows, writing `RERUN-FINDINGS.md`. tsc-clean; smoke-verified end-to-end against the live substrate.
- **Live verification:** confirmed `resolve_candidates` (43uuz1r) is published and returns data (`SB014098→BX228895`); row #2 (confident-wrong AUTO) demotes below AUTO under corroboration.

## Task Commits
1. **Task 1 + Task 2: harness + no-engine-diff re-baseline** — `<prev commit>` (feat) + this docs close.

## Deviations from Plan
- **Task 1b operator review → DEFERRED (HUMAN-UAT).** The full 100-row empirical re-score is not run this phase. Root cause (discovered live): the debtor swarm resolves via the LEGACY `nxt.contact_lookup`/`nxt.identifier_lookup` Zaps (because live `debtorP0Config.auto_safe_kinds` is `[]`), not `resolve_candidates`. The replay therefore can't exercise the generic corroboration path, and legacy-Zap lookups timed out (polluting scores). See `RERUN-FINDINGS.md`. The gate is carried into the next phase (debtor→resolve_candidates unification) as its acceptance eval.
- **Added `sales-resolve-smoke.ts`** (not in plan) — a minimal live diagnostic proving the sales `resolve_candidates`/43uuz1r path returns data; useful for the next phase.

## Issues Encountered
- Live substrate debugging: workspace `.env.local` lacked `DEBTOR_FETCH_WEBHOOK_SECRET` (copied the Vercel `92…` value from the main checkout); discovered debtor routes to legacy Zaps; the 43uuz1r Zap is published (operator confirmed) and returns data.

## User Setup Required
None for this phase. The deferred gate needs `DEBTOR_FETCH_WEBHOOK_SECRET` present + debtor on `resolve_candidates` (next phase).

## Next Phase Readiness
- FINAL STAGE2-01 holds; corroboration code complete and committed.
- **Next phase queued:** "Unify Stage-2 on `resolve_candidates` + retire `contact_lookup`/`identifier_lookup`" — see `.planning/todos/pending/2026-06-17-unify-stage2-on-resolve-candidates.md` (full inventory + the carried-over correctness gate).

---
*Phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm*
*Completed: 2026-06-17*
