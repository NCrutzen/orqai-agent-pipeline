---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 05
subsystem: api
tags: [stage-2, resolver, stage2-01, stage2-02, no-engine-diff, acceptance-tests, ci-guard, v8.2, rebase, cross-track]

# Dependency graph
requires:
  - phase: 114-04
    provides: sales resolve-customer adapter (resolveEntity) + real resolution_config on remote + registry-driven Stage 2 worker (the onboarding under measurement)
provides:
  - STAGE2-02 designed acceptance tests (self-auth no-op + customer-less prospect fall-through)
  - STAGE2-01 no-Engine-diff guard (scripts/no-engine-diff-check.sh) — byte-equality of engine.ts/config.ts/steps/* against the donor baseline, single sales dispatch line allowed
  - D-02 v8.2 cross-track rebase note (the cherry-picked seam subset becomes a no-op on rebase)
  - Full phase gate green (tests + codegen + no-Engine-diff + RLS)
affects: [stage2-cut-over, d06-corroboration-fast-follow, v8.2-rebase]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "No-Engine-diff CI guard with PRECISE scope: byte-equality of resolution-logic files vs a donor branch baseline (git show <donor>:<path>), allowing exactly the bundler-mandated dispatch-map entry — no blanket grep (RESEARCH Pitfall 2)"
    - "STAGE2-02 acceptance tests ported from the donor vi.hoisted self-contained admin mock, re-aimed at the sales resolveEntity adapter (no module-top const closure)"

key-files:
  created:
    - web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts
    - web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts
    - scripts/no-engine-diff-check.sh
    - .planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md
  modified: []

decisions:
  - "no-Engine-diff baseline = origin/workspace/v8.2-resolution-recall (the donor branch Plan 01 transplanted verbatim); guard compares working-tree files against git show <donor>:<path> for byte-equality"
  - "dynamic.ts allowance widened to the Phase-114 comment marker's two lines (the 'Phase 114' header + its 'Pitfall 2' continuation) plus the resolver-module-path lines — these are the sanctioned sales registration block, nothing else"
  - "D-06 tripwire CONFIRMED PRESENT before treating the no-Engine-diff gate as final: Plan 04 took the DEFER path, so 2026-06-04-d06-corroboration-fast-follow.md must exist (it does) — the no-Engine-diff result is provisional until corroboration lands or is formally descoped"

# Metrics
duration: ~15m
completed: 2026-06-04
---

# Phase 114 Plan 05: Lock STAGE2-01/02 — acceptance tests + no-Engine-diff guard + D-02 rebase note Summary

**Locked the two phase requirements: STAGE2-02 via designed acceptance tests (self-auth no-op + customer-less prospect fall-through), STAGE2-01 via a precise byte-equality no-Engine-diff guard, and left the D-02 v8.2 cross-track rebase note — full phase gate green.**

## Performance

- **Duration:** ~15m
- **Completed:** 2026-06-04
- **Tasks:** 3 of 3
- **Files created:** 4 (2 tests, 1 shell guard, 1 todo)

## Accomplishments

- **STAGE2-02 designed acceptance tests (Task 1):** two dedicated test files prove the debtor-only self-auth tier degrades to a no-op for sales (`auto_safe_kinds: []` → no `self_auth` candidate, no crash) and that a customer-less prospect resolves to `method: "unresolved"`, `customer_account_id: null` — the exact value D-09 / the context-shape contract depend on for the Stage 3 fall-through. Both ported the donor's `vi.hoisted` self-contained chainable admin mock (no module-top const closure).
- **STAGE2-01 no-Engine-diff guard (Task 2):** `scripts/no-engine-diff-check.sh` asserts byte-equality of `engine.ts` / `config.ts` / `resolve/steps/*` against the donor baseline (`origin/workspace/v8.2-resolution-recall`) and allows ONLY the single sales `STAGE2_RESOLVER_MODULES` registration entry in `dynamic.ts`. Precise scope per RESEARCH Pitfall 2 — no blanket grep that would wrongly fail on the mandatory dispatch-map line. Verified to exit 0 in the correct state and exit 1 on a deliberate `engine.ts` edit and on a broad `dynamic.ts` edit.
- **D-02 v8.2 rebase note (Task 3):** `.planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md` records that the v8.2 workspace (39 ahead / 233 behind main) must rebase after the enabler-PR merges — the cherry-picked RESL-03 seam subset becomes a no-op, while the HELD SQL-substrate cutover stays in the debtor track and is unaffected. Operator self-coordinates.
- **D-06 tripwire honored:** Plan 04 took the DEFER path for multi-match corroboration; confirmed `2026-06-04-d06-corroboration-fast-follow.md` EXISTS before treating the no-Engine-diff gate as final. The STAGE2-01 result is therefore provisional until corroboration lands or is formally descoped (per the tripwire's hard constraint).
- **Full phase gate green:** `npm test` 2458 passed / 0 failed (22 files, 40 tests skipped, 95 todo); `npm run codegen && git diff --exit-code` no drift; `./scripts/no-engine-diff-check.sh` exit 0; `npm run check:supabase` 0 ERROR.

## Task Commits

1. **Task 1: STAGE2-02 acceptance tests** — `bed0b1d5` (test) — `self-auth-noop-sales.test.ts` + `unresolved-fallthrough.test.ts`; 3 tests green.
2. **Task 2: STAGE2-01 no-Engine-diff guard** — `bee26823` (feat) — `scripts/no-engine-diff-check.sh`; byte-equality + scoped dynamic.ts allowance; verified positive + two negative cases.
3. **Task 3: D-02 rebase note + phase gate** — `149a8588` (docs) — v8.2 rebase note; D-06 tripwire asserted present; full gate recorded green.

**Plan metadata:** this commit (docs: complete plan).

## Files Created/Modified

- `web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts` — STAGE2-02 part 1 (self-auth tier no-op for sales).
- `web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts` — STAGE2-02 part 2 (customer-less prospect → `unresolved`, `customer_account_id: null`).
- `scripts/no-engine-diff-check.sh` — STAGE2-01 precise no-Engine-diff guard (executable; wired as a `/gsd:verify-work` phase gate — see below).
- `.planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md` — D-02 cross-track rebase coordination note.

## Phase-gate command (for /gsd:verify-work)

```
./scripts/no-engine-diff-check.sh
```

Exit 0 = STAGE2-01 holds (engine/config/steps byte-identical to the donor; only the sales dispatch entry added). Override the baseline with `NO_ENGINE_DIFF_BASELINE=<ref>` if the donor branch is renamed. NOTE: the result is PROVISIONAL until the D-06 corroboration fast-follow lands (or corroboration is formally descoped) — see `2026-06-04-d06-corroboration-fast-follow.md`.

## Decisions Made

- **no-Engine-diff baseline = the donor branch** (`origin/workspace/v8.2-resolution-recall`). The guard reads `git show <donor>:<path>` as canonical baseline content and asserts byte-equality with the working-tree files — robust to where the seam sits in history.
- **dynamic.ts allowance covers the full sales registration block**, including the two-line Phase-114 comment marker (the `Phase 114` header line + its `Pitfall 2` continuation) and the resolver-module-path lines. The first guard pass tripped on the bare `Pitfall 2` continuation comment; the allowance was widened to recognize it as part of the sanctioned block (the `Pitfall 2` token is specific enough not to admit unrelated additions). No donor lines may be removed.
- **D-06 tripwire confirmed before finalizing STAGE2-01** — the no-Engine-diff result is explicitly provisional per the fast-follow's hard constraint.

## Deviations from Plan

None — plan executed exactly as written. The Task 2 guard's `dynamic.ts` allowance was tuned during verification to admit the sanctioned `Pitfall 2` continuation comment (a refinement of the same precise-scope guard the plan specifies, not a scope change).

## Issues Encountered

- **Initial `npm run codegen` "drift" was a false alarm** — the compound check ran from the repo root, where `codegen` is not a script (it lives in `web/`). Re-run from `web/`: codegen up-to-date (4 swarm rows, 14 intent rows), `git diff --exit-code` clean. No real drift.
- The first no-Engine-diff guard run correctly flagged the `Pitfall 2` continuation comment as an unrecognized added line — fixed by widening the allowance (see Decisions), then re-verified positive + both negative cases.

## Next Phase Readiness

- **Phase 114 requirements STAGE2-01 + STAGE2-02 are now locked** with runnable proofs: acceptance tests green + the no-Engine-diff guard green.
- **Provisional gate:** STAGE2-01's no-Engine-diff result stays provisional until the D-06 corroboration fast-follow lands (or corroboration is descoped). Re-run `./scripts/no-engine-diff-check.sh` after that work.
- **Cross-track action queued:** the v8.2 workspace rebase note is in `pending/` — the operator rebases `origin/workspace/v8.2-resolution-recall` after the Phase 114 enabler-PR merges.
- Sales Stage 2 remains fail-closed (`stage_2_resolution=true` dry-run) until an explicit cut-over.

## Self-Check: PASSED

(Appended after verification below.)

---
*Phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof*
*Completed: 2026-06-04*
