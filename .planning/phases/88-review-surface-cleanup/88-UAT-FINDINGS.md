---
phase: 88
title: UAT findings — review-surface-cleanup
date: 2026-05-20
status: open
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

## Open — deferred to Phase 89+ planning

### F-03 — "Needs review = 0" and "Auto-reply = 80 but 8 visible" reflect a deeper data-source mismatch

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

**Recommended scope for a Phase 89 follow-up plan:**

- Replace `classifier_queue_counts` with an RPC (or RLS-aware view) that reads from `pipeline_events_email_summary`, applies the exact same Stage 0 + predicted-status filter chain that the list uses, and groups by `decision_details->>'topic'`. Same return shape, swap data source.
- Replace `classifier_queue_verdict_pending` with a derivation from the same source (`stage_1_decision IS NULL` OR equivalent).
- Add an integration test that runs the loader + counts RPC against a seeded test DB and asserts `sum(chip_counts) == visible_list_length` (allowing one chip per topic).
- DO NOT apply the current `20260521_phase88_classifier_queue_verdict_pending.sql` migration — leave the file on the branch as documentation of the wrong path; supersede it in the Phase 89 migration with `drop function … if exists` for the verdict-pending RPC plus the replacement counts RPC.

**Migration file status:** kept on disk at `supabase/migrations/20260521_phase88_classifier_queue_verdict_pending.sql` with a header note marking it `NOT YET APPLIED` and referencing this findings doc. Removing the file would lose the cross-reference; leaving it lets the Phase 89 planner see exactly what was tried and why it was abandoned.

## Production DB state after UAT

- No DDL applied. `classifier_queue_verdict_pending` does NOT exist; `classifier_queue_counts` remains on its 2026-04-28 definition.
- Phase 88 code on the branch references the missing RPC at `stage-1/page.tsx:426` and gracefully degrades to `0` when the call returns null. This is the source of the "Needs review 0" symptom — it is a *deploy-side* bug (code shipped pointing at a non-existent RPC), masked locally by the same null-coalesce.
- Action: either (a) revert `stage-1/page.tsx` to drop the verdict-pending call and the chip's `count` binding until Phase 89, or (b) accept the silent-zero in production as a temporary state. **Recommendation: (a)** — silent-zero on a high-visibility chip is itself a UX defect.
