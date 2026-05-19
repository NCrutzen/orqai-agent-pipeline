---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 04
subsystem: outlook-ingest
tags: [phase-83, d-04, conversation-context, graph-api, ingest]
one_liner: "ALWAYS-fetch the 2 most-recent prior messages from a Graph conversation and upsert them into email_pipeline.conversation_context after the parent email row is resolved (both debtor-email + sales-email ingest)."
dependency_graph:
  requires: [83-01, 83-02, 83-03]
  provides:
    - "fetchConversationMessages helper (web/lib/outlook/client.ts)"
    - "PriorMessage type"
    - "Populated email_pipeline.conversation_context table for every inbound email with a non-null Graph conversationId"
  affects:
    - "web/lib/outlook/index.ts (re-export)"
    - "debtor-email + sales-email ingest paths (1 extra Graph call per inbound email, soft-failure)"
tech_stack:
  added: []
  patterns:
    - "Soft-failure observability via automation_runs row (stage='phase83_conversation_context_fetch')"
    - "Idempotent upsert on composite PK (email_id, position)"
    - "Test mock: default mockResolvedValue([]) + per-test mockResolvedValueOnce override"
key_files:
  created:
    - .planning/phases/83-body-ingestion-capture-full-thread-on-forwards-and-replies/83-04-SUMMARY.md
    - web/lib/outlook/__tests__/conversation-context.test.ts
  modified:
    - web/lib/outlook/client.ts
    - web/lib/outlook/index.ts
    - web/app/api/automations/debtor-email/ingest/route.ts
    - web/app/api/automations/sales-email/ingest/route.ts
    - web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts
decisions:
  - "D-04 ALWAYS-fetch (not body-length-conditional) — bounded cost: 1 Graph call per inbound email regardless of body size."
  - "topN=2 hardcoded at call site (override available via helper arg) — RFC default."
  - "Soft-failure path writes status='completed' (not 'failed') because the conversation fetch is best-effort context enrichment, not a primary pipeline step. Failure is auditable via stage='phase83_conversation_context_fetch'."
metrics:
  completed: 2026-05-19
  duration: ~25min
  tasks: 2
  files_changed: 6
---

# Phase 83 Plan 04: Conversation Context Capture Summary

## What landed

`fetchConversationMessages(mailbox, conversationId, excludeId, topN=2)` lives in
`web/lib/outlook/client.ts`. It issues a single Graph `$filter=conversationId eq '<cid>'`
query (newest-first, `$top=topN+1`), excludes the supplied current-message id, strips
HTML bodies to plain text, and returns up to `topN` `PriorMessage` rows.

Both ingest routes (`web/app/api/automations/debtor-email/ingest/route.ts` and
`web/app/api/automations/sales-email/ingest/route.ts`) now invoke it
unconditionally after the parent email row is resolved, whenever
`msg.rawJson.conversationId` is a non-empty string. The returned rows are upserted
into `email_pipeline.conversation_context` with `onConflict='email_id,position'`,
so Zapier retries and ingest replays are safe.

If Graph errors during the conversation fetch (transient socket drop or
relay timeout that survives the retry budget in `graphFetch`), the route
catches and records the failure as an `automation_runs` row with
`stage='phase83_conversation_context_fetch'`. Ingest itself never fails — Stage 0
dispatch ordering is unchanged.

## Tasks

### Task 1: fetchConversationMessages helper (TDD)

- **RED commit:** `dd74590` — `test(83-04): pin fetchConversationMessages contract (RED)`.
  Seven assertions cover exclude-current, HTML stripping, empty-thread, empty-cid TypeError, return shape, topN cap, and Graph URL shape.
- **GREEN commit:** `3251803` — `feat(83-04): fetchConversationMessages — D-04 prior-message helper`.
  Implementation added below `fetchMessageBody`; reuses `enc`, `graphFetch`, and `stripHtml`. Adjusted one test assertion: `encodeURIComponent` leaves `'` intact so the URL contains `conversationId%20eq%20'cid-X'`, not the percent-encoded variant.
- Vitest: 7/7 pass. `tsc --noEmit` clean.

### Task 2: Wire into both ingest routes

