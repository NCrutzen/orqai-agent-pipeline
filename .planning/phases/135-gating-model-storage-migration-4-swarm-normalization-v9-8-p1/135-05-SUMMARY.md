---
phase: 135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1
plan: 05
subsystem: storage-migration
tags: [supabase, migration, gating_config, operator-gated-apply, oq-3-falsified, sales-live, derived-mode]

# Dependency graph
requires:
  - phase: 135-02
    provides: GatingConfig TS shape + tri-state handlers + deriveMailboxMode (asserted post-apply)
  - phase: 135-03
    provides: authored migration 20260625_phase135_gating_config.sql (applied here, operator-gated)
  - phase: 135-04
    provides: worker-side gating reads green
provides:
  - "Live mvqjhlxfvtqqubqgdvhz: dry_run_config renamed -> gating_config; tri-state handlers; 4-swarm legal seed; enforce_handler_trigger_stage_invariant trigger + gating_invariant_violations security_invoker view (applied by orchestrator)"
  - "OQ-3 Path A FALSIFIED -> Option A operator decision: sales = Live (no sales UPDATE; D-09 preserved)"
  - "phase135-seed-readback EXPECTED_SEED + derive-mode.test reconciled to the applied live seed (sales derives Live)"
affects: [136, 137, 138]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated production registry apply (checkpoint:decision + checkpoint:human-action); no auto-apply"
    - "Verify-before-lock: live read-back + derived-mode assertion over the ACTUAL applied row, not just a raw seed read-back"

key-files:
  created:
    - .planning/phases/135-gating-model-storage-migration-4-swarm-normalization-v9-8-p1/deferred-items.md
  modified:
    - web/scripts/phase135-seed-readback.ts
    - web/lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts

key-decisions:
  - "OQ-3 Path A premise FALSIFIED (sales archive live+firing) -> operator chose Option A: accept sales = Live; migration applied AS AUTHORED with no sales UPDATE (honors D-09 no-behavior-change). Sales derives Live, not the D-05-R Dry."
  - "EXPECTED_SEED + derive-mode sales pin flipped from archive-held/Dry to archive-live/Live; generic Dry-ladder coverage preserved as a separate abstract pin."

requirements-completed: [MIGRATE-01, MIGRATE-03, MODEL-04]

# Metrics
duration: ~35min (across the checkpoint pause)
completed: 2026-06-30
---

# Phase 135 Plan 05: Operator-Gated Apply + Post-Apply Verification Summary

**The 135-03 migration was applied to the live registry (`mvqjhlxfvtqqubqgdvhz`) under operator gate after the `checkpoint:decision` resolved the falsified OQ-3 Path A premise: sales archive is live + firing, so the operator chose Option A — accept sales = Live, apply AS AUTHORED with no sales UPDATE (honoring D-09 "no behavior change at cutover"). The orchestrator performed the live apply + live reads; this executor reconciled the local seed-readback EXPECTED_SEED and the derive-mode test to the applied live state (sales derives Live) and ran the local gate.**

## Performance
- **Duration:** ~35 min (incl. the checkpoint:decision pause for the operator)
- **Completed:** 2026-06-30
- **Tasks:** Task 1 (pre-apply), checkpoint:decision (Option A), checkpoint:human-action (live apply — orchestrator), Task 3 (post-apply verification + local reconciliation)
- **Files modified:** 2 (+ 1 created: deferred-items.md)

## The OQ-3 Path A Falsification -> Option A Decision

- **Premise (OQ-3 Path A):** sales `stage_1_archive` is inert -> seed it HELD -> sales derives Dry, keeping D-09 and the simple derive fn correct.
- **Falsified (135-03, re-confirmed at source in 135-05):** sales archive is **live and firing**. `classifier-verdict-worker.ts` fires a live Outlook categorize+archive via `archiveLive = !!category.outlook_label && !isStageBlocked(swarmRow, "stage_1_archive")`; 12 sales `swarm_noise_categories` carry `outlook_label` + `action='categorize_archive'`; live `stage_1_archive=false`.
- **Operator decision (Option A):** accept sales = Live. Apply the migration AS AUTHORED (no sales UPDATE) — sales retains its verified-live state, so D-09 holds (sales keeps archiving noise exactly as today). Sales derives **Live**, not the D-05-R "Dry". Task 3's derived-mode assertion + the seed-readback EXPECTED_SEED were updated to expect sales = Live.

## Live Apply + Post-Apply Verification (performed by the orchestrator)

> This executor did NOT touch the live DB (auto-mode + no local service-role key). The orchestrator applied the migration and ran the live reads; results recorded here for traceability:

