# nxt-zapier — NXT REST-toegang

Rechtstreekse toegang tot de NXT ERP REST-API (de `/api/*` backend achter de
JHipster/Auth0 SPA) zonder officiële API. Token wordt via Browserless ge-harvest,
gecached en hergebruikt.

> **Canonieke uitleg + security model:** [`docs/nxt-rest-access.md`](../../../../docs/nxt-rest-access.md)

## Bestanden

| Bestand | Rol |
|---|---|
| `acquire-token-via-browserless.ts` | Headless login op n-xt.org, vangt de Bearer-header van `/api/*` af |
| `token-store.ts` | `getValidToken(env)` — cache in `settings` tabel, refresh <5min vóór exp |
| `nxt-client.ts` | `nxtRequest(env,method,path,body)` (generiek) + getypeerde helpers (customers/sites/brands/items/prices/orders) |
| `auth.ts` | `checkWebhookAuth` (legacy single-secret) · `checkProxyAuth(req,env)` (env-gescheiden) |
| `spike-smoke.ts` | gitignored live smoke (read-only, beide envs) |

## Routes

| Route | Doel |
|---|---|
| `POST /api/automations/nxt/proxy` | **Generieke passthrough** — elk `/api/*` endpoint. Aanbevolen voor skills/Handler Agents. |
| `POST /api/automations/nxt/create-sales-order` | Order aanmaken (Zapier-app) |
| `GET  /api/automations/nxt/lookup/{customers,sites,brands,items,order-types}` | Getypeerde lookups (Zapier dynamic dropdowns) |

## Snel testen

```bash
cd web && node_modules/.bin/tsx lib/automations/nxt-zapier/spike-smoke.ts
```

## Buiten de repo gebruiken

Collega's / andere projecten: `tools/nxt-mcp/` (MCP-server + raw-HTTP skill).
Zij praten alleen met de gehoste proxy en hebben geen NXT-credentials nodig.
