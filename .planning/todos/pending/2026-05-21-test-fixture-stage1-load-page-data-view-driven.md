---
phase-link: 88.2
opened: 2026-05-21
status: pending
---

# `loadPageData — Phase 71-03 D-10 view-driven predicted-row feed` (4 tests)

## Failing tests (one suite, four cases skipped)
- `Test 4: still calls loadCoordinatorRunsForReview (out-of-scope side-loader regression)`
- `Test 5: when view returns 2 rows, page data has 2 row entries keyed by email_id`
- `Test 6: predicted-row carries stage_1..4_decision + stage_1..4_overridden + total_cost_cents from view`
- `Phase 81-03 + Phase 82 Plan 06: URL-direct-edit filters (?entity=X&mailbox=12) still applied in the loader (mailbox via .in for multi-select)`

## Failing file
`web/app/(dashboard)/automations/[swarm]/stage-1/__tests__/load-page-data.test.ts`

## Errors
- Test 4: `loadCoordinatorRunsForReview` mock not called — production no longer side-loads coordinator runs at this point in `loadPageData`.
- Test 5: `data.rows` is empty (0 rows) when view returns 2 — the view fixture is no longer wired through to the per-email aggregate the loader now consumes (likely needs a different `pipeline_events_email_summary` shape).
- Test 6: `row1.stage_decisions` is undefined — view fixture missing the `stage_decisions` field, and/or production reads stage_decisions from a different source now.
- Filters test: `.in()` for `decision_details->>mailbox_id` is no longer present — mailbox filtering moved client-side in Stage1ClientShell (see `web/app/(dashboard)/automations/[swarm]/stage-1/page.tsx:604` "mailbox intentionally excluded — mailbox filtering happens client-side via hydrated PredictedRow.mailbox_id").

## Likely root cause
The Phase 71-03 view-driven feed (`pipeline_events_email_summary`) and Phase 82 filter routing have evolved past the assertions in this test file. The test still encodes the legacy contract: server-side mailbox filtering, side-loader coordinator runs, and the original per-email row shape. None of these match the current loader.

## Fixture/file likely needing work
- Refresh the view-row fixture in this test file to match the current `pipeline_events_email_summary` row shape (including `stage_decisions`).
- Drop or rewrite the `loadCoordinatorRunsForReview` assertion (the side-loader call site may have moved or been removed).
- Drop the `decision_details->>mailbox_id` `.in()` assertion (mailbox filtering is client-side now; the test as written contradicts the production design comment at `page.tsx:604`).

## Skip reason
Time-boxed per Phase 88.2 D-07; see CONTEXT.md. Four tests in one file with intertwined view-fixture + filter-routing drift — fixing properly needs a dedicated mini-phase to align the test with the Phase 71-03 + Phase 82-06 design (mailbox client-side, view-driven aggregate), not a 15-minute patch.
