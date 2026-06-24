---
spike: 017
name: order-entry-act-layer-completeness
type: standard
validates: "Dim E — dekt de act-laag (de CTO's NXT/Camunda/Exact-skills + NXT-endpoints) de HÉLE Order Entry-afdeling zoals Koen 'm in kaart bracht (~28 SOPs/taken), niet alleen create-order? En wat valt te leren van hóe de CTO (in-house NXT-expert) zijn skills bouwt, om onze handlers op te baseren? Read-only studie van de 19 CTO concept-skills (~/Downloads/skills, authoritative per source-trust) gekruist met Koens takenkaart (014 + research-SOPs) → dekkingsmatrix. De live Browserless/REST-probe op NXT-acceptance (endpoint/payload-bevestiging) is het dev-env-residu."
verdict: "DONE (read-only helft) 2026-06-24. De act-laag dekt de ORDER-CREATIE-KERN: POST /api/orders (nxt-user, prospect/open) + sites/orderSchemes/customers, cancellations (POST /api/cancellations, confirmed), send-rules, camunda-rest, Intelly — allemaal REST/skill-bevestigd. MAAR 'Order Entry' = ~28 SOPs, geen enkele create-order-flow: ~de helft is PARTIAL (NXT-write gedekt, maar orchestratie-glue ontbreekt), de GAPS zijn quote-acceptance-trigger + quote→order-lineage (grootste, spike 013), opzegging-orchestratie en per-klant-guardrail-gates; BROWSERLESS-ONLY = AED-maandbatch (SOP18/19), magazijn-dispatch 'rode pijltje'+Tablet Dispatch (SOP07/08/27), plattegronden (SOP16); DECOMMISSIONED-met-QuoteWerks = SOP03/04/08/12-kern/16-entry/24-intake (overlever = SOP02 native NXT). CTO-skill-bouwpatronen geoogst (CTO-SKILL-PATTERNS.md). De live Browserless-probe op NXT-acc is het dev-env-residu (10-punts checklist hieronder). Volledige matrix: COVERAGE-MATRIX.md."
related: [013, 014, 018]
idea: order-entry-act-proof
tags: [order-entry, v10.5, act-layer, nxt, cto-skills, coverage, browserless]
---

# Spike 017: order-entry act-layer completeness

Toetst of de act-laag de **hele Order Entry-afdeling** dekt (Koens ~28 SOPs/taken), niet alleen
create-order — en leert van hóe de CTO zijn NXT-skills bouwt. Twee bronsets convergeren: Koens
takenkaart (spike 014 + `research/`-SOPs) en de CTO's 19 concept-skills (`~/Downloads/skills`,
authoritative). Detail in de twee sibling-docs.

## Verdict per bucket

**(a) Volledig gedekt door bestaande CTO-skills** — werkadres-correctie (SOP10, `PUT /api/sites`),
site+stammaand (SOP11/15, `POST /api/sites` + `/orderSchemes` via nxt-user/amend-order-scheme),
**opzegging-block** (`POST /api/cancellations`, confirmed in nxt-user `cancel.py`), en status-vraag /
niet-order als Stage-3 forwards. De kale order-write (`POST /api/orders`) onder de meeste SOPs is confirmed.

**(b) PARTIAL — skill bestaat, orchestratie-glue ontbreekt** — het gros: SOP02/04/06/09/17/19–27 +
credit/return + order_wijziging. `nxt-user` levert de write, maar elk vraagt glue die de skills niet
geven (quote-accept-trigger, backorder→Valtimo, klant-resolutie + per-klant-gating, negatieve-regel-logica).

**(c) GAPS — geen skill/endpoint, bouwen** — (1) quote-acceptance-trigger + quote→order-transformatie
(geen `quoteAccepted`/`createOrderFromQuote`-proces; `create-order` bouwt from scratch). (2)
opzegging-orchestratie (block-endpoint bestaat, maar voorraad/lopende-orders-check → planning informeren →
block-sequence niet). (3) per-klant-guardrail-gates (STB €0, Defensie-MM + CO2-staal-marine, Dirk €500,
Jumbo-template, H&B-skip, voorrijkosten-blijft). (4) order_wijziging / credit-return handlers (014: build).

**(d) BROWSERLESS-ONLY (geen REST/skill — alleen UI-automatisering)** — AED-maandbatch (SOP18/19:
NXT-filterscherm + rapportage-site-knoppen + Outlook), magazijn-dispatch "rode pijltje" + **Tablet
Dispatch** (SOP07/08/27), plattegronden (SOP16: Emrode/Dropbox/G-schijf/post), Defensie BestelAPP.

**(e) Gestorven met QuoteWerks (DECOMMISSIONED)** — SOP03, 04 (conversie-helft), 08, 12 (dual-conversie-kern),
16 (entry), 24 (SMEQ-intake) + prefix-routing Rule 31. **Overlever = SOP02** (native NXT `SB`-offerte →
`won` → Order Genereren → DocuWare) = de REST-backbone waar elke QW-SOP nu doorheen moet of escaleert.

## Belangrijkste les + grootste gat
- **Les (CTO):** één gedeelde SPA-Bearer-token-laag (per merk gecached, 401→re-auth), 3-lagenmodel,
  default-acc + `--confirm-prod` + dry-run + present-back-confirm, catalog-validatie vóór write,
  profile-patroon (één skill, per merk/bron een profiel). → overnemen in onze handlers. Zie CTO-SKILL-PATTERNS.md.
- **Gat:** de **quote→order-lineage** is greenfield (geen quote-model/-event in de skills; `quoteReference`
  is enkel een opaque string; `prospect→open` heeft géén API — "convert in UI"). Dit is dé bouwopdracht.

## Residu — live Browserless/REST-probe op NXT-acceptance (dev-env; NIET van hier draaibaar)
Geen `BROWSERLESS_API_TOKEN`/deps in deze omgeving → dit deel draait in de dev-env. Te bevestigen:
1. `POST /api/orders` exacte payload + lifecycle (`prospect`+`prospect:true`→`open`; lines; `stockAllocationRequired` alleen via "Verwijder instelling").
2. Het **quote-object** + of er een "Order Genereren"/`Resolution=won|lost`-endpoint is, of enkel Camunda-task → bepaalt of de trigger REST of Browserless is.
3. `quoteReference`-lineage bij order-create.
4. `POST /api/cancellations` end-to-end op acc (S3-upload + `documentResourceIds` + reason-catalog + asset-preflight) voor opzegging.
5. `POST /api/sites/{id}/orderSchemes` met einddatum-leeg gehonoreerd.
6. **Camunda process-inventory** op acc (`process-definition?keyLike=`): bestaat er een quote→order of backorder→Valtimo-proces?
7. Order-types TO/CO/EX/EI/EP/MOEX/UO/UOW creëerbaar via `POST /api/orders` (catalog toont ze; `availableForScheme=false` → bevestig als directe order-types).
8. Magazijn "rode pijltje"-dispatch via enig `/api/...` of strikt UI (beslist Browserless vs REST voor SOP07/27).
9. DocuWare auth/versie (M0-blocker): upload `Site ID + Job ID + Document Type` (env BX, level Order).
10. SPA-token-harvest TTL (acc.sb.n-xt.org) + dat de bestaande Browserless-harvest een token geeft dat alle bovenstaande writes dekt.

## Out of scope
- Het bouwen van de handlers / swarm-registratie (V10.5-fases).
- Live NXT-writes (gated op dry-capture + expliciete acc-first-bevestiging).
- De data-claim-verificatie van Koens cijfers — dat is spike **018**.
