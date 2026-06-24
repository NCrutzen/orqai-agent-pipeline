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

## REST-helft — RESOLVED op PRODUCTIE 2026-06-24 (read-only, CTO-akkoord; acc offline)
Acc lag offline → CTO gaf akkoord de read-only REST-helft op **productie** te draaien (alleen lezen).
Gedraaid via een **wegwerp-runner** die safe-by-construction is: token via `loadToken("production")`
(plain SELECT, geen harvest/geen store) en bij expiry een **in-memory** `acquireTokenViaBrowserless`
— nooit `getValidToken`/`storeToken`, dus de live `settings.nxt_oauth_token_production`-rij blijft ongemoeid.

**Root-cause vanmorgen herzien (2e keer):** de "temporary login token"-vangst was **geen** harvest-bug
maar twee aparte oorzaken: (a) acc was kapot, en (b) de `NXT Production Login`-credential had de
**verkeerde username** (`danny.vaessens.cb` i.p.v. `nick.crutzen.cb`) → Auth0 "Wrong email or password",
dus geen Bearer. Username gecorrigeerd (wachtwoord bleef ongewijzigd); daarna logde de harvest probleemloos
in en leverde een echt RS256-token (~10h TTL).

| # | Residual | Live-prod resultaat |
|---|---|---|
| #7 | order types | `POST /api/orders/types {status:active,availableForEntry:true}` → **200, 19 entry-valide types** (SQL zei 34 totaal). Bv. `AI=Detectie Installatie`. |
| #6 | camunda quote→order/backorder proces? | `GET /api/camunda-rest/process-definition?latestVersion=true` → **16 procs**. Relevant = **`quoteProcess`** (Quote process). **Géén** apart order- of backorder-proces; planning via `prePlanningProcess`/`updatePlanningProcess`/`Job_processing`. |
| #2 | quote REST-endpoint | collection `GET /api/quotes` → **405** (methodNotSupported, conform CTO-gotcha). Single `GET /api/quotes/{id}` → **200** (`{id,status,…}`). REST-quote bestaat. |
| #1/#3 | order shape + lineage-veld | `GET /api/orders/{guid}` → **200**. Top-level keys: `id, internalId, date, reference1, brandId, customerId, siteId, created, createdBy, ticketFinishDate, orderTypeId, orderTypeAvailableForEntry, orderTypeDirectDispatchEnabled, orderTypeDirectInvoice, orderStatusId, windowStartDate, windowEndDate, startDate, subscriptionId, jobsCustomDurations, site, customer, companyId, lines, notes, `**`originQuote`**`. → REST-lineage-veld = **`originQuote`** (verfijnt SQL's `origin_quote_id`/`quote_reference`); lifecycle-veld = `orderStatusId`; dispatch-flag = `orderTypeDirectDispatchEnabled`; stammaand-link = `subscriptionId`. |
| #5 | orderScheme read | `GET /api/sites/{id}/orderSchemes` → **405** → read is POST-shaped (CTO-gotcha "order-scheme POST"). Velden al via SQL-replica gedekt. |
| #4 | cancellation reasons | `GET /api/cancellations/reasons` → **400** (`reasons` als long geparsed → pad is `/api/cancellations/{id:long}`). Reason-catalogus al via SQL-replica gedekt. |
| #10 | SPA-token-TTL | harvest leverde token met **~600min (10h)** TTL — conform CTO `id_token ~10h`. |

**Echt nog open (alléén via UI-gesture / Browserless DOM-capture, geen GET):**
1. Exacte **"Order Genereren"**-call die quote→`status='ORDER'` + order met `originQuote` zet.
2. Magazijn **"rode pijltje"**-dispatch: `/api/...` of strikt UI/Tablet Dispatch.

### Read-only UI-capture-poging 2026-06-24 (geen write afgevuurd) — wat het opleverde
Browserless-sessie ingelogd op prod (creds gefixt), passief genavigeerd, **geen actie-knop geklikt**.
Conclusies (inferentieel — exacte body vereist een echte write → acc-first):
- **#1 "Order Genereren" = vrijwel zeker een Camunda user-task-completion in `quoteProcess`, géén directe `POST /api/orders` vanuit de knop.** Bewijs: `quoteProcess` bestaat (#6); de home/taken-inbox draait op `POST /api/tasks` (200); CTO/matrix beschrijft "Open User Task `Resolution=won` → Order Genereren". De act = de user-task completen met `Resolution=won` → de proces-engine bouwt de order (met `originQuote`). De mirror `Resolution=lost` sluit de quote als LOST (zie quote_rejection-quick-win).
- **#8 dispatch "rode pijltje" = vrijwel zeker pure UI (Tablet Dispatch), geen algemene `/api`-call.** Bewijs: route `#/dispatch` redirect naar `#/home` voor deze user/rol; de order-shape draagt de flag `orderTypeDirectDispatchEnabled` (UI-conditie, geen endpoint). Bevestigt de BROWSERLESS-ONLY-classificatie in de matrix.
- JS-bundle-grep faalde: NXT serveert één opaque bundle + dynamisch samengestelde paden → endpoint-literals niet betrouwbaar headless te grijpen. De exacte call vastleggen vereist de klik = een write → **acc-first** (spike-regel), niet read-only haalbaar.
→ Zie DOM-PROBE-note onderaan `probe-order-entry-acc.ts`.

<details><summary>Historische diagnose (acc-run vanochtend — superseded door bovenstaande)</summary>

### REST/Browserless-helft — LIVE GEDRAAID 2026-06-24; token-harvest-bug (temporary login token)
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

</details>
