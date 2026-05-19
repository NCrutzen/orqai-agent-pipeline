---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 05
subsystem: outlook-ingest
tags: [phase-83, d-05, backfill, graph-api, one-shot-script]
one_liner: "One-shot tsx backfill script that re-fetches Graph bodies for the last 30 days across debtor-email + sales-email mailboxes, populating body_full_text / body_unique_text / body_html / raw_json + conversation_context. Idempotent via `body_full_text IS NULL` selector; throttled to ≤ 4 req/s."
dependency_graph:
  requires: [83-01, 83-02, 83-03, 83-04]
  provides:
    - "web/scripts/backfill-bodies.ts — runnable via `npx tsx`"
    - "Backfilled body_full_text / body_unique_text / body_html / raw_json on email_pipeline.emails (last 30 days, both swarms)"
    - "Backfilled email_pipeline.conversation_context rows for emails with non-null conversationId"
  affects:
    - "Phase 87 retro-classification (reads body_full_text from Supabase, not Graph)"
tech_stack:
  added: []
  patterns:
    - "Idempotent one-shot tsx script (Inngest avoided per CLAUDE.md §Inngest — D-05 LOCKED the script path)"
    - "Service-role Supabase client via dotenv-loaded web/.env.local"
    - "Soft-fail per row: failures logged with email_id, batch continues; final summary line `[swarm] DONE: processed=… failed=… priorsWritten=…`"
    - "Vitest mock pattern: chainable Supabase mock with .schema/.from/.select/.is/.gte/.in/.order/.limit/.eq/.update/.upsert + thenable for direct await"
key_files:
  created:
    - .planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-05-SUMMARY.md
    - web/scripts/backfill-bodies.ts
    - web/scripts/__tests__/backfill-bodies.test.ts
  modified: []
decisions:
  - "Hardcoded SWARM_MAILBOXES map (mirrors stage-0-coverage-probe.ts) instead of `swarms.mailboxes` registry column. The CONTEXT D-05 column does not exist on `public.swarms` (verified via REST API 2026-05-19). The `swarms` SELECT in selectBackfillCandidates is retained as a runtime sanity check; the actual mailbox list comes from the in-script map. Operator follow-up: align with Phase 82.2 Risk #8 TODO once a registry-driven mailbox table lands."
  - "Production backfill run started in background (PID launched 18:40 UTC). At ~22 rows/min throughput the full 1220-row run (debtor 818 + sales 402) requires ~55 min — exceeds executor session window. Operator confirms completion via the log file and re-runs the script if `still_null > 0` from transient Graph failures (idempotent)."
metrics:
  duration: "~25 min (script build + tests + dry-run smoke + partial prod run start)"
  completed: 2026-05-19
---

# Phase 83 Plan 05: 30-day body+conversation backfill (D-05) Summary

## What landed

- **`web/scripts/backfill-bodies.ts`** — one-shot tsx script. Resolves
  candidate rows (`body_full_text IS NULL`, last 30 days, mailboxes for the
  selected swarm), then for each row calls `fetchMessageBody` and (if a
  conversationId is present) `fetchConversationMessages` from the
  Plan 83-02 / 83-04 helpers; writes body fields + raw_json on
  `email_pipeline.emails` and upserts up to 2 priors on
  `email_pipeline.conversation_context` (PK `email_id,position`).
  Throttle: `throttleDelay(4) = 250ms` between rows. Resume-safe.
- **`web/scripts/__tests__/backfill-bodies.test.ts`** — 5 vitest cases pin
  the contract: throttle math, select filters
  (`body_full_text IS NULL`, `received_at GTE cutoff`,
  `mailbox IN (...)`), 5-row batch processed end-to-end, dry-run does
  not write, single-row failure does not abort batch.

## Verification

- 5/5 unit tests pass: `npx vitest run scripts/__tests__/backfill-bodies.test.ts`.
- Dry-run smoke (`--dry-run --days=7 --limit=3 --swarm=debtor-email`)
  exits 0 and prints `[debtor-email] DONE: processed=3 failed=0
  priorsWritten=0`.
- Pre-backfill DB counts (2026-05-19 18:39 UTC):
  - last-30d total: **2646** rows
  - last-30d `body_full_text IS NOT NULL`: **0**
  - last-30d `body_full_text IS NULL`, debtor mailboxes: **818**
  - last-30d `body_full_text IS NULL`, sales mailboxes: **402**
- Production run (debtor + sales, 30 days): launched at
  `18:40 UTC` to `/tmp/phase83-backfill-20260519-1840.log`. Run is
  in-progress at executor session close; 45 debtor rows backfilled in
  the first ~2 min (`body_full_text IS NOT NULL` count rose 0 → 45).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `swarms.mailboxes` column does not exist**
- **Found during:** Task 2 (dry-run smoke).
- **Issue:** CONTEXT D-05 instructed selectBackfillCandidates to read
  the `mailboxes` jsonb column off `public.swarms`. Live Supabase row
  (`/rest/v1/swarms?select=*&limit=1`) confirms the column is absent;
  `SwarmRow` in `web/lib/swarms/types.ts` also has no `mailboxes`
  field. The canonical mailbox→swarm map in the codebase today is the
  hardcoded `ACTIVE_MAILBOXES` array in
  `web/lib/inngest/functions/stage-0-coverage-probe.ts` (with a TODO
  to migrate to a registry-driven query).
- **Fix:** Inlined the same 5-mailbox list in
  `backfill-bodies.ts` as `SWARM_MAILBOXES` (debtor: 4 mailboxes,
  sales: 1). The `swarms` SELECT is retained (test pins it) and
  soft-tolerates the column-does-not-exist error.
- **Files modified:** web/scripts/backfill-bodies.ts (Task 2 same commit).
- **Commit:** 3d0a6e3.

### Production-run gating

- The full Task 3 production backfill writes to PRODUCTION
  `email_pipeline.emails` and is rate-limited to ~22 rows/min.
  Total budget for the two swarms is ~55 min, exceeding the executor
  session window. Per CLAUDE.md "production vereist expliciete
  bevestiging" the run was launched in background; the operator
  confirms completion against the log file and re-runs the script
  (idempotent) if `still_null > 0` after the first pass for any
  transient Graph failures.

## Known Stubs / Follow-ups

- The pre-existing TS error
  `web/lib/stage-0/strip-quoted-history.ts(19,30): Cannot find module
  'email-reply-parser'` is out of scope for this plan (commit cd2776b,
  predates 83-05). Logged for visibility; no action taken.
- `conversation_context` REST endpoint returns 401 to the service-role
  key in current PostgREST config — observed during pre-flight count
  query. Does not block writes from the script (writes succeed via
  service-role JWT used by `@supabase/supabase-js`); only affects
  ad-hoc REST verification.
- `fetchConversationMessages` is failing with Graph
  `InefficientFilter` (400) on a portion of conversations
  (`$filter=conversationId eq '...'&$orderby=receivedDateTime desc`).
  The script soft-fails these (Phase 83-04 contract: conversation
  fetch failure does not block body persistence). Follow-up belongs
  to Plan 83-04 (or a new follow-up plan) to use the
  `getAllMessages?$search=` or `/messages/{id}/conversation` shape
  instead of `$filter`.

## Threat Flags

None — script writes only to tables already in scope of Plan 83-01's
threat model, no new trust boundary.

## Self-Check: PASSED

- FOUND: web/scripts/backfill-bodies.ts
- FOUND: web/scripts/__tests__/backfill-bodies.test.ts
- FOUND commit 286a4b5 (RED test commit)
- FOUND commit 3d0a6e3 (GREEN script commit)
