---
phase: 88
slug: review-surface-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-20
---

# Phase 88 — Validation Strategy

> Per-phase validation contract for the three D-items in Phase 88. Pure frontend; no Inngest, no schema writes.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (web/) — see `web/vitest.config.ts` |
| **Config file** | `web/vitest.config.ts` |
| **Quick run command** | `cd web && npx vitest run --no-coverage <changed-test>` |
| **Full suite command** | `cd web && npm run test` |
| **Estimated runtime** | ~30s changed; ~3 min full |
| **In-browser repro** | `cd web && npm run dev` → Vercel preview deploy URL for visual checks (operator UAT) |

---

## Sampling Rate

- **After every task commit:** Run the changed test file (`vitest run --no-coverage path/to/file.test.tsx`).
- **After every plan wave:** Run the full vitest suite on `web/`.
- **Before `/gsd-verify-work`:** Full suite green; deploy to Vercel preview; visual UAT on at least the three operator surfaces (Stage 1 chip strip, S0/S2/S3 override flow, Stage 4 layout).
- **Max feedback latency:** ~30s for changed tests; ~3min for full suite.

---

## Per-D-Item Verification Map

Tasks are not yet enumerated (planner writes PLAN.md next). Verification axes per D-item:

| D-item | Wave | Behavior validated | Test Type | Command sketch |
|--------|------|--------------------|-----------|----------------|
| D-01 (S2/S3 override widgets + cancel-override) | TBD | S2 customer picker + note submits via fused form; S3 intent picker + note submits via fused form; cancel-override returns S0/S2/S3 to clean state | unit + browser | `vitest run _shell/__tests__/detail-pane*.test.tsx` + in-browser dry-run |
| D-02 (verdict-based "Needs review" count + remove Needs-action toggle) | TBD | New count RPC returns only verdict-pending rows; chip count matches; Needs-action toggle removed without breaking deeplinks; default landing = Needs review | unit + browser | `vitest run stage-1/__tests__/noise-category-chip-strip.test.tsx` + manual `?needs_action=1` deeplink check |
| D-03 (Stage 4 chip-strip parity + width regression) | TBD | Stage 4 renders chip-strip with 3 outcome-state chips; selectedId preserved across chip switches; detail-pane width matches Stage 1/2/3 baseline | unit + visual diff | `vitest run stage-4/__tests__/*.test.tsx` + side-by-side screenshot at fixed viewport |

Planner fills the concrete task IDs in this table during PLAN.md write.

---

## Wave 0 Requirements

- [ ] **D-02 RPC verification** — confirm `automation_runs.email_id` column shape vs nested-in-`result jsonb` before writing the verdict-pending RPC SQL. Researcher flagged uncertainty.
- [ ] **D-03 width regression repro** — load the live dashboard in a browser, capture pane width per stage at fixed viewport, identify the regressed stage(s). Researcher could not localize from code alone.
- [ ] **D-02 deeplink audit** — grep the codebase for `?needs_action=1` and `needs_action=` to find any saved-link or kanban surface that relies on the toggle parameter.

---

## Nyquist Dimensions

- **D1 (Functional correctness):** unit tests per D-item touching widgets and count semantics.
- **D2 (Edge cases):** Stage 4 empty sections (selectedId clearing); D-02 verdict-pending = 0 (chip badge `0`); cancel-override with no dirty stages (no-op).
- **D3 (Integration):** detail-pane ↔ chip-strip selection model preserved on Stage 4.
- **D4 (Regression):** Stage 1 existing chip-strip tests still pass; cancel-override behavior on Stage 1 unchanged.
- **D5 (Performance):** new RPC must not regress chip-strip render time; verify with one timing assertion if practical (otherwise visual snappiness check).
- **D6 (Security):** no new server actions; RLS unchanged.
- **D7 (Accessibility):** chips remain `role="tab"`, keyboard nav unchanged.
- **D8 (Validation infrastructure):** this VALIDATION.md captures the contract; PLAN.md tasks must each map to one or more rows above before the plan is locked.

---

*Wave 0 must complete before any D-item implementation task starts. Planner enforces this in PLAN.md task ordering.*