- **Commit:** `7648646` — `feat(83-04): wire conversation_context writes into both ingest routes`.
- Both routes import `fetchConversationMessages` from `@/lib/outlook` (barrel updated in `web/lib/outlook/index.ts`).
- New block placed AFTER `resolvedEmailId` / `emailId` is set, BEFORE the Stage 0 placeholder INSERT — so the FK target exists, and Stage 0 dispatch ordering is preserved.
- `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` updated:
  - Added `fetchConversationMessages: vi.fn()` to the `@/lib/outlook` mock.
  - Added `chain.upsert` to the supabase mock that records `table:upsert` with `{rows, opts}` payload and resolves to `{data: null, error: null}`.
  - Added default `mockResolvedValue([])` in `beforeEach` so existing tests are unaffected.
  - New test `Phase 83 D-04 — upserts 2 prior messages …` overrides with two `PriorMessage` rows and asserts `position=1`/`source_message_id='prior-B'` + `position=2`/`source_message_id='prior-C'` + `onConflict='email_id,position'` against the `email_pipeline` schema.
- Vitest: 7/7 pass. `tsc --noEmit` clean.

## Deviations from Plan

None — the plan executed exactly as written. One minor implementation detail:
the plan example URL string showed `&$orderby=receivedDateTime desc` (unencoded
space); the actual implementation passes the value through `encodeURIComponent`,
yielding `&$orderby=receivedDateTime%20desc`. Graph accepts both, but the
encoded form is the safer canonical shape and the test was written to match.

## Threat Model Compliance

| Threat | Disposition | Implementation |
|--------|-------------|----------------|
| T-83-10 (DoS) | mitigate | Single extra Graph call/email. `graphFetch` retry+backoff inherited. Soft-failure keeps ingest moving. |
| T-83-11 (info disclosure) | accept | Same `email_pipeline` posture as parent emails (service-role only, FK CASCADE on parent delete). |
| T-83-12 (tampering / duplicate position) | mitigate | PK `(email_id, position)` + `ON CONFLICT DO UPDATE` (`onConflict='email_id,position'`). |
| T-83-13 (repudiation / swallowed errors) | mitigate | Soft-failures write `automation_runs` rows with `stage='phase83_conversation_context_fetch'` + error_message. |

## Acceptance Criteria

- [x] `web/lib/outlook/__tests__/conversation-context.test.ts` exists with 7 assertions.
- [x] `grep -c "export async function fetchConversationMessages" web/lib/outlook/client.ts` → 1.
- [x] `grep -c "export interface PriorMessage" web/lib/outlook/client.ts` → 1.
- [x] `grep -c "conversationId eq" web/lib/outlook/client.ts` → 1.
- [x] Vitest helper: 7/7 pass.
- [x] `grep -c "fetchConversationMessages" web/app/api/automations/debtor-email/ingest/route.ts` → 2 (import + call site).
- [x] `grep -c "fetchConversationMessages" web/app/api/automations/sales-email/ingest/route.ts` → 2.
- [x] `grep -c "conversation_context" web/app/api/automations/debtor-email/ingest/route.ts` → 3.
- [x] `grep -c 'onConflict: "email_id,position"' web/app/api/automations/debtor-email/ingest/route.ts` → 1.
- [x] New D-04 route test asserts `position=1` + `position=2` rows.
- [x] Vitest route suite: 7/7 pass.
- [x] `tsc --noEmit` clean.

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| `dd74590` | test | RED — pin fetchConversationMessages contract (7 tests) |
| `3251803` | feat | GREEN — fetchConversationMessages helper (D-04 prior-message fetcher) |
| `7648646` | feat | Wire conversation_context writes into debtor-email + sales-email ingest |

## TDD Gate Compliance

- RED (test commit `dd74590`) preceded GREEN (feat commit `3251803`). Confirmed in git log.
- No refactor commit needed — implementation matched plan spec on first GREEN.

## Self-Check: PASSED

- `web/lib/outlook/__tests__/conversation-context.test.ts` — FOUND
- `web/lib/outlook/client.ts` — FOUND (fetchConversationMessages exported)
- `web/lib/outlook/index.ts` — FOUND (re-exports updated)
- `web/app/api/automations/debtor-email/ingest/route.ts` — FOUND (conversation_context block present)
- `web/app/api/automations/sales-email/ingest/route.ts` — FOUND (conversation_context block present)
- `web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts` — FOUND (D-04 test present)
- Commit `dd74590` — FOUND
- Commit `3251803` — FOUND
- Commit `7648646` — FOUND
