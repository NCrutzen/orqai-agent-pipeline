---
phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
plan: 02
subsystem: pipeline-gating
tags: [gating, dry-run-gate, gating_config, tri-state, deriveMailboxMode, cutover, migrate-02]

# Dependency graph
requires:
  - phase: 135-01
    provides: RED derive-mode + tri-state + Shadow-suppression tests; pin tests as GREEN baseline
  - phase: 110-04
    provides: per-stage dry-run gate (isStageBlocked/isHandlerBlocked)
  - phase: 132-01
    provides: forward-bucket inverse-polarity release map
provides:
  - GatingConfig interface (renamed from DryRunConfig) + tri-state stage_4_handlers
  - five gate helpers re-pointed to gating_config (signatures byte-identical)
  - isHandlerBlocked tri-state interpretation (state !== "live" → blocked)
  - deriveMailboxMode() pure fn (Shadow/Dry/Live, highest-wins, fail-closed→Shadow)
  - every production reader + SwarmRow type on gating_config
affects: [135-03, 135-04, 135-05, 136, 137, 138]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Rename-as-safety-net: dry_run_config→gating_config surfaces every reader at compile time (tsc)"
    - "Tri-state→boolean fail-closed collapse: only the explicit \"live\" value un-blocks a handler"
    - "Derived lifecycle (no stored enum): deriveMailboxMode computes mode from the flags every read"

key-files:
  created: []
  modified:
    - web/lib/pipeline-gating/dry-run-gate/index.ts
    - web/lib/swarms/types.ts
    - web/lib/inngest/functions/info-routing-forward-autoflip.ts
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/classifier-verdict-worker.ts
    - web/lib/inngest/functions/stage-2-customer-resolver.ts
    - web/lib/inngest/functions/stage-2-icontroller-label-applier.ts
    - web/app/(dashboard)/automations/[swarm]/_shell/_lib/load-page-data.ts
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts
    - web/lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts
    - web/lib/inngest/functions/__tests__/info-routing-forward-autoflip.test.ts

key-decisions:
  - "verdict-worker has NO legacy labeling_settings.dry_run co-gate — it already gates stage_1_archive purely via the registry isStageBlocked; only invoice-copy-handler retains the transitional dry_run OR-gate (MIGRATE-01)"
  - "deriveMailboxMode co-located in index.ts (RESEARCH's optional derive-mode.ts split not needed)"
  - "info-routing-forward-autoflip column-name strings (.select/.update) flipped to gating_config now; live-consistent only after 135-05 applies the SQL rename"

requirements-completed: [MODEL-01, MODEL-02, MODEL-03, MODEL-05, MIGRATE-01, MIGRATE-02]

# Metrics
duration: 12min
completed: 2026-06-30
---

# Phase 135 Plan 02: gating_config TS Cutover + Tri-State + deriveMailboxMode Summary

**Cut the gate library and every production reader from `dry_run_config`/`DryRunConfig` to `gating_config`/`GatingConfig`, promoted the Stage-4 handler map to a tri-state (`off|dry|live`) interpreted fail-closed, and added the pure `deriveMailboxMode()` derived-lifecycle fn — all with the five helper signatures byte-identical (MIGRATE-02 "swap internals only"). Turned 135-01's RED derive-mode + tri-state tests GREEN; kept the three pin tests + the preservation test green.**

## Performance
- **Duration:** ~12 min
- **Completed:** 2026-06-30
- **Tasks:** 2
- **Files modified:** 15

## Accomplishments
- `index.ts`: renamed `DryRunConfig`→`GatingConfig`; `stage_4_handlers` is now `Record<string,"off"|"dry"|"live">`; `stage_4_forward_buckets` kept as `Record<string,boolean>` (inverse polarity NOT flattened, RESEARCH Pattern 2). `SwarmLikeForGate.dry_run_config`→`gating_config`. All five helpers read `gating_config`, signatures unchanged.
- `isHandlerBlocked` flipped to the tri-state contract: `const state = …; return state !== "live"` — only "live" un-blocks; "dry"/"off"/missing all stay blocked (fail-closed, MODEL-02).
- Added `export type MailboxMode` + `export function deriveMailboxMode()` implementing the RESEARCH Pattern 3 ladder verbatim (highest-wins → Live; label-live → Dry; else Shadow; `{}`→Shadow). No side-effect-wiring detection (OQ-3 Path A — honest held seed), no `swarm_type` branch (SWARM-02).
- `SwarmRow.dry_run_config`→`gating_config` typed `GatingConfig | null`; comment re-pointed to `public.swarms.gating_config`.
- `info-routing-forward-autoflip.ts`: flipped the FRESH `.select("dry_run_config")`/`.update({dry_run_config})` column refs + field reads to `gating_config`.
- Comment column-name references flipped in the 5 readers + `events.ts` + `debtor-email-coordinator.ts`.
- MIGRATE-01: annotated the retained legacy `labeling_settings.dry_run` OR-gate in `classifier-invoice-copy-handler.ts` (kept `|| handlerBlocked`, removal deferred, D-09).
- Flipped `.dry_run_config` fixtures to `gating_config` in the three pin tests + `dry-run-gate-preservation.test.ts` + `info-routing-forward-autoflip.test.ts`.

