# Onderzoek: noise in info@smeba.nl niet correct weggefilterd

**Date:** 2026-06-18 · **Type:** diagnostic (no code change — root cause already fixed)
**Examples given:** metaalnieuwsbrief · roderick van bumbal · pierrette | LID Dak · BAS World

## TL;DR

De noise *werd* niet weggefilterd omdat **elke Stage-1 LLM Pass-2 call voor de
`info-routing` swarm crashte** op een Postgres CHECK-constraint. Alles viel terug
op `unknown` → niet gearchiveerd → bleef in de operator-queue staan.

**Dit is al gefixt** (migration `20260616115210`, Phase 130, live op prod
2026-06-16 11:52 UTC). Sinds 2026-06-17 zijn de LLM-errors **0** en worden
exact deze afzenders nu correct als noise geclassificeerd én gearchiveerd.

## Root cause (bewezen)

`agent_runs_swarm_type_check` somde alleen `debtor-email, sales-email, planning,
order-entry` op — **niet** `info-routing`. De LLM Pass-2 in
`classifier-screen-worker.ts` doet een `agent_runs` INSERT (rule_key
`llm:{cat}:{conf}`) → Postgres 23514 op *elke* info-routing write.

Gevolg (pipeline_events bewijs):
- `decision_details.llm_error = "agent_runs insert failed ... agent_runs_swarm_type_check"`
- `final_category_key = unknown`, `predictor = llm_2nd_pass`
- De `swarm_noise_categories` voor info-routing zijn juist goed gevuld
  (`marketing_newsletter`, `cold_sales_outreach`, `auto_dealer_spam`, `spam`, …),
  maar de LLM kon zijn keuze nooit wegschrijven.
- `classifier_rules` voor info-routing: alle categorieën `status=candidate`,
  **`n=0`** — de closed-loop telemetrie werd nooit gevoed (Wilson-CI promotie
  uitgehongerd). Migration-comment benoemt dit zelf: *"Every other Phase 130 task
  is INERT until this lands."*

## Verificatie dat het nu werkt (post-fix, > 2026-06-16 12:00)

LLM Pass-2 attribueert **en** archiveert nu (final_decision == llm_category_key):

| categorie | n | komt overeen met voorbeeld |
|---|---|---|
| cold_sales_outreach | 15 | Roderick van Bumbal, Pierrette \| LID Dak |
| marketing_newsletter | 12 | metaalnieuwsbrief |
| spam | 4 | |
| auto_dealer_spam | 2 | BAS World |
| unsolicited_job_application / automated_security_report | 1 elk | |
| unknown | 35 | **terecht** — echte business-mail (extincteur-orders, procurement, contactformulieren) |

De `unknown`-restgroep op 6-17 is legitieme correspondentie die hoort door te
gaan naar Stage 3 — geen mis-filter.

## Restwerk (geen van beide blokkeert; keuze aan operator)

1. **Backlog reprocessen (optioneel).** In het bug-venster (2026-05-21 →
   2026-06-16 11:49) zijn **683 distinct emails** op `llm_error` → `unknown`
   geknald. Op basis van de post-fix mix is ~40-45% daarvan noise die nu ten
   onrechte in de manual-review/Kanban-queue staat (nooit gearchiveerd). Ze
   herverwerken zich **niet** vanzelf. Wil je een schone queue → re-run Stage 1
   op die 683 (of bulk-archiveer in Outlook). Pre-mei voorbeelden (BAS World maart–mei)
   liepen nog *niet* via deze swarm en zijn niet relevant.

2. **Determinisme laten groeien — niets doen (aanbevolen, ponytail).** De
   categorieën staan op `candidate`/`n=0` puur omdat de telemetrie tot 2 dagen
   geleden leeg was. Nu er data stroomt, promoot `classifier-promotion-cron` ze
   vanzelf naar deterministische rules zodra `n≥30` & Wilson CI-lo ≥ 0.92. Geen
   nieuwe regex nodig. Voeg alleen een handmatige sender-domain rule toe als één
   specifieke afzender blijft doorglippen — niet preventief.

## Bewijs-queries / refs
- Constraint-fix: `supabase/migrations/20260616_phase130_agent_runs_swarm_type_check_info_routing.sql`
- Code: `web/lib/inngest/functions/classifier-screen-worker.ts` (LLM Pass-2 INSERT),
  `web/lib/debtor-email/classify.ts` (regex Pass-1, gedeeld door info-routing),
  `web/lib/stage-1/actionable-tokens.ts` (carve-out)
- Registry: `public.swarm_noise_categories`, `public.classifier_rules` (info-routing)
