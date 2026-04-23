# Brief: Debtor Email Agent Swarm (DEBTOR ONLY)

> **Scope:** This swarm is for **debtor mailboxes only**. Sales (`Smeba Brandbeveiliging BV`, `INFO@Smeba New Cases`, `verkoop@smeba.nl`) is out of scope — different intent taxonomy, different downstream systems, separate brief if/when needed. Any "debtor + sales" framing from earlier todos is obsolete.

**Status:** SKELETON — data samples + eval set to be filled in before invoking `/orq-agent`.
**Intended consumer:** `/orq-agent` skill (agent-swarm designer).
**Last updated:** 2026-04-22, to be completed 2026-04-23.

---

## 1. Problem

Debtor mailboxes (`debiteuren@smeba.nl`, `debiteuren@sicli-noord.be`, `debiteuren@berki.nl`, `debiteuren@smeba-fire.be`, `facturations@sicli-sud.be`) receive inbound customer mail that needs routing. A deterministic regex classifier already strips noise. The remaining mail — the `unknown` bucket — needs intent classification + handoff to dedicated sub-agents that can act on it, with drafts landing in iController for human review.

## 2. Existing infrastructure (non-negotiable constraints)

- **Regex classifier** — `web/lib/debtor-email/classify.ts`, 359 lines, 24 hand-iterated rules. Handles `auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`, `unknown`. Stays as-is. The swarm starts on the `unknown` output only.
- **Existing analysis tables** — `debtor.email_analysis` + `sales.email_analysis` already hold LLM-produced intent labels on ~8k inbound emails. Reusable as training/eval signal.
- **Stack (per `CLAUDE.md`):**
  - Orq.ai Router for all LLM calls (primary: `anthropic/claude-haiku-4-5-20251001` + 3-4 fallbacks)
  - Zapier SDK (`@zapier/zapier-sdk`) for **all** NXT data access — both SQL and S3 document retrieval. No direct AWS SDK, no direct DB. Zapier NXT automations already live in production — the path is proven.
  - Browserless.io + Playwright (`playwright-core`) for iController (no API exists)
  - Supabase for state + audit trail, Inngest for orchestration, Vercel for HTTP surfaces
  - Credentials in Supabase `credentials` table with `environment` column; default to acceptance
- **No direct email sending.** Drafts live in iController — the human debtor team accepts/sends from there as they already do.

## 3. Scope for the swarm

**In scope (phase 1):**
- Intent classification on the regex classifier's `unknown` bucket
- Copy-document sub-agent (dedicated): NXT SQL lookup → S3 PDF fetch → iController draft creation
- Shadow-mode → draft-assist progression, never full-auto on day one

**Out of scope (phase 2+):**
- Payment dispute handler
- Address change handler
- Peppol / credit request handlers
- Sales mailbox swarm (separate brief — different intent taxonomy)

## 4. Tools available to the swarm (implemented separately — not designed by `/orq-agent`)

These are HTTP endpoints exposed as Orq.ai tool-calls. Their internals (Zapier SDK, Browserless, Playwright, etc.) are engineering concerns, not swarm-design concerns. The swarm references them by contract.

### 4a. `fetchDocument` — LIVE, end-to-end tested 2026-04-23

- **Endpoint:** `POST https://agent-workforce-eosin.vercel.app/api/automations/debtor/fetch-document`
- **Auth:** `Authorization: Bearer <AUTOMATION_WEBHOOK_SECRET>`
- **Request:**
  ```json
  { "docType": "invoice", "reference": "33052208", "entity": "smeba" }
  ```
- **Response (real sample, 2026-04-23):**
  ```json
  {
    "found": true,
    "pdf": {
      "base64": "<~175k chars, ≈131KB PDF>",
      "filename": "20260420084919994294_nl-invoice-33052208.pdf"
    },
    "metadata": {
      "invoice_id": "2c9180839d49f41e019d721fcb5127c9",
      "customer_id": "551091",
      "document_type": "invoice",
      "bucket": "nxt-benelux-prod-valtimo-privatebucket8bb6c5b4-1axhb89plskxu",
      "key": "invoice/20260420084919994294_nl-invoice-33052208.pdf",
      "created_on": "2026-04-20 08:49:20"
    },
    "request_id": "<uuid>"
  }
  ```
- **Error responses:** `{found:false, reason, request_id}` with HTTP 400/404/502/504. Reasons: `invalid_reference_format | unsupported_doc_type | timeout | not_found | fetch_failed | upstream_error`.
- **Latency:** ≈26s end-to-end on happy path (Zap chain + PDF download). 50s internal timeout, 60s Vercel Pro ceiling.
- **MVP scope:** invoice only. Extensions (werkbon, contract, quote) = one Zap per doc-type following the same pattern.

