---
created: 2026-04-22T17:30:00.000Z
title: Build triage agent for debtor + sales inbox noise filter
area: automation
files:
  - web/debtor-email-analyzer/src/categorize.ts
  - web/lib/automations/sales-email-analyzer/src/categorize-sales.ts
---

## Problem

Debtor + sales inboxes receive ~8,000 inbound emails / 13 months. A meaningful share is NOT actionable mail from customers: out-of-office replies, delivery-failure notices, read receipts, automated PO notifications ("Kopie voor referentie: Nieuwe inkooporder ..."), internal forwards, vendor newsletters, etc. Every downstream agent we build (copy-document fetcher, payment-confirmation handler, dispute handler) would otherwise have to re-parse this noise.

**Existing signal:** `debtor.email_analysis.email_intent = 'auto_reply'`, `category = 'auto_reply'` already classify most OoO/auto-reply mail. Same for sales. But nothing *acts* on that classification — no routing layer, no noise suppression, no handoff.

**Unblocks:** copy-document automation (see sibling todo `2026-04-22-automate-copy-document-responder-for-debtor-and-sales-inboxes.md`) and every future intent-specific agent in the Debtor/Sales swarms.

## Solution

Build a **triage agent** (Orq.ai) as the very first stage of the Debtor Team and Sales Team swarms. It consumes every inbound email and outputs a routing decision:

```
{
  route: "drop" | "human" | "copy_fetcher" | "payment_confirmation" | "dispute" | "address_change" | "general_inquiry" | "unsure",
  noise_category: null | "out_of_office" | "delivery_failure" | "read_receipt" | "po_notification" | "internal_forward" | "newsletter" | "spam",
  confidence: "high" | "medium" | "low",
  language: "nl" | "fr" | "en" | "de",
  reasoning: "one sentence"
}
```

Rules:
- `route: "drop"` when `noise_category` is set and confidence is high → logged but no downstream action
- `route: "human"` when confidence is low or intent is ambiguous → land in a human-review queue
- `route: "<intent>"` → hand off to the dedicated downstream agent / tool

**Phased build:**

1. **Phase 0 (this todo) — triage agent only.** Deploy against historical data first (the 8k inbound corpus) to measure noise-drop rate and confidence distribution. No live routing yet.
2. **Phase 1 — shadow mode on live traffic.** Classify in real time, log decisions, but don't act. Compare against human handling for 2 weeks.
3. **Phase 2 — activate drops.** Enable auto-drop for high-confidence noise categories only. Humans still see everything else.
4. **Phase 3 — activate routing** to specific intent handlers as each becomes available. First handler to land: copy-document fetcher (sibling todo).

**Stack:**
- Orq.ai agent, `anthropic/claude-haiku-4-5-20251001` + fallbacks (cheap, fast, high-volume)
- JSON-schema response_format (per `docs/orqai-patterns.md`)
- XML-tagged prompt (`<role>`, `<task>`, `<constraints>`, `<output_format>`)
- State in Supabase: new `triage_decisions` table (email_id, route, noise_category, confidence, acted, overridden_by_human, created_at)
- Inngest function triggered by new-email events — durable, retryable

**Reference data / eval set:**
- `/tmp/copy-requests-classified.json` (1,124 labeled emails incl. 200 random control — reusable for precision/recall on copy_fetcher route)
- Historical `debtor.email_analysis` + `sales.email_analysis` → ~8k pre-labeled rows for backtest

**Open questions:**
- Do we auto-drop OoO / read-receipts entirely (don't log as a Case) or archive them silently for audit? Legal implications for debtor-correspondence retention?
- Human-review queue: where does it live? Existing NXT Cases, a new Supabase-backed UI, or a Slack channel?
- Multi-entity: same triage agent across Smeba/Berki/Sicli, or per-entity tuning?

## Sequencing note

This replaces the earlier framing in the copy-document todo where the fetcher was "phase 1". Correct order:
1. Triage agent (this todo)
2. Copy-document fetcher tool
3. Remaining intent handlers (payment confirmation, dispute, etc.)

Without triage, every downstream agent re-parses noise. Build it once, benefit everywhere.
