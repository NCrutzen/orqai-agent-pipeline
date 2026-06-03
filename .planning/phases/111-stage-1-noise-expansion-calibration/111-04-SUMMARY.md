---
phase: 111-stage-1-noise-expansion-calibration
plan: 04
subsystem: classifier
tags: [stage-1, noise-filter, cluster-mining, loopback, sales-email, retro, discovery, vitest]

# Dependency graph
requires:
  - phase: 111-03
    provides: "stage_1_retro_runs table + select-candidates/aggregate-baseline retro output (the unknown bucket + false_archive_suspect signal this plan consumes)"
provides:
  - "Operator-gated Stage-1 noise cluster miner over the retro unknown bucket (D-07 discovery mechanism, not hand-curated)"
  - "D-09 loopback false-archive-rate measurement + data-driven enable/disable recommendation (pure function)"
  - "stage-1-regex.md corrected to the verified call-time closed-list runtime (Finding 3); D-08/D-09 disposition recorded"
affects: [phase-112-archive-side-effect, sales-noise-rule-promotion, stage-1-regex-rfc]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discovery-as-script over the retro unknown bucket (not the raw mailbox): surface ranked clusters, operator promotes (Anti-Pattern A4)"
    - "Data-driven rule disposition: a documented threshold + measured rate, fail-closed on no evidence (D-09)"

key-files:
  created:
    - scripts/sales-stage-1-cluster-mine.ts
    - web/lib/automations/sales-email/retro/loopback-validation.ts
    - web/lib/automations/sales-email/retro/__tests__/loopback-validation.test.ts
  modified:
    - docs/agentic-pipeline/stage-1-regex.md

key-decisions:
  - "Cluster miner reads stage_1_retro_runs WHERE predicted_category_key='unknown' joined to email_pipeline.emails — spans both corpora, direction-normalized, no hardcoded mailbox/direction, NO auto-INSERT"
  - "Approved candidates default to LLM-category rows (pure registry data, Finding 3); a sales regex rule is the costlier code path, out by default (Pitfall 7)"
  - "Loopback enable/disable derived from measured false-archive rate vs LOOPBACK_FALSE_ARCHIVE_MAX=0.1; fail-closed to 'disable' on n=0 (no evidence)"
  - "stage-1-regex.md 3-place enum invariant corrected to call-time closed-list + no-codegen-for-noise-keys reality"

patterns-established:
  - "Retro-bucket cluster mining: read what Stage-1 already failed to classify, rank candidate signatures, leave promotion to a deliberate follow-up"
  - "Audit-datum measurement function: pure, deterministic, recommendation tied to a single documented threshold constant"

requirements-completed: [STAGE1-02]

# Metrics
duration: ~20min
completed: 2026-06-03
---

# Phase 111 Plan 04: Stage-1 Noise Discovery + AP-Revalidation Summary

**Delivered the D-07 operator-gated cluster-mining mechanism over the retro unknown bucket and the D-09 data-driven loopback false-archive measurement, and corrected the stale 3-place noise-key invariant in the Stage-1 RFC — all discovery is operator-promoted, no live DB change, no hand-curation.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 3/3
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments
- **D-07 discovery (Task 1):** read-only first-match-wins cluster miner that reads the retro `unknown` bucket (not the raw mailbox), joins to `email_pipeline.emails` for signature fields, spans both Smeba corpora, normalizes direction, and prints a ranked, operator-approvable candidate list + residual top-25 domains/addresses. It makes zero DB writes (Anti-Pattern A4: surface clusters, operator promotes).
- **D-09 loopback (Task 2):** `evaluateLoopback` measures `own_outbound_invoice_loopback`'s false-archive rate over normalized-inbound, would-archive rows only (outbound excluded, Pitfall 4) and returns `{ n, falseArchiveRate, recommendation }` derived from a documented threshold — no preset. Test-first (RED→GREEN), 6 tests green.
- **Doc correction (Task 3):** corrected the stale "3-place enum invariant" in `stage-1-regex.md` to the verified runtime (`category_key` is `{'type':'string'}`, closed list passed at call-time, codegen does NOT cover `swarm_noise_categories` → a new LLM noise key is pure registry data). Recorded D-08 (7 AP rules kept as-is) + D-09 (loopback test-first). Hard-separation (Stage1 XOR Stage3) statement preserved.

## Task Commits

1. **Task 1: cluster-mining script over the retro unknown bucket (D-07)** — `41401b63` (feat)
2. **Task 2: loopback false-archive-rate validation (D-09 test-first)** — `aa2d1982` (test, RED) → `64c6910f` (feat, GREEN)
3. **Task 3: correct the stale 3-place invariant + record D-08** — `c74cb4a9` (docs)

## Files Created/Modified
- `scripts/sales-stage-1-cluster-mine.ts` — read-only cluster miner over `stage_1_retro_runs` unknown bucket; ranked operator-approvable candidates; no auto-INSERT, no hardcoded mailbox/direction
- `web/lib/automations/sales-email/retro/loopback-validation.ts` — pure `evaluateLoopback` + `LOOPBACK_FALSE_ARCHIVE_MAX` threshold; inbound-only denominator; fail-closed on n=0
- `web/lib/automations/sales-email/retro/__tests__/loopback-validation.test.ts` — 6 tests: high-rate→disable, clean→enable, outbound-excluded, other-category-ignored, empty→disable, purity
- `docs/agentic-pipeline/stage-1-regex.md` — Finding 3 correction + D-08/D-09 disposition

## Verification
- `cd web && npx vitest run lib/automations/sales-email/retro/__tests__/loopback-validation.test.ts` → 6 passed.
- `cd web && npx tsc --noEmit -p tsconfig.json` → no errors in any `sales-email/retro` file or the new module.
- Cluster-mine script: reads `stage_1_retro_runs`, no `info@smeba.nl`, no `.insert(`/`.upsert(`; `npx tsx --check` clean.
- `stage-1-regex.md`: call-time/category_key-string correction present, D-08/D-09 recorded, hard-separation preserved.

## Deviations from Plan

None — plan executed as written.

Note on the Task 1 automated verify: the plan's `cd web && npx tsc --noEmit ../scripts/...` single-file check reports a spurious `Cannot find module '@supabase/supabase-js'` because there is no root tsconfig and single-file tsc ignores the project's bundler module resolution. The script follows the identical import pattern as the existing root scripts (`scripts/phase-89-shadow-eval.ts`, `scripts/phase-65-regression-backfill.ts`) and passes `npx tsx --check`. The substantive acceptance-criteria greps (`stage_1_retro_runs` present, no `info@smeba.nl`, no INSERT) all pass.

## TDD Gate Compliance
Task 2: `test(...)` commit `aa2d1982` (RED — failed on missing module import) precedes `feat(...)` commit `64c6910f` (GREEN — 6 tests pass). No refactor commit needed (implementation minimal and clean).

## Known Stubs
None. The cluster miner is fully wired to live tables; the loopback function is a complete pure measurement. The candidate-promotion step (INSERT + seed re-fire) is intentionally NOT in this plan per D-07 (operator-gated, follow-up migration) — this is a documented scope boundary, not a stub.

## Self-Check: PASSED
- scripts/sales-stage-1-cluster-mine.ts — FOUND
- web/lib/automations/sales-email/retro/loopback-validation.ts — FOUND
- web/lib/automations/sales-email/retro/__tests__/loopback-validation.test.ts — FOUND
- docs/agentic-pipeline/stage-1-regex.md — FOUND (modified)
- Commits 41401b63, aa2d1982, 64c6910f, c74cb4a9 — all FOUND in git log
