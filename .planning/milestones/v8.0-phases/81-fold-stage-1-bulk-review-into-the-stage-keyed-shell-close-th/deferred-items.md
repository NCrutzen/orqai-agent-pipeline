# Phase 81 — Deferred Items

## Filters popover (entity + mailbox) — deferred to follow-up phase

Phase 81 D-07 specified a compact secondary "Filters" button popover for
entity + mailbox drill-down. Per CONTEXT §discretion (planner's call based
on plan budget), the popover UI is deferred. URL params `?entity=` and
`?mailbox=` remain functional via direct URL editing — verified by a
regression test in `stage-1/__tests__/load-page-data.test.ts` (Plan 03
Task 3): `"Phase 81-03: URL-direct-edit filters (?entity=X&mailbox=12)
still applied in the loader"` asserts the loader applies both filters as
`.eq("decision_details->>entity", …)` / `.eq("decision_details->>mailbox_id", …)`.

Carry-forward: a future phase should ship the popover as a single ~80-LOC
client component reading current URL params, presenting entity dropdown +
mailbox multi-select, and `router.push`-ing on apply.

## Carry-forward: pre-existing load-page-data.test.ts failures

Three failures in `stage-1/__tests__/load-page-data.test.ts` (Tests 4, 5,
6) pre-date Plan 03 — they fail because the test fixtures don't model the
Phase 71-08 `automation_runs.result.message_id ↔ email_pipeline.emails.source_id`
join the loader uses to whitelist predicted-status email_ids. Documented
in `81-01-SUMMARY.md` ("Carry-forward failures"). Plan 04 may revisit;
out of scope for Plan 03.

## Carry-forward: QueueTree file deletion

Plan 03 removes the `<QueueTree />` JSX usage and import from
`stage-1/page.tsx`, but the file
`web/app/(dashboard)/automations/[swarm]/stage-1/queue-tree.tsx` itself
is retained on disk. Plan 04 owns the file deletion + leftover "Bulk
Review" sibling-file string purge per the plan's <objective>.

**Resolution (Plan 04):** `queue-tree.tsx` was actually deleted in Plan 03's
docs commit (a3bcda3), not in Plan 03's code wave. Plan 04 confirmed the file
is gone from disk + git index; remaining `QueueTree` references live only in
JSDoc/comments (selection-context.tsx:12,56; noise-category-chip-strip.tsx:7;
middleware-review-redirect.test.ts:77) — all intentional audit trail per D-18.
No user-visible "Bulk Review" strings under `stage-1/` (verified by
`page-shell.test.tsx` assertion + grep audit).

## Carry-forward to Phase 82: 3 remaining stage-1 loader test failures

After Plan 04 Task 3 added the `.schema(name)` shim to both stage-1 admin
mocks (commit 383f261) and scoped the safety-list builder lookup to skip
the timeline overwrite (commit b038918), failure count dropped from 22 → 3.
The three remaining failures all live in `load-page-data.test.ts` and have
clear, distinct causes that exceed the Plan 04 time-box:

1. ~~**safety-review-loader.test.ts** > `filters pipeline_events on stage=0...`~~
   **RESOLVED in Plan 04** (commit b038918). The mock now tracks all
   `pipeline_events` builders in `pipelineEventBuilders[]`, and the safety-list
   test does `.find(b => b._eqCalls.some(c => c.col === 'decision' && c.val ===
   'injection_suspected'))` to pick the right one. All 5 safety-review-loader
   tests now pass.
2. **load-page-data.test.ts** Test 4 (loadCoordinatorRunsForReview side-loader)
3. **load-page-data.test.ts** Test 5 (view returns 2 rows → row entries by email_id)
4. **load-page-data.test.ts** Test 6 (predicted-row carries stage_1..4_decision)

Tests 5+6 fail because `pipeline_events_email_summary` fixture rows end up
returning `[]` from the loader, suggesting a query-chain branch the mock
doesn't model (e.g. an additional `.eq()` or `.in()` filter the loader added
post-71-03 that filters all rows out). Test 4 fails because the side-loader
mock now never gets called — likely production-code reorder of the loader
flow. All three are test-fixture drift, not production bugs (production code
is exercised in /stage-1 UI and via the Plan 03 page-shell test).
