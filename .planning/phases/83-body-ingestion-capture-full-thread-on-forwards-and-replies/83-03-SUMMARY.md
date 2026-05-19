---
phase: 83-body-ingestion-capture-full-thread-on-forwards-and-replies
plan: 03
subsystem: ingest-writers / email_pipeline.emails
tags: [ingest, debtor-email, sales-email, body-persistence, dual-write, phase-83]
dependency-graph:
  requires:
    - "83-01 (body_full_text + body_unique_text columns, raw_json + body_html pre-existed)"
    - "83-02 (FetchedMessageBody 5-field shape — bodyText, bodyUniqueText, bodyHtml, bodyType, rawJson)"
  provides:
    - "Every new email_pipeline.emails row from either swarm carries body_full_text, body_unique_text, body_html, raw_json"
    - "Stage 0 inngest payload's body_text now carries the full thread (D-01)"
    - "D-10 dual-write contract: body_text = bodyUniqueText (legacy consumers unchanged)"
  affects:
    - "Plan 83-04 (conversation_context writer — reads the same fetchMessageBody result)"
    - "Plan 83-05 (backfill — writes the same five fields on historical rows)"
    - "Plan 83-06 (Stage 3 input adapter — switches to reading body_full_text)"
tech-stack:
  added: []
  patterns:
    - "Dual-write contract (D-10): legacy body_text preserved one release alongside new body_full_text / body_unique_text"
    - "Single fetchMessageBody call feeds both DB persistence and Stage 0 inngest payload — no drift possible (T-83-09 mitigation)"
key-files:
  created: []
  modified:
    - web/app/api/automations/debtor-email/ingest/route.ts
    - web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts
    - web/app/api/automations/sales-email/ingest/route.ts
decisions:
  - "D-01 honored: Stage 0 inngest payload's body_text now carries msg.bodyText (full thread), not bodyUniqueText"
  - "D-02 honored: body_html + raw_json written on every new row (both columns pre-existed on email_pipeline.emails — no DDL needed)"
  - "D-03 honored: body_full_text + body_unique_text written on every new row"
  - "D-05 honored: same writer change applied to both swarms in a single plan"
  - "D-10 honored: body_text continues to be populated == bodyUniqueText for backward-compat during the dual-write release"
metrics:
  duration_minutes: 8
  tasks_completed: 3
  tasks_total: 3
  files_created: 0
  files_modified: 3
  completed_date: 2026-05-19
---

# Phase 83 Plan 03: Ingest Writer — Five-Field Body Persistence Summary

Wired the Plan 83-02 `FetchedMessageBody` shape into both ingest writers
(debtor-email + sales-email). Every newly-inserted `email_pipeline.emails`
row now carries the full thread (`body_full_text`), the unique-only text
(`body_unique_text`), raw HTML (`body_html`), and the verbatim Graph
envelope (`raw_json`) — while `body_text` continues to mirror
`body_unique_text` per the D-10 dual-write contract so existing consumers
see no behavior change.

## What Shipped

### Task 1 — Column existence verification (no-op)

Queried `information_schema.columns` via the Supabase Management API for
`email_pipeline.emails`. Both `raw_json` (jsonb) and `body_html` (text)
already existed on the live `mvqjhlxfvtqqubqgdvhz` project alongside the
new `body_full_text` and `body_unique_text` columns from Plan 83-01.

**Result:** No DDL needed; no migration file created. Task 1 acceptance
criteria branch "if both pre-existed" applies.

### Task 2 — debtor-email ingest writer (commit `46d31a0`)

`web/app/api/automations/debtor-email/ingest/route.ts`:

- Local `msg` shape widened from `{ subject, from, fromName, receivedAt, body }`
  to a five-body-field struct carrying `bodyText`, `bodyUniqueText`,
  `bodyHtml`, `rawJson`.
- `email_pipeline.emails` INSERT payload now writes:
  - `body_text: msg.bodyUniqueText` (D-10 dual-write — same semantics as today)
  - `body_full_text: msg.bodyText` (D-03)
  - `body_unique_text: msg.bodyUniqueText` (D-03)
  - `body_html: msg.bodyHtml` (D-02 — was empty before)
  - `raw_json: msg.rawJson` (D-02 — was empty before)
- Stage 0 `inngest.send` payload's `body_text` switched to `msg.bodyText`
  (full thread) per D-01 — the safety classifier now sees what humans see.

Test updates in `__tests__/route.test.ts`:

- `outlook.fetchMessageBody` mock returns the new 5-field shape.
- Existing happy-path assertion updated: `data.body_text` now expects
  the full-thread value (D-01).
