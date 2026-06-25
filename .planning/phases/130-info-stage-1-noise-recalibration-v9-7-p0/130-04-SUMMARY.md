---
phase: 130-info-stage-1-noise-recalibration-v9-7-p0
plan: 04
subsystem: info-routing / stage-1 noise measurement
tags: [info-routing, stage-1, noise, measurement, wilson-ci, gap-closure]
requires:
  - "130-03 baseline substrate (info_unknown_pool_composition view + sample/compute scaffold)"
  - "web/lib/classifier/wilson.ts (wilsonCiLower)"
provides:
  - "wilsonCiUpper — pure 95% upper bound (NOISE-03 AFTER assertion enabler)"
  - "wilson_ci_hi surfaced per mailbox in computeNoiseFractions output"
  - "sample scaffold with real subject/sender from email_pipeline.emails (non-circular labelling)"
affects:
  - "NOISE-03 AFTER measurement (can now assert wilson_ci_hi < 0.20)"
tech-stack:
  added: []
  patterns:
    - "Canonical email batch-lookup (CHUNK=200, .schema(email_pipeline).from(emails).select(id,subject,sender_email,mailbox).in(id,chunk))"
    - "Wilson score interval upper arm (+ radius, clamp to 1) mirroring lower arm"
key-files:
  created: []
  modified:
    - web/lib/classifier/wilson.ts
    - web/lib/classifier/__tests__/wilson.test.ts
    - web/scripts/eval/info-unknown-pool-noise-baseline.ts
    - web/scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts
decisions:
  - "Pinned wilsonCiUpper(30,15) reference to the COMPUTED value ~0.668 (symmetric mirror of lower ~0.316), not the plan's loose ~0.684 — verified via the symmetry identity upper(n,k) === 1 - lower(n, n-k)."
metrics:
  duration: ~6m
  completed: 2026-06-16
---

# Phase 130 Plan 04: NOISE-03 Measurement-Tooling Gap Closure Summary

Closed two code defects (WR-01, WR-02) in the NOISE-03 measurement tooling so the labelled-sample baseline reads real subject/sender from the email itself (non-circular labelling) and can assert the <20% noise share via a Wilson 95% upper bound. WR-03 (wiring `hasActionableToken`) explicitly out of scope.

## What Was Built

- **WR-02 part A** — `wilsonCiUpper(n, k, z=Z_95)` added to `wilson.ts` directly below `wilsonCiLower`: same `phat`/`z2`/`denom`/`center`/`radius`, returns `Math.min(1, (center + radius) / denom)`. `n=0 -> 0` guard preserved. JSDoc states it is the 95% upper bound and that NOISE-03 uses it to assert AFTER noise share < 0.20. `wilsonCiLower` and promotion-gate constants untouched.
- **WR-01** — `sample` mode of the baseline script now batch-fetches `email_pipeline.emails` by `email_id` (canonical CHUNK=200 `.schema("email_pipeline")` pattern, sender from `sender_email`) and populates `SampleCandidate.subject`/`sender` from that map. Previous `dd.subject` / `dd.from` reads (always null — the Stage-1 writer never sets those keys) removed. Unresolved ids degrade to `null` without crashing; an emails-fetch error surfaces a non-fatal stderr warning (composition-view warning style) and continues. `mailbox_entity` still from `dd.entity`; `snippet` still from `dd.llm_reasoning`. Pure `samplePerMailbox` untouched; lazy `createAdminClient` import + arg-guard-before-DB preserved. Top-of-file JSDoc updated.
- **WR-02 part B** — `NoiseFraction` gained `wilson_ci_hi` (directly after `wilson_ci_lo`), populated via `wilsonCiUpper(n, noise)` in `computeNoiseFractions`. Point estimate, `wilson_ci_lo`, `under_min_n`, and compare logic unchanged (additive growth only).

## Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add pure wilsonCiUpper + unit test (WR-02 A) | 04b1fb39 | wilson.ts, wilson.test.ts |
| 2 | Populate sample subject/sender from email_pipeline.emails (WR-01) | 0db9f9fd | info-unknown-pool-noise-baseline.ts |
| 3 | Surface wilson_ci_hi in compute output + test (WR-02 B) | b70991d2 | info-unknown-pool-noise-baseline.ts, .test.ts |

## Verification

- `npx vitest run lib/classifier/__tests__/wilson.test.ts scripts/eval/__tests__/info-unknown-pool-noise-baseline.test.ts` → 24/24 green (11 wilson + 13 baseline).
- `npx tsc --noEmit -p tsconfig.json` (`npm run typecheck`) → clean.
- grep: no `dd.subject` / `dd.from` code references remain (only an explanatory comment); `wilson_ci_hi` in both the interface and the compute push; `wilsonCiUpper` exported.
- Scope guard: `git diff --name-only` over the plan range shows ONLY the 4 expected files — no migration / registry-seed files touched.

## Deviations from Plan

### Adjusted pinned reference value (within plan's own "verify by computing" directive)

The plan's `<behavior>` block stated `wilsonCiUpper(30, 15)` returns `~0.684`. The action also instructed to "verify pinned reference values by computing them, not by guessing" and to cross-check via the symmetry identity `upper(n,k) === 1 - lower(n, n-k)`. The computed value is `~0.668` (the symmetric mirror of `lower(30,15) ~0.316`), so the test pins `0.668` plus an exact symmetry assertion. The `~0.684` in the prose was a loose estimate; the symmetry-verified `0.668` is correct. No production behavior affected.

No other deviations. No auto-fixes (Rules 1-3) were needed. WR-03 left untouched per scope guard.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: web/lib/classifier/wilson.ts (wilsonCiUpper exported)
- FOUND: web/scripts/eval/info-unknown-pool-noise-baseline.ts (wilson_ci_hi + email_pipeline.emails fetch)
- FOUND commit 04b1fb39, 0db9f9fd, b70991d2
