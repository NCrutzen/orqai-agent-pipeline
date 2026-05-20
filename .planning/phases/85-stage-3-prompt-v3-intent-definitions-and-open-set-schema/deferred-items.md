# Phase 85 — Deferred items

## Pre-existing test failures (not introduced by Phase 85)

- `web/lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` — 3 failing tests with `TypeError: admin.schema is not a function` at `classifier-verdict-worker.ts:150:22`. Baseline-confirmed (fails on HEAD prior to Phase 85 edits). The test's Supabase admin mock lacks a `.schema()` method that production code expects. Out-of-scope for Phase 85; should be fixed by the test owner / classifier-verdict-worker stakeholder.

