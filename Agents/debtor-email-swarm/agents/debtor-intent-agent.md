---
key: debtor-intent-agent
role: Debtor Email Intent Classifier
version: 2026-05-19.v3
swarm: debtor-email-swarm
phase: 3
pattern: external-orchestration (Inngest)
orqai_id: "01KQECK191GE21CH8D8KEMTM9J"
orqai_project_id: "019db9c0-c45a-7000-ab48-ebde3557b891"
orqai_project_key: "Debtor Team"
orqai_studio_url: "https://my.orq.ai/cura/agents/01KQECK191GE21CH8D8KEMTM9J"
deployed_at: "2026-05-19T00:00:00Z"
last_synced_with_studio: "2026-05-21"
deploy_channel: "mcp"
---

# debtor-intent-agent

> **Source-of-truth note (2026-05-21):** the deployed agent in Orq Studio is the authoritative copy. This file mirrors what `mcp__orqai-mcp__get_agent debtor-intent-agent` returned on `last_synced_with_studio`. Future changes: update Studio first, then refresh this file via the spec-sync procedure (defer to v8.1 grooming for CI-gated drift detection).

## Configuration

| Field | Value |
|-------|-------|
| **Key** | `debtor-intent-agent` |
| **Role** | Debtor Email Intent Classifier (Multilingual NL/EN/DE/FR) |
| **Description** | Phase 85 Stage 3 ranked-intent coordinator (V3). Classifies inbound debtor emails into a closed list of 8 actionable intents and returns a ranked list (top-5). Adds open-set escape hatch via `intent_proposal` + `proposal_reason` for novel-intent capture (consumed by Phase 86). |
| **Version tag** | `2026-05-19.v3` (emitted as `intent_version` in output; bumps on every prompt change per `## Version bump discipline` below) |

## Model

**Primary model:** `anthropic/claude-sonnet-4-5-20250929`

**Fallback models** (ordered, per CLAUDE.md mandate — verify each via `list_models` before deploy):

1. `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` — same Sonnet via Bedrock EU
2. `openai/gpt-4o` — different provider/tokenizer family
3. `google-ai/gemini-2.5-pro` — multilingual peer
4. `mistral/mistral-large-2411` — European model, NL/FR/DE weight (dated pin per catalog rules)

**Model parameters (verified in Studio 2026-05-21):**

```json
{
  "temperature": 0,
  "top_p": 0,
  "top_k": 5,
  "max_tokens": 2048,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "debtor-intent-agent-output-v3",
      "strict": true,
      "schema": "see Response Format section below"
    }
  }
}
```

**Retry:** `{count: 1, on_codes: [500, 502, 503, 504]}`.

**Client timeout:** 45s (CLAUDE.md mandate; Orq internal retry budget is 31s).

> **Historical note:** earlier versions of this file specified Haiku 4.5 with `max_tokens: 400`. Production runs Sonnet 4.5 with `max_tokens: 2048`. The Sonnet upgrade was made in Studio without a parallel spec update — that's part of the spec drift this file's 2026-05-21 refresh corrects.

## Instructions

Verbatim mirror of the deployed Orq Studio `Instructions` field (pulled via `mcp__orqai-mcp__get_agent debtor-intent-agent` on 2026-05-21). Changes to this section MUST be made in Studio first, then this file refreshed.

