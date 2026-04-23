# Blueprint: debtor-email-swarm

## 1. Swarm Name and Scope

**Swarm name:** `debtor-email-swarm`
**Domain:** `debtor-email` (matches directory convention, covers intent routing + copy-document automation + phase 2 stubs)
**Agent count:** 8 (2 fully specified, 6 stubs)
**Phase 1 build targets:** `debtor-intent-agent`, `debtor-copy-document-body-agent`

## 2. Orchestration Pattern

**Pattern:** `external-orchestration (Inngest)` — NOT a standard Orq.ai pattern.

**Critical deviation from default architect output:** Orq.ai `team_of_agents` / `call_sub_agent` / agent-as-tool wiring is **NOT used**. Each Orq agent is a pure LLM-only invocation (`completion` or single-shot agent call with no tools). All tool-calls (`fetchDocument`, `createIcontrollerDraft`) execute as Inngest `step.run()` calls in TypeScript, not inside the agent's tool loop.

**Rationale:**
- **Durable retries** — `fetchDocument` is ≈26s latency with a 50s internal timeout; transient failures need Inngest's exponential backoff, not LLM-loop retries that burn tokens and lose state.
- **HITL `waitForEvent`** — Phase 2 agents (payment-dispute, etc.) will block on human review; Inngest's `step.waitForEvent` is the idiomatic pattern, not Orq's.
- **Per-step replay** — Intent classification, fetchDocument result, body generation, draft creation are each cacheable/replayable. An Orq agent loop re-runs the whole prompt on retry.
- **Expensive-tool cache** — NXT SQL + S3 download is expensive. Caching the `fetchDocument` result keyed on `(docType, reference, entity)` belongs in Inngest/Supabase, not in an Orq agent memory.
- **Observability boundaries stay clean** — Orq.ai Analytics tracks LLM calls; Inngest tracks orchestration. Mixing agent-as-tool muddles both dashboards.

**Cross-system correlation:** Every Orq invocation receives `variables: { email_id, inngest_run_id, stage }` so traces join across Orq Analytics ↔ Inngest runs ↔ Supabase `debtor.agent_runs`.

**Flow (authoritative):**
```
regex classifier (existing) → unknown bucket
  ↓
Inngest: debtor-email-triage fn
  step.run("classify-intent") → Orq debtor-intent-agent (LLM only)
  step.run("route-by-intent") → switch on intent_result
    case copy_document_request & confidence=high & ref!=null:
      step.run("fetch-document")      → HTTP POST fetchDocument
      step.run("generate-body")       → Orq debtor-copy-document-body-agent (LLM only)
      step.run("create-draft")        → HTTP POST createIcontrollerDraft
      step.run("persist-run")         → Supabase debtor.agent_runs
    case *: step.run("human-queue") → Supabase + Kanban state
```

## 3. Agent Roster

### Fully Specified (Phase 1)

#### 1. `debtor-intent-agent`

- **Role:** Classify `unknown`-bucket debtor emails into actionable intents with document reference extraction.
- **Pattern:** Single-shot LLM (no tools, no KB)
- **Model (primary):** `anthropic/claude-haiku-4-5-20251001`
- **Fallback chain:**
  1. `openai/gpt-4o-mini`
  2. `google-ai/gemini-2.5-flash`
  3. `anthropic/claude-3-5-haiku-20241022`
- **Rationale:** High-volume (estimated 50–150/day across 5 mailboxes post-regex), latency-sensitive, closed-taxonomy classification with best-effort extraction. Haiku tier; Sonnet overkill at this volume. Validate multilingual NL/DE/FR before lock.
- **Client timeout:** 45s
- **Knowledge base:** none
- **Tools:** none

**Input schema (variables passed by Inngest):**
```json
{
  "email_id": "uuid",
  "inngest_run_id": "string",
  "stage": "classify",
  "subject": "string",
  "body_text": "string",
  "sender_email": "string",
  "sender_domain": "string",
  "mailbox": "debiteuren@{entity}.{tld}",
  "entity": "smeba|berki|sicli-noord|sicli-sud|smeba-fire",
  "received_at": "iso8601"
}
```

