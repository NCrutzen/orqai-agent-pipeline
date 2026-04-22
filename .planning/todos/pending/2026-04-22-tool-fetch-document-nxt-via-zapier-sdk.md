---
created: 2026-04-22T18:30:00.000Z
title: Build fetchDocument tool — NXT SQL + S3 via Zapier SDK (Vercel API route)
area: automation
files:
  - web/debtor-email-analyzer/src/fetch-emails.ts
---

## Problem

The debtor swarm's copy-document sub-agent needs a concrete tool to resolve a customer's document request ("please send invoice 17006798") into an actual PDF from NXT. Today this is a manual lookup: open NXT, find the invoice, download the PDF from S3, attach it in iController. We need this as an HTTP-callable function so the sub-agent can invoke it as an Orq.ai tool-call.

This is **engineering**, not swarm design. `/orq-agent` references this tool by its contract; the implementation lives separately.

## Solution

Single Vercel API route:

```
POST /api/automations/debtor/fetch-document

Request:
{
  "docType": "invoice" | "work_order" | "contract" | "quote" | "certificate" | "delivery_note" | "credit_note" | "statement",
  "reference": "17006798",
  "entity": "smeba" | "berki" | "sicli-noord" | "sicli-sud" | "smeba-fire"
}

Response (success):
{
  "found": true,
  "pdf": { "base64": "...", "filename": "factuur-17006798.pdf" },
  "metadata": { "customer_id": 431221, "invoice_date": "2026-03-04", "amount_eur": 1234.50, ... }
}

Response (not found / ambiguous):
{
  "found": false,
  "reason": "not_found" | "ambiguous" | "entity_mismatch" | "invalid_reference_format",
  "candidates": [...]
}
```

**Implementation uses Zapier SDK for BOTH SQL and S3** (per `learnings` table id `1aca2247-80d7-4d33-8a5f-c331d0500f07` and `CLAUDE.md`). No direct AWS SDK, no direct DB connection. Pattern reference: `web/debtor-email-analyzer/src/fetch-emails.ts`.

**Doc-type → NXT table map (TO CONFIRM with ops team):**
- `invoice` → factuurtabel, PK = factuurnummer
- `work_order` → werkbontabel, PK = werkbonnummer
- `contract` → contracttabel
- etc.

Each doc-type needs: (1) SQL query to resolve reference → S3 key + metadata, (2) S3 fetch of the PDF. Parameterise the Zapier actions accordingly.

**Entity routing:** Smeba / Berki / Sicli-Noord / Sicli-Sud / Smeba-Fire may live in separate NXT tenants or separate DBs. Clarify with ops — the `entity` parameter drives which Zapier connection/account is used.

## Open questions

- Do all 5 entities share one NXT instance, or separate? Separate means separate Zapier connections.
- S3 key convention per doc-type — is it `{entity}/invoice/{year}/{reference}.pdf` or something else? Ask ops.
- Size limits: some Zapier actions cap payload at 25MB. If a PDF is larger (multi-page work orders with photos), we may need a signed-URL return pattern instead of base64 in the response.
- Caching: same invoice requested multiple times per day — should we cache S3 blobs in Supabase storage for a short TTL?
- Authz: the HTTP endpoint must reject calls not coming from our Orq.ai tool-calls. Signed webhook secret or IP allowlist?

## Phased build

1. **Invoice-only MVP** — one doc-type, one entity (Smeba). Prove end-to-end: Orq.ai tool-call → Vercel route → Zapier SQL → Zapier S3 → response.
2. Extend to other doc-types (work_order, contract, quote). Each adds one SQL query + one S3 pattern.
3. Extend to other entities (Berki, Sicli-Noord, Sicli-Sud, Smeba-Fire). Each adds one Zapier connection.

## Sequencing

Part of the debtor-email-automation sub-project. Built in parallel with the iController drafter tool (`2026-04-22-tool-icontroller-create-draft.md`). Both must exist before `/orq-agent` designs the swarm that consumes them — see sibling `2026-04-22-automate-copy-document-responder-for-debtor-and-sales-inboxes.md` and `2026-04-22-intent-agent-for-unknown-bucket-debtor-mails.md`.