**Architecture:**
```
Orq.ai agent tool-call
  → Vercel POST /api/automations/debtor/fetch-document
      → Supabase: INSERT pending row in debtor.fetch_requests
      → POST to Zap "MR · Debtor · Fetch Invoice" (webhook)
          Zap steps: Catch Hook → Filter(secret) → SQL1(invoice_number→UUID)
                   → SQL2(UUID→bucket+key) → S3 Get Object
                   → POST {pdf_url, metadata} to /fetch-document/callback
      → Vercel waits via Supabase Realtime (filter id=<uuid>, UPDATE event)
      → Callback route UPDATEs row with status='complete'
      → Realtime fires, Vercel downloads Zapier CDN pdf_url → base64 → response
  On timeout → 504 with request_id so caller can retry-poll (retry-poll NOT built — MVP).
```

Todo: `2026-04-22-tool-fetch-document-nxt-via-zapier-sdk.md`.

### 4b. `createIcontrollerDraft` — DEPLOYED, not yet E2E-tested

- **Endpoint:** `POST https://agent-workforce-eosin.vercel.app/api/automations/debtor/create-draft`
- **Auth:** `Authorization: Bearer <AUTOMATION_WEBHOOK_SECRET>` (also accepts legacy `x-automation-secret`)
- **Request (reply-mode MVP):**
  ```json
  {
    "messageId": "<iController internal id>",
    "bodyHtml": "<p>Beste ..., in bijlage ...</p>",
    "pdfBase64": "<base64 from fetchDocument>",
    "filename": "<from fetchDocument.filename>",
    "env": "production"
  }
  ```
- **Response (success):**
  ```json
  {
    "success": true,
    "draftUrl": "https://walkerfire.icontroller.eu/messages/compose/direction/reply/messageId/<id>",
    "screenshots": {
      "beforeSave": { "path": "...", "url": "<signed supabase storage url>" },
      "afterSave":  { "path": "...", "url": "<signed supabase storage url>" }
    },
    "bodyInjectionPath": "iframe"
  }
  ```
- **Response (failure):** `{ success:false, reason: "login_failed"|"message_not_found"|"attach_failed"|"save_failed", screenshot, details }` HTTP 500.
- **Backend:** Browserless.io (Amsterdam, `playwright-core`, `chromium.connectOverCDP`, `waitUntil:'domcontentloaded'`). Dedicated session key `icontroller_session_drafter`, validate-before-trust pattern. PDF attached via `input[type='file'].setInputFiles` (bypasses Dropzone click). Body via CKEditor iframe `innerHTML` assignment, textarea fallback.

Todo: `2026-04-22-tool-icontroller-create-draft.md`.

## 5. Proposed swarm shape (for `/orq-agent` to validate or redesign)

- **Intent agent** — consumes `unknown` bucket emails, outputs `{intent, sub_type, document_reference, urgency, language, confidence, reasoning}`. Intents: `copy_document_request | payment_dispute | address_change | peppol_request | credit_request | contract_inquiry | general_inquiry | other`.
- **Copy-Document sub-agent** — handles `copy_document_request`. Calls `fetchDocument` → if found, calls `createIcontrollerDraft` with the PDF → logs outcome. Doesn't implement those tools, just calls them.
- **Fallback** — routes everything else to the human-review queue for now.

Open for `/orq-agent` to reshape: is copy-document one agent or two (resolver + drafter split by tool-call)? Does the intent agent need a separate language-detect step? Is there a verifier after draft placement?

### 5a. Copy-document sub-agent composition (target for `/orq-agent`)

```
copy-document sub-agent receives:
  { email: {messageId, language, body, sender_email, entity, ...},
    intent_result: {document_reference, sub_type} }

  tool 1: fetchDocument({
    docType: intent_result.sub_type,
    reference: intent_result.document_reference,
    entity: email.entity
  })
  tool 2: createIcontrollerDraft({
    messageId: email.messageId,
    bodyHtml: <LLM-composed cover text in email.language>,
    pdfBase64: fetch.pdf.base64,
    filename: fetch.pdf.filename
  })

  return: { draft_created: true, draft_url, audit: {invoice_id, bucket, key, ...} }
```

**Sub-agent success criteria:**
- (a) Correct doc-reference resolution. Handle ambiguous invoice numbers — SQL1 currently picks most recent `invoice_date desc` as MVP disambiguation; production needs customer-aware disambiguation (match sender domain → customer_id).
- (b) Cover text matches sender's language. NL default, FR if sender is francophone.
- (c) Draft created, not sent. Human-in-the-loop stays in iController.

### 5b. Upstream sequencing (how copy-document gets triggered)

Per sibling todo `2026-04-22-intent-agent-for-unknown-bucket-debtor-mails.md`:

```
regex classifier (existing)
  → buckets: auto_reply | ooo_* | payment_admittance | unknown
  → only `unknown` flows onward

intent agent (to design)
  emits: {intent, sub_type, document_reference, language, confidence}
  routing rule:
    intent == 'copy_document_request'
    && confidence == 'high'
    && document_reference != null
      → copy-document sub-agent
    else → human review queue
```

## 6. Volume + language

