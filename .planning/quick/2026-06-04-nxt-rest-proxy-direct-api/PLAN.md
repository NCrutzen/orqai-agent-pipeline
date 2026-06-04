---
slug: nxt-rest-proxy-direct-api
status: complete
date: 2026-06-04
retroactive: true
branch: feat/nxt-rest-proxy-mcp
pr: 63
---

# NXT direct REST access — token-harvest proxy + MCP server

Geef skills en Stage 4 Handler Agents (ook buiten deze repo) rechtstreekse
toegang tot de NXT REST-API zonder handmatig een token uit local storage te
plukken. Aanleiding: collega bouwt Stage 4 Handler-skills lokaal en moet op
acceptatie én productie tegen NXT kunnen praten.

> **Retroactief vastgelegd.** Dit werk is ad-hoc uitgevoerd buiten de
> GSD-workflow (geen discuss/plan/execute), op branch `feat/nxt-rest-proxy-mcp`
> i.p.v. een `/gsd-new-workspace`. Conform de CLAUDE.md workspace-gate wordt die
> override hier expliciet geflagd. Dit record + `SUMMARY.md` brengen het alsnog
> in lijn met het GSD-principe (plan + verifieerbare uitkomst, getrackt in STATE).

## Achtergrond / ontdekking

- NXT is een **JHipster + Auth0 SPA** met een volwaardige REST-backend op
  `/api/*`. CLAUDE.md zei historisch "Geen API" — genuanceerd onjuist.
- Het werkende token is de **RS256 Bearer-header** die het Angular-front naar
  `/api/*` stuurt; NIET het JWE uit `/oauth/token` (API wijst dat af), en niet
  `jhi-authenticationToken` uit local storage handmatig.
- Een groot deel van de keten bestond al (`web/lib/automations/nxt-zapier/`:
  `acquire-token-via-browserless.ts`, `token-store.ts`, `nxt-client.ts` + 6
  hardcoded routes voor de Zapier sales-order app). Ontbrekend: een generieke
  proxy + out-of-repo toegang + documentatie + security model.

## Tasks (zoals uitgevoerd)

1. `nxtRequest(env,method,path,body)` generieke passthrough in `nxt-client.ts`
   (relayt NXT-status, throwt niet op 4xx).
2. `checkProxyAuth(req,env)` in `auth.ts` — env-gescheiden secrets.
3. Route `web/app/api/automations/nxt/proxy/route.ts` — generieke open proxy +
   read-only-prod gate.
4. Nieuwe Vercel secret `NXT_PROD_WEBHOOK_SECRET` (prod/preview/dev).
5. `tools/nxt-mcp/` — MCP-server (`server.mjs`) + portable raw-HTTP skill
   (`skills/nxt-rest/SKILL.md`) voor gebruik buiten de repo.
6. Docs: `docs/nxt-rest-access.md` (canoniek), Stage-4 "Two NXT access paths"
   tabel, CLAUDE.md genuanceerd + NXT-REST patroon, README ingevuld.
7. Learning + memory vastgelegd.
8. NXT-credentials (`acceptance` + `production`) op `active` gezet (geverifieerd).

## Security besluit (operator, 2026-06-04)

- **Env-gescheiden secrets**: acc `AUTOMATION_WEBHOOK_SECRET`, prod
  `NXT_PROD_WEBHOOK_SECRET`. Acc-only houder kan prod niet bereiken.
- **Read-only prod**: niet-GET vereist `allowWrite:true`. ⚠️ NXT doet reads óók
  via POST → prod-lookups hebben dat ook nodig (proxy kan read-POST niet van
  write-POST onderscheiden).
- **Geen path-allowlist** (bewust open) — leunt op secret-scheiding + prod-gate.

## Verificatie

- Live read acc: `searchCustomers('graaf')` → 20 klanten (200).
- Live read-only prod: `GET /api/brands/filtered` → 7 merken (200) — bevestigt
  ook dat de prod-credential werkt.
- Route-gating (handler direct aangeroepen): 6/6 — geen-secret 401, acc-secret
  op prod 401, prod-write-zonder-flag 403, bad-path 400, acc-read 200,
  prod-read 200.
- `tsc --noEmit` schoon op gewijzigde files; eslint 0 errors.

## Out of scope / follow-ups

- Per-endpoint wrappers voor nieuwe NXT-acties (toevoegen per Handler-use-case),
  of de generieke proxy direct gebruiken.
- Geen geautomatiseerde tests in de suite (smokes zijn gitignored `spike-*.ts`);
  overweeg een vitest-route-test als dit kritiek pad wordt.
- Prod-write-pad (`allowWrite:true` create-order) niet live getest — bewust niet
  tegen productie gemuteerd.
