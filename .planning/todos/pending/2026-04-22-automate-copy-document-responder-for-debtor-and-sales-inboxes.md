---
created: 2026-04-22T16:59:18.760Z
title: Automate copy-document responder for debtor and sales inboxes
area: automation
files:
  - web/debtor-email-analyzer/src/classify-copy-requests.ts
  - web/debtor-email-analyzer/src/find-copy-requests.ts
  - /tmp/copy-requests-classified.json
---

## Problem

Customers email `debiteuren@*` and sales inboxes asking for copies of business documents (invoice, work order, contract, quote, certificate, location sheet, etc.). Today this is handled manually: read email → look up in NXT → fetch PDF from S3 → reply.

**Volume (13-mo sample, Apr 2025 → Apr 2026):**
- LLM-confirmed copy-requests: **197** (keyword filter precision 21%)
- Recall-corrected estimate: **~580 total → ~45/month**, trending up; Feb–Mar 2026 showed 23–30/month confirmed
- 92% Dutch, 6% English, 2% German, <1% French

**Document breakdown (LLM-confirmed n=197):**
| Doc type | Count | Debtor | Sales | Ref extractable |
|---|---:|---:|---:|---:|
| Invoice / factuur | 85 | 42 | 43 | **78%** |
| Contract | 36 | 6 | 30 | 19% |
| Quote / offerte | 27 | 0 | 27 | 41% |
| Work order / werkbon | 17 | 0 | 17 | 53% |
| Delivery note | 7 | 0 | 7 | 57% |
| Statement / rekeningoverzicht | 6 | 4 | 2 | 67% |
| Certificate | 5 | 0 | 5 | 40% |
| Location sheet | 4 | 0 | 4 | 25% |
| Credit note | 3 | 1 | 2 | 67% |
| Order confirmation | 1 | 0 | 1 | 100% |

**ROI:** ~45 req/month × ~8 min handling = ~72 hrs/yr ≈ **€2,800–3,600/yr** manual cost. Automation realistic coverage: ~40% full-auto (invoice + extractable ref), ~25% draft-assist. Net savings ~60 hrs/yr ≈ €2,500/yr. Modest on labor alone, but the pipeline (NXT SQL + S3 + email send) is reusable infrastructure.

**Critical finding:** keyword filter has ~31% recall. Production classifier MUST use LLM, not keywords. Most missed pattern: `FW: Documenten n.a.v. uitgevoerde werkzaamheden. Factuur: NNNNNNNN` — customer forwards Smeba's auto-doc-mail to their own AP team.

## Solution

**Phased build:**

1. **MVP — invoice-only** (highest volume + highest auto-ref-extraction rate = cleanest win)
2. Measure precision/recall over 4 weeks on real traffic
3. Extend to work_order, contract, quote if MVP holds up
4. Skip certificate / location_sheet / order_confirmation (too low volume, <5/yr each)

**Architecture note — decouple the fetcher:**

The **document fetcher** (NXT SQL lookup → S3 retrieval → return PDF + metadata) must be a **standalone, reusable tool** — NOT embedded inside the email responder. It should be callable from multiple triggers:

1. **Debtor Team** — direct invocation (internal UI button, Slack slash command, or Zapier step) when they want to pull a doc manually without going through NXT UI
2. **Sales Team** — same pattern, different consumers (e.g. pulling an offerte or werkbon during a customer call)
3. **Orq.ai agents** — exposed as a tool-call (function/tool definition) so any agent in the swarm can fetch a document as part of a larger workflow
4. **Email responder automation** (this todo's primary consumer) — calls the same tool

Interface: single function `fetchDocument({ docType, reference, entity }) → { pdfUrl | base64, metadata, notFoundReason? }`. Entity param handles Smeba/Berki/Sicli multi-tenant routing. Deployed as: Vercel API route + Orq.ai tool registration + Zapier app action.

**Pipeline:**
```
Inbound email (Graph API or Zapier trigger)
  → LLM classifier (claude-haiku-4-5, JSON schema)
      { is_copy_request, document_type, document_reference, confidence, language }
  → If is_copy_request && confidence=high && ref extracted:
      → NXT SQL via Zapier (whitelisted IP) to resolve ref → document metadata + S3 key
      → Fetch PDF from S3 (NXT backend)
      → Compose reply in sender's language (NL default)
      → Send via Graph API
  → Else: draft-assist mode → queue for human review with pre-filled draft
```

**Stack (per CLAUDE.md):**
- Trigger: Zapier (first choice) or Vercel webhook from Graph API
- LLM: Orq.ai Router, `anthropic/claude-haiku-4-5-20251001` + fallbacks
- NXT SQL: Zapier custom query step (only path to NXT DB — whitelisted IP)
- S3: AWS SDK from Vercel function (NXT backend bucket — get credentials from ops)
- Email send: Graph API via service account
- State / audit log: Supabase (`automation_copy_requests` table — who asked, what we sent, precision tracking)

**Open questions before planning:**
- Which S3 bucket holds NXT documents? Bucket/region/credentials?
- Email send: from which mailbox? (`debiteuren@smeba.nl` direct, or a dedicated automation sender with reply-to?)
- Human-in-the-loop for first 4 weeks: slack approval before send, or auto-send with post-hoc audit?
- Multi-entity: Smeba / Berki / Sicli-Noord / Sicli-Sud / Smeba-Fire — one NXT or separate? Different S3 buckets?
- Legal: is auto-sending invoice copies by email acceptable for all entities (BE vs NL)?

**Reference data:**
- Classification script: `web/debtor-email-analyzer/src/classify-copy-requests.ts`
- Raw labeled dataset (1,124 emails): `/tmp/copy-requests-classified.json` — use as eval set for prompt iteration
- Candidate selector: `web/debtor-email-analyzer/src/find-copy-requests.ts`

**Suggested first session:** `/gsd:new-project` to scope an mr-automation, with invoice-copy-responder as phase 1.
