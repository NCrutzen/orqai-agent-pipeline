# Heeren Oefeningen Facturatie

**Status:** Fase 1 live op productie · Fase 2 productie-geverifieerd, wacht op echte test-regel
**Type:** hybrid (Zapier → Vercel → Inngest → Browserless)
**Eigenaar:** Automation team
**Systemen:** NXT (browser automation — geen API)
**Supabase project-id:** `24ae5949-8b1c-4ec8-a590-f9121951aae8`

## Wat doet het

Bij Heeren Loo worden er in NXT bij elk bezoek orderregels aangemaakt voor **oefeningen** (training-items). Deze regels moeten niet mee op de lopende factuur, maar aan het **einde van de maand** als aparte facturen de deur uit. Deze automation zorgt daarvoor in twee fases:

- **Fase 1 — Regel verwijderen** (real-time): zodra een oefening-orderregel in NXT verschijnt, wordt die door Browserless verwijderd en in een staging tabel bewaard.
- **Fase 2 — Draft factuur aanmaken** (maandelijks): op de laatste werkdag van de maand maakt een cron voor alle bewaarde regels een nieuwe NXT order (status "draft") aan. Een mens reviewt en factureert definitief.

## Waarom

Zonder deze automation zou een medewerker maandelijks handmatig ~50-100 orderregels moeten verplaatsen tussen orders — foutgevoelig en tijdrovend.

## Flow

```
Fase 1 (per regel):
┌────────┐   ┌─────────┐   ┌────────┐   ┌─────────────┐
│ NXT DB │──▶│ Zapier  │──▶│ Vercel │──▶│ Inngest fn: │
│  (SQL) │   │   SQL   │   │  API   │   │ process...  │
└────────┘   └─────────┘   └────────┘   └──────┬──────┘
                                               ▼
                                        ┌────────────┐       ┌──────────────┐
                                        │ Browserless│──────▶│ delete-order │
                                        │   (NXT)    │       │    -line     │
                                        └────────────┘       └──────┬───────┘
                                                                    ▼
                                                         ┌──────────────────┐
                                                         │ staging (status: │
                                                         │    processed)    │
                                                         └──────────────────┘

Fase 2 (maandelijks):
┌─────────────────┐   ┌────────────────┐   ┌────────────────┐
│ Cron 18:00 NL   │──▶│ last-workday?  │──▶│ query staging  │
│ (Inngest)       │   │ else skip      │   │ (2 mnd, open)  │
└─────────────────┘   └────────────────┘   └───────┬────────┘
                                                   ▼
                                          ┌────────────────────┐       ┌─────────────────┐
                                          │ group by (cust+    │──────▶│ createInvoice   │
                                          │ site+brand+type)   │       │ Draft (Browser- │
                                          └────────────────────┘       │ less, per groep)│
                                                                       └────────┬────────┘
                                                                                ▼
                                                                    ┌────────────────────┐
                                                                    │ NXT draft order    │
                                                                    │ + staging updated  │
                                                                    └────────────────────┘
```

## Credentials

- `NXT_USERNAME` / `NXT_PASSWORD` — via Supabase `credentials` tabel in productie, fallback in env
- `BROWSERLESS_API_TOKEN` — in Vercel env vars
- `AUTOMATION_WEBHOOK_SECRET` — Zapier authenticatie

## Bestanden

| Bestand | Doel |
|---------|------|
| `delete-order-line.ts` | Fase 1 Browserless script: verwijdert één orderregel uit NXT |
| `create-invoice-draft.ts` | Fase 2 Browserless script: maakt een nieuwe NXT draft order aan |
| `seed-and-test-fase2.ts` | End-to-end test: seed staging → Fase 2 flow → verify |
| `explore/` | Verken-scripts van NXT UI (reference voor debug) |
| `screenshots/` | Lokale screenshots tijdens development |
| `templates/` | Gedownloade NXT template bestanden (Import Order Lines XLSX) |

## Inngest functies

| Functie | Trigger | Locatie |
|---------|---------|---------|
| `processHeerenOefening` | event `automation/heeren-oefeningen.triggered` | `lib/inngest/functions/heeren-oefeningen.ts` |
| `createMonthlyInvoiceDrafts` | cron `TZ=Europe/Amsterdam 0 18 * * 1-5` + event `automation/heeren-oefeningen.create-invoices` | idem |

## HTTP endpoints

- `POST /api/automations/heeren-oefeningen` — Fase 1 webhook voor Zapier
- `POST /api/automations/heeren-oefeningen/create-invoices` — Fase 2 handmatige trigger (met `forceRun: true`)

## Staging tabel (`heeren_oefeningen_staging`)

Schema staat in `supabase/schema-heeren-oefeningen.sql` + `supabase/migrations/20260421_heeren_oefeningen_fase2.sql`.