- Migration applied OK in a single committed transaction.
- `dry_run_config` -> `gating_config` rename: confirmed (MIGRATE-01).
- Trigger `trg_enforce_handler_trigger_stage_invariant`: installed; view `gating_invariant_violations`: created, returns EMPTY (MODEL-04).
- Security advisor: **0 ERROR-level lints** (security_invoker view + pinned-search_path trigger fn pass).
- Live `gating_config` read-back (all 4 swarms) — matches the reconciled EXPECTED_SEED:
  - debtor-email: `{stage_1_archive:false, stage_1_cleanup:false, stage_3_routing:false, stage_3_labeling:true, stage_3_intent_label:false, stage_4_handlers:{"invoice-copy":"dry","stage_1_cleanup":"live"}}` -> **Live**
  - info-routing: `{stage_1_archive:false, stage_3_routing:true, stage_4_forward_buckets:{verkoop:true,opleidingen:true}}` -> **Live**
  - sales-email: `{stage_1_archive:false, stage_1_cleanup:true, stage_3_routing:false, stage_3_labeling:true, stage_3_intent_label:false, stage_4_handlers:{}, stage_2_resolution:true}` -> **Live** (Option A)
  - support-tickets: `{}` -> **Shadow**
- Trigger dynamic smoke (illegal `handler="live"` on a held stage): treated PASS (trigger present, violations view empty, fn body correct).

## Local Reconciliation + Gate (this executor)

- **Source-level re-confirmation** of the sales-archive firing path (`classifier-verdict-worker.ts` `archiveLive` predicate) — corroborates 135-03.
- **`phase135-seed-readback.ts`** EXPECTED_SEED: sales-email flipped to the applied live state (`stage_1_archive=false`, archive LIVE; no held-archive); header rewritten to document the OQ-3 Path A falsification -> Option A. Reads `gating_config` (post-rename).
- **`derive-mode.test.ts`**: the old "sales-shaped (archive HELD) -> Dry" pin split into (a) a generic **Dry-ladder** pin (held archive + label live -> Dry, abstract) and (b) a **sales APPLIED-seed -> Live** pin (`stage_1_archive=false` -> Live), citing OQ-3 Path A -> Option A. `deriveMailboxMode` itself unchanged (already returns Live for `stage_1_archive===false`).
- **Local gate results:**
  - `npx vitest run lib/pipeline-gating ...stage-3-intent-label-worker.test.ts ...dry-run-gate-preservation.test.ts` -> **6 files, 44 passed** (derive-mode now 7 tests, all green).
  - `npx tsc --noEmit` -> **exit 0, clean**.
  - `npm run codegen && git diff --exit-code` -> **could not EXECUTE** (codegen needs `SUPABASE_SERVICE_ROLE_KEY`; `web/.env.local` absent in this worktree). **No-op property holds by construction**: the only files changed are a test + a script — no codegen source, no `*.generated.ts` (verified `git diff --name-only | grep generated` -> none). Pitfall 6 satisfied.
  - `npm test` (full suite) -> **3091 passed, 27 failed, 23 skipped**. The 27 failures are a **pre-existing 135-02 cutover gap** (stale `dry_run_config` test fixtures), NOT caused by this plan and NOT a production regression — see Deferred Issues.

## Migration Tracking — Operator Follow-Up

The migration was applied via the Supabase Management API query endpoint and is **not yet recorded** in `supabase_migrations.schema_migrations`. One-line operator follow-up: record `20260625_phase135_gating_config.sql` in the migration history (or push it through `supabase db push`). The migration is idempotent (guarded rename, skip-if-string tri-state migrate, `CREATE OR REPLACE` fn/view, `DROP TRIGGER IF EXISTS`), so a future re-apply is harmless.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - assertion correctness] Reconciled sales pin Dry -> Live**
- **Found during:** Task 3 (operator chose Option A after the checkpoint:decision).
- **Issue:** plan/Task-3 originally expected sales -> "Dry" (OQ-3 Path A held-archive premise). That premise was falsified; sales archive is live -> sales derives Live.
- **Fix:** updated EXPECTED_SEED (sales `stage_1_archive=false`) + the derive-mode sales pin (-> Live), preserving abstract Dry-ladder coverage.
- **Files modified:** `web/scripts/phase135-seed-readback.ts`, `web/lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts`.
- **Commit:** `1a521aaa`.

## Deferred Issues

**135-02 cutover left 16 test files with stale `dry_run_config` fixtures -> 27 full-suite failures.** The workers were re-pointed to `gating_config` but these worker-test swarm mocks still set the old key, so the workers read `undefined` -> fail-closed -> `held`/`predicted_held` instead of the intended live path. **Not a production regression** — the live read-back proves `gating_config` is correctly populated and read in production; the MIGRATE-02 pin tests + derive-mode + preservation are all green. Out of plan-05 scope (`files_modified: []`; pre-existing to this plan, rooted in 135-02). Logged with the full file list + the mechanical fix (`dry_run_config:` -> `gating_config:` in the fixtures) in
`.planning/phases/135-.../deferred-items.md`.

## Known Stubs
None — apply + verification + test/script reconciliation only; no UI data path.

## Threat Flags
None new. The plan's STRIDE mitigations are realized live: T-135-05-01/05 (operator checkpoint confirmed the sales seed; falsified premise escalated, Option A chosen), T-135-05-02 (advisor 0 ERROR), T-135-05-03 (human-action apply gate honored), T-135-05-04 (no hardcoded keys; this executor performed no live write).

## Self-Check: PASSED
- Files verified present: 135-05-SUMMARY.md, deferred-items.md, phase135-seed-readback.ts, derive-mode.test.ts.
- Commit verified present: `1a521aaa`.
