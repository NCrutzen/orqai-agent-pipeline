---
created: 2026-04-22T17:30:00.000Z
title: Build intent agent for unknown bucket (debtor regex classifier fallthrough)
area: automation
files:
  - web/lib/debtor-email/classify.ts
  - web/app/(dashboard)/automations/debtor-email-review/actions.ts
---

## Problem

The debtor-email regex classifier (`web/lib/debtor-email/classify.ts`, 359 lines, 24 hand-iterated rules) already handles noise triage: `auto_reply`, `ooo_temporary`, `ooo_permanent`, `payment_admittance`. By design it routes anything uncertain to `category: "unknown", confidence: 0` for human review.

The `unknown` bucket is where the real work lives — genuine customer mail with an intent the regex can't decide: copy-document requests, payment disputes, address changes, peppol requests, contract inquiries, general questions. These need intent classification + routing to downstream handlers (copy-document fetcher, dispute agent, etc.), but it's explicitly out of scope for the regex layer (whitelist-based classifier; open-intent reasoning needs judgment).

The regex classifier is NOT to be replaced. It's fast, deterministic, auditable (every decision carries a `matchedRule` slug), precision-first, and battle-tested with inline FP corrections. LLM goes on top of the `unknown` bucket only.

## Solution

Build an **intent agent** (Orq.ai) that consumes ONLY emails where `classify()` returned `unknown`. Output:

```
{
  intent: "copy_document_request" | "payment_dispute" | "address_change" | "peppol_request" | "credit_request" | "payment_plan" | "general_inquiry" | "other",
  sub_type: string | null,          // e.g. for copy_document_request: "invoice" | "work_order" | "contract" | ...
  document_reference: string | null, // invoice/WO/quote number if mentioned
  urgency: "low" | "medium" | "high" | "critical",
  language: "nl" | "fr" | "en" | "de",
  requires_human: boolean,
  confidence: "high" | "medium" | "low",
  reasoning: "one short sentence"
}
```

**Stack:**
- Orq.ai Router, `anthropic/claude-haiku-4-5-20251001` + fallbacks
- JSON-schema `response_format` (per `docs/orqai-patterns.md`)
- XML-tagged prompt (`<role>`, `<task>`, `<constraints>`, `<output_format>`)
- State in Supabase: extend existing `debtor.email_analysis` or add `debtor.unknown_intent` table
- Orchestrator: Inngest function; input is the `unknown` bucket from `classify()`

**Phased build:**

1. **Phase 0 — shadow mode.** Classify the `unknown` bucket historical corpus (hand-labeled batch from 2026-04-22 is a starter eval set). Measure confidence distribution + human-agreement rate.
2. **Phase 1 — live shadow.** Classify in real time, log decisions, don't route yet. Compare to human review queue outcomes for 2 weeks.
3. **Phase 2 — activate routing** to the first concrete handler: the **copy-document fetcher** (sibling todo). Start with `intent: copy_document_request, sub_type: invoice, confidence: high` → auto-fulfill. Everything else stays human.
4. **Phase 3 — extend routing** to additional handlers as they land (payment dispute agent, address change agent, etc.).

**Eval set:**
- Hand-labeled "Onbekend" batch from 2026-04-22 (referenced in classify.ts comments as `2026-04-22 Onbekend hand-picks`)
- 200-email random control from `/tmp/copy-requests-classified.json` (unused so far — ~5% are real copy-requests the regex didn't catch via its copy-request path either)

**Open questions:**
- Where do we persist the intent output? Extend `debtor.email_analysis` with new columns, or new `debtor.unknown_intent` table? Extending existing table means one schema for all, but mixes regex-derived and LLM-derived fields.
- Human-review UI already exists at `web/app/(dashboard)/automations/debtor-email-review/` — does the intent agent output feed that UI (as a pre-filled suggestion) or replace parts of it?
- Multi-entity (Smeba / Berki / Sicli-Noord / Sicli-Sud / Smeba-Fire): same agent across all, or per-entity prompt tuning?
- Sales inbox: separate intent agent (different intent taxonomy), or same prompt with entity-aware routing?

## Sequencing

Correct order for the email-automation sub-project:

1. **Regex classifier** ✅ already live (`web/lib/debtor-email/classify.ts`) — handles noise
2. **Intent agent on `unknown` bucket** (this todo) — handles actionable-but-unclassified
3. **Copy-document fetcher tool** (sibling todo `2026-04-22-automate-copy-document-responder-for-debtor-and-sales-inboxes.md`) — first concrete handler the intent agent routes to
4. **Additional intent handlers** — dispute, address change, peppol, credit request, etc.

The regex layer is the *right* first step and stays in place. An LLM would be worse here: non-deterministic, opinion-as-reasoning vs. rule-as-audit, and it would over-answer edge cases instead of deferring to `unknown`.