- **New test pins the dual-write contract**: asserts the
  `email_pipeline.emails` INSERT payload carries `body_full_text` =
  full thread, `body_text` = unique-only, and `raw_json.conversationId`
  surfaces verbatim from the Graph envelope.

**Verification (live):**
- `cd web && npx vitest run app/api/automations/debtor-email/ingest/__tests__/route.test.ts` → **6/6 pass**
- `cd web && npx tsc --noEmit` (filtered to ingest files) → 0 errors

### Task 3 — sales-email ingest writer (commit `f485e17`)

`web/app/api/automations/sales-email/ingest/route.ts`:

- Same structural change as Task 2: local `msg` holder gets the four
  body fields from `fetchMessageBody`; `meta` holder keeps its four
  non-body fields.
- `email_pipeline.emails` INSERT writes the same five-field payload
  (`body_text`, `body_full_text`, `body_unique_text`, `body_html`,
  `raw_json`) with identical D-10 semantics.
- Stage 0 inngest payload's `body_text` switched to `msg.bodyText`.

No sales-email ingest test file exists (`app/api/automations/sales-email/ingest/__tests__/`
absent); none created per plan guidance — sales-email handler tests are
V10.0 territory.

**Verification:** `npx tsc --noEmit` clean for the file.

## Acceptance Criteria

Task 1:
- [x] `information_schema.columns` shows BOTH `raw_json` and `body_html`
  on `email_pipeline.emails` (verified via Management API: both present)
- [x] No migration file created (both columns pre-existed)
- [x] This SUMMARY notes "no raw_json DDL needed"

Task 2 (debtor-email):
- [x] `grep -c "body_full_text" web/app/api/automations/debtor-email/ingest/route.ts` → 1
- [x] `grep -c "body_unique_text" web/app/api/automations/debtor-email/ingest/route.ts` → 1
- [x] `grep -c "raw_json" web/app/api/automations/debtor-email/ingest/route.ts` → 1
- [x] `grep -c "body_html" web/app/api/automations/debtor-email/ingest/route.ts` → 1
- [x] `grep -c "body_text: msg.bodyUniqueText" .../debtor-email/ingest/route.ts` → 1 (D-10)
- [x] New test asserts INSERT payload contains literal `body_full_text` key
- [x] Vitest 6/6 pass; tsc clean

Task 3 (sales-email):
- [x] `grep -c "body_full_text" .../sales-email/ingest/route.ts` → 2 (insert + adjacent comment ref)
- [x] `grep -c "body_unique_text" .../sales-email/ingest/route.ts` → 1
- [x] `grep -c "raw_json" .../sales-email/ingest/route.ts` → 1
- [x] `grep -c "body_html" .../sales-email/ingest/route.ts` → 1
- [x] `grep -c "body_text: msg.bodyUniqueText" .../sales-email/ingest/route.ts` → 1 (D-10)
- [x] tsc clean

## Deviations from Plan

None for Rules 1-4. Plan executed exactly as written.

One small additive change worth flagging (not a deviation — explicitly
required by D-01 in the phase CONTEXT but not spelled out in this
plan's task action blocks): both routes' **Stage 0 inngest payload's
`body_text` field** is now `msg.bodyText` (full thread), not
`msg.bodyUniqueText`. The plan's `<action>` blocks focused on the DB
INSERT payload; the inngest send was the same `msg.body` reference and
flipping it is the whole point of D-01 (Stage 0 safety classifier needs
to see the full thread). Without this flip, the DB would carry full
threads but the live pipeline would still classify on the unique part.
Caught during Task 2 mid-edit; applied symmetrically in Task 3.

## Threat Flags

None. New surface (writing body_html + raw_json on every row) is
covered by the existing T-83-07 / T-83-08 dispositions (accept — schema
is service-role only; storage cost negligible). T-83-09 (dual-write
drift) is mitigated by construction: both `body_text` and
`body_unique_text` are sourced from the same `msg.bodyUniqueText`
reference within a single function scope, so they cannot drift.

## Self-Check: PASSED

- FOUND: web/app/api/automations/debtor-email/ingest/route.ts (modified)
- FOUND: web/app/api/automations/debtor-email/ingest/__tests__/route.test.ts (modified)
- FOUND: web/app/api/automations/sales-email/ingest/route.ts (modified)
- FOUND commit: 46d31a0 (feat(83-03): persist five-field body payload in debtor-email ingest)
- FOUND commit: f485e17 (feat(83-03): persist five-field body payload in sales-email ingest)
- Live DB confirmed via Management API: body_full_text, body_html, body_text, body_unique_text, raw_json all present on email_pipeline.emails.
- Vitest 6/6 pass on the debtor-email ingest test file (including the new Phase 83 D-02/D-03/D-10 assertion).
