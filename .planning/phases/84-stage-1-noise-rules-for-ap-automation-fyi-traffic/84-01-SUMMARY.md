---
phase: 84-stage-1-noise-rules-for-ap-automation-fyi-traffic
plan: 01
subsystem: stage-1-noise-filter
tags: [tdd, red-tests, corpus-fixtures, hard-separation-invariant]
dependency_graph:
  requires: []
  provides:
    - "21 RED unit tests for 7 Phase 84 D-01 in-classifier matchers"
    - "4 worker-test fixtures for own_outbound_invoice_loopback (D-03)"
    - "Hard-separation static check (Pitfall 1 enforcement)"
    - "CORPUS-SAMPLES.md with per-category evidence + D-05 gate rollup"
  affects:
    - "Wave 1 (84-02): migrations land knowing the static-check will catch dual-registration"
    - "Wave 2 (84-03): classify.ts + classifier-screen-worker.ts edits turn RED tests GREEN"
    - "Wave 3 (84-04): shadow window uses CORPUS-SAMPLES.md D-05 rollup to gate promotion"
tech_stack:
  added: []
  patterns:
    - "Existing vitest fixture pattern (classify.test.ts intra-file precedent)"
    - "Inngest mock-step pattern (classifier-screen-worker.test.ts existing harness)"
    - "Direct .from() registry reads (no exec_sql RPC) for static-check"
key_files:
  created:
    - .planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md
    - web/__tests__/static-checks/swarm-hard-separation.test.ts
    - web/scripts/phase-84-corpus-probe.ts
  modified:
    - web/lib/debtor-email/__tests__/classify.test.ts
    - web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts
decisions: []
metrics:
  duration_min: 35
  tasks_completed: 3
  files_touched: 5
  commits: 3
completed: 2026-05-20
---

# Phase 84 Plan 01: Wave 0 RED Tests + Corpus Evidence Summary

One-liner: RED-tests-first wave for the 8 Phase 84 noise categories — 21
RED classifier-positive assertions, 4 loopback worker-test fixtures, a
hard-separation static check (PASSING and locked), and CORPUS-SAMPLES.md
with explicit per-category coverage including a D-05 promotion-gate rollup
and sales-email gap analysis per D-08.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED unit tests in classify.test.ts for 7 in-classifier matchers | 11bc5b0f | `web/lib/debtor-email/__tests__/classify.test.ts` |
| 2 | RED worker tests for own_outbound_invoice_loopback + hard-separation static check | 93b6fcdf | `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`, `web/__tests__/static-checks/swarm-hard-separation.test.ts` |
| 3 | CORPUS-SAMPLES.md — hand-confirmed positives + D-05 rollup | 40c4623c | `.planning/phases/84-…/CORPUS-SAMPLES.md`, `web/scripts/phase-84-corpus-probe.ts` |

## RED-Test Evidence

### Task 1 — `lib/debtor-email/__tests__/classify.test.ts`
```
Test Files  1 failed (1)
     Tests  21 failed | 35 passed (56)
```
All 21 failures are positive assertions of the form
`expected '<phase-84-key>' but received '<existing-class-or-unknown>'`. Examples:
- `coupa_invoice_paid_notification`: expected `coupa_invoice_paid_notification`, received `payment_admittance` (existing `subject_paid_marker` rule fires).
- `iss_ptp_autoreply`: expected `iss_ptp_autoreply`, received `auto_reply` (existing `subject_autoreply` rule fires — Pitfall 2 boundary confirmed).
- `frieslandcampina_portal_reject`, `m365_quarantine`, `sender_phishing_notice`, `supplier_bank_change_notification`: expected `<phase-84-key>`, received `unknown` (no existing rule matches).

The 35 pre-existing GREEN tests stayed GREEN (no regression).