- **Inbound debtor mail:** ~8,000 / 13 months across 5 mailboxes (~600/mo)
- **After regex classifier drops noise:** unknown bucket size — TO FILL IN from `debtor.email_analysis` query tomorrow
- **Copy-document requests (keyword-prefiltered + LLM-verified 2026-04-22, debtor only):** 125 confirmed in 13 months. Dominant doc type: invoice (78% have extractable reference).
- **Languages:** 92% NL, 6% EN, 2% DE, <1% FR
- **Entities:** Smeba (NL), Berki (NL), Sicli-Noord (BE), Sicli-Sud (BE), Smeba-Fire (BE) — legal + doc-template differences across NL/BE

## 7. Data samples — TO FILL IN 2026-04-23

Before invoking `/orq-agent`, fetch and paste in:

- [ ] **30-50 real `unknown` bucket emails** (anonymised if needed) covering the intent spread. Query:
  ```sql
  SELECT e.subject, e.body_text, e.sender_email, e.mailbox, e.received_at, a.email_intent
  FROM email_pipeline.emails e
  LEFT JOIN debtor.email_analysis a ON e.id = a.email_id
  WHERE e.direction = 'incoming'
    AND e.mailbox LIKE 'debiteuren@%'
    AND (a.category = 'unknown' OR a.category IS NULL)
  ORDER BY random() LIMIT 50;
  ```
- [ ] **2026-04-22 hand-labeled batch** (referenced in `classify.ts` comments as "Onbekend hand-picks") — primary eval set
- [ ] **200-email random control** from `/tmp/copy-requests-classified.json` — secondary eval set with copy-request labels
- [ ] **Current volume of `unknown`** (count of rows matching the query above) — sizing signal for LLM budget

## 8. Success criteria

- **Intent agent, shadow mode:** ≥90% agreement with human reviewers on 200-email labeled batch, confidence calibration within ±10%
- **Copy-document sub-agent, shadow mode:** ≥95% precision on `is this actually a copy request` + correct `document_reference` extraction on ≥85% of those
- **Live trigger:** sustained 4 weeks of shadow-mode performance at the above thresholds, plus ≥3 positive reviews from debtor team on sample drafts
- **Full auto-send:** NOT in scope for phase 1. Drafts always land in iController for human send.

## 9. Open questions for `/orq-agent` to surface

- Multi-entity prompt tuning: one intent agent for all 5 mailboxes with entity context injected, or 5 agents?
- Language handling: detect first + branch to language-specific drafter, or single multilingual drafter?
- Failure modes: what happens when NXT SQL finds multiple matches for an ambiguous reference? When S3 returns 404? When iController login fails mid-session?
- Observability: how does the debtor team see what the swarm decided and override it?
- Evaluation loop: how do human corrections in iController feed back as training signal for the intent agent?

## 10. Known limitations + non-obvious findings (bake these into agent prompts)

- **`exact_invoice_id` in NXT is NOT unique.** Same invoice number can map to multiple invoice rows (different entities, customers, billing cycles). SQL1 picks most recent `invoice_date` as MVP disambiguation. This is a known edge case, not a bug — production needs customer-aware disambiguation (derive `customer_id` from sender domain before SQL1).
- **`file_link.document_type` values are case-mixed** (`INVOICE`, `invoice`, `Invoice FR`, `proforma`, …). Safe filter is `document_type LIKE '%invoice%'` scoped by a specific `model_id`. This excludes `invoice training` / `invoice template s heeren loo` noise (different `model_id`s).
- **S3 Get Object via Zapier SDK returns a dehydrated file-token, not bytes** (team learning `aba90d71-d3d8-4f99-9d70-2c484b22f578`). Production path: Zap webhook → Return Response with `{{step.file}}` — hydration happens inside Zapier when the token flows into the downstream step (Return Response / POST with JSON payload_type).
- **`invoice/` vs `Invoice FR/` S3 prefixes** — each invoice is rendered in one locale per row; the fetcher returns whichever exists (no cross-locale selection logic needed).
- **Bucket name literally contains `-prod-`; no acceptance equivalent.** The fetcher always hits production S3, even in test flows. This is the one place the test-first pattern is waived by system constraint — document in runbook.

## 11. References

- `web/lib/debtor-email/classify.ts` — regex classifier (stays)
- `web/debtor-email-analyzer/src/classify-copy-requests.ts` — 2026-04-22 classification run (eval signal)
- `web/debtor-email-analyzer/src/categorize.ts` — existing LLM categorizer for `debtor.email_analysis`
- `docs/browserless-patterns.md` — iController browser automation patterns
- `docs/orqai-patterns.md` — Orq.ai prompt + tool-call patterns
- `CLAUDE.md` — stack constraints, credentials model, Zapier-first beslisboom
- Sibling todos:
  - `.planning/todos/pending/2026-04-22-intent-agent-for-unknown-bucket-debtor-mails.md` (swarm design)
  - `.planning/todos/pending/2026-04-22-automate-copy-document-responder-for-debtor-and-sales-inboxes.md` (swarm design — copy-document sub-agent)
  - `.planning/todos/pending/2026-04-22-tool-fetch-document-nxt-via-zapier-sdk.md` (engineering — fetcher tool)
  - `.planning/todos/pending/2026-04-22-tool-icontroller-create-draft.md` (engineering — drafter tool)
