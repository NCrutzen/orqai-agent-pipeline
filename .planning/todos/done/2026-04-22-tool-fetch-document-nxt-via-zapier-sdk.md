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

## Findings from 2026-04-23 spike

- **End-to-end chain proven via Zapier SDK.** Invoice number → UUID → S3 coords works. SDK call is `zapier.runAction({ app: "sql-server" OR "MSSQLCLIAPI", actionType: "search", action: "row_custom_query", connection: <id>, inputs: { query } })` — NOT `find_row_via_custom_query` (that name is MCP-only).
- **Confirmed Zapier identifiers.**
  - SQL Server connection: `Zapier MR V2 SQL Server`, id `62591150`, app_key `MSSQLCLIAPI`.
  - S3 connection: `eu-west-1`, id `58743406`, app_key `S3CLIAPI`, marked `shared_with_all=true` (group: "CURA BHV's Team"). Listing shared connections requires `canIncludeSharedConnections: true` in `createZapierSdk()` or env `ZAPIER_CAN_INCLUDE_SHARED_CONNECTIONS=true`.
  - S3 Get Object takes a single input `s3Url` in form `s3://bucket/key`.
- **BLOCKER — S3 bytes cannot be fetched via pure SDK.** S3 Get Object returns a Zapier hydrate token in the `file` field (e.g. `hydrate|||eJyV...|||hydrate`, 446 chars, Django-signed opaque pointer). The SDK ships no rehydration method. See team learning `aba90d71-d3d8-4f99-9d70-2c484b22f578` in the `learnings` table (system=`zapier`).
- **Chosen path forward — one Zap per doc-type.** Zap shape: `Webhooks Catch Hook → shared-secret Filter → SQL #1 (resolve number) → SQL #2 (file_link ⋈ s3_resource) → Amazon S3 Get Object → Webhooks Return Response emitting the hydrated file-URL plus metadata`. Vercel route `POST /api/automations/debtor/fetch-document` is a thin proxy: auth check → POST to the Zap URL → download the short-TTL Zapier CDN URL → return base64 + metadata. Naming convention: `MR · Debtor · Fetch Invoice`, `MR · Debtor · Fetch Werkbon`, etc. MVP is invoice-only; extension is "clone the Zap per doc-type" — NOT Zapier Paths (clunky, hard to test).
- **document_type taxonomy for `model_type='Invoice'`.** Filter with `document_type IN ('INVOICE', 'Invoice FR')`. Earlier `LIKE '%invoice%'` was too loose — it swept in `invoice training` (2,934) and `invoice template s heeren loo` (972), not real customer invoices. Full distribution: `INVOICE` 217k, `Invoice FR` 21k, `proforma` 7.7k, `invoice training` 2.9k, `invoice template s heeren loo` 972, `proforma FR` 132, null 1. Ignoring proforma for now; if customers request proforma copies, that's a separate doc-type.
- **Test record confirmed fetchable.** Invoice `33054518` → UUID `2c9180839d880fa2019db02dfe1055e5` → `s3://nxt-benelux-prod-valtimo-privatebucket8bb6c5b4-1axhb89plskxu/Invoice FR/20260422130742465411_nl-Invoice-FR-33054518.pdf`. Use this as the test record when wiring the Vercel route.
- **Env plumbing.** Vercel already has `ZAPIER_CREDENTIALS_CLIENT_ID` and `ZAPIER_CREDENTIALS_CLIENT_SECRET` (note the `_CREDENTIALS_` infix — existing `web/debtor-email-analyzer/src/config.ts` reads `ZAPIER_CLIENT_ID/SECRET` which is a naming mismatch; new code should read the Vercel names directly since the SDK auto-picks them up). New vars to add for the fetcher: `DEBTOR_FETCH_WEBHOOK_URL_INVOICE` + `DEBTOR_FETCH_WEBHOOK_SECRET`. Set `ZAPIER_CAN_INCLUDE_SHARED_CONNECTIONS=true` if we ever call the SDK outside a Zap.
- **Newly-surfaced open questions** (do not delete existing Open Questions section; these are additional):
  - `document_type = "Invoice FR"` — confirmed FR = French locale (user answer 2026-04-23). Invoices are rendered in exactly one locale per row; no multi-locale variants to pick between. Fetcher does not choose a language; it returns whatever locale the invoice was generated in.
  - Bucket name literally contains `-prod-` — all spike calls hit production data. Per CLAUDE.md test-first: flag this clearly in the route's log output (`ENVIRONMENT: PRODUCTION`).

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