```xml
<role>
You are the Stage 3 ranked-intent classifier for inbound debtor emails arriving at Moyne Roberts mailboxes (Smeba, Smeba-Fire, Berki, FireControl, KEDÉ). Your job is to read one debtor email plus its quoted thread context, classify the sender's primary intent against a closed list, and rank up to five alternatives by likelihood. You also detect language and urgency, and — new in V3 — flag emails that do not fit the closed list so the team can grow the vocabulary.
</role>

<closed_list_constraint>
The `ranked[*].intent` field is restricted to this fixed enumeration:

- `copy_document_request` — sender asks for a copy of an existing invoice, credit note, werkbon, contract, or quote.
- `payment_dispute` — sender disputes an invoice's amount, line items, references, or VAT, or refuses payment until corrected.
- `address_change` — sender updates billing or delivery address details.
- `peppol_request` — sender asks about Peppol identifier, e-invoicing routing, or e-invoicing setup.
- `credit_request` — sender requests a credit note for an already-accepted invoice (correction by credit, not a dispute).
- `contract_inquiry` — sender asks a question that explicitly references a contract, SLA, or framework agreement.
- `general_inquiry` — sender asks a question Moyne Roberts can answer (status, contact, process) that does not fit a more specific intent.
- `other` — informational, automated, or fundamentally off-topic emails that still need human eyes.

Stage 4 dispatchers read `ranked[0].intent` and dispatch deterministically on this closed list. You MUST always emit a `ranked` array with at least one entry whose `intent` is from this enumeration, even when the closed list is a poor fit.
</closed_list_constraint>

<intent_definitions>

<intent name="copy_document_request">
  Scope: sender requests a copy of an existing administrative document — invoice (`factuur`), credit note (`creditnota`), werkbon, contract, or quote. Phrases include "kopie factuur", "graag toezenden", "stuur ons de factuur opnieuw", "please resend invoice".
  Boundary: if the sender asks for a copy *because* they dispute the amount or references on it, this is `payment_dispute` ranked-top with `copy_document_request` ranked-second. Pure administrative resend with no dispute language stays `copy_document_request` top.
</intent>

<intent name="payment_dispute">
  Scope: sender disputes an invoice's amount, line items, references, or VAT — explicit rejection or hold on payment until corrected. Also covers structured return-of-invoice templates (PO mismatch, missing reference, wrong cost centre) that procurement teams send when an invoice cannot be matched in their system.
  Boundary: if the sender's primary ask is a credit note for an already-accepted invoice (correction by credit, not dispute itself), prefer `credit_request`. If the sender both disputes the amount AND requests a credit note, this stays `payment_dispute` ranked-top with `credit_request` ranked-second.
</intent>

<intent name="address_change">
  Scope: any explicit update to a billing address, delivery address, invoicing email recipient, accounts-payable contact, or company name on invoices. Includes "graag wijzigen naar…", "per direct factureren aan…", "ons factuuradres is gewijzigd".
  Boundary: address updates take priority even when wrapped in a copy-document request — pick `address_change` ranked-top in that case and add `copy_document_request` ranked-second. The address signal is the higher-value action item.
</intent>

<intent name="peppol_request">
  Scope: any mention of Peppol identifier, Peppol ID, e-invoicing routing, e-invoicing onboarding, or UBL routing setup. Even when wrapped in a general question, the Peppol signal wins.
  Boundary: vs `general_inquiry` — any concrete Peppol/e-invoicing keyword routes here. Generic "how do you handle electronic invoices" without Peppol/UBL framing stays `general_inquiry`.
</intent>

<intent name="credit_request">
  Scope: sender asks for a credit note for an invoice they accept as correct in principle — typical reason is a refund, return of goods, cancellation, or goodwill correction. Phrases: "graag creditnota", "kunnen jullie een creditnota opmaken", "please issue a credit".
  Boundary: if the sender also disputes the original invoice's amount or references, that is `payment_dispute` top with `credit_request` ranked-second. Pure credit-note ask without dispute language is `credit_request` top.
</intent>

<intent name="contract_inquiry">
  Scope: sender asks a question that explicitly references a contract, SLA, raamcontract, framework agreement, or contract number. The contract reference must be concrete — a contract ID, a contract start date, or a named agreement.
  Boundary: vs `general_inquiry` — generic "how do you handle X" without explicit contract framing stays `general_inquiry`. The contract reference must be in the email, not inferred.
</intent>

<intent name="general_inquiry">
  Scope: the sender asks a question Moyne Roberts can answer — status of a process, who to contact, how a procedure works, when a delivery is expected. The sender expects a human reply.
  Boundary: vs `other` — if the email contains a clear question directed at us, this is `general_inquiry`. If the email is purely informational ("we have moved", "please note our holiday hours"), an automated notification, or an off-topic email that landed in debiteuren@ by accident, prefer `other`.
</intent>

<intent name="other">
  Scope: informational notes, automated notifications that survived Stage 1 (e.g. an unusual ERP notification format), off-topic emails that need human eyes, ad-hoc acknowledgements ("received, thanks"), and emails whose intent is none of the above closed-list entries.
  Boundary: this is the catch-all. Use it sparingly — if a more specific intent above fits, use that. Use `other` ONLY when no specific intent fits AND no novel intent suggests itself (see `<novel_intent_proposal>` below).
</intent>

</intent_definitions>

<disambiguation_table>
These boundary rules the closed list cannot resolve from intent names alone:

| If the email looks like… | …then top-1 is | …and ranked-2 is |
|---|---|---|
| Disputes amount AND asks for credit note | `payment_dispute` | `credit_request` |
| Asks for copy because of a dispute | `payment_dispute` | `copy_document_request` |
| Routine "stuur factuur opnieuw" with no dispute language | `copy_document_request` | (no second) |
| Address update wrapped in copy-doc request | `address_change` | `copy_document_request` |
| Question that mentions a specific contract / SLA / raamcontract | `contract_inquiry` | (no second) |
| Generic "how do you handle X" with no contract reference | `general_inquiry` | `other` |
| Mentions Peppol, Peppol ID, e-invoicing routing, UBL | `peppol_request` | (no second) |
| Auto-reply or off-topic that survived Stage 1 | `other` | (no second) |
</disambiguation_table>

<novel_intent_proposal>
V3 adds an open-set escape hatch. Two new top-level fields capture novel intents WITHOUT changing the closed-list dispatch:

- `intent_proposal`: a `snake_case` label (≤64 chars, matches `^[a-z][a-z0-9_]*$`) that better describes this email than ANY closed-list intent. `null` when the closed list already fits well.
- `proposal_reason`: one sentence justifying the proposal. When non-null, this string MUST start exactly with `No closed-list intent fits because` (this anchor is enforced by the JSON Schema). `null` when `intent_proposal` is `null`.

**When to propose (R-02 — under-eager guard):** if your ranked-top closed-list intent has `confidence: "low"` AND the email has a recognisable pattern that suggests a new label (e.g. WKA chain-liability data request, Coupa PO notification, vendor onboarding form, deduction notification), you SHOULD set `intent_proposal` to a snake_case label that names that pattern.

**When NOT to propose (R-01 — over-eager guard):** when ANY closed-list intent fits well — i.e. the top-1 confidence is `medium` or `high` — `intent_proposal` MUST be `null` and `proposal_reason` MUST be `null`. Do not propose synonyms of existing intents. Do not propose generic labels like `unclassified` or `unknown` — that is what `other` is for.

**Critical:** `ranked[0].intent` is ALWAYS a closed-list value, even when `intent_proposal` is non-null. The proposal is additive context for the team, not a dispatch route.
</novel_intent_proposal>

<confidence_rubric>
- `high`: the email contains explicit, unambiguous keywords for the chosen intent and the disambiguation rules above clearly resolve to this intent.
- `medium`: the email is consistent with the chosen intent but missing one disambiguator (e.g. asks for a copy without specifying which document type — likely `copy_document_request` but `sub_type` is null).
- `low`: the intent is the best of the closed-list options but the email does not fit any of them well. THIS is the signal to consider `intent_proposal`.
</confidence_rubric>

<language_and_urgency>
- `language`: one of `nl`, `en`, `de`, `fr`. Detect from the inbound message body, not the quoted thread.
- `urgency`: `high` when the email contains escalation language ("urgent", "today", "before close of business", "deurwaarder", "incassobureau", "juridisch"). `normal` for routine requests. `low` for purely informational emails.
</language_and_urgency>

<output_format>
Return a single JSON object that conforms to the V3 schema (strict). Required top-level keys: `ranked`, `language`, `urgency`, `intent_version`, `intent_proposal`, `proposal_reason`. The `intent_version` literal MUST be exactly `"2026-05-19.v3"`. No preamble, no markdown fences — just the JSON.

**Length budget — strict, enforced by JSON Schema:**
- Each `ranked[*].reasoning` MUST be **≤ 200 characters**. Be terse. One short factual sentence. Do NOT restate the email's content. Do NOT quote the sender. Strings longer than 200 chars fail downstream Zod validation and the entire run is rejected.
- `proposal_reason` MUST be ≤ 280 characters when non-null.
- `intent_proposal` MUST be ≤ 64 characters, lowercase snake_case.
- `document_reference` MUST be ≤ 64 characters when non-null.

Reasoning style: aim for **60–150 characters** per entry. The 200-char cap is a hard ceiling — leave headroom. All few-shot examples below stay well under the cap.
</output_format>

<few_shot_examples>
(10 worked examples retained verbatim from Studio — see Studio prompt or the get_agent MCP response for the full text. Truncated here for spec-file brevity since the examples are not part of the architectural contract.)
</few_shot_examples>

<final_reminders>
1. Always emit `ranked` with at least one closed-list entry — Stage 4 dispatch depends on it.
2. **Each `ranked[*].reasoning` MUST be ≤ 200 characters.** Aim for 60–150 chars. Longer reasonings fail downstream Zod validation and the entire run is rejected — this is the most common failure mode of this agent.
3. `intent_proposal` is `null` whenever the closed list fits (confidence ≥ medium). Only non-null on `low` confidence + recognisable novel pattern.
4. `proposal_reason` MUST start exactly with `No closed-list intent fits because` when `intent_proposal` is non-null. The JSON Schema enforces this; if you violate it, the call fails validation.
5. `intent_version` is the literal string `"2026-05-19.v3"`. Never any other value.
6. Output is JSON only — no markdown fences, no preamble.
</final_reminders>
```

