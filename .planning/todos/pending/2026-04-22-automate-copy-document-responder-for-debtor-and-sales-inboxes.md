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

**Sequencing (revised 2026-04-22):** This is the SECOND phase. Phase 0 is the **triage agent** (see sibling todo `2026-04-22-triage-agent-debtor-sales-inbox-noise-filter.md`) — it drops OoO / auto-reply / PO-notification noise and routes the remaining actionable mail. The copy-document fetcher is the first concrete handler that the triage agent routes to. Build order: (0) triage agent, (1) fetcher tool, (2) minimal responder that consumes fetcher for copy-request route, (3) additional intent handlers. Reasons: fetcher is the high-risk piece (NXT SQL patterns, S3 structure, multi-entity routing, Zapier SDK payload limits for PDFs); ~45 copy-requests/month is a gentle pilot volume; swarm integration becomes a trivial tool-registration step once the fetcher works. DO NOT build a swarm on non-copy emails first — that's the harder intent space (disputes, address changes, complaints need judgment) and building it without the mechanical plumbing proven is backwards.

**Pre-flight spike (1 hour, do this before anything else):** Log into Zapier, find the NXT S3 connection, fetch ONE real document by hand via the Zapier SDK. If that works, rest is a straight build. If it doesn't (e.g. no S3 app linked to NXT account, or Zapier payload limit blocks PDFs), surface immediately — whole plan may need replanning.

**Phased build (after spike):**

1. **MVP — invoice-only fetcher** (highest volume + highest auto-ref-extraction rate). Exposed as `fetchDocument({ docType: 'invoice', reference, entity })`.
2. Wire into a minimal email responder as the first consumer — validates end-to-end flow.
3. Measure precision/recall over 4 weeks on real traffic.
4. Extend fetcher to work_order, contract, quote. Register each as the swarms start consuming them.
5. Skip certificate / location_sheet / order_confirmation (too low volume, <5/yr each — human-handle).

**Retire the keyword classifier:** the current `find-copy-requests.ts` keyword filter has ~31% recall and was a scaffolding step, not a production component. The Debtor/Sales swarms will LLM-classify *all* inbound emails (the existing `debtor.email_analysis` and `sales.email_analysis` tables already do this for routing) — copy-request detection happens there, not in a separate filter. The classification script stays useful only as an eval set for iterating the swarms' prompts.

**Architecture note — decouple the fetcher:**

The **document fetcher** (NXT SQL lookup → S3 retrieval → return PDF + metadata) must be a **standalone, reusable tool** — NOT embedded inside the email responder. It is consumed by multiple Orq.ai agent swarms we are building:

1. **Debtor Team swarm** — invokes the fetcher when handling AR emails that require attaching an invoice, credit note, statement, etc.
2. **Sales Team swarm** — invokes the fetcher when handling inbound sales emails requiring an offerte, werkbon, contract, location sheet, etc.
3. **Any future Orq.ai agent** — the fetcher is registered as a reusable tool in the Orq.ai tool registry so any swarm can call it

Interface: single function `fetchDocument({ docType, reference, entity }) → { pdfUrl | base64, metadata, notFoundReason? }`. Entity param handles Smeba/Berki/Sicli multi-tenant routing.

Deploy surface: **Vercel API route** (the HTTP endpoint the Orq.ai tool-call hits) + **Orq.ai tool registration** (so agents can discover and call it).

**Data access — use the Zapier SDK (`@zapier/zapier-sdk`) for BOTH NXT SQL and S3.**
- NXT SQL: Zapier `sql_server_find_multiple_rows_via_custom_query` / `sql_server_find_row_via_custom_query` (whitelisted-IP path is non-negotiable — no direct Vercel→NXT connection)
- S3 (NXT document backend): same Zapier SDK, S3 actions
- Do NOT hit S3 directly with AWS SDK from Vercel — keep a single credential boundary and auth path through Zapier
- Pattern already in use here: see `web/debtor-email-analyzer/src/fetch-emails.ts` for Zapier SDK invocation style

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
