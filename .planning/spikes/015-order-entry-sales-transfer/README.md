---
spike: 015
name: order-entry-sales-transfer
type: standard
validates: "Dim D — of the act-layer (013) + intent/handler (014) work, what is genuinely CROSS-SWARM (transfers to/from the sales-email swarm) vs order-entry-specific? The offerte→order journey crosses the sales/order boundary, so the answer decides which pieces order-entry builds new vs inherits/reuses from sales + the shared pipeline."
verdict: "DONE 2026-06-23. Exactly ONE intent is genuinely cross-swarm: offerte_akkoord / quote_acceptance — sales DETECTS it (Stage 3, registered intent, 2,208 live), order-entry must ACT on it (create-order, the spike-013 GAP). Everything else is order-entry-specific act work (create-order/backorder/opzegging/order_wijziging/credit-return/guardrails) OR already-shared, already-locked infrastructure that order-entry inherits for free (stage-3-dispatcher, swarm_intents registry + codegen, resolver_index Stage-2 transport). NO new cross-swarm plumbing to build. The handoff is a registry INSERT, not code. Two reuse-locks for order-entry: (a) offerte→customer resolution MUST use sales' resolver_index path, never NXT REST (spike 011 false-positive); (b) the verkoop@→order@ forward (quote_acceptance + order_status, ~15/mnt) is already specced in the routing-swarm charter, not yet wired."
related: [012, 013, 014, 011]
idea: order-entry-act-proof
tags: [order-entry, v10.5, sales, cross-swarm, dispatch, offerte]
---

# Spike 015: order-entry ↔ sales-email transfer (Dim D)

Lays the order-entry act-layer (013) + intent/handler map (014) against the **existing sales-email
swarm** (Phase 113, live `verkoop@smeba.nl`; multi-brand SB/BB/FI via PR #130) to separate what
crosses the swarm boundary from what is order-entry's own. Read-only synthesis of 013/014 + the
cross-swarm RFC + the sales swarm code/registry.

## 1. The shared substrate is already built and locked

Order-entry adds a swarm to a funnel that is **already cross-swarm by design** — it inherits, builds nothing:

| Shared mechanism | Where | What order-entry gets for free |
|---|---|---|
| **stage-3-dispatcher** | `web/lib/inngest/functions/stage-3-dispatcher.ts` | Single Inngest fn, wildcard `pipeline/predicted`, zero hardcoded swarm names. Routes on `swarm_intents.handler_status`: `placeholder`→Kanban, `registered`→emit `handler_event` |
| **`swarm_intents` registry** | `public.swarm_intents` (Phase 68) | `(swarm_type, intent_key) → (handler_event, handler_status)`. Add a swarm = INSERT rows, **zero dispatcher code change** |
| **Intent codegen** | `coordinator/intent.generated.ts` ← `scripts/gen-intent-types.ts` | One source of truth; sales + order-entry intents regen in one pass. No parallel enums, no merge risk |
| **Stage-2 transport** | `nxt.resolve_candidates` → `zapier.dbo.resolver_index` | The single resolution route for ALL swarms (locked `stage-2-entity.md` 2026-06-15) |
| **Cross-swarm dispatch contract** | `docs/agentic-pipeline/README.md` (Swarm Shapes / Hybrid) | `<target_swarm>/dispatch.requested` event shape already defined |

→ **No new cross-swarm plumbing.** Registering order-entry is INSERTs + a per-swarm classifier fn.

## 2. What actually crosses the boundary

| Flow | Direction | Volume | Cross-swarm? | Mechanism |
|---|---|---|---|---|
| **offerte_akkoord / quote_acceptance** | **sales → order-entry** | 2,208 live (7%); charter says ~9/mnt at verkoop@ | **YES — the one true cross-swarm act** | Sales Stage-3 emits intent; order-entry's `create-order` handler acts. Today both `placeholder` → Kanban |
| **order_status** | sales → order-entry | ~6/mnt (charter) | partial | Status question raised at verkoop@ that order-entry owns → forward |
| **offerte_aanvraag / quote_request** | **order-entry → sales** | 184 live | YES (reverse) | Order-entry Stage-3 router forwards a quote *request* back to verkoop@ — sales owns quoting |
| **status / planning / storing forwards** | order-entry → planning/HR/Jeroen-Ad | ~25% of order-work | NO (not sales) | Order-entry Stage-3 router, intra-org dispatch — not the sales swarm |

The whole cross-swarm surface with **sales** is the offerte lifecycle: sales owns the quote (request →
send → accept/reject); order-entry owns the order. **The accept event is the seam.**

## 3. The offerte→order seam (the spike-013 GAP, re-framed)

013 found the GAP: no quote-acceptance trigger, no quote→order glue. 015 places that GAP precisely:

- **Detection is NOT order-entry's to build** — sales-email already carries `quote_acceptance` as an
  intent row (`swarm_intents`, seeded migration `20260609b`, 13 sales intents). Sales Stage-3
  classifies it; order@ also receives direct acceptances and classifies them in its own Stage-3.
  **Live-verified 2026-06-23** (Agent-Workforce DB `mvqjhlxfvtqqubqgdvhz`): all 13 sales intents are
  `handler_status='placeholder'` (so today they route to the Kanban human-lane, no Stage-4 handler
  yet); `quote_acceptance` exists with `handler_event='sales-email/quote_acceptance.requested'`. The
  detection wiring is present; only the act-side handler is missing.
- **Resolution is NOT order-entry's to build, and is LOCKED away from NXT REST** — the offerte→customer
  lookup is `web/lib/automations/sales-email/lookups/offerte.ts` via `resolver_index` (filter
  `identifier_kind='quote_no'`, require `is_unique_in_scope`). Order-entry MUST reuse this, NOT
  `/api/quotes/search` (spike 011: searchTerm ignored → every offerte resolved to customer `512887`,
  confident false positive). NXT REST stays writes/UI-lookups only.
- **The act IS order-entry's to build** — `create-order` (`POST /api/orders`, `quoteReference=<id>`,
  CTO `nxt-user` skill, spike 013) wrapped as a Stage-4 handler, plus the trigger that fires it on a
  `quote_acceptance` verdict. This trigger is the *only* genuinely new cross-swarm code, and even it is
  a registry INSERT (`(order-entry, quote_acceptance) → handler_event=order-entry/quote_acceptance.requested, handler_status=registered`)
  + the handler body — the dispatcher routes it unchanged.