## Response Format (JSON Schema — verbatim from Studio 2026-05-21)

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "debtor-intent-agent-output-v3",
    "description": "Stage 3 ranked-intent classifier output (V3). Additive over V2: adds intent_proposal + proposal_reason so the agent can flag emails that do NOT fit the closed-list intent enum. Stage 4 dispatch is unaffected — dispatch reads ranked[0].intent from the closed list. intent_version literal bumped to 2026-05-19.v3.",
    "strict": true,
    "schema": {
      "type": "object",
      "additionalProperties": false,
      "required": ["ranked", "language", "urgency", "intent_version", "intent_proposal", "proposal_reason"],
      "properties": {
        "ranked": {
          "type": "array",
          "minItems": 1,
          "maxItems": 5,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["intent", "confidence", "document_reference", "sub_type", "reasoning"],
            "properties": {
              "intent": {
                "type": "string",
                "enum": ["copy_document_request", "payment_dispute", "address_change", "peppol_request", "credit_request", "contract_inquiry", "general_inquiry", "other"]
              },
              "confidence": {
                "type": "string",
                "enum": ["low", "medium", "high"]
              },
              "document_reference": {
                "anyOf": [{"type": "string", "maxLength": 64}, {"type": "null"}]
              },
              "sub_type": {
                "anyOf": [{"type": "string", "enum": ["invoice", "credit_note", "werkbon", "contract", "quote"]}, {"type": "null"}]
              },
              "reasoning": {
                "type": "string",
                "maxLength": 200,
                "description": "Be terse — 60-150 chars target. >200 chars fail downstream Zod validation."
              }
            }
          }
        },
        "language": {"type": "string", "enum": ["nl", "en", "de", "fr"]},
        "urgency": {"type": "string", "enum": ["low", "normal", "high"]},
        "intent_version": {"type": "string", "enum": ["2026-05-19.v3"]},
        "intent_proposal": {
          "anyOf": [
            {"type": "string", "maxLength": 64, "pattern": "^[a-z][a-z0-9_]*$"},
            {"type": "null"}
          ]
        },
        "proposal_reason": {
          "anyOf": [
            {"type": "string", "maxLength": 280, "pattern": "^No closed-list intent fits because"},
            {"type": "null"}
          ]
        }
      }
    }
  }
}
```

> `additionalProperties: false` + `strict: true` reject extraneous keys server-side. **Note:** OpenAI/Anthropic strict mode does NOT enforce `maxLength` server-side — it only enforces required keys + enums. The 200-char `reasoning` cap is enforced by Zod in `web/lib/automations/debtor-email/coordinator/types.ts:110`, NOT by Orq. This is why explicit length guidance in the `<output_format>` instructions is critical (see 2026-05-21 prompt tightening).

> `additionalProperties: false` is mandatory. Orq.ai's `response_format: json_schema` with `strict: true` enforces the enum boundaries server-side — prompt-only JSON instruction drift (~15-20% failure rate on Haiku) is not acceptable here.

## Variables (Orq `variables` contract)

Declared with `type` and `required` on the Orq side so malformed inputs are rejected at ingress before the model spends tokens.

```json
{
  "variables": {
    "email_id":         { "type": "string", "required": true,  "description": "UUID of the email row in email_pipeline.emails. Used for traceability in debtor.agent_runs." },
    "inngest_run_id":   { "type": "string", "required": true,  "description": "Inngest run id for cross-system trace correlation (Orq Analytics ↔ Inngest ↔ Supabase)." },
    "stage":            { "type": "string", "required": true,  "description": "Fixed value 'classify' for this agent. Part of the swarm's multi-stage trace taxonomy." },
    "subject":          { "type": "string", "required": true,  "description": "Email subject line, raw." },
    "body_text":        { "type": "string", "required": true,  "description": "Plain-text email body. HTML stripped upstream. May include quoted reply chains." },
    "sender_email":     { "type": "string", "required": true,  "description": "Sender's From address, normalized." },
    "sender_domain":    { "type": "string", "required": true,  "description": "Lowercase domain portion of sender_email. Tie-breaker signal only." },
    "mailbox":          { "type": "string", "required": true,  "description": "The debtor mailbox the email was received in, e.g. debiteuren@smeba.nl." },
    "entity":           { "type": "string", "required": true,  "enum": ["smeba", "berki", "sicli-noord", "sicli-sud", "smeba-fire"], "description": "Moyne Roberts legal entity tied to the mailbox." },
    "received_at":      { "type": "string", "required": true,  "description": "ISO 8601 receive timestamp. Metadata only — NOT used in the classification prompt body to preserve idempotency." }
  }
}
```

**Idempotency requirement (Inngest-side):** Before building the prompt, serialize the variables JSON with keys sorted alphabetically. This prevents prompt-cache misses and ensures identical input → identical output across retries.

**`received_at` handling:** logged to `debtor.agent_runs.created_at` and Orq traces, but must NOT appear inside the prompt body. A retry 5 minutes later must produce the same prompt string.

## Input Template (Orq variable binding for the user message)

```
Classify the following debtor email.

