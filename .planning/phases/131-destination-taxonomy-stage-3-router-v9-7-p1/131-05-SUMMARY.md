---
phase: 131-destination-taxonomy-stage-3-router-v9-7-p1
plan: 05
subsystem: eval-harness
tags: [eval, shadow, route-08, precision, info-routing, vitest, typescript, false-success-guard]

# Dependency graph
requires:
  - phase: 131-03
    provides: coordinator_runs.decision_details->routing->>'bucket' (the persisted high-confidence router verdict the harness grades)
  - phase: 131-01
    provides: routing_destinations registry + outlook_category column (the human-actual category→bucket reverse map) + loadRoutingDestinations
provides:
  - computeMatchRate — pure IO-free per-bucket + overall match-rate (verdict bucket vs human-actual bucket), high-confidence only, null human_category = ungraded
  - gradeVerdict — the graded_n false-success guard: refuses a pass/fail below MIN_GRADED_N (Pitfall 6), else grades against the ≥0.85 MATCH_RATE_GATE
  - info-routing-precision-shadow.ts — report/shadow-mode ROUTE-08 harness (no writes, no forward), live run prerequisite-gated outside 131
affects: [route-08-live-measurement, delta-sync-on-info-prerequisite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shadow eval harness = IO-free pure compute fn (computeMatchRate + gradeVerdict) + report-mode main() with lazy createAdminClient + invoked-directly regex guard, mirroring info-unknown-pool-noise-baseline.ts exactly"
    - "False-success guard (Pitfall 6): grade the denominator, not just the rate — refuse a verdict (pass:null, status:insufficient_sample) below MIN_GRADED_N so an absent-prerequisite 0/8000 sample can never report a misleading 100%"
    - "Registry-inverted ground truth: invert routing_destinations.outlook_category (bucket→category) to a category→bucket map so the human-actual Outlook category resolves back to a comparable bucket"

key-files:
  created:
    - web/scripts/eval/info-routing-precision-shadow.ts
    - web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts
  modified: []

key-decisions:
  - "MIN_GRADED_N = 50: the harness refuses a pass/fail below 50 graded emails. Chosen as a small-but-non-trivial floor that trips the guard under today's 0/8000 prerequisite-absent state while remaining attainable once delta-sync lands; tunable in one place if the live operator wants a tighter bound."
  - "Match comparison is bucket-vs-bucket. The verdict carries a bucket (destination_key); the human-actual is an Outlook category string mapped BACK to a bucket via routing_destinations.outlook_category. main() builds the category→bucket reverse map once, so computeMatchRate compares two buckets — no per-row registry lookups in the pure fn."
  - "High-confidence-only filter lives in computeMatchRate (filters confidence==='high'), matching the ≥85%-gate wording; low/medium verdicts are excluded from both numerator and denominator."
  - "Report/shadow mode only. main() READS coordinator_runs (decision_details->routing not null) + the delta-synced human category and prints JSON — no .update/.insert/.forward/sendMail anywhere in the eval path (T-131E-02)."

patterns-established:
  - "An eval script whose live run depends on an out-of-phase prerequisite still ships its BUILD + pure-fn unit test in-phase; the guard makes a premature live run self-refuse rather than mislead, decoupling the harness build from the prerequisite landing."

requirements-completed: [ROUTE-08]

# Metrics
duration: 3min
completed: 2026-06-17
---

# Phase 131 Plan 05: ROUTE-08 shadow precision harness Summary

**The report-mode ROUTE-08 shadow harness: it joins each high-confidence router verdict bucket (`coordinator_runs.decision_details->routing->>'bucket'`) to the human-actual destination (the delta-synced Outlook category mapped back to a bucket via `routing_destinations.outlook_category`) and computes per-bucket + overall match-rate, gated overall ≥0.85. The pure `computeMatchRate` + `gradeVerdict` functions are IO-free and unit-tested without Supabase; `gradeVerdict` REFUSES a pass/fail when `graded_n < MIN_GRADED_N` (the false-100% guard — the delta-sync-on-info@ prerequisite is absent today, 0/8000 categories). Report/shadow only — no writes, no forward. The BUILD + 9 unit tests complete in 131; the LIVE measurement run is gated on the prerequisite landing OUTSIDE 131. Single TDD task; RED→GREEN; 9/9 tests green; shadow harness tsc clean.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-06-17T07:39:36Z
- **Completed:** 2026-06-17T07:42:21Z
- **Tasks:** 1 of 1 complete
- **Files created:** 2 · **Files modified:** 0

## Accomplishments

- **`computeMatchRate` (pure, IO-free):** takes `ShadowRow[]` (`{verdict_bucket, human_category, confidence}`), filters to high-confidence verdicts, and returns `{ overall_match_pct, per_bucket[], graded_n, ungraded_n }`. A match is `verdict_bucket === human_category`; a null `human_category` counts in `ungraded_n` and is NEITHER a match nor a miss (never touches the graded numerator/denominator). Per-bucket breakdown is keyed off the verdict bucket and sorted by name for stable output. No NaN on empty input (graded_n=0 → 0 pct).
- **`gradeVerdict` (the false-success guard, T-131E-01 / Pitfall 6):** refuses a pass/fail when `graded_n < MIN_GRADED_N` (50) — returns `{ status: 'insufficient_sample', pass: null, … }` plus the reported denominator and a rationale that names the absent delta-sync prerequisite. Only when `graded_n ≥ MIN` does it grade against `MATCH_RATE_GATE` (0.85) → `pass: true|false`. This is the structural guard against the false-100% trap while 0/8000 info@ emails carry an Outlook category.
- **`main()` (report/shadow mode only):** lazy-imports `createAdminClient` + `loadRoutingDestinations`; inverts `routing_destinations.outlook_category` into a category→bucket reverse map; reads `coordinator_runs` (decision_details->routing not null) joined to the delta-synced human category; projects DB rows → pure `ShadowRow`s; prints `{ verdict, stats }` JSON. NO `.update`/`.insert`/`.forward`/`sendMail` in the eval path. Invoked-directly regex guard on `process.argv[1]` so the test imports the pure fns only.
- **Inline documentation** of the LIVE-run prerequisite gate: Phase 131 ships the BUILD + unit test only; the live measurement requires the delta-sync-on-info@ category-capture prerequisite (outside 131). Until then a live run self-reports `insufficient_sample` by design.

## Task Commits

1. **Task 1 RED: failing shadow precision harness test (graded_n guard)** — `d98b7332` (test)
2. **Task 1 GREEN: ROUTE-08 shadow precision harness + false-success guard** — `0d085092` (feat)

No REFACTOR commit — the GREEN implementation needed no cleanup.

## Files Created/Modified

- `web/scripts/eval/info-routing-precision-shadow.ts` — report-mode ROUTE-08 harness: `computeMatchRate` + `gradeVerdict` (pure, IO-free) + `MIN_GRADED_N`/`MATCH_RATE_GATE` constants + lazy-admin `main()` + invoked-directly guard
- `web/scripts/eval/__tests__/info-routing-precision-shadow.test.ts` — 9 pure-fn assertions: overall 4/5→0.8, per-bucket breakdown, null→ungraded (not a miss), high-confidence-only filter, empty-input no-NaN, and the four guard/gate cases (refuse below MIN, refuse at graded_n=0, PASS ≥0.85, FAIL <0.85)

## Decisions Made

- **`MIN_GRADED_N = 50`** as the refusal floor — trips the guard under today's 0/8000 state, attainable once delta-sync lands, tunable in one constant.
- **Bucket-vs-bucket comparison.** The verdict carries a `destination_key` bucket; the human-actual Outlook category is mapped back to a bucket via the registry's `outlook_category` column. The reverse map is built once in `main()`, so the pure `computeMatchRate` compares two plain buckets (no IO).
- **High-confidence filter inside `computeMatchRate`** (per the ≥85%-gate wording); low/medium verdicts are excluded from numerator and denominator.
- **Report/shadow only** — reads + prints JSON, zero side-effects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `loadRoutingDestinations` arity — call needed `(admin, swarmType)`**
- **Found during:** Task 1 GREEN (`tsc --noEmit`)
- **Issue:** The plan's interface sketch implied `loadRoutingDestinations(SWARM)`, but the live registry signature (Plan 01) is `loadRoutingDestinations(admin: SupabaseClient, swarmType: string)`. tsc flagged `TS2554: Expected 2 arguments, but got 1`.
- **Fix:** Passed the already-created `admin` client as the first argument: `loadRoutingDestinations(admin, SWARM)`.
- **Files modified:** web/scripts/eval/info-routing-precision-shadow.ts
- **Verification:** `tsc --noEmit` clean (no shadow-harness errors); 9/9 tests green.
- **Committed in:** `0d085092` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (mechanical arity fix from the live registry signature). No scope change — behaviour matches the plan exactly.

## Issues Encountered

None blocking. The full-suite `tsc --noEmit` surfaces only pre-existing errors in unrelated files (none in this plan's two files); out of scope, left untouched.

## Known Stubs

- **`human_outlook_category` projection in `main()` is prerequisite-shaped, not prerequisite-wired.** The exact landing surface of the delta-synced Outlook category (a join column / view) depends on the delta-sync-on-info@ prerequisite which lands OUTSIDE Phase 131. Today the join yields `null` for every row (0/8000 captured), so every row is `ungraded` and `gradeVerdict` refuses — exactly the designed false-success guard, NOT a defect. This is intentional and documented inline: 131 ships the BUILD + unit test; the LIVE run is prerequisite-gated. The pure compute path (the unit-tested contract) is fully complete and does not depend on the stub.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface. The threat register dispositions are mitigated: T-131E-01 (false-success → `gradeVerdict` refuses below MIN_GRADED_N; the test asserts the refusal path at graded_n=0 and graded_n=1), T-131E-02 (accidental write → report/shadow only, lazy admin import, grep confirms no `.update`/`.insert`/`.forward`/`sendMail`), T-131E-03 (info disclosure → prints aggregate match-rates + bucket counts only), T-131E-SC (no package installs).

## Verification

- `cd web && npx vitest run scripts/eval/__tests__/info-routing-precision-shadow.test.ts` → **9 passed**.
- `cd web && npx vitest run scripts/eval/__tests__/` → 3 files / **21 passed** (eval directory regression clean).
- `npx tsc --noEmit` → no errors in `info-routing-precision-shadow.ts` (full-suite errors are pre-existing, unrelated files).
- `grep -q "graded_n" web/scripts/eval/info-routing-precision-shadow.ts` → OK; the MIN-sample refusal path (`gradeVerdict` → `insufficient_sample`/`pass:null`) exists.
- `grep -qE "createAdminClient|admin" …` → OK; `grep -nE "\.update\(|\.insert\(|\.forward\(|sendMail" …` → **none** (shadow only).
- Invoked-directly regex guard on `process.argv[1]` present.

## Next Phase Readiness

**Plan 131-05 COMPLETE — the final plan of Phase 131. The ROUTE-08 shadow precision harness is built + unit-tested.**

- **LIVE measurement (outside 131):** once the delta-sync-on-info@ category-capture prerequisite lands and `graded_n ≥ MIN_GRADED_N`, run `npx tsx web/scripts/eval/info-routing-precision-shadow.ts report` to get a real per-bucket + overall match-rate verdict against the ≥0.85 gate. Until then it self-reports `insufficient_sample`.
- Phase 131 destination taxonomy + Stage-3 router is fully delivered: registry (01), agent (02), coordinator verdict + held no-forward (03), dedup (04), shadow precision harness (05).

## Self-Check: PASSED

Both created files verified present; both task commits (`d98b7332`, `0d085092`) verified in git log. 9/9 unit tests green; shadow harness tsc clean; no writes in the eval path.

---
*Phase: 131-destination-taxonomy-stage-3-router-v9-7-p1*
*Completed: 2026-06-17 — ROUTE-08 shadow harness built + unit-tested; live run prerequisite-gated outside 131*
