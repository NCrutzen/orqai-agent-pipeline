---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 07
subsystem: verification
tags: [verification, harness, phase-close, read-only]
dependency_graph:
  requires: [83-01, 83-02, 83-03, 83-04, 83-05, 83-06, 83-06b]
  provides:
    - "Read-only verification harness for Phase 83 closure (V1..V4)"
    - "Operator sign-off checklist with manual §5 direct-debtor spot-check"
  affects:
    - "Gates Phase 83 ROADMAP checkbox flip"
tech_stack:
  added: []
  patterns:
    - "Read-only tsx verification script (dotenv + service-role Supabase client, SELECT-only)"
    - "Operator-facing markdown checklist with sign-off table"
key_files:
  created:
    - web/scripts/verify-phase83.ts
    - .planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-07-VERIFICATION.md
  modified: []
decisions:
  - "JS-side aggregation for V3/V4: no generic SQL RPC available — pull rows via REST and aggregate input_chars / injection_suspected in TypeScript. SQL is still printed for operator transparency."
  - "V4 FAILs when stage0_runs == 0 in lookback window (rather than auto-PASS). Operator must widen lookback or wait for traffic — avoids silent green-lighting on empty data."
  - "V1 failing row_ids printed to stdout so operator can diff against 83-05-SUMMARY.md permanent-Graph-404 list before treating as regression."
metrics:
  duration_minutes: ~10
  completed_date: 2026-05-19
  tasks_executed: 2
  tasks_pending_checkpoint: 1
  files_created: 2
---

# Phase 83 Plan 07: Verification Harness Summary

Read-only verification harness (`web/scripts/verify-phase83.ts`) and
operator-facing sign-off checklist (`83-07-VERIFICATION.md`) that together
gate Phase 83 closure on four automated checks (V1..V4) plus a manual §5
direct-debtor non-regression spot-check.

## What shipped

### Task 1 — `web/scripts/verify-phase83.ts` (commit `2a46247`)

Runnable as `npx tsx web/scripts/verify-phase83.ts [--days=30] [--sample=20] [--pii-ceiling=0.05]`.
Exits 0 only when V1..V4 all PASS:

- **V1** (CONTEXT §1) — body_full_text coverage on a sample of FW:/Re: rows
  received in the last `--days` window. Requires ≥95% non-null
  (`Math.ceil(0.95 * sample)`), matching 83-05's permanent-Graph-404 tolerance.
  Failing row_ids are printed for cross-reference with 83-05-SUMMARY.md.
- **V2** (CONTEXT §2) — on the same sample, ≥95% of rows must have
  `length(body_full_text) > length(body_unique_text)`.
- **V3** (CONTEXT §3, D-09) — `coordinator_runs.decision_details.input_size`
  telemetry in the last 24h: runs > 0 AND median `input_chars` > 500.
- **V4** (R-03 PII expansion sanity) — Stage 0 `injection_suspected` ratio in
  the last 24h must be ≤ the `--pii-ceiling` (default 0.05). If no traffic in
  the window, V4 FAILs (operator must widen lookback rather than silently waive).

Read-only invariant: `grep -v '^#' | grep -Ec '\.(insert|update|delete|upsert)\b'`
returns 0. The grep gate is enforced by the plan's acceptance criteria.

Prints the SQL for each check for operator transparency, but executes via the
PostgREST surface (with JS-side aggregation for V3/V4 medians + ratios — there
is no generic SQL RPC available to this script).

### Task 2 — `83-07-VERIFICATION.md` (commit `395a242`)

Operator-facing checklist with five sections:

1. Pre-flight (83-01..83-06b shipped, 83-05 backfill counts recorded, D-09 telemetry live).
2. Automated checks (how to run the harness, what each V1..V4 threshold means).
3. Manual §5 — direct-debtor regression spot-check on 10 non-FW debtor emails.
4. Sign-off table covering V1..V4 + manual §5, with "PASS / FAIL" cells.
5. Closure note (Phase 87 owns the ≥50% reclassification gate, not Phase 83).
6. v8.2 backlog reminder to drop `email_pipeline.emails.body_text` (CONTEXT D-10 follow-up).

## Deviations from Plan

None — both auto tasks executed exactly as specified. The harness's
JS-side aggregation for V3/V4 is the chosen execution path for the printed
SQL (PostgREST has no generic SQL endpoint here); SQL is still surfaced to
the operator for transparency.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | `2a46247` | `web/scripts/verify-phase83.ts` |
| 2 | `395a242` | `.planning/phases/83-…/83-07-VERIFICATION.md` |

## Checkpoint state

Task 3 is `type="checkpoint:human-verify"` — operator sign-off. Halted per
checkpoint protocol; no automated work remaining. The operator runs the
harness, walks §5 manually, fills the sign-off table in `83-07-VERIFICATION.md`,
and flips the ROADMAP checkbox.

## Self-Check: PASSED

- `web/scripts/verify-phase83.ts` — FOUND
- `.planning/phases/83-…/83-07-VERIFICATION.md` — FOUND
- Commit `2a46247` — FOUND
- Commit `395a242` — FOUND
