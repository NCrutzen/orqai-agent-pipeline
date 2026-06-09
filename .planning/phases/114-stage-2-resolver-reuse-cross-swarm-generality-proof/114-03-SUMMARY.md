---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
plan: 03
subsystem: sales-email-ingest + stage-2-resolution-input
tags: [outlook-ingest, has_attachments, sender_email, identifier-mining, D-04, D-14]
requires:
  - email_pipeline.emails (has_attachments + sender_email columns — exist live)
  - web/lib/outlook/client.ts (Graph fetch helpers)
provides:
  - robust sender extraction (from→sender fallback) for all Outlook ingest
  - has_attachments capture for new sales mail
  - web/scripts/sales-identifier-mining.ts (D-04 corpus-mining script)
  - web/scripts/output/sales-identifier-mining.json (Plan 04 precedence input)
affects:
  - Plan 04 (reads the mining report to set resolution_config.precedence)
  - any Outlook-ingested swarm (sender/attachment fixes are swarm-agnostic)
tech-stack:
  added: []
  patterns:
    - "Graph from→sender fallback for robust sender extraction"
    - "offline corpus-mining script (tsx) with dual-denominator correction (Pitfall 4)"
key-files:
  created:
    - web/lib/outlook/__tests__/fetch-shape.test.ts
    - web/scripts/sales-identifier-mining.ts
    - web/scripts/output/sales-identifier-mining.json
  modified:
    - web/lib/outlook/client.ts
    - web/app/api/automations/sales-email/ingest/route.ts
decisions:
  - "D-14 fix-forward only: no 354-row sender backfill, no attachment backfill (decision recorded below)"
  - "Identifier kinds discovered from corpus, not hand-curated (D-04); report sorted highest-frequency first"
metrics:
  duration: ~7m
  completed: 2026-06-04
  tasks: 4
  files: 5
---

# Phase 114 Plan 03: Ingest-Gap Prereqs + Identifier Mining Summary

Hardened Outlook ingest to capture `has_attachments` and a robust sender (Graph `from`→`sender` fallback), then mined the verkoop@ corpus for data-driven identifier-kind frequencies (D-04) with the null-sender denominator explicitly corrected — the committed report is Plan 04's precedence input.

## What Was Built

**Task 1 — Outlook ingest hardening (`581ed626`)**
- Added `hasAttachments` + `sender` to the Graph `$select` in BOTH `fetchMessageBody` and `getMessageMeta` (`web/lib/outlook/client.ts`).
- Sender extraction now prefers Graph `from`, falls back to Graph `sender` when `from` is empty/absent. Surfaced `from`/`fromName`/`hasAttachments` on `FetchedMessageBody` and the meta return shape.
- Ingest insert writes `has_attachments: meta.hasAttachments ?? false`; `sender_email` uses meta (`from`→`sender`) with a secondary fall-back to the body-call's resolved sender.
- Changes are swarm-agnostic (no `if swarm === 'sales-email'` branch) — they benefit any Outlook-ingested mailbox.

**Task 2 — fetch-shape regression tests (`107c2735`)**
- `web/lib/outlook/__tests__/fetch-shape.test.ts`: 9 cases over mocked `graphFetch` pinning the `from`→`sender` fallback and `hasAttachments` propagation for both `fetchMessageBody` and `getMessageMeta`, including the residual-gap case (neither `from` nor `sender` → empty string → ingest writes null). Full `lib/outlook` suite: 22/22 green.

**Task 3 — identifier-mining script + report (`c61c5300`)**
- `web/scripts/sales-identifier-mining.ts`: read-only `tsx` analysis over `email_pipeline.emails` (mailbox=verkoop@smeba.nl, direction=inbound) via the service-role client. Reports per-kind count + percentage over subject + `body_full_text`, with regex shapes DISCOVERED from the corpus.
- `web/scripts/output/sales-identifier-mining.json`: committed frequency report — Plan 04's data-driven `resolution_config.precedence` input.

**Task 4 — D-04 data-driven gate (verified, see Checkpoint section)**

## Mining Report (the Plan 04 precedence input)

Denominators (Pitfall 4 correction): **total inbound = 1282**, **rows_with_sender_email = 928**, **excluded null-sender = 354 (27.6%)**. Sender-dependent resolution rates MUST use 928 as the denominator; null-sender rows are "no input", not NXT-misses.

Sender composition (of 928 with-sender): external_business=621, freemail=26, own_tenant_forwards=281 (the 23% internal-forward case → D-07 quoted-sender extraction).