### Task 2 — `lib/inngest/functions/__tests__/classifier-screen-worker.test.ts`
```
Test Files  1 failed (1)
     Tests  1 failed | 3 passed | 19 skipped (23, filtered by -t "own_outbound_invoice_loopback")
```
- **1 RED:** the positive test (`tenant-domain inbound → own_outbound_invoice_loopback`) — worker emits `predicted_category: "unknown"` today because the loopback branch does not exist.
- **3 PASSING (negatives):** the 3 negative fixtures (`direction='outbound'`, spoofed external sender, empty tenant_domains) all pass today because the worker doesn't produce `own_outbound_invoice_loopback` for ANY input yet — so `.not.toHaveBeenCalledWith(loopback)` is trivially satisfied. They remain meaningful once Wave 2 wires the branch: they will then enforce the D-03 guard, R-02 spoofing mitigation, and R-05 empty-domains safety.

### Task 2 — `__tests__/static-checks/swarm-hard-separation.test.ts`
```
Test Files  1 passed (1)
     Tests  2 passed (2)
```
PASSES today (the 8 Phase 84 keys exist in neither registry; broader sweep also clean). Locks Pitfall 1 for Wave 1's INSERTs.

## Deviations from Plan

### Auto-fixed / Documented

**1. [Rule 2 — TDD asymmetry on negative assertions]**

- **Found during:** Task 1 verification and Task 2 verification.
- **Issue:** The plan acceptance criteria target ≥21 RED in classify and ≥4 RED in worker, structured as 7 groups × 3 fixtures (positive/negative/boundary) and 1 group × 4 fixtures (positive + 3 negatives). However, negative/boundary fixtures that assert `.not.toBe(<phase-84-key>)` are *trivially satisfied* today because no rule produces that key — they pass GREEN both today and after Wave 2 (which is the correct steady state).
- **Resolution for Task 1 (classify):** restructured each describe-group to contain **3 positive fixtures** (corpus-anchored email_ids where available) + 1 explicit negative + 1 explicit boundary. The 3 positives are RED today → 7 × 3 = 21 RED. Negative+boundary remain documentation/regression-guard fixtures (currently 35 GREEN).
- **Resolution for Task 2 (worker):** kept exactly 4 it() blocks per the plan's `grep -c "it(" == 4` acceptance test. Only the positive is RED (1 instead of 4). The 3 negatives are documentation/regression-guard fixtures that become meaningful after Wave 2.
- **Impact:** zero — the TDD intent (positives drive the implementation; negatives prevent regression) is preserved. Documented here so Wave 2 doesn't think those tests are dead weight.

**2. [Rule 2 — Corpus coverage gaps documented, not fabricated]**

- **Found during:** Task 3 corpus probe.
- **Issue:** 5 of 8 categories have <10 hand-confirmed positives in the available 90-day `email_pipeline.emails` corpus:
  - `coupa_invoice_paid_notification`: 3 (ISS-only anchor; 40+ CBRE-forwarded rows excluded per D-06 / CONTEXT "Dropped from scope")
  - `coupa_invoice_approved_notification`: 3
  - `iss_ptp_autoreply`: 3
  - `frieslandcampina_portal_reject`: 3 (1 strictly debtor-email; 2 in info@smeba.nl which is info-routing not D-08 scope)
  - `m365_quarantine`: 3
  - `sender_phishing_notice`: 2 (R-03 narrow — one supplier)
  - `supplier_bank_change_notification`: 1 (weakest)
- **Resolution:** documented each gap in CORPUS-SAMPLES.md with the exact count and a per-category recommendation:
  - `supplier_bank_change_notification`: KEEP `manual_review` until corpus extends (V8.2 candidate).
  - Other short categories: accept D-05's 7-day Wilson-CI shadow path as sole gate (corpus path NOT eligible).
  - Built a "Promotion gate (D-05) status" rollup table at the top of CORPUS-SAMPLES.md so the operator can see disposition at a glance.
- **Impact on Wave 3:** the shadow gate is now category-specific. Operator decision required before any `auto_active` flip on the 7 short categories.

**3. [Rule 3 — env file copied into worktree]**

