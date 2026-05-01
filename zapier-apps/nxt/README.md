# Moyne Roberts NXT — Zapier Custom App

Custom Zapier integration die NXT-acties beschikbaar maakt in elke Zap.

## Architectuur

```
Zap → NXT (Zapier App) → ${baseUrl}/api/automations/nxt/* (Vercel)
                                                       → NXT API
                                                          (JWT via Browserless bootstrap)
```

## Setup

```bash
cd zapier-apps/nxt
npm install
npx zapier login                    # eenmalig, met Zapier developer account
npx zapier register "MR NXT"        # eenmalige app-registratie
cp .zapierapprc.example .zapierapprc # vul de gegenereerde id in
npx zapier push                     # upload naar Zapier
npx zapier promote 1.0.0            # publiceer (alleen private/team-zichtbaarheid)
```

## Authenticatie

Custom auth: bij het verbinden in Zapier vult de Zap-builder in:

- **Vercel Base URL** — `https://agent-workforce-moyne-roberts.vercel.app`
- **Shared Secret** — waarde van `AUTOMATION_WEBHOOK_SECRET` in Vercel env vars

## Acties

### Create Sales Order

Roept `POST ${baseUrl}/api/automations/nxt/create-sales-order` aan.

**Inputs (v1)** — handmatige IDs (volgende iteratie: dynamic dropdowns):

- `env` — acceptance | production
- `customerId`, `siteId`, `brandId`, `orderTypeId`
- `itemId`, `quantity`, `price`, `discount`, `transferToUsage`
- `reference1/2/3` — optioneel

**Outputs:**

- `id` (UUID), `internalId` (zichtbaar nummer), `orderStatusId`, `url`

## Lokaal testen

```bash
npx zapier test                     # runt Zapier's eigen testharnas
```

## Volgende stappen

- Dynamic dropdowns (customers, sites, items) — vereist lookup-routes in Vercel
- Multi-line orders (huidige v1 ondersteunt 1 regel per Zap-action)
- Search-actie ("Find Customer") + trigger ("New Sales Order")