## 4. Order-entry-specific (does NOT cross to sales)

From 014's handler map, everything except the offerte seam is order-entry's own act work:
`create-order` body · `backorder→Valtimo` (Camunda) · `opzegging→block site/customer` ·
`order_wijziging` · `credit/return` · per-customer guardrails (STB €0, Defensie-MM, CO2-marine,
Dirk-€500). None touch the sales swarm.

## Conclusion (V10.5 readiness)
- **Cross-swarm-with-sales surface = the offerte lifecycle, and it reduces to one seam:**
  `quote_acceptance` (sales detects → order-entry acts) + the small reverse `quote_request` forward.
  Live-verified: the sales intent rows exist but sit at `handler_status='placeholder'` — the seam is
  scaffolded, not yet wired.
- **Nothing new to build at the swarm-boundary layer** — dispatch, registry, codegen, and Stage-2
  transport are shared and locked; order-entry inherits them.
- **Two hard reuse-locks for the V10.5 build:** (a) resolve offerte→customer via the shared
  `resolver_index` path, never NXT REST; (b) the `verkoop@→order@` forward
  (`quote_acceptance`/`order_status`, ~15/mnt) is already specced in
  `docs/routing-swarm-milestone-charter.md` — wire it, don't redesign it.
- **The build cost is the act layer, not the integration** — `create-order` + the quote-accept
  trigger (spike-013 GAP) is order-entry's real work; the cross-swarm handoff is an INSERT.

## Out of scope
- Building the create-order handler / quote-accept trigger / registering the order-entry swarm (V10.5 phases).
- Wiring the verkoop@→order@ forward (routing-swarm milestone).
- Verifying Koen's per-customer guardrails (needs Ans — see 014).