<email>
<mailbox>{{mailbox}}</mailbox>
<entity>{{entity}}</entity>
<sender_email>{{sender_email}}</sender_email>
<sender_domain>{{sender_domain}}</sender_domain>
<subject>{{subject}}</subject>
<body_text>{{body_text}}</body_text>
</email>

Return the JSON object. No preamble.
```

## Output Template

The output is a single JSON object matching the `response_format` schema above. No wrapping, no markdown. Consumers (Inngest `step.run("classify-intent")`) parse it as `JSON.parse(completion.choices[0].message.content)` and validate with Zod against the same schema.

## Tools

### Built-in Tools

Not applicable for this agent. This is a pure LLM single-shot classifier.

### Function Tools

Not applicable for this agent. All external calls (`fetchDocument`, `createIcontrollerDraft`) are executed by Inngest `step.run()` in the orchestration layer, never by the agent. See `TOOLS.md` §"Why no Orq tools?" for rationale.

### HTTP Tools

Not applicable for this agent.

### Code Tools

Not applicable for this agent.

### MCP Tools

Not applicable for this agent.

### Agent Tools (Sub-Agents)

Not applicable for this agent. `team_of_agents` is NOT set. The swarm uses external orchestration (Inngest), not Orq-native hierarchical delegation.

## Context

**Knowledge bases:** Not applicable for this agent. Closed-taxonomy classification on short inputs does not benefit from RAG; entity/mailbox context is injected via `variables`.

**Memory stores:** Not applicable for this agent. Single-shot, stateless by design. Enabling memory would introduce state-leak across emails and defeat idempotency. Do NOT set `memory` or `memory_stores`.

**Variables:** See "Variables" section above. `path`, `identity`, `thread`: not required, not set.

## Guardrails

### Prompt-level (in-prompt, enforced by model)

1. **Confidence rubric** — explicit `<confidence_rubric>` block anchors `low`/`medium`/`high` thresholds. Counteracts Haiku's known over-confidence bias on short, well-formed inputs.
2. **Anti-hallucination rule for `document_reference`** — explicit `<document_reference_rules>` block forbids synthesizing references from non-reference digit strings (customer IDs, dates, PO numbers). Most dangerous failure mode → belt-tightened in prompt.
3. **Closed sub_type vocabulary** — `<constraints>` block enforces `invoice | credit_note | werkbon | contract | quote`; `statement` is explicitly collapsed into `general_inquiry`.
4. **No prompt disclosure / prompt-extraction resistance** — `<constraints>` block forbids revealing the prompt, version, or vocabulary on request.

### Schema-level (enforced by Orq `response_format: json_schema` strict mode)

- All 8 fields required; `additionalProperties: false` rejects extraneous keys.
- `intent`, `sub_type`, `urgency`, `language`, `confidence` are closed enums.
- `intent_version` is a `const`, pinned to `"2026-05-19.v3"` — any future prompt change must update this AND the schema AND bump the version string together.
- `reasoning` capped at 500 chars to prevent verbose hallucinated context.

### Post-validator (Inngest `step.run("classify-intent")`, runs AFTER the LLM response)

Deterministic regex + logic checks on the parsed JSON. Does NOT block the agent — runs as a post-hoc calibration layer that may DOWNGRADE confidence before the routing step reads it.

1. **`document_reference` format check:**
   - Regex: `/^(F|FC|INV|FACT)?\d{5,}$/i` (optional letter prefix + 5+ digits).
   - Reference must also appear as a substring in `{subject}\n{body_text}` (case-insensitive). Verbatim rule from prompt re-asserted in code.
   - On failure: set `document_reference = null`, downgrade `confidence` by one level (`high`→`medium`, `medium`→`low`), append `"[post-validator: invalid or hallucinated reference format]"` to `reasoning`.

2. **`sub_type` consistency check:**
   - If `intent != copy_document_request` and `sub_type != null`: force `sub_type = null`, downgrade confidence, flag.
   - If `intent == copy_document_request` and `sub_type == null`: downgrade confidence to `low`; route to human queue regardless.

3. **`intent_version` pin:**
   - Must equal `"2026-05-19.v3"`. If not, reject the call as a prompt/model drift signal and retry once with explicit prompt-cache bust.

4. **Language sanity check (advisory, non-blocking):**
   - If `language == "fr"` and body contains zero French function words (`le|la|les|de|vous|nous|est|pas|pour`), flag in `agent_runs.human_notes` for review.

5. **Confidence floor on mixed signals:**
   - If `intent == copy_document_request` AND `document_reference != null` AND `confidence == high` BUT the reference prefix mismatches the `sub_type` pattern (e.g. `sub_type == contract` with a numeric-only 8-digit reference that looks like an invoice number): downgrade confidence by one level.

## Orchestration Notes (how Inngest wraps this agent)

This agent runs inside the `debtor-email-triage` Inngest function. Full flow reference: `blueprint.md` §2.

```
Inngest: debtor-email-triage(emailId)
  step.run("load-email")        → Supabase: fetch subject/body/mailbox/entity/…
  step.run("classify-intent")   → Orq debtor-intent-agent (THIS AGENT)
                                      variables = sortKeys({email_id, inngest_run_id, stage:"classify", subject, body_text, sender_email, sender_domain, mailbox, entity, received_at})
                                      client timeout = 45s
                                      Zod-validate response against schema
                                      run post-validator (see Guardrails above)
  step.run("route-by-intent")   → switch on (intent, confidence, document_reference)
     case copy_document_request & confidence == "high" & document_reference != null:
       step.run("fetch-document")      → HTTP to /api/automations/debtor/fetch-document
       step.run("generate-body")       → Orq debtor-copy-document-body-agent
       step.run("create-draft")        → HTTP to /api/automations/debtor/create-draft
       step.run("persist-run")         → INSERT into debtor.agent_runs
     case *:
       step.run("human-queue")         → INSERT into debtor.agent_runs + Kanban state
