---
phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
plan: 01
subsystem: testing
tags: [vitest, gating, dry-run-gate, deriveMailboxMode, supabase, management-api, tdd-red]

# Dependency graph
requires:
  - phase: 110-04
    provides: per-stage dry-run gate (isStageBlocked/isHandlerBlocked + dry_run_config)
  - phase: 117-02
    provides: stage-3-intent-label-worker (the Shadow-suppression PATCH site)
  - phase: 132-01
    provides: forward-bucket inverse-polarity release map
provides:
  - RED derive-mode.test.ts pinning deriveMailboxMode Shadow/Dry/Live ladder (highest-wins, fail-closed)
  - RED handler tri-state assertions (live/dry/off/missing) against gating_config
  - RED Shadow-suppression assertion in the intent-label worker test (D-03)
  - phase135-trigger-smoke.ts (MODEL-04 illegal-UPDATE-rejected, operator-runnable)
  - phase135-seed-readback.ts (MIGRATE-03/D-09 post-apply seed read-back)
  - installed web/node_modules (npm ci)
affects: [135-02, 135-03, 135-04, 135-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Nyquist Wave-0 RED scaffold: every downstream task maps to one failing automated check before implementation"
    - "Always-raise DO-block probe: SQL trigger smoke can never persist (sentinel raise forces rollback on both outcomes)"
    - "Operator-runnable Management-API smoke scripts that no-op cleanly pre-apply"

key-files:
  created:
    - web/lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts
    - web/scripts/phase135-trigger-smoke.ts
    - web/scripts/phase135-seed-readback.ts
  modified:
    - web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts
    - web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts

key-decisions:
  - "Sales derive-fixture PRESENTS stage_1_archive=true (held) per OQ-3 Path A → derives Dry; kept separate from the missing-config→Shadow fail-closed case"
  - "Shadow-suppression RED test asserts emitPipelineEvent (internal persistence) still fires while the Graph PATCH is held (Pitfall 4)"
  - "Smoke scripts use SUPABASE_ACCESS_TOKEN Management API only; never a hardcoded service-role key (CLAUDE.md)"
  - "Trigger smoke probes via an always-raise DO block so the illegal write never persists regardless of outcome (threat T-135-02)"

patterns-established:
  - "RED tests target the POST-cutover gating_config key so they fail until 135-02 renames + flips internals"
  - "EXPECTED_SEED constant is the single operator-reconciled source for the seed read-back"

requirements-completed: [MODEL-02, MODEL-03, MODEL-04, MODEL-05, MIGRATE-02, MIGRATE-03]

# Metrics
duration: 9min
completed: 2026-06-30
---

# Phase 135 Plan 01: Wave 0 RED Scaffold + Operator Smokes Summary

**Installed Vitest deps and laid down the Nyquist Wave-0 scaffold: a RED `deriveMailboxMode` ladder test, RED handler tri-state + Shadow-suppression assertions, and two operator-runnable Management-API SQL smokes (trigger-reject + seed read-back) that every downstream 135 task turns green.**

## Performance

- **Duration:** ~9 min
- **Completed:** 2026-06-30
- **Tasks:** 3
- **Files modified:** 5 (3 created, 2 modified) + `npm ci`

## Accomplishments
- `npm ci` installed `web/node_modules` (1506 packages) — Vitest now runs in this worktree.
- `derive-mode.test.ts` (NEW) pins the RESEARCH Pattern 3 ladder: Shadow x2 (fail-closed + dormant), Dry (sales / OQ-3 Path A held archive), Live x3 (debtor cleanup-handler, info-routing released bucket, mixed handlers highest-wins). RED — `deriveMailboxMode` lands in 135-02.
- `dry-run-gate.test.ts` gained a `handler tri-state (MODEL-02)` block: `live`→not blocked, `dry`/`off`/missing→blocked. RED until 135-02 flips internals to tri-state over `gating_config`.
- `stage-3-intent-label-worker.test.ts` gained a Shadow-suppression assertion: derived `Shadow` → `decision="shadow_suppressed"`, 0 Graph PATCH, but internal `emitPipelineEvent` NOT suppressed (Pitfall 4). RED until 135-04 wires the Shadow gate.
- Two standalone tsx smokes created, typecheck-clean, no hardcoded secrets, and safe to run pre-apply.

## Task Commits

1. **Task 1: Install deps + scaffold derive-mode RED test** - `c1907e98` (test)
2. **Task 2: Tri-state + Shadow-suppression RED assertions** - `a688512c` (test)
3. **Task 3: SQL trigger + seed-readback smoke scripts** - `e0cc97cf` (feat)

## Files Created/Modified
- `web/lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` - RED ladder for `deriveMailboxMode` (MODEL-03/05/D-05-R)
- `web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts` - added handler tri-state RED block (MODEL-02); imports `isHandlerBlocked`
- `web/lib/inngest/functions/__tests__/stage-3-intent-label-worker.test.ts` - added Shadow-suppression RED assertion (D-03); captured `emitPipelineEventMock`
- `web/scripts/phase135-trigger-smoke.ts` - MODEL-04 illegal-UPDATE-rejected SQL smoke (always-raise DO block, exits 0 only on reject)
- `web/scripts/phase135-seed-readback.ts` - MIGRATE-03/D-09 4-swarm seed read-back vs `EXPECTED_SEED`

## Verification

- `cd web && npx vitest run lib/pipeline-gating` → 2 files passed (forward-bucket, intent-label pin tests), 2 files RED (derive-mode 6/6 + tri-state 1/4) = **7 intended REDs, 17 green**. The pin tests staying green is the MIGRATE-02 no-behavior-change proof.
- `cd web && npx vitest run …intent-label-worker.test.ts` → 10 existing tests green, 1 new Shadow test RED (`expected 'gated' to be 'shadow_suppressed'`).
- `cd web && npx tsc --noEmit -p tsconfig.json` → 0 errors referencing `phase135` (both verify branches print `TYPECHECK-OK` / `NO-NEW-ERRORS`).

## Decisions Made
- Sales derive-fixture PRESENTS `stage_1_archive=true` (held) per OQ-3 Path A so sales derives **Dry**; kept SEPARATE from the missing-config→`Shadow` fail-closed default (do not merge — they pin two distinct rungs of the ladder).
- The Shadow-suppression RED test asserts `emitPipelineEvent` still fires (internal persistence not suppressed) while the Graph PATCH is held — encoding Pitfall 4 so 135-04 cannot over-suppress.
- The trigger smoke probes inside an always-raise `DO $$ … RAISE EXCEPTION 'PHASE135_PROBE_NOT_REJECTED' … $$` block: the trigger's own exception (reject) and the sentinel (not-reject) both roll back the atomic DO, so the probe write can never persist (threat T-135-02). Outcome is read from the returned error message.

## Deviations from Plan

None - plan executed exactly as written. (No packages added beyond the pinned lockfile via `npm ci`, per RESEARCH "ships no new external packages".)

## Issues Encountered
- A `git add` ran with cwd persisted at `web/` causing a doubled `web/web/...` pathspec error; re-ran the stage from the repo root with `git -C`. No impact on commits.

## User Setup Required
None - no external service configuration required. The two smoke scripts require `SUPABASE_ACCESS_TOKEN` (already in `web/.env.local`) and are operator-run only during the 135-05 gated apply window.

## Next Phase Readiness
- 135-02 (TS cutover): rename `dry_run_config`→`gating_config`, add `deriveMailboxMode`, flip `isHandlerBlocked` to tri-state → turns derive-mode + tri-state REDs green.
- 135-04 (Shadow gate): wire `deriveMailboxMode==="Shadow"` early-return in the intent-label worker → turns the Shadow RED green.
- 135-05 (migration apply): run `phase135-trigger-smoke.ts` + `phase135-seed-readback.ts` after apply; **re-query + reconcile `EXPECTED_SEED`** at apply time per 135-VALIDATION (sales `stage_3_routing`/`stage_3_intent_label` live values flagged [ASSUMED] in RESEARCH OQ-2 — confirm with operator before locking the seed).

---
*Phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1*
*Completed: 2026-06-30*
