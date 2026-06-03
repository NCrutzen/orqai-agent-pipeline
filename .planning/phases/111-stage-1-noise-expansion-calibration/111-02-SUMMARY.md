---
phase: 111-stage-1-noise-expansion-calibration
plan: 02
subsystem: stage-1-noise-filter
tags: [calibration, swarm_noise_categories, sales-email, migration, registry-data]
requires:
  - "111-01: dry-run gate retrofit (isStageBlocked on stage_1_archive) — makes this flip inert"
provides:
  - "Audited registry-UPDATE migration flipping 3 safe sales noise keys → categorize_archive"
  - "Registry-assertion regression guard encoding the D-06 disposition (3 archive / 2 review)"
affects:
  - "Plan 05 (applies this migration via MCP); Phase 112 (activates the live Outlook archive)"
tech-stack:
  added: []
  patterns:
    - "Registry-decision vs production-write separation (flip inert until Phase 112)"
    - "Static-guard test parses migration SQL (no live DB in unit test)"
key-files:
  created:
    - "supabase/migrations/20260603_sales_noise_calibration_flip.sql"
    - "web/lib/swarms/__tests__/sales-noise-calibration.test.ts"
  modified: []
decisions:
  - "D-06 encoded: auto_reply/ooo_temporary/ooo_permanent → categorize_archive; payment_admittance/unknown held at manual_review with rationale"
  - "Migration written but NOT applied to live DB — Plan 05's BLOCKING MCP task owns the apply"
metrics:
  duration: "~1.5 min"
  completed: "2026-06-03"
  tasks: 2
  files: 2
---

# Phase 111 Plan 02: Sales Noise Calibration Flip Summary

Audited registry-UPDATE migration flips the 3 safe core sales noise categories (`auto_reply`, `ooo_temporary`, `ooo_permanent`) from `manual_review` → `categorize_archive`, while `payment_admittance` and `unknown` stay in review with recorded rationale — guarded by a static migration-parsing assertion test. The flip is inert (Plan 01's `isStageBlocked` gate + `dry_run_config.stage_1_archive` blocked) until Phase 112.

## What Was Built

**Task 1 — Calibration-flip migration** (`supabase/migrations/20260603_sales_noise_calibration_flip.sql`, commit `3005c8c6`)
- `BEGIN;`/`COMMIT;`-wrapped `UPDATE public.swarm_noise_categories SET action='categorize_archive', updated_at=now() WHERE swarm_type='sales-email' AND category_key IN ('auto_reply','ooo_temporary','ooo_permanent')`.
- `payment_admittance` and `unknown` deliberately untouched.
- Header audit trail documents: which 3 keys flip + why; why `payment_admittance` is held (operator-visible financial admittance) and why `unknown` is held (Stage 2/3 fall-through must never auto-archive); the Plan-01 inertness cross-reference (`isStageBlocked` + fail-closed `dry_run_config.stage_1_archive`); the Plan-05 apply note; the RLS/no-codegen/no-Orq notes.
- UPDATE-only on an existing RLS-enabled table — no new table, no new policy.

**Task 2 — Registry-assertion test** (`web/lib/swarms/__tests__/sales-noise-calibration.test.ts`, commit `d1370e39`)
- Parses the migration SQL (strips comment lines so header rationale text can't pollute the parse), extracts the `category_key IN (...)` flip set, and asserts it is exactly `{auto_reply, ooo_temporary, ooo_permanent}`.
- Asserts `payment_admittance`/`unknown` are never in the flip set, the BEGIN/COMMIT wrapping, the 3-archive/2-review disposition, and that the held-back rationale is documented.
- Pure unit test (vitest), no Supabase client / network. 5 tests green in ~1s.

## Verification

- Task 1 automated verify: `test -f` + `grep` for the exact flip list + negative grep for `payment_admittance.*categorize_archive` → `OK`.
- Task 2: `cd web && npx vitest run lib/swarms/__tests__/sales-noise-calibration.test.ts` → 5 passed (1.01s).
- Live registry assertion is deferred to Plan 05 (after the MCP apply). This plan only writes the file + test, per the critical constraint.

## Deviations from Plan

None — plan executed exactly as written. No bugs, missing functionality, or blocking issues encountered. No live DB apply (as required). No modifications to STATE.md / ROADMAP.md (orchestrator-owned).

## TDD Gate Compliance

Task 2 is marked `tdd="true"` with a `<behavior>` block, but its target artifact (the migration) is a static file produced in Task 1, and the test is a static-guard that parses that file. There is no runtime source behavior under test — the test file is test-only and the migration is data/DDL, not application code. The MVP+TDD behavior-adding predicate (tdd + behavior block + non-test source files) therefore does not apply: the test went straight to GREEN against the already-present migration. The commit sequence is `feat(...)` (migration) then `test(...)` (guard), which is the natural ordering for a regression guard over a pre-existing data artifact rather than a RED→GREEN feature cycle.

## Known Stubs

None. The flip is intentionally inert (registry-decision separated from production-write per Phase 111 scope), but that inertness is a documented architectural decision gated by Plan 01 + Phase 112, not a stub.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260603_sales_noise_calibration_flip.sql
- FOUND: web/lib/swarms/__tests__/sales-noise-calibration.test.ts
- FOUND commit: 3005c8c6 (feat — migration)
- FOUND commit: d1370e39 (test — assertion guard)