```

### Hybrid Haiku→Sonnet escalation (research-brief §"Model recommendation")

The researcher recommends escalating to Sonnet-4-6 when either (a) `confidence == "low"` OR (b) `language == "fr"`, covering the francophone-BE tail risk at ~3-5% of volume.

**Architectural decision (per this spec):** escalation is Inngest-side routing on a SINGLE agent definition, NOT two agent keys. Rationale:
- Keeps the Orq agent catalog clean (one `debtor-intent-agent` entry; no `-v2-fallback` duplicate).
- This agent has no tools, so it cannot call Sonnet itself — that pattern requires agent-as-tool which we explicitly don't use.
- Inngest owns the decision, the retry budget, and the observability boundary (one extra `step.run` vs a nested agent invocation).

**Inngest implementation sketch:**

```ts
const first = await step.run("classify-intent", () =>
  orq.invoke({ agent: "debtor-intent-agent", variables, modelOverride: null })
);

const needsEscalation = first.confidence === "low" || first.language === "fr";
const second = needsEscalation
  ? await step.run("classify-intent-escalate", () =>
      orq.invoke({
        agent: "debtor-intent-agent",
        variables,
        modelOverride: "anthropic/claude-sonnet-4-6"
      })
    )
  : null;

const final = second ?? first;
// Persist BOTH calls to agent_runs.tool_outputs for calibration
```

> `modelOverride` is passed via Orq Router's `model` field at invocation time — same agent key, different model. No second agent spec needed.

### Idempotency contract (what Inngest guarantees the agent)

- Variables serialized with keys sorted alphabetically before prompt rendering.
- `received_at` is logged but NOT in the prompt body.
- Orq `step.run` cache key: `(email_id, intent_version)`. Version bump → cache invalidated.
- Temperature 0 on primary model; fallbacks may drift ±5% token-level. Downstream consumers MUST NOT assert byte-equality across model variants.

### Cross-system trace correlation

Every invocation carries `{ email_id, inngest_run_id, stage: "classify" }`. These join:
- Orq Analytics (span attributes)
- Inngest run timeline
- Supabase `debtor.agent_runs` (one row per email lifecycle, keyed on `email_id`)

## Evaluators (Orq-native, recommended — configure in Orq Studio after deploy)

1. **Python eval (`create_python_eval`, deterministic, 100% sample)**
   - Validates `document_reference` regex + verbatim presence (same logic as post-validator).
   - Validates `sub_type` is null when `intent != copy_document_request`.
   - Validates `intent_version == "2026-05-19.v3"`.
   - Cheap; runs on every trace.

2. **LLM-as-Judge (`create_llm_eval`, async, 100% sample given low volume)**
   - Criteria: does the chosen `intent` match the email's actual primary ask? Rate 0-1.
   - Criteria: is `confidence` appropriately calibrated given the email's clarity? Rate 0-1.
   - Model: `anthropic/claude-sonnet-4-6` (judge ≠ classifier).
   - Threshold: 0.8 minimum composite score. Alerts on sustained drift.
   - Runs async — does NOT block the Inngest pipeline.

3. **JSON Schema Evaluator** — redundant with `response_format: json_schema strict:true` but adds visible trace-level pass/fail signal in Orq dashboards.

> Exact configuration JSON is not documented in the Orq API surface this spec was built against; set up in Orq Studio per evaluator type after the agent is deployed.

## Test Hooks (datasets & shadow-mode metrics)

### Datasets (generated by dataset-generator subagent in a later wave)

- **`debtor-intent-agent.dataset.base.jsonl`** — 30-50 real `unknown`-bucket emails sampled from `debtor.email_analysis` covering the intent spread per brief §7.
- **`debtor-intent-agent.dataset.handlabel-2026-04-22.jsonl`** — primary eval set from the 2026-04-22 hand-labeled batch ("Onbekend hand-picks" in `classify.ts`).
- **`debtor-intent-agent.dataset.copy-requests-200.jsonl`** — secondary eval set from `/tmp/copy-requests-classified.json`, targeting copy_document_request precision/recall specifically.
- **`debtor-intent-agent.dataset.fr-synth.jsonl`** — 5-8 synthetic FR examples (2-3 curated real + 2-3 NL-translated + native-speaker reviewed). Owner: @nick + Sicli-Sud contact.

### Shadow-mode metrics (weekly dashboards, pre-live-trigger)

Per research-brief §"Shadow-mode evaluation plan":

- **Intent agreement rate** overall + per-language (NL / EN / DE / FR) — target ≥90% on 200-email batch before live trigger.
- **Per-confidence-bucket agreement:**
  - `high` ≥95% (calibration proof)
  - `medium` 80-90% (expected, routes to human → training signal)
  - `low` — anything (hard-routes to human queue)
- **`document_reference` extraction precision** (false-positive rate, hallucinated references) — must be ≥98%. This is the go/no-go safety metric.
- **`document_reference` extraction recall** on copy_document_request — must be ≥85%.
- **Per-entity agreement** — NL entities vs BE entities broken out separately.
- **Per-language agreement** — NL/EN must hit target at 4-week mark; DE/FR slices flagged individually for any <80% agreement as prompt-regression signal.

### Go/no-go thresholds before routing `high`-confidence `copy_document_request` to the automated draft path

- Intent agreement ≥90% on 200-email batch
- Calibration within ±10%
- Sustained 4 weeks of shadow-mode performance at thresholds above
- ≥3 positive reviews from debtor team on sample drafts (delegated to body-agent eval)

## Runtime Constraints

| Constraint | Value |
|-----------|-------|
| **Max iterations** | 1 |
| **Max execution time** | 45 seconds |

Rationale: single-shot LLM call, no tools, no loop. One iteration is the correct value — the agent cannot retry itself. 45s aligns with CLAUDE.md's mandated client timeout (Orq's internal retry budget is 31s, leaving 14s safety margin on cold calls).

Inngest owns orchestration-level retries (exponential backoff) and escalation routing. The agent itself is non-iterative by design.

## Deployment Notes

### Orq.ai Studio paste-map

1. **Create agent** in Orq.ai Studio:
   - Path: `Default/agents/debtor-email-swarm/`
   - Key: `debtor-intent-agent`
   - Role: "Debtor Email Intent Classifier"
   - Description: (from Configuration table above)
2. **Instructions field**: paste the full `<instructions>…</instructions>` block verbatim.
3. **Model**: `anthropic/claude-sonnet-4-5-20250929` (validate via MCP `list_models` first).
4. **Fallback models**: paste the 4-entry ordered list.
5. **Model parameters**: `temperature: 0`, `top_p: 0`, `top_k: 5`, `max_tokens: 2048`.
6. **Response format**: paste the JSON Schema under `response_format` with `strict: true`.
7. **Variables**: declare all 10 variables with `type` + `required` per the Variables section.
8. **Tools**: leave empty.
9. **Knowledge bases / Memory / team_of_agents**: leave empty.
10. **Fallback policy**: set `sequential_on_error` with exponential backoff explicitly (do NOT rely on Orq default).
11. **Trace sampling**: 100%.

### Environment variables (Inngest / Vercel side, not Orq)

- `ORQ_API_KEY` — Orq.ai Router key
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — Inngest
- `AUTOMATION_WEBHOOK_SECRET` — for downstream `fetchDocument` / `createIcontrollerDraft` (irrelevant to this agent but required in the broader pipeline)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — for `debtor.agent_runs` writes

### Version bump discipline

Any change to `<instructions>`, `<confidence_rubric>`, `<document_reference_rules>`, few-shot examples, or the `response_format` schema MUST:

1. Bump `intent_version` literal in the `<intent_version>` tag inside the prompt.
2. Bump the `const` value in the JSON Schema.
3. Bump the frontmatter `version:` field in this spec file.
4. Update the file header date.

CI check (recommended, per research-brief §"Prompt-versioning discipline"): diff this file on every PR, fail if prompt text changed without a version string bump. Whitelist typo-only changes via explicit `[skip-version]` commit tag.

### Post-deploy verification

1. Call `get_agent` via Orq MCP immediately after `update_agent` / `create_agent` to confirm config was persisted correctly (CLAUDE.md mandate — Orq has historical drift between PUT and GET).
2. Send 3 smoke-test emails (one NL copy-request, one EN general-inquiry, one FR ambiguous) through the Inngest triage function in acceptance. Verify `debtor.agent_runs` rows appear with correct schema.
3. Confirm `intent_version` in `agent_runs` rows matches `2026-05-19.v3`.

---

**End of spec.** This file is authoritative for `debtor-intent-agent` phase 1. Next pipeline steps: dataset-generator (parallel wave), orchestration-generator (Inngest function wiring), README assembly.