## Task Commits
1. **Task 1: gate library cutover + tri-state + deriveMailboxMode** — `9939b072` (feat)
2. **Task 2: re-point all readers + swarm row type** — `ec8c7b15` (feat)

## Verification
- `cd web && npx vitest run lib/pipeline-gating/dry-run-gate` → 4 files, 24 tests passed (derive-mode 6/6 + tri-state now GREEN; forward-bucket + intent-label pin tests STAY green — MIGRATE-02 inverse-polarity + fail-closed preserved).
- `cd web && npx vitest run lib/pipeline-gating lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts lib/inngest/functions/__tests__/info-routing-forward-autoflip.test.ts` → 6 files, 44 tests passed.
- `cd web && npx tsc --noEmit` → exit 0, clean of `dry_run_config`/`DryRunConfig`.
- `grep -rl "\.dry_run_config\|DryRunConfig" lib app --include="*.ts" --include="*.tsx" | grep -v "__tests__/derive-mode"` → 0 hits.

## Decisions Made
- **verdict-worker carries no legacy co-gate.** The plan assumed `classifier-verdict-worker.ts` (~L194) had the same `(settingsRow?.dry_run ?? true) || handlerBlocked` OR-gate as invoice-copy. It does not — verdict-worker gates its inline Stage-1 archive SOLELY via the registry `isStageBlocked(swarmRow, "stage_1_archive")`. So there is no transitional `dry_run` read to retain there; it is already the single source of gating truth. Annotated honestly at the site (MIGRATE-01) rather than inventing an OR-gate.
- **`deriveMailboxMode` co-located in `index.ts`** — the RESEARCH optional split to `derive-mode.ts` was not needed (module stays cohesive).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan inaccuracy] verdict-worker has no legacy `dry_run` OR-gate**
- **Found during:** Task 2
- **Issue:** The plan instructed adding the MIGRATE-01 "retain `|| handlerBlocked`" deprecation comment to `classifier-verdict-worker.ts` at ~L194, but that file has no `settingsRow?.dry_run` OR-gate — it gates Stage-1 archive purely via the registry `isStageBlocked`. The verbatim deprecation comment about a retained legacy read would have been false.
- **Fix:** Added an accurate MIGRATE-01 note at the verdict-worker archive-gate site stating it is already registry-only (no legacy co-gate to retain/remove). Applied the verbatim "SUPERSEDED … transitional co-gate … removed in a follow-up cleanup" comment only at the invoice-copy site where the OR-gate genuinely exists.
- **Files modified:** web/lib/inngest/functions/classifier-verdict-worker.ts, web/lib/inngest/functions/classifier-invoice-copy-handler.ts
- **Commit:** ec8c7b15

## Sequencing / Cutover Note (per plan)
135-02 (this plan, TS field + type) and 135-03 (SQL column rename) both land in Wave 1 on disjoint files (TS vs SQL). `loadSwarm` does `select("*")`, so at RUNTIME the renamed column flows through the loader without a loader change — the only compile-time coupling is the TS field access, flipped here. Until 135-05 (Wave 3, operator-gated) applies the migration to the live DB, the production code reads `.gating_config` from a row whose live column is still named `dry_run_config`; this code is NOT deployed/run against live until after 135-05. The Vitest suite uses in-memory `gating_config` fixtures, so tests are correct immediately. **135-02 + 135-03 land code+SQL; 135-05 applies SQL to live; only then is the renamed field live-consistent.**

## Known Stubs
None — pure internal refactor; no hardcoded empty data flowing to UI.

## Threat Flags
None — no new network endpoints, auth paths, or trust-boundary surface introduced. The two STRIDE mitigations for this plan (T-135-02-01 tri-state fail-closed; T-135-02-02 forward-bucket polarity untouched) are pinned green by the suite.

## Issues Encountered
- `gsd-sdk query state.record-metric` / `state.add-decision` require named flags (`--phase`/`--plan`/`--duration`, `--summary`), not positional args; re-ran with flags.

## Next Phase Readiness
- 135-03 (SQL): rename `public.swarms.dry_run_config`→`gating_config` + tri-state seed + invariant trigger + violation view. Code already reads the new name.
- 135-04 (Shadow gate): import `deriveMailboxMode` into `stage-3-intent-label-worker.ts` and early-return `shadow_suppressed` when mode === "Shadow" (turns the 135-01 Shadow RED green).
- 135-05 (apply): run `phase135-trigger-smoke.ts` + `phase135-seed-readback.ts` post-apply; reconcile `EXPECTED_SEED` with the operator (sales OQ-2 [ASSUMED] values).

## Self-Check: PASSED
All 15 modified files present; both task commits (9939b072, ec8c7b15) found in git log.

---
*Phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1*
*Completed: 2026-06-30*
