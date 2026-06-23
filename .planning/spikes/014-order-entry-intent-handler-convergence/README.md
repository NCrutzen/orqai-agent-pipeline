---
spike: 014
name: order-entry-intent-handler-convergence
type: standard
validates: "Lay the live-measured intents (spike 012 full sweep, 30,469) next to Koen's curated voorwerk set (INTENT-VALIDATIE.md §A + intent-eerst), and the same for the Stage-4 handlers — to confirm the V10.5 handler map is complete and surface what each side missed. Doubles as Dim C (task-model gap): the delta IS the gap."
verdict: "DONE 2026-06-23. Strong convergence on the core; live data validates + quantifies Koen's set (incl. his offerte_akkoord A/B split, already 2 buckets in the sweep). Two deltas: (a) my open-set LLM tail = synonym noise collapsing into Koen's niet_order_mail/platform_notificatie/noise → normalise before registry; (b) Koen has fine-grained domain intents (magazijnorder, order_wijziging, interne_order_aanvraag, storingsmelding-dispatch) + per-customer guardrails that bulk classification can't see → need voorwerk + Ans. Koen's SKILLS_BENODIGD = build-tooling, NOT runtime handlers; runtime handlers = his intent set."
related: [012, 013]
idea: order-entry-act-proof
tags: [order-entry, v10.5, intents, handlers, convergence, task-model]
---

# Spike 014: order-entry intent + handler convergence

Lays the **live-measured** intents/handlers (spike 012 sweep over the full 30,469 corpus, classified
by haiku-4.5) next to **Koen's curated voorwerk** (provisional per source-trust). Sources: live =
`/Volumes/Developer/pass2.jsonl`; Koen = `web/lib/automations/order-entry/INTENT-VALIDATIE.md` §A/§1/§2
+ `research/SKILLS_BENODIGD_ORDER_ENTRY_v0.2.md`.

## 1. Intents — live (mine) vs Koen (curated)

| Koen (curated) | My live intent | My volume | Match |
|---|---|---|---|
| `inkooporder_verwerking` (external PO→order) | `external_purchase_order` | 6,783 (22%) | ✅ 1:1 |
| `offerte_akkoord` (Smeba quote→order) | `quote_accepted` | 2,208 (7%) | ✅ — live data **validates Koen's A/B split** (PO vs quote are already 2 buckets in the sweep) |
| `backorder` (→ Valtimo) | `raise_order_valtimo` + `backorder` | ~4,250 (14%) | ✅ — Koen bundles; I split the Valtimo action out |
| `status_vraag` (→ planning) | `status_question` | 2,029 (7%) | ✅ |
| `werkbon_ontvangst` / `interne_order_aanvraag` | `work_instruction` | 4,098 (13%) | ~ partial |
| `offerte_aanvraag` (→ verkoop) | `quote_request` | 184 | ✅ |
| `offerte_afwijzing` / `klant_cancel` | `quote_retracted`/`order_retracted`/`order_cancellation` | ~270 | ~ |
| `opzegging` (→ block site) | `opzegging` | 144 | ✅ |
| `magazijnorder` | — | — | ❌ I missed it (hidden in PO/work_instruction) |
| `order_wijziging` | — | — | ❌ missed |
| `storingsmelding` (→ dispatch out-of-scope) | `service_request`/`maintenance_request` | ~67 | ~ |
| `platform_notificatie` / `niet_order_mail` (→ noise/forward) | `invoice_*` + `*_notification` + `fyi*` + `internal_*` (50+ tail labels) | ~3,000 | ⚠️ my open-set spawned dozens of synonyms Koen catches in 2 buckets |

## 2. Handlers — Koen (intent→Stage-4) vs my data

> Koen's `SKILLS_BENODIGD` doc is **build-tooling** (slash-commands), explicitly NOT the runtime
> handlers. The runtime Stage-4 handlers = one per intent (his "bouwresultaat, bestaat nog niet").

| Stage-4 handler | Koen | Live volume | Build / Reuse |
|---|---|---|---|
| **create-order** (PO→order · quote→order · internal) | core handler | ~9k combined | **Reuse** CTO `create-order` (spike 013) + **GAP**: build the quote-acceptance trigger / quote→order glue |
| **backorder → Valtimo** | yes (partly deterministic) | ~3.9k | Camunda/Valtimo (013) |
| **opzegging → block site/customer** | yes (own process: check orders→inform planning→block) | 144 | **Build** (NXT block) |
| **order_wijziging** (scope/PO change) | sub-intent | not separately measured | **Build** |
| **credit / return** | folded into order handling | `credit_return` 151 | my data lifts it out |
| **forward / dispatch** (status · offerte-aanvraag · storing · niet-order) | forwarder → planning/verkoop/Jeroen-Ad | forward 25%, planning-dominant | Stage-3 **router** (not a Stage-4 act handler) |
| **guardrails** (STB €0, Defensie-MM, CO2-marine, Dirk-€500) | hard-constraints as deterministic gates | ⚠️ not in my data (customer-specific) | **Build** — per-customer gates, orthogonal to intents |

## Conclusion (V10.5 readiness)
- **Convergent core** — my top-5 map 1:1 to Koen's core; the live sweep quantifies + validates his
  proposed set, including the `offerte_akkoord` A/B split.
- **My delta** — a noisy synonym tail (open-set LLM) → **normalise to Koen's clean set before any
  `swarm_intents` registry rows**.
- **Koen's delta (what bulk classification can't see)** — fine-grained domain intents
  (`magazijnorder`, `order_wijziging`, `interne_order_aanvraag`, `storingsmelding`) and the
  **per-customer guardrails** → need the voorwerk + an Ans session. This IS the Dim-C task-model gap.
- **Handler map for V10.5:** create-order (reuse 013, build quote-accept trigger) · backorder→Valtimo ·
  opzegging-block · order_wijziging · credit/return · Stage-3 forward-router · per-customer guardrail gates.

## Out of scope
- Building the handlers / registering intents (V10.5 phases).
- Spike 015 (sales-transfer) — still planned.
- Verifying Koen's customer-specific guardrails (needs Ans).
