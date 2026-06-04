# NXT REST-toegang (token-harvest + passthrough-proxy)

**Status:** live geverifieerd 2026-06-04 (acceptance + production read-only).
**Code:** `web/lib/automations/nxt-zapier/` · **Proxy-route:** `web/app/api/automations/nxt/proxy/route.ts`
**Voor skills/collega's buiten de repo:** `tools/nxt-mcp/` (MCP-server + raw-HTTP skill).

> CLAUDE.md zegt historisch *"NXT — Geen API"*. Dat klopt genuanceerd niet: er is
> geen **officiële/supported** API, maar NXT is een **JHipster + Auth0 SPA** met
> een volwaardige REST-backend op `/api/*` die we kunnen aanspreken zodra we het
> Bearer-token hebben. Dit document is de canonieke bron voor hoe dat werkt.

## Architectuur

```
skill / Handler Agent
   │  (geen token, geen credentials, geen Browserless)
   ▼
/api/automations/nxt/proxy   ← env-gescheiden secret-auth + read-only-prod gate
   │
   ├── getValidToken(env)     ← token-store.ts: cache in `settings` tabel, refresh <5min
   │        │ (cache-miss)
   │        ▼
   │   acquireTokenViaBrowserless(env)  ← Browserless headless login op n-xt.org,
   │                                       vangt de Bearer-header van /api/* af
   ▼
NXT  https://acc.sb.n-xt.org/api/*   (acceptance)
     https://sb.n-xt.org/api/*       (production)
```

### Waarom de Bearer-header en niet local storage / /oauth/token

In de browser staat het token zichtbaar als `jhi-authenticationToken` in local
storage. Maar:
- `/oauth/token` levert een **JWE** access_token dat de NXT-API zélf afwijst.
- De werkende **RS256 JWT** is wat het Angular-front feitelijk in de
  `Authorization: Bearer`-header naar `/api/*` stuurt.

`acquireTokenViaBrowserless()` logt daarom headless in en **luistert op de
uitgaande `/api/*` request-header** i.p.v. local storage te lezen. Het token is
een Auth0-token (`sub=auth0|...`) en leeft kort (uren) — vandaar de proactieve
refresh met 5-min marge in `token-store.ts`.

## De generieke proxy

`POST /api/automations/nxt/proxy`

```jsonc
{
  "env": "acceptance",          // of "production"
  "method": "GET",              // GET|POST|PUT|PATCH|DELETE
  "path": "/api/customers",     // moet met /api/ beginnen
  "body": { "searchTerm": "x" },// optioneel, voor niet-GET
  "allowWrite": false           // verplicht true op prod voor elke niet-GET
}
```

Antwoord relayt NXT 1-op-1: `{ "ok": bool, "status": <nxt status>, "data": <nxt body> }`.

Header: `x-webhook-secret: <secret van de juiste env>`.

## Security model (teambesluit 2026-06-04)

| Knop | Keuze |
|---|---|
| **Secrets** | Env-gescheiden. acc → `AUTOMATION_WEBHOOK_SECRET`, prod → `NXT_PROD_WEBHOOK_SECRET`. Een acc-only houder kan prod **niet** bereiken. |
| **Prod writes** | Read-only by default. Elke niet-GET op prod vereist `allowWrite: true`. |
| **Path-allowlist** | Geen (bewust open) — elk `/api/*` path mag. Veiligheid leunt op de secret-scheiding + de read-only-prod gate. |

⚠️ **De POST-is-ook-een-read valkuil.** NXT doet veel *reads* via POST
(`/api/customers`, `/api/items/search`, ...). De proxy kan een read-POST niet
onderscheiden van een write-POST, dus op productie hebben **ook lookups**
`allowWrite: true` nodig. "Read-only prod" betekent hier dus: *standaard niets
muteren tenzij de caller bewust de vlag zet* — geen harde garantie dat een
`allowWrite:true`-POST geen mutatie is. Wees expliciet bij prod.

## Drie manieren om aan te haken

1. **In-process** (binnen de agent-workforce Vercel-app, bv. een Inngest Stage-4
   handler): `import { nxtRequest, getValidToken } from "@/lib/automations/nxt-zapier/nxt-client"`.
2. **MCP-server** (`tools/nxt-mcp/`): `claude mcp add nxt ...` → tools
   `nxt_request`, `nxt_search_customers`, `nxt_search_items`. Beste UX in Claude
   Code, secret nooit in prompts.
3. **Raw HTTP-skill** (`tools/nxt-mcp/skills/nxt-rest/SKILL.md`): curl/fetch naar
   de proxy met het secret uit env. Geen install nodig.

## Voor Handler Agents (Stage 4)

Een Stage-4 Handler die NXT moet lezen/schrijven gebruikt **niet** zelf
Browserless of credentials. Hij roept de in-process `nxtRequest()` aan (zelfde
Vercel-app) of de gehoste proxy. Per nieuwe NXT-actie óf een dunne wrapper in
`nxt-client.ts`, óf direct via de generieke proxy. Het token-lifecyclebeheer
(harvest, cache, refresh) is volledig afgehandeld — een handler hoeft daar niets
van te weten.

## Verificatie / smoke

`web/lib/automations/nxt-zapier/spike-smoke.ts` (gitignored) test de hele keten
read-only op beide environments:
```bash
cd web && node_modules/.bin/tsx lib/automations/nxt-zapier/spike-smoke.ts
```

## Env vars

| Var | Waar | Voor |
|---|---|---|
| `BROWSERLESS_API_TOKEN` | Vercel + .env.local | headless login |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | idem | credential-load + token-cache |
| `CREDENTIAL_ENCRYPTION_KEY` | idem | credentials + token-cache decrypt |
| `AUTOMATION_WEBHOOK_SECRET` | idem | acc proxy-auth |
| `NXT_PROD_WEBHOOK_SECRET` | idem (toegevoegd 2026-06-04) | prod proxy-auth |

Credentials in Supabase `credentials` tabel: `NXT Acceptance Login` (acceptance),
`NXT Production Login` (production) — beide live geverifieerd 2026-06-04.
