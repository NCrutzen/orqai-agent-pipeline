# Phase 71: Bulk Review 4-axis redesign — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-05-05
**Phase:** 71-bulk-review-4-axis-redesign-capability-regression-eval-split
**Mode:** `--auto`
**Areas discussed:** Override emit shape, Per-stage override behaviour (4 axes), eval_type tagging, Per-email aggregated view, Backend wiring, Security

---

## Override emit shape

| Option | Selected |
|---|---|
| One new `pipeline_events` row per override (audit-preserving) | ✓ |
| In-place mutation of the original row | |
| Separate `pipeline_overrides` table | |

**Rationale:** Audit trail invariant from Phase 70 — original first-pass row is preserved unchanged. (D-01, D-02)

## Per-stage behaviour

| Stage | Behaviour | Selected approach |
|---|---|---|
| 1 (category) | Re-route email | Reuse existing verdict-worker, wrap to emit override row first (D-04) |
| 2 (customer) | Correct customer_account_id | Operator toggle for re-running Stage 3+4, default off (D-05) |
| 3 (intent) | Re-emit to different handler | Operator picks from registry; original Stage 4 discarded (D-06) |
| 4 (handler output) | Capture quality + reason | 1-5 scale + text, no re-run (D-07) |

## eval_type tagging

| Option | Selected |
|---|---|
| Operator-tagged radio (capability \| regression), default = regression | ✓ |
| Auto-detect via historical-run heuristic | (deferred to Phase 72) |
| Boolean is_regression | |

**Rationale:** Default = regression is a safety bias — more likely to forget to switch to capability than reverse, and regression mistag is lower-cost. (D-08)

## Per-email aggregated view

| Option | Selected |
|---|---|
| Postgres view `pipeline_events_email_summary` over raw events | ✓ |
| Materialised view | (deferred — performance not yet a concern) |
| New `pipeline_events_email` table + dual-write | (rejected — re-introduces dual-write maintenance Phase 70 just collapsed) |

**Rationale:** View keeps single source of truth invariant. Index-friendly query shape. (D-09, D-10)

## Backend wiring

| Option | Selected |
|---|---|
| UI → API route → Inngest event → fan-out handler (single function with axis switch) | ✓ |
| Direct DB write from API route | (rejected — bypasses replay safety + downstream re-trigger logic) |
| 4 separate Inngest functions (one per axis) | (rejected — premature surface area; fan-out is cleaner) |

**Rationale:** Matches existing pipeline architecture. Single function easier to reason about end-to-end. (D-11, D-12)

## Security

- `operator_id` always extracted server-side from auth session (never trusted from client) (D-13)
- `reason` text length-capped + HTML-escaped on render (D-14)
- iController draft NOT auto-modified by override; operator manages separately (D-15)

## Claude's Discretion

- Migration filename
- Override route path under `/api/automations/debtor-email/` or `/api/automations/debtor/`
- Test fixture co-location
- UI copy (UI-SPEC owns this)

## Deferred Ideas

- promotion_candidates + Learning Inbox (Phase 72)
- Auto-detect capability/regression (Phase 72)
- Override of override / undo
- Bulk override
- Materialised view
- CHECK constraints
- Mobile/tablet UI
- Override-driven retraining

## Reviewed Todos (not folded)

- `2026-04-22-resolve-postgrest-exposed-schemas-for-email-insights.md` — unrelated.
- `2026-03-26-zapier-analytics-browser-automation.md` — unrelated.
