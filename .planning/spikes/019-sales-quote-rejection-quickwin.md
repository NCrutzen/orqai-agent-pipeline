---
spike: 019
name: sales-quote-rejection-quickwin
type: probe-note
validates: "Is 'offerte afwijzen uit het mailverkeer' (sales intent quote_rejection) een quick-win voor de Sales-swarm? Volume + classificatie-kwaliteit + act-blast-radius gecheckt tegen agent_runs (live, read-only) 2026-06-24."
verdict: "JA — sterkste low-risk quick-win in het Order-Entry/Sales-domein. Joint-#1 actionable sales intent (80 runs, ~6/dag, 13 dagen), classificatie ziet er schoon uit (expliciete-afwijzing-reasonings MET quote-referentie SB/BB#####), en de act (quote → Resolution=lost) heeft NUL downstream side-effects (geen order/dispatch/factuur). Doet tegelijk dienst als de veiligste pathfinder voor de quote→state-transitie-glue (milestone-grootste gat), want LOST is risicoloos terug te draaien t.o.v. de won-/order-kant."
related: [017, 018]
tags: [sales, v10.5, quote-rejection, quick-win, quoteProcess]
---

# Spike 019: Sales quote_rejection quick-win

Nick-observatie: grote load op `quote_rejection` in het mailverkeer → mogelijke quick-win. Read-only
geverifieerd tegen `agent_runs` (service-role) op 2026-06-24.

## Cijfers (agent_runs, all-time)
`quote_rejection` = sales-email Stage-3 intent (`agent_runs.intent`, `intent_version 2026-06-05.v1`).

| sales intent | n |
|---|---|
| other | 511 |
| **quote_rejection** | **80** |
| service_request | 80 |
| quote_request | 67 |
| quote_acceptance | 42 |
| documentation_request | 40 |
| order_status | 31 |
| billing_dispute | 24 |
| purchase_order | 15 |
| product_question | 11 |
| complaint | 6 |
| contract | 5 |
| portal_access | 0 |

- **Joint-#1 actionable intent** (excl. `other`), gelijk met service_request, vóór quote_request/quote_acceptance.
- 80 runs over **2026-06-11 → 2026-06-24** (~13 dagen) = **~6/dag**, stabiel.
- Status: **69 `routed_human_queue`** + 11 `classifying` → nu nog **volledig handmatig**; geen act. Automatiseren offload ~6 triages/dag.
- `human_verdict` = NULL op alle 80 (queue nog niet ge-verdict) → kwaliteit niet via verdicts te meten, dus reasoning-sample gepakt.

## Classificatie-kwaliteit (5 recentste reasonings)
Schoon en mét quote-referentie:
- `[high]` "Sender explicitly declines the quote **SB017541** and states they will not use the offered service."
- `[medium]` "Sender expresses surprise and rejection of quote **BB018470**, no agreement reached…"
- `[high]` "…'geen gebruik maken van uw aanbod'…"
- `[high]` "…'wij deze niet laten uitvoeren'…"
- `[high]` "…'Geen akkoord' in response to quote **SB018289**…"

→ Intent is eenduidig en de LLM extraheert de **quote-referentie** al. Dat halveert de quote-lookup-glue.

## Waarom quick-win
1. **Laagste blast-radius act in het hele domein.** Quote → `Resolution=lost` sluit de offerte als LOST: géén order, géén dispatch, géén factuur, geen downstream. Veiligste eerste autonome write.
2. **Pathfinder voor het grootste milestone-gat.** De act is de **mirror** van "Order Genereren" (`Resolution=won`) — zelfde Camunda user-task-completion in `quoteProcess` (zie spike 017). LOST eerst bouwen bewijst de quote→state-transitie-glue risicoloos.
3. **Volume + kwaliteit** beide aanwezig (~6/dag, schone classificatie, quote-ref al geëxtraheerd).
4. `GET /api/quotes/{id}` werkt (spike 017) → email-ref → quote → open user-task → complete(lost) is traceerbaar.

## Te bevestigen vóór bouw
- De exacte **complete(Resolution=lost)**-call op de `quoteProcess` user-task — zelfde UI-gesture-residu als #1, **acc-first** te capturen (LOST is de veiligste om te testen).
- Resolveert de email-geëxtraheerde ref (SB/BB#####) betrouwbaar naar een quote mét een **open** user-task? (sommige quotes al gesloten/zonder task.)
- Notify-Planning-stap nodig na LOST? (matrix: lost = "Open User Task Resolution=lost"; mail-kant via Graph.)
- Steekproef de 80 op false-positives (geen verdicts beschikbaar) vóór auto-act.
