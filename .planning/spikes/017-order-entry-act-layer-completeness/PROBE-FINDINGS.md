# Probe-bevindingen — NXT-acceptance (2026-06-24)

De live act-laag-probe in twee helften: de **data-model-helft** kon read-only via de NXT-SQL-replica
(Zapier-SQL, geen dev-env) — hieronder. De **REST/Browserless-helft** (exacte calls/payloads) blijft
dev-env-residu (onderaan).

## Data-model-helft — UITGEVOERD (NXT-SQL-replica, read-only)

### #2 Quote-entiteit bestaat + acceptance-signaal
`nxt.dbo.quote_bx` (+ `quote_line_bx`) bestaat. Statuswaarden:

| status | n | closed_date | related_job |
|---|---|---|---|
| SENT | 7.522 | 0 | 6.883 |
| **ORDER** | **3.691** | 3.691 | 3.336 |
| LOST | 3.166 | 3.166 | 2.918 |
| SUPERSEDED | 1.374 | 61 | 1.240 |
| GENERATED | 873 | 0 | 873 |
| DRAFT | 776 | 9 | 412 |
| CANCELLED | 664 | 1 | 431 |
| PENDING_APPROVAL | 84 | 0 | 83 |
| WON | 36 | 36 | 17 |
| EXPIRED | 5 | 0 | 2 |

→ **Conversiesignaal = `quote.status='ORDER'`** (3.691; closed_date + related_job_id gevuld), níét `WON`
(slechts 36, kennelijk legacy/handmatig). Relevante velden: `status`, `closed_date`, `related_job_id`,
`reference`, `customer_id`, `site_id`, `valid_until_date`, `sent_on`, `enquiry_number`.

### #3 Quote→order-lineage is ECHT en wordt in productie gebruikt
`orders_bx.origin_quote_id` (bigint FK) **én** `quote_reference` (nvarchar) bestaan. Vulling (BX, 12 mnd):
origin_quote_id op o.a. 2.386/36.962 invoiced, quote_reference op 6.078 — d.w.z. een minderheid (de
quote-afgeleide orders), de rest (PO's/stammaand) heeft geen quote. **De lineage-rails liggen er;** de
handler kan `origin_quote_id` zetten. Verfijnt spike 013/017's "alleen opaque string / geen lineage".

### #1 Order-lifecycle bevestigd
`orders_bx.order_status`: invoiced, open, cancelled, preplanning, unplannable, scheduled, dispatched,
invoicing, processed, **prospect** (224, = drafts), started, committed. + `stock_allocation_started/completed/result`-kolommen.

### #4 Cancellation-model + reason-catalogus (opzegging-block)
Volledig model als views: `cancellation_bx`, `cancellation_reason_bx`, `cancellation_document_bx`,
`cancellation_change_bx`. Reason-catalogus: **BB** Bedrijfsbeëindiging · **NT** Leegstand/niet toegankelijk ·
**GI** Geen inkooporder · **PR** Prijs · **VA** Verloren aanbesteding · + klacht-codes (AD/MA/OP/OR/PL/VE) ·
FA Faillissement · IN Incasso · NM Nieuwe materialen. (Opzegging → BB/NT.)

### #5 Stammaand (order_scheme_bx)
Velden incl. `start_scheme`, **`end_scheme`** (de einddatum — Koens "leeg laten"-regel), `frequency`,
`frequency_start`, `months`, `window`, `generated_until`, `job_duration`, `quote_reference`, `subscription_id`.

### #6 Camunda/process — views bestaan (verder REST nodig)
`context_processes_bx`, `process_definition_variable_bx`, `process_data_object_relation_bx`,
`process_definition_version_changelogs_bx` bestaan in de replica → process-inventory is verder te
inspecteren op een quote→order / backorder-proces (niet in deze ronde uitgediept).

## Gevolg voor het verdict
De quote→order-bouwopdracht is **smaller dan "greenfield"**: trigger = email-akkoord, act = order met
`origin_quote_id`, resultaat data-verifieerbaar (`quote.status='ORDER'`). Het datamodel + detectie +
lineage + cancellation-catalogus staan; wat ontbreekt is de **automatisering** (de "Order Genereren"-call
zelf) en de orchestratie-glue.

## REST/Browserless-helft — LIVE GEDRAAID 2026-06-24; token-harvest-bug (temporary login token)
De probe (`probe-order-entry-acc.ts`) is **live uitgevoerd** vanuit de main-checkout (deps + `.env.local`).
Resultaat + **gecorrigeerde diagnose** (dank Ans/Nick):
- **Token-harvest liep, maar pakte het VERKEERDE token.** `acquireTokenViaBrowserless` vangt de **eerste**
  `Bearer` op een `/api/*`-request. Dat blijkt een **temporary login token** te zijn (Valtimo/NXT toont
  `403 — "You are authenticated with a temporary login token. Login with your credentials"` + knop
  *Reauthenticate*). De headless auto-login voltooit de **volledige credential-auth niet** vóór de eerste
  `/api/*`-call, dus we capturen het tijdelijke token.
- **Élke `/api/*`-call gaf daarom `502/403`** — géén acc-storing (mijn eerdere "acc down"-conclusie was
  fout), maar de API die het tijdelijke token afwijst.
- **Neveneffect opgeruimd:** `getValidToken` cachet automatisch via `storeToken` → mijn tijdelijke token
  belandde in `public.settings.nxt_oauth_token_acceptance`. Die rij is **verwijderd** zodat de live app niet
  aan het foute token vastzit. (Les: een probe nooit via `getValidToken` draaien — die schrijft naar de
  gedeelde cache.)

**Fix-richtingen (token-harvest):**
1. Capture de Bearer **ná** volledige credential-login (niet de eerste `/api/*`), of handel de
   *Reauthenticate*-stap expliciet af.
2. Of volg het **CTO-patroon** (`nxt.py`/`browser_token.py`): grab het token via CDP uit een Chrome die
   al **met credentials ingelogd** is — dat omzeilt het temporary-token-probleem dat onze headless
   auto-login raakt. (Zie CTO-SKILL-PATTERNS.md §3.)

Onderstaande punten blijven open tot de harvest een **volwaardig** token levert:
1. Exacte **"Order Genereren"**-call (method/path/body) die quote→`status='ORDER'` + order met `origin_quote_id` zet — REST of enkel UI?
2. `POST /api/orders` payload-bevestiging (`prospect`→`open`-transitie heeft mogelijk geen API).
3. Magazijn "rode pijltje"-dispatch: `/api/...` of strikt UI/Tablet Dispatch?
4. DocuWare-auth (upload Site/Job/Document Type).
5. SPA-token-TTL via de Browserless-harvest.
→ Draai `web/lib/automations/nxt-zapier/probe-order-entry-acc.ts` in de dev-env (zie README).
