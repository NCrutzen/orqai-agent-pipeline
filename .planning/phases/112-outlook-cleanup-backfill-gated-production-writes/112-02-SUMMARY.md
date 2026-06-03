---
phase: 112-outlook-cleanup-backfill-gated-production-writes
plan: 02
subsystem: sales-email-pipeline
tags: [go-live-flip, dry-run-gate, jsonb_set, verify-only, idempotency, CLEANUP-01]
requires:
  - "Phase 111 inline verdict-worker dry-run gate (archiveLive predicate, WR-01 telemetry gating)"
  - "swarms.dry_run_config jsonb (stage_1_archive flag; 20260603b seed)"
  - "20260603_sales_noise_calibration_flip.sql (the 111 flip analog mirrored here)"
provides:
  - "supabase/migrations/20260603x_sales_stage1_archive_golive.sql — the D-02 go-live flip (written, NOT applied)"
  - "migration-assertion test guarding exact jsonb_set flip + no sibling clobber + sales scope + APPLY NOTE"
  - "verify-only verdict-worker tests proving the inline live-archive path fires iff stage_1_archive=false"
affects:
  - "Plan 112-03 [BLOCKING] checkpoint applies this migration via MCP after canary approval"
tech-stack:
  added: []
  patterns: ["jsonb_set targeted-key flip (not whole-column)", "written-but-unapplied human-gated migration", "verify-only characterization tests (no source edit)"]
key-files:
  created:
    - supabase/migrations/20260603x_sales_stage1_archive_golive.sql
    - web/lib/swarms/__tests__/sales-stage1-archive-golive.test.ts
  modified:
    - web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts
decisions:
  - "D-02/D-03 honored: flip is the sole go-live trigger; no source edit to classifier-verdict-worker.ts, no swarms.side_effects row, no new worker"
  - "jsonb_set on '{stage_1_archive}' only — siblings (stage_1_cleanup/stage_3_labeling/stage_4_handlers) preserved (RESEARCH A2 / T-112-08)"
  - "Migration WRITTEN-NOT-APPLIED: no MCP/exec invocation this plan (T-112-09); apply deferred to Plan 112-03 [BLOCKING] checkpoint"
metrics:
  duration: ~4m
  completed: 2026-06-03
---

# Phase 112 Plan 02: Sales Stage-1 Archive Go-Live Flip Summary

The D-02 go-live flip migration (sales `dry_run_config.stage_1_archive` true→false via `jsonb_set`, sales-scoped, written-but-unapplied with a human-gated APPLY NOTE) plus verify-only tests proving the already-correct inline verdict-worker archive path fires iff the gate is open — confirming the flip is the sole zero-code activation trigger (D-03).

## What Was Built

**Task 1 — go-live flip migration + assertion test** (`c1599750`)
- `supabase/migrations/20260603x_sales_stage1_archive_golive.sql`: single `BEGIN; UPDATE public.swarms SET dry_run_config = jsonb_set(dry_run_config, '{stage_1_archive}', 'false'::jsonb), updated_at = now() WHERE swarm_type = 'sales-email'; COMMIT;`. Sorts after `20260603c_*` (`x` > `c`). Two header blocks: APPLY NOTE (written-but-unapplied; Plan 112-03 `[BLOCKING]` checkpoint applies via MCP against ref `mvqjhlxfvtqqubqgdvhz` after canary) + RLS/SCHEMA NOTE (existing RLS table, UPDATE-only, no policy, no codegen). Documents the jsonb_set-vs-whole-column rationale (A2) and the sales-only tenancy guard (debtor `stage_1_cleanup=false` LIVE untouched).
- `web/lib/swarms/__tests__/sales-stage1-archive-golive.test.ts`: 6 tests parsing the SQL — BEGIN/COMMIT; jsonb_set flip to false (NOT whole-column replace); sales-email scope (no debtor, WHERE present); no sibling-flag mutation; only `'{stage_1_archive}'` path touched; APPLY NOTE + `[BLOCKING]` markers present.

**Task 2 — verify-only verdict-worker gate tests** (`f617c364`)
- Extended `classifier-verdict-worker.test.ts` with named `categorizeEmail`/`archiveEmail` mock handles + 3 sales-email tests:
  - gate OPEN (`stage_1_archive=false`) → categorize (1×) + archive (1×) + Stage-4 `auto_archived_noise` emit fire.
  - gate BLOCKED → 0 archive, 0 Stage-4 emit (WR-01: no phantom telemetry).
  - Stage-4 emit 23505 unique-violation → swallowed, handler resolves `{ok:true}`, archive still fired once (D-08 idempotent no-op).
- `classifier-verdict-worker.ts` source NOT edited (verify-only, D-03).

## Verification

- `cd web && npx vitest run lib/swarms/__tests__/sales-stage1-archive-golive.test.ts lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` → 14 passed (2 files).
- `git diff --stat web/lib/inngest/functions/classifier-verdict-worker.ts` → empty (no source change).
- Migration present in `supabase/migrations/`, unapplied (no MCP/exec invocation this plan); sorts last among `20260603*`.
- `grep "swarm_type = 'debtor'"` on the migration → none in executable statement.

## Deviations from Plan

None — plan executed exactly as written. The existing test already carried the WR-01 telemetry-gating cases (Stage-4 emit fires/skips by gate); Task 2 added the load-bearing `categorizeEmail`/`archiveEmail` call-count assertions and the 23505 idempotency case the plan's `<behavior>` specified, via named mock handles (a test-only refactor, no source touch).

## Known Stubs

None. The flip migration is intentionally written-but-unapplied (D-02) — this is the designed human-gated state, not a stub; Plan 112-03's `[BLOCKING]` checkpoint applies it after canary approval.

## Threat Coverage

- T-112-08 (sibling clobber): mitigated — jsonb_set on `'{stage_1_archive}'` only; assertion test proves siblings absent from any SET.
- T-112-09 (premature go-live): mitigated — written-but-unapplied; APPLY NOTE; no apply/exec step this plan.
- T-112-10 (debtor mis-scope): mitigated — `WHERE swarm_type='sales-email'`; grep confirms no debtor scope.
- T-112-11 (phantom Stage-4 telemetry): mitigated — verdict-worker test proves emit gated on same predicate as archive (blocked → 0/0).

## Self-Check: PASSED

- All created/modified files exist on disk.
- Both task commits found in git history (c1599750, f617c364).