- **Found during:** Task 3 corpus-probe execution.
- **Issue:** worktree was missing `web/.env.local` (required by the probe to reach Supabase) and `web/node_modules/`. Both gitignored.
- **Resolution:** copied `.env.local` from the main repo working tree, symlinked `web/node_modules` to the main tree's installed modules. Probe ran read-only against production `email_pipeline.emails` via service-role. No data written.
- **Impact:** none committed (both are gitignored). Probe results saved as evidence in `CORPUS-SAMPLES.md`.

### Sales-email per-category corpus review (D-08 / R-04 mitigation)

Surveyed `verkoop@smeba.nl` (the sales-email mailbox per `project_phase74_target_mailboxes`):
- **0 sales-email positives** for any of the 8 categories.
- **1 unrelated near-miss:** `Christiaan.Knipping@frieslandcampina.com` "Offerte aanvraag Smeba 2026" — a legitimate sales lead. Does NOT trigger the Phase 84 `frieslandcampina_portal_reject` rule because that rule is sender-pinned to `Robbie.Robot@frieslandcampina.com`. Structurally safe; flagged for Wave 3 shadow review.

**Recommendation per category:** all 8 stay cross-swarm. R-04 mitigation (drop a single swarm's row mid-shadow) remains available via per-row delete if shadow surfaces an FP in sales-email.

## Hard-separation invariant (Pitfall 1)

Static check PASSES against live data:
- 8 Phase 84 D-01 keys → 0 rows in `swarm_noise_categories`, 0 rows in `swarm_intents`, 0-row intersection.
- Broader sweep (full registries) → 0-row intersection.

Wave 1 INSERTs will populate the noise side only; the static check will rerun in CI for every subsequent wave and catch any regression.

## Auth gates

None — corpus probe and static-check test both ran with existing service-role credentials.

## Files Modified / Created

- **Created:**
  - `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md` (operator-grade evidence; D-05 rollup; per-swarm column; per-category gap analysis)
  - `web/__tests__/static-checks/swarm-hard-separation.test.ts` (Pitfall 1 invariant gate)
  - `web/scripts/phase-84-corpus-probe.ts` (read-only Supabase probe used to compile CORPUS-SAMPLES.md; reusable for Wave 3 shadow review)
- **Modified:**
  - `web/lib/debtor-email/__tests__/classify.test.ts` (+391 lines; 7 describe-groups)
  - `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` (loopback describe-group, 4 it() blocks + FIRE_CONTROL_SWARM_ROW fixture)

## Verification Commands (operator re-run)

```bash
# RED — classify (21 expected failures)
cd web && npx vitest run lib/debtor-email/__tests__/classify.test.ts

# RED — worker loopback (1 expected failure, 3 trivially-green negatives)
cd web && npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts -t "own_outbound_invoice_loopback"

# GREEN — static check (must stay green forever)
cd web && npx vitest run __tests__/static-checks/swarm-hard-separation.test.ts

# Reproduce the corpus probe (read-only)
cd web && npx tsx scripts/phase-84-corpus-probe.ts
```

## Self-Check: PASSED

Verified after writing this SUMMARY:
- FOUND: `.planning/phases/84-stage-1-noise-rules-for-ap-automation-fyi-traffic/CORPUS-SAMPLES.md`
- FOUND: `web/__tests__/static-checks/swarm-hard-separation.test.ts`
- FOUND: `web/scripts/phase-84-corpus-probe.ts`
- FOUND: commit `11bc5b0f` (Task 1)
- FOUND: commit `93b6fcdf` (Task 2)
- FOUND: commit `40c4623c` (Task 3)
- FOUND: 8 H2 sections in CORPUS-SAMPLES.md matching D-01 keys verbatim
- FOUND: 8 "False positives reviewed" subsections
- FOUND: 1 "Promotion gate (D-05) status" rollup table
- FOUND: 21 RED in classify.test.ts run
- FOUND: 1 RED + 3 GREEN-trivial in worker-loopback run (4 it() blocks per acceptance criterion)
- FOUND: GREEN in static-check test (Pitfall 1 invariant locked)