Identifier kinds, sorted highest-frequency first (count / %total / %with-sender):

| kind | status | count | %total | %w/sender |
|------|--------|-------|--------|-----------|
| postcode_site | confirmed | 706 | 55.1% | 76.1% |
| offertenummer_sb | confirmed | 284 | 22.2% | 30.6% |
| case_ref | candidate | 227 | 17.7% | 24.5% |
| factuurnummer | confirmed | 84 | 6.6% | 9.1% |
| ordernummer | candidate | 58 | 4.5% | 6.3% |
| offertenummer_smeq | confirmed | 46 | 3.6% | 5.0% |
| werkordernummer | confirmed | 40 | 3.1% | 4.3% |
| klant_debiteurnummer | candidate | 7 | 0.5% | 0.8% |

Discovered regex shapes (validated before any future NXT lookup, V5): `SB\d{5,6}` (offerte), `SME[QB]\s?\d{4,6}` (Smeq quote), `werkorder\s*\d{5,8}`, `CASE:\s?\d{4,7}`, `(17|25|30|32|33)\d{6}` (NXT invoice, reuses debtor `extract-invoices.ts` prefixes), NL postcode `[1-9][0-9]{3}\s?[A-Za-z]{2}` → NXT Site, `order...\d{4,8}`, `(klant|debiteur)...\d{3,8}`.

## Root Cause: 28% null sender_email

The ingest reads `from.emailAddress.address`; Graph **omits `from` on some message classes** (drafts, certain delegated / shared-mailbox sends, and some forward variants), so `getMessageMeta` returned `""` → ingest wrote `null`. The fix-forward adds Graph's `sender` field (the verified submitting account, distinct from `from`) to the `$select` and prefers `from` then `sender`, recovering the address in those cases. A residual gap remains only when Graph omits BOTH fields (documented by a test). Note: the corpus has grown to 1282 inbound rows (todo snapshot was 1273); null-sender share is steady at ~27.6%.

## Backfill Decision (D-14, recorded per todo acceptance)

**No backfill in this plan — fix-forward only.**
- **sender_email (354 rows):** NOT backfilled here. Graph message-ids are in `source_id`, so a future backfill is mechanically possible (re-fetch `from`/`sender` per id). Deferred: resolution-rate metrics correct for the gap via the dual denominator (rows_with_sender_email) while it exists, so the gap does not block Stage 2 measurement honesty. Recommend a one-off backfill script only if the 354 rows prove materially resolvable.
- **has_attachments (all rows false):** NOT backfilled here. New mail captures it going forward. Report shows `rows_with_attachments=0` (expected until backfill/new mail). A backfill (re-fetch `hasAttachments` per `source_id`) is deferred — useful for retro Stage-2/Stage-3 corpus signal but not a Plan 03 blocker.

## Checkpoint: Task 4 (D-04 data-driven gate) — SATISFIED

The blocking checkpoint forces the mining script to have actually RUN (not be a "written-but-unrun" stub). Verified within this execution:
1. `web/scripts/output/sales-identifier-mining.json` is git-tracked (committed `c61c5300`) and non-empty.
2. All 8 identifier kinds have real (>0) counts — no placeholder/TODO/zero values.
3. Both denominators reported (total=1282, rows_with_sender_email=928) with excluded null-sender=354 stated.
4. The script was run against the live verkoop@ corpus via service-role (Management-API cross-check confirmed the same counts).
The Task 3 escape hatch (write-but-unrun) was NOT taken; credentials were available at execute time. Plan 04 is unblocked to set a data-driven precedence.

## Deviations from Plan

None — plan executed as written. (Task 1 implemented the fetch-shape fix before Task 2's tests per the plan's task ordering; the Task 2 tests therefore passed on first run as a regression guard rather than strict RED-first — this matches the plan's intent: "These tests are the regression guard for the ingest-gap fix.")

## Known Stubs

None. The mining report contains real frequencies; `has_attachments=0` in the report is correct (the column was false on all historical rows; the ingest fix populates it for new mail only — documented, not a stub).

## Self-Check: PASSED

- web/lib/outlook/client.ts — FOUND (modified)
- web/app/api/automations/sales-email/ingest/route.ts — FOUND (modified)
- web/lib/outlook/__tests__/fetch-shape.test.ts — FOUND
- web/scripts/sales-identifier-mining.ts — FOUND
- web/scripts/output/sales-identifier-mining.json — FOUND (tracked, non-empty)
- Commits 581ed626, 107c2735, c61c5300 — present in git log
