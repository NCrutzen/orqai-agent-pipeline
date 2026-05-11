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
