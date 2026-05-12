# Deferred Items — Phase 82.2

Out-of-scope discoveries found during execution. Not fixed here.

## 82.2-04 execution (2026-05-12)

- **`classifier-verdict-worker.test.ts` — 2 failing tests (pre-existing).**
  Mock for `admin.schema()` chained call is missing in the test file (real
  code path: `web/lib/inngest/functions/classifier-verdict-worker.ts:149`
  uses `admin.schema("email_pipeline").from("emails").select(...)`). Failures
  reproduce on the plan's base commit before any Plan 04 changes; not
  introduced by the Stage 0 refactor. Different file, different worker.
  Track in a future Stage 1 / classifier maintenance plan.