**Output JSON-schema:**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["intent", "sub_type", "document_reference", "urgency", "language", "confidence", "reasoning", "intent_version"],
  "properties": {
    "intent": {
      "type": "string",
      "enum": ["copy_document_request", "payment_dispute", "address_change", "peppol_request", "credit_request", "contract_inquiry", "general_inquiry", "other"]
    },
    "sub_type": {
      "type": ["string", "null"],
      "description": "For copy_document_request: invoice|credit_note|werkbon|contract|quote|statement. Null for other intents in v1."
    },
    "document_reference": {
      "type": ["string", "null"],
      "description": "Best-effort normalized reference. Null if not present."
    },
    "urgency": { "type": "string", "enum": ["low", "normal", "high"] },
    "language": { "type": "string", "enum": ["nl", "en", "de", "fr"] },
    "confidence": { "type": "string", "enum": ["low", "medium", "high"] },
    "reasoning": { "type": "string", "maxLength": 500 },
    "intent_version": { "type": "string" }
  }
}
```

**Guardrails:**
- Regex post-validator on `document_reference` format (digits-only, min 5 chars for invoices); downgrades `confidence` on mismatch.
- If `intent == copy_document_request` + `document_reference == null` → Inngest forces human-queue (not agent's responsibility).
- No PII leakage; `reasoning` stays short + factual.
- Temperature 0 for idempotency.

---

#### 2. `debtor-copy-document-body-agent`

- **Role:** Generate cover-letter HTML body for copy-document reply in sender's language, within guardrails.
- **Pattern:** Single-shot LLM (no tools, no KB)
- **Model (primary):** `anthropic/claude-sonnet-4-6`
- **Fallback chain:**
  1. `openai/gpt-4o`
  2. `google-ai/gemini-2.5-pro`
  3. `anthropic/claude-sonnet-4-5`
- **Rationale:** Lower volume (~10/month now, growing), quality-sensitive multilingual tone (NL/BE legal nuance), relaxed latency (HITL downstream). Sonnet justified.
- **Client timeout:** 45s
- **Knowledge base:** none (entity + language context via variables)
- **Tools:** none

**Input schema (variables):**
```json
{
  "email_id": "uuid",
  "inngest_run_id": "string",
  "stage": "generate_body",
  "email": {
    "subject": "string",
    "body_text": "string",
    "sender_email": "string",
    "sender_first_name": "string|null",
    "mailbox": "string",
    "entity": "smeba|berki|sicli-noord|sicli-sud|smeba-fire",
    "language": "nl|en|de|fr"
  },
  "intent_result": {
    "intent": "copy_document_request",
    "sub_type": "invoice|credit_note|...",
    "document_reference": "string"
  },
  "fetched_document_metadata": {
    "invoice_id": "string",
    "filename": "string",
    "document_type": "string",
    "created_on": "iso8601"
  },
  "body_version": "string"
}
```

**Output JSON-schema:**
```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["body_html", "detected_tone", "body_version"],
  "properties": {
    "body_html": {
      "type": "string",
      "description": "Cover letter HTML. MUST end with <hr> + monospace metadata footer. No signature block."
    },
    "detected_tone": {
      "type": "string",
      "enum": ["neutral", "de-escalation"]
    },
    "body_version": { "type": "string" }
  }
}
```

**Guardrails:**
- Footer regex-validator: MUST contain all 5 fields (intent, confidence, ref, body_version, email_id).
- No-signature detector rejects invented sig blocks.
- Language consistency regex (NL keywords vs FR keywords).
- Temperature 0 (idempotency for replay).
- Emotion trigger narrow: `!`, "waar blijft", "al weken", EN/FR/DE equivalents → 1 de-escalation sentence, no fault-admission.

---

### Stub Agents (Phase 2+)

See `agents/*-stub.md` for minimal trigger + input-sketch cards.

## 4. Tool Assignments

**For Orq agents:** NONE.

**External tools (invoked by Inngest `step.run()`, NOT by Orq agents):**

| Tool | Owner | Endpoint | Invoked by |
|---|---|---|---|
| `fetchDocument` | Vercel + Zapier SDK | `POST agent-workforce-eosin.vercel.app/api/automations/debtor/fetch-document` | Inngest step `fetch-document` |
| `createIcontrollerDraft` | Vercel + Browserless | `POST agent-workforce-eosin.vercel.app/api/automations/debtor/create-draft` | Inngest step `create-draft` |

Auth: `Bearer ${AUTOMATION_WEBHOOK_SECRET}`. Not part of any Orq agent spec.

**Extension note:** `fetchDocument` response will gain `{ambiguous: true, match_count: N}`. Inngest routes ambiguous → human queue.

## 5. Data Model Integration

`debtor.agent_runs` schema:

```
email_id           uuid   (FK → email_pipeline.emails)
intent             text
sub_type           text
document_reference text
confidence         text   (low|medium|high)
tool_outputs       jsonb
draft_url          text
body_version       text
intent_version     text
human_verdict      text   enum: approved|edited_minor|edited_major|
                              rejected_wrong_intent|rejected_wrong_reference|
                              rejected_wrong_attachment|rejected_wrong_language|
                              rejected_wrong_tone|rejected_other
human_notes        text
verdict_set_at     timestamptz
created_at         timestamptz default now()
```

## 6. Job States (Kanban Integration)

Add to swarm-realtime / kanban (`web/components/v7/swarm-realtime-provider.tsx` + kanban components):

- `copy_document_drafted`
- `copy_document_needs_review`
- `copy_document_failed_not_found`
- `copy_document_failed_transient`
- `login_failed_blocked`

## 7. Open Questions (for researcher)

1. `sub_type` vocabulary — is `statement` distinct from `invoice`?
2. Confidence calibration — self-reported v1 vs logprob-derived hybrid
3. `entity_signatures` Supabase fallback if iController doesn't auto-append
4. Multilingual model validation — Haiku NL/DE/FR accuracy ≥85%?
5. 4th fallback per agent (CLAUDE.md mandates 3-4)
6. `fetchDocument.ambiguous` contract extension timing
7. Phase 2: language re-detect in body-agent
