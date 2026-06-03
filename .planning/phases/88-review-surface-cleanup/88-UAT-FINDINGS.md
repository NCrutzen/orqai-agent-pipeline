---
phase: 88
title: UAT findings — review-surface-cleanup
date: 2026-05-20
status: resolved
operator_uat_closed: 2026-06-01
resolution: "All UAT findings (F-01/F-02/F-03) fixed + migration 20260521_phase88_classifier_queue_verdict_pending applied to prod + smoke-validated 2026-05-20. Closed 2026-06-01."
---

# Phase 88 UAT findings — 2026-05-20

Live operator UAT on the merged Phase 88 branch (`workspace/phase-88-review-cleanup`) against production Supabase (`mvqjhlxfvtqqubqgdvhz`, "Agent-Workforce") at viewport 1440×900, swarm `debtor-email`. Verifier had marked the phase code-level PASS with three deferred UAT items; UAT surfaced two additional real issues that the code-level verdict could not catch.

## Resolved during UAT (committed to this branch)

### F-01 — Detail-pane action bar overflowed at 540 px (fixed)

The unified detail-pane is rendered into a fixed-width 540 px grid cell across all five stage shells (`stage-{0,1,2,3,4}/{page,client-shell}.tsx`, `gridTemplateColumns: "minmax(640px, 1fr) 540px"`). The action footer (`_shell/detail-pane.tsx` line 756) is a single horizontal flex row with up to five buttons (Submit override / Cancel override / Approve / Reject / Skip). At 540 px with normal padding + button label widths, the row overflows and the rightmost buttons (Reject, Skip) are clipped.

Wave 0 (Plan 01 Q3) inspected the CSS and concluded "no width regression across stages" because the columns track is identical on every stage. That verdict was correct in a *relative* sense — every stage has the same problem — but missed the *absolute* fit failure: 540 px is too narrow for the natural action-row width.

**Fix:** Added `flexWrap: "wrap"` so buttons wrap onto a second row when needed, and `position: sticky; bottom: 0; background: var(--v7-panel); zIndex: 1` so the footer stays visible while the rest of the pane scrolls. Subsequent UAT round (#2 below) clarified the user wants the footer in natural flow (not sticky-to-viewport) — `flex: 1` was removed from the pipeline section so the footer now sits directly under the stage steps instead of being pushed to the absolute bottom of the aside.

Net change in `_shell/detail-pane.tsx`:
- Footer: `flexWrap: "wrap"`, sticky-bottom safety net, opaque background.
- Pipeline section: dropped `flex: 1` so it doesn't stretch to fill remaining aside height.

### F-02 — Stage 1 chip strip showed 11+ zero-count pills (fixed)

`stage-1/noise-category-chip-strip.tsx` rendered one chip per row in `swarm_noise_categories` regardless of count. For `debtor-email` that produces 11+ chips, most reading `0`. The strip overflows horizontally and visually buries the active filter.

**Fix:** Filter `categories.map(...)` so a chip only renders when `count > 0` *or* it equals the currently-active key. Deep-link case (operator lands on a category whose count just dropped to zero) is preserved — that chip stays visible until the user navigates away.

## Resolved during UAT, second pass (committed to this branch)

### F-03 — "Needs review = 0" and "Auto-reply = 80 but 8 visible" reflect a deeper data-source mismatch (fixed)

**Symptom:** Stage 1 chip strip shows `Needs review 0` and `Auto-reply 80` while the visible row list under the strip has ~9 rows total (Stage 1 tab header reads "Stage 1 · Noise 9").

**Investigation:**

1. **`Needs review 0`** — Plan 03 added `classifier_queue_verdict_pending` RPC and the loader calls it (`stage-1/page.tsx:426`). The migration was never applied to production, so the RPC doesn't exist, the call returns `null`, the client coerces to `0`. UAT confirmed: applying the RPC as written would return **198** for `debtor-email`, which is more wrong, not less.

2. **`Auto-reply 80`** — `classifier_queue_counts` (the existing RPC at `supabase/migrations/20260428_classifier_queue_counts.sql`) reads from `automation_runs.status='predicted'` and groups by topic. That source contains 80 `auto_reply` rows for `debtor-email`.

3. **Visible list (~9 rows)** — `stage-1/page.tsx:711` reads from a different source: `pipeline_events_email_summary` (view), filtered by `stage_0_decision='safe'`, then in-memory-joined against `automation_runs.status='predicted'` (sub-query at line 738–742) to keep only emails awaiting operator review.

The three data sources disagree on what counts as a "Stage 1 row":

| Source | Auto-reply count |
|---|---|
| `classifier_queue_counts` (automation_runs) | **80** ← current chip |
| `pipeline_events stage=1 decision='auto_reply'` (distinct email_id) | 173 |
| Proposed `classifier_queue_verdict_pending` (automation_runs anti-join `email_feedback`) | 198 |
| Actual list (`pipeline_events_email_summary` + Stage 0 safe + predicted join) | ~9 |

Phase 88 D-02's design assumption — that an `email_feedback`-based anti-join over `automation_runs` would match the list — was wrong. The list filter chain is significantly more constrained.

**Why this didn't show up in tests:** The `noise-category-chip-strip` vitest suite passes a mock `verdictPendingCount` prop directly. The loader tests in `stage-1/__tests__/load-page-data.test.ts` mock the RPC return values. No test asserts that chip count == visible-list length against real data. The verifier agent worked from PLAN/SUMMARY artefacts and grep — neither catches this kind of semantic divergence.

**Fix applied 2026-05-20 (same UAT session):**

Both `classifier_queue_counts` and `classifier_queue_verdict_pending` were rebuilt on `pipeline_events_email_summary` in `supabase/migrations/20260521_phase88_classifier_queue_verdict_pending.sql`. The migration was applied to production (`mvqjhlxfvtqqubqgdvhz`) via Supabase MCP `apply_migration` after smoke validation confirmed per-topic counts matched the loader's filter chain.

Post-fix smoke (debtor-email):

| topic | count |
|---|---|
| (uncategorised) | 122 |
| auto_reply | 59 |
| payment_admittance | 55 |
| ooo_permanent | 4 |
| ooo_temporary | 3 |
| safety_review | 1 |
| supplier_bank_change_notification | 1 |

`classifier_queue_verdict_pending('debtor-email')` returns 245 = sum of the per-topic counts. Chip strip's "Needs review" badge now displays this total; per-category chips display the matching topic count.

**Note on chip vs visible-list gap:** chip totals (e.g. Auto-reply 59) reflect the full Stage 1 review backlog. The list view paginates from the latest 400 summary rows then slices to PAGE_SIZE = 100, so the operator may only see ~8 of the 59 in the first page. This is intentional — chip count = "how much work in this bucket across all time"; "Older →" pagination handles the visibility gap. Consider a future "X of Y" indicator on the row list header if this turns out to confuse operators.

**Code changes:**

- `web/app/(dashboard)/automations/[swarm]/stage-1/noise-category-chip-strip.tsx` — re-enabled the `count` binding on the "Needs review" chip (the UAT-pass-1 workaround of omitting the count was rolled back once the RPC data source was fixed).
- Tests (`stage-1/__tests__/noise-category-chip-strip.test.tsx`) — reverted to assert count badges present, mirroring the pre-UAT shape.
- Loader (`stage-1/page.tsx`) — no change required; same RPC names + return shapes.

## Production DB state after UAT

- Both RPCs live in production with the corrected join chain. Smoke-tested.
- No application-code redeploy required on the loader (function names + return shapes preserved). The frontend changes above ship with this branch's existing commits.
