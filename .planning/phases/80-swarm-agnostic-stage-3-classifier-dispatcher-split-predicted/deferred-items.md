# Phase 80 — Deferred / Out-of-Scope Items

## Pre-existing test failures (not introduced by Phase 80)

- `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` —
  2 tests fail with `TypeError: admin.schema is not a function`. The
  classifier-verdict-worker calls `admin.schema("email_pipeline").from(...)`
  but the test's Supabase mock does not implement `.schema()`. Pre-exists on
  main (verified by `git stash` + run on HEAD before Plan 80-03 started).
  Out of scope for Phase 80 — file untouched by this phase.
