---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 02
subsystem: outlook-ingest
tags: [outlook, graph-api, body-ingestion, fetchMessageBody, full-thread]
dependency-graph:
  requires:
    - "83-01 (conversation_context table — landing zone for raw_json in 83-03)"
    - "Microsoft Graph /messages?$select=body,uniqueBody"
  provides:
    - "FetchedMessageBody {bodyText, bodyUniqueText, bodyHtml, bodyType, rawJson}"
    - "Full-thread bodyText for Stage 2/3 classifiers"
    - "raw_json envelope ready for writer persistence in 83-03"
  affects:
    - "web/app/api/automations/debtor-email/ingest/route.ts (still reads bodyText, now full thread)"
    - "web/app/api/automations/sales-email/ingest/route.ts (same)"
    - "web/app/(dashboard)/automations/[swarm]/stage-1/actions.ts (fetchReviewEmailBody)"
tech-stack:
  added: []
  patterns:
    - "Additive return-shape evolution — preserve existing keys, append new ones"
    - "Vitest mock of @zapier/zapier-sdk's createZapierSdk().fetch to control graphFetch"
key-files:
  created:
    - "web/lib/outlook/__tests__/client.test.ts"
  modified:
    - "web/lib/outlook/client.ts"
decisions:
  - "Flip is unconditional (D-01): body always wins for bodyText; uniqueBody surfaces separately via bodyUniqueText. No feature flag — the whole reason this plan exists is that uniqueBody-first was wrong."
  - "Strip at fetch time (kept current stripHtml call) so all current consumers see no behavior change beyond 'more content'. Raw HTML + rawJson are escape hatches for any future consumer that wants to defer stripping."
  - "$select widened in one shot so Plan 83-03 (the writer) does NOT need a second Graph round-trip to persist raw_json + conversationId + internetMessageId."
metrics:
  duration: "~6 minutes wallclock"
  completed-date: "2026-05-19"
---

# Phase 83 Plan 02: fetchMessageBody body-vs-uniqueBody flip Summary

One-liner: `fetchMessageBody` now prefers Graph `body.content` (full thread) over `uniqueBody.content` for `bodyText`, and returns a 5-field envelope (`bodyText`, `bodyUniqueText`, `bodyHtml`, `bodyType`, `rawJson`) so downstream plans can persist the verbatim Graph payload without re-fetching.

## What changed

- `web/lib/outlook/client.ts`:
  - New exported `FetchedMessageBody` interface (5 fields).
  - `fetchMessageBody` signature widened to return `FetchedMessageBody`.
  - `$select` widened to `body,uniqueBody,internetMessageId,conversationId,from,toRecipients,ccRecipients`.
  - Old "Prefer uniqueBody" branch removed. Body always wins for `bodyText`; `bodyUniqueText` is the stripped uniqueBody (or `""` when Graph omits it).
  - `rawJson` now returns the verbatim Graph envelope JSON.
- `web/lib/outlook/__tests__/client.test.ts` (new):
  - 7 vitest pins covering the FULL THREAD vs NEW ONLY preference, the `bodyUniqueText` surface, raw HTML preservation, `rawJson` shape, the missing-uniqueBody fallback, HTML stripping, and the wider `$select`.
  - Mocks `@zapier/zapier-sdk` so `graphFetch` is fully controlled — no live Graph hit.

## Tasks executed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Pin contract with 7 failing tests | `16d1f76` | `web/lib/outlook/__tests__/client.test.ts` |
| 2 (GREEN) | Flip preference + extend return shape | `e9cd3bc` | `web/lib/outlook/client.ts` |

## Verification

- `cd web && npx vitest run lib/outlook/__tests__/client.test.ts` → **7/7 pass**
- `cd web && npx tsc --noEmit` → **0 errors**
- Caller-regression check: `cd web && npx vitest run tests/queue/fetch-review-email-body.test.ts app/api/automations/debtor-email/ingest/__tests__/route.test.ts` → **11/11 pass** (no caller code changes were needed because `bodyText`/`bodyHtml`/`bodyType` keys are preserved).
- Acceptance-criteria grep:
  - `grep -c "Prefer uniqueBody" web/lib/outlook/client.ts` → 0 (old comment gone)
  - `grep -c "bodyUniqueText" web/lib/outlook/client.ts` → 5 (≥3 required)
  - `grep -c "rawJson" web/lib/outlook/client.ts` → 3 (≥2 required)
  - `grep -c "FetchedMessageBody" web/lib/outlook/client.ts` → 2 (≥2 required)
  - `$select` line contains `conversationId` and `internetMessageId` → confirmed.

## Deviations from Plan

None — plan executed exactly as written. Both RED and GREEN gates landed with the exact contract the plan called for; no auto-fixes or architectural deviations.

## Out-of-scope observations

Full-repo `npx vitest run` shows 55 pre-existing failures across 16 test files (stage-4 page, classifier-verdict-worker, kanban-loader, orq-agents-client, pipeline stages, v7 graph layout, corpus-mapping, etc.). None reference `fetchMessageBody`, `bodyText`, `uniqueBody`, or `web/lib/outlook/`. Per scope-boundary rule these are pre-existing failures unrelated to Plan 83-02 and have **not** been touched. The two files that mock `fetchMessageBody`'s shape (`tests/queue/fetch-review-email-body.test.ts` and `app/api/automations/debtor-email/ingest/__tests__/route.test.ts`) continue to pass against the new shape because they only mock/destructure `bodyText`/`bodyHtml`/`bodyType` — the preserved keys.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED  | `16d1f76` test(83-02): pin fetchMessageBody full-thread contract | green (7/7 failing as designed) |
| GREEN| `e9cd3bc` feat(83-02): prefer Graph body over uniqueBody in fetchMessageBody | green (7/7 passing) |
| REFACTOR | — | not needed; implementation already minimal |

## Self-Check: PASSED

- FOUND: `web/lib/outlook/__tests__/client.test.ts`
- FOUND: `web/lib/outlook/client.ts` (modified)
- FOUND commit: `16d1f76` (RED)
- FOUND commit: `e9cd3bc` (GREEN)
