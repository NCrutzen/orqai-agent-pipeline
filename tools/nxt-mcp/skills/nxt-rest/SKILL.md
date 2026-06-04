---
name: nxt-rest
description: Praat rechtstreeks met de NXT ERP REST-API (klanten, sites, items, orders, prijzen) op acceptatie of productie. Gebruik wanneer een taak NXT-data nodig heeft of een NXT-order moet aanmaken. Token wordt server-side geregeld — nooit handmatig uit local storage halen.
---

# NXT REST-toegang (raw HTTP)

Je kunt rechtstreeks met de NXT REST-API praten via de gehoste passthrough-proxy.
Je hoeft **nooit** een token uit local storage te halen, in te loggen, of
Browserless te gebruiken — dat regelt de proxy server-side.

## Config (env op deze machine)

```
NXT_PROXY_BASE_URL=https://agent-workforce-eosin.vercel.app
NXT_ACC_SECRET=<AUTOMATION_WEBHOOK_SECRET>
NXT_PROD_SECRET=<NXT_PROD_WEBHOOK_SECRET>   # alleen als je prod mag
```

> Heb je de MCP-server `nxt` toegevoegd? Gebruik dan de tools `nxt_request` /
> `nxt_search_customers` i.p.v. curl — dat is netter en lekt het secret niet.

## Aanroep (generieke proxy)

`POST $NXT_PROXY_BASE_URL/api/automations/nxt/proxy` met header
`x-webhook-secret: <secret van de juiste env>` en body:

```json
{ "env": "acceptance", "method": "POST", "path": "/api/customers",
  "body": { "searchTerm": "graaf" }, "allowWrite": true }
```

Antwoord: `{ "ok": true, "status": 200, "data": <NXT response> }`.

```bash
curl -s -X POST "$NXT_PROXY_BASE_URL/api/automations/nxt/proxy" \
  -H "x-webhook-secret: $NXT_ACC_SECRET" -H "content-type: application/json" \
  -d '{"env":"acceptance","method":"POST","path":"/api/customers","body":{"searchTerm":"graaf"},"allowWrite":true}'
```

## Regels (belangrijk)

1. **Acceptance is default.** Productie alleen op expliciet verzoek; gebruik dan
   `NXT_PROD_SECRET` (niet het acc-secret — acc-secret werkt niet op prod).
2. **Read-only prod.** Op `env=production` heeft élke niet-GET call
   `"allowWrite": true` nodig — óók lookups, want NXT doet reads via POST. Zet
   `allowWrite` alleen bewust; een create-order op prod is een echte mutatie.
3. **`path` begint altijd met `/api/`.**
4. Bij twijfel of een POST een read of een write is op productie: vraag de
   gebruiker om bevestiging vóór je `allowWrite: true` zet.

## Veelgebruikte endpoints

| Doel | method | path | body |
|---|---|---|---|
| Klant zoeken | POST | `/api/customers` | `{ "searchTerm": "..." }` |
| Sites van klant | POST | `/api/sites` | `{ "customerId": 123, "status": "ACTIVE", "size": 3000 }` |
| Merken | GET | `/api/brands/filtered` | — |
| Order-types | POST | `/api/orders/types` | `{ "status": "active", "availableForEntry": true }` |
| Item zoeken | POST | `/api/items/search` | `{ "searchTerm": "...", "defaultItemsOnly": true, "includeInactive": false }` |
| Prijs bepalen | POST | `/api/prices/determine` | `{ "customerId", "siteId", "itemId", "quantity" }` |
| Order aanmaken | POST | `/api/orders` | zie `web/lib/automations/nxt-zapier/nxt-client.ts` |

Voor de exacte order-payload: kopieer de structuur uit `createSalesOrder()` in
de agent-workforce repo (`web/lib/automations/nxt-zapier/nxt-client.ts`).
