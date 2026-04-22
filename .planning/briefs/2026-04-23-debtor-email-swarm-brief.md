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

- **`fetchDocument`** — `POST /api/automations/debtor/fetch-document`. Input: `{docType, reference, entity}`. Output: `{found, pdf?, metadata?, reason?}`. Zapier SDK backend for NXT SQL + S3. Todo: `2026-04-22-tool-fetch-document-nxt-via-zapier-sdk.md`.
- **`createIcontrollerDraft`** — `POST /api/automations/debtor/create-draft`. Input: `{messageId, bodyHtml, pdfBase64, filename}`. Output: `{success, draftUrl, screenshots}`. Browserless+Playwright backend targeting `/messages/compose/direction/reply/messageId/{id}`. Todo: `2026-04-22-tool-icontroller-create-draft.md`.

## 5. Proposed swarm shape (for `/orq-agent` to validate or redesign)

- **Intent agent** — consumes `unknown` bucket emails, outputs `{intent, sub_type, document_reference, urgency, language, confidence, reasoning}`. Intents: `copy_document_request | payment_dispute | address_change | peppol_request | credit_request | contract_inquiry | general_inquiry | other`.
- **Copy-Document sub-agent** — handles `copy_document_request`. Calls `fetchDocument` → if found, calls `createIcontrollerDraft` with the PDF → logs outcome. Doesn't implement those tools, just calls them.
- **Fallback** — routes everything else to the human-review queue for now.

Open for `/orq-agent` to reshape: is copy-document one agent or two (resolver + drafter split by tool-call)? Does the intent agent need a separate language-detect step? Is there a verifier after draft placement?

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

## 10. References

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