### Fase 1 velden
`billing_order_code`, `billing_order_id`, `billing_order_line_id`, `billing_item_id`, `course_id`, `screenshot_before`, `screenshot_after`, `status`, `processed_at`

### Fase 2 velden
- Input: `customer_id`, `site_id`, `brand_id`, `order_type_id`, `quantity`, `unit_price`, `description` (gevuld door Zapier SQL)
- Resultaat: `new_order_uuid`, `new_billing_order_code`, `invoice_draft_created_at`, `invoice_draft_screenshot`, `invoice_error`

## Zapier SQL query (live)

Bevestigd op productie 2026-05-19. Brand komt als string-code (`'BB'`) i.p.v. UUID — dat is wat de NXT dropdown verwacht. Site is NULL voor top-level customers zonder mother-company; de Fase 2 code skipt de site-dropdown dan automatisch.

```sql
SELECT
    sol.Id                       AS id,
    sol.BillingOrderCode         AS billingOrderCode,
    sol.BillingOrderId           AS billingOrderId,
    sol.BillingOrderLineId       AS billingOrderLineId,
    sol.BillingItemId            AS billingItemId,
    sol.CourseId                 AS courseId,
    sol.BillingItemPrice         AS unitPrice,
    CASE
        WHEN c.MotherCompanyId IS NOT NULL THEN mc.ExternalCode
        ELSE c.ExternalCode
    END                          AS customerId,
    CASE
        WHEN c.MotherCompanyId IS NOT NULL THEN c.ExternalCode
        ELSE NULL
    END                          AS siteId,
    'BB'                         AS brandId,        -- NXT brand-code (string), niet de interne UUID
    'DOTR'                       AS orderTypeId,
    1                            AS quantity,
    'Production'                 AS [environment]
FROM SalesOrderLines sol
    INNER JOIN Companies c   ON c.Id  = sol.CompanyId
    LEFT JOIN  Companies mc  ON mc.Id = c.MotherCompanyId
WHERE sol.UseNxtInvoicing = 1
  AND sol.CourseTheme = 2
  AND c.Name LIKE '%Heeren%'
ORDER BY sol.Id DESC;
```

`description` wordt door de Fase 1 Browserless-stap uit het NXT-scherm gegrepen tijdens delete; niet via Zapier nodig.

## Testen

### Fase 1 — handmatig trigger
```bash
curl -X POST https://{deploy}/api/automations/heeren-oefeningen \
  -H "Content-Type: application/json" \
  -d '{
    "webhookSecret": "{secret}",
    "billingOrderCode": "370147",
    "billingOrderId": "test",
    "billingOrderLineId": "test-line-1",
    "billingItemId": "6410005107",
    "courseId": "test-course"
  }'
```

### Fase 2 — seed + trigger end-to-end
Zodra de migration is uitgevoerd:
```bash
cd web
npx tsx lib/automations/heeren-oefeningen/seed-and-test-fase2.ts
```

### Fase 2 — handmatig vanuit productie
```bash
curl -X POST https://{deploy}/api/automations/heeren-oefeningen/create-invoices \
  -H "Content-Type: application/json" \
  -d '{"webhookSecret": "{secret}", "triggeredBy": "handmatig-test", "forceRun": true}'
```

## Productie go-live (status)

- [x] Supabase migration uitgevoerd (`supabase/migrations/20260421_heeren_oefeningen_fase2.sql`)
- [x] Zapier SQL query live met Fase 2 velden
- [x] NXT credentials productie (`environment='production'` in Supabase `credentials`)
- [x] URLs per environment uit `systems` tabel (geen hardcoded acc-URL meer)
- [x] Fase 1 webhook geverifieerd op productie (staging-row 2026-05-19 met correcte Fase 2 velden)
- [ ] Echte Fase 1 → Fase 2 round-trip op een nieuwe Heeren oefening-regel

## Ontwerpkeuzes

- **Groepering:** 1 nieuwe draft order per unieke combinatie `(customer_id, site_id, brand_id, order_type_id)` — kan later aangepast worden (bijv. alle samen of per bedrijf).
- **Order type "DOTR" (Training / Opleiding):** matcht het type van de bron-orders. Bij types zonder `Planned start/end` velden (bijv. `DO` Directe Order) detecteert de code dit automatisch en skipt die velden.
- **Save als draft:** voorlopig geen auto-submit — een mens reviewt en factureert definitief. Reviewer krijgt screenshot + URL.
- **Window van 2 maanden:** als vorige maand-run (deels) misging, pakt de volgende run het alsnog op.
- **Idempotency:** records met `new_billing_order_code` gevuld worden niet opnieuw opgepakt. Als NXT geen human-readable code teruggeeft, slaan we de UUID daar op.
