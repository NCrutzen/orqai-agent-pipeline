# NXT MCP server

Geeft Claude Code skills (in welk project dan ook) rechtstreeks toegang tot de
**NXT REST-API** zonder lokaal een token, Browserless of credentials te hebben.
Alles loopt via de gehoste passthrough-proxy op de agent-workforce Vercel-app,
die het Auth0-token server-side harvest + cached.

## Hoe het werkt

```
Claude Code skill ──▶ nxt-mcp (lokaal, stdio) ──▶ https://<app>/api/automations/nxt/proxy
                                                          │ (harvest + cache token, Browserless)
                                                          ▼
                                                   NXT /api/* (acc of prod)
```

De MCP-server bevat **geen NXT-credentials** — alleen de webhook-secret(s) + de
base-url. De token-harvest gebeurt volledig server-side.

## Install & toevoegen aan Claude Code

```bash
cd tools/nxt-mcp
npm install

claude mcp add nxt -- node "$(pwd)/server.mjs"
# Zet daarna de env vars (of geef ze mee met -e bij add):
#   NXT_PROXY_BASE_URL=https://agent-workforce-eosin.vercel.app
#   NXT_ACC_SECRET=<AUTOMATION_WEBHOOK_SECRET>
#   NXT_PROD_SECRET=<NXT_PROD_WEBHOOK_SECRET>   # optioneel; weglaten = geen prod
```

> **Acc-only collega's**: laat `NXT_PROD_SECRET` weg. Dan kan die persoon
> productie letterlijk niet bereiken — de proxy weigert zonder het juiste secret.

## Tools

| Tool | Wat |
|---|---|
| `nxt_request` | Generieke call: `{ env, method, path, body?, allowWrite? }` naar elk `/api/*` endpoint |
| `nxt_search_customers` | `{ env, searchTerm }` — read-only klant-lookup |
| `nxt_search_items` | `{ env, searchTerm }` — read-only artikel-lookup |

## Security model (teambesluit 2026-06-04)

- **Env-gescheiden secrets**: acc → `NXT_ACC_SECRET`, prod → `NXT_PROD_SECRET`.
- **Read-only prod**: op productie zijn alle niet-GET calls geblokkeerd tenzij
  `allowWrite: true`. ⚠️ NXT gebruikt POST óók voor reads (lookups), dus een
  prod-lookup heeft ook `allowWrite: true` nodig — de proxy kan een search-POST
  niet onderscheiden van een create-POST.
- **Geen path-allowlist**: elk `/api/*` path mag (bewust open).

## Voorbeeld

```
nxt_request env=acceptance method=POST path=/api/customers body={"searchTerm":"graaf"} allowWrite=true
nxt_request env=production  method=GET  path=/api/brands/filtered
```
