# MR Automations Toolkit

Dit project is het centrale platform voor AI-driven automations bij Moyne Roberts. Het bevat de agent-workforce Next.js applicatie, alle automation code, en de MR Automations Toolkit — de verzamelde kennis en gereedschappen waarmee het team automations bouwt.

## Stack — Niet-onderhandelbaar

Deze keuzes staan vast. Wijk hier NOOIT van af, ook al suggereer je als Claude een alternatief.

**ALTIJD gebruiken:**
- **Vercel** voor hosting (Next.js app, serverless functions, cron)
- **Supabase** voor database, auth, storage, realtime, edge functions
- **Supabase MCP** voor database operaties (tabellen aanmaken, queries, migrations)
- **Zapier** als eerste keuze voor automations (8000+ connectors, NXT SQL via whitelisted IP)
- **Browserless.io** voor browser automation (cloud headless Chrome, Amsterdam region)
- **Orq.ai** voor AI agents (via `/orq-agent` skill, MCP beschikbaar)
- **Inngest** voor event-driven pipelines (durable functions, retries, HITL gates)
- **Playwright** (via `playwright-core`) voor browser scripts op Browserless.io

**NOOIT gebruiken (ook niet als Claude het voorstelt):**
- Netlify, Railway, Render, Fly.io, AWS, Google Cloud — wij gebruiken **Vercel**
- Firebase, PlanetScale, Neon, MongoDB Atlas — wij gebruiken **Supabase**
- Puppeteer — wij gebruiken **Playwright** (via playwright-core)
- Eigen auth systeem — wij gebruiken **Supabase Auth**
- Handmatig tabellen aanmaken in SQL — gebruik **Supabase MCP** `apply_migration`
- API keys opslaan voor services die Zapier al beheert — **Zapier beheert auth**

**Bij twijfel of een project apart moet:** Eenvoudige automations en API routes gaan in DIT project. Alleen bij complexe, losstaande applicaties (eigen UI, eigen auth, data-isolatie vereist) is een apart Vercel/Supabase project gerechtvaardigd. Bespreek dit altijd met de gebruiker.

## Zapier-First Beslisboom

**Vraag ALTIJD eerst: "Kan Zapier dit?"** Veel automations zijn simpele trigger → actie → notificatie flows die Zapier in 10 minuten afhandelt zonder code.

```
Kan Zapier de HELE flow afhandelen?
  JA → Bouw het in Zapier (geen code nodig)
     ├─ Schedule/trigger → actie → notificatie = Zapier Zap
     ├─ NXT data nodig? → Zapier SQL Query (whitelisted IP)
     ├─ AI agent aanroepen? → Zapier → Cloudflare Worker → Orq.ai
     └─ Bulk operaties? → Zapier kan dit ook

  GEDEELTELIJK (Zapier triggert, maar browser/custom code nodig voor uitvoering)
  → Zapier triggert Vercel API route of Inngest function
     ├─ Browser interactie nodig? → Zapier → Vercel → Browserless.io
     └─ Multi-step pipeline? → Zapier → Inngest function

  NEE (Zapier kan dit niet)
     ├─ Interactieve interface nodig? → Next.js app (mogelijk apart project)
     ├─ Agent-driven logica? → Orq.ai agent met tools (Browserless als MCP tool)
     ├─ Automated browser testing? → Playwright test suite
     └─ Custom UI vereist? → Next.js app (mogelijk apart project)
```

**Zapier valt af bij:** interactieve interfaces, agent-driven logica (AI beslist de flow), automated browser testing, custom UI vereisten.

**Zapier kan WEL:** multi-step AI pipelines (sequentieel via Cloudflare), bulk operaties, alles met trigger → actie patroon, SQL queries naar NXT.

## Systemen

Moyne Roberts core systemen staan in de `systems` tabel in Supabase. Raadpleeg deze via Supabase MCP:

```sql
SELECT name, integration_method, url, notes FROM systems ORDER BY name;
```

**Belangrijke systemen:**
- **NXT** — ERP systeem. Geen API. Browser automation of SQL via Zapier (whitelisted IP).
- **iController** — Facturatiesysteem. Geen API. Browser automation.
- **Cura-portaal** — Zorgplatform. Heeft een redelijk complete API.
- **Linqur** — E-learning platform.
- **CRM** — Klantrelatiebeheer. Geen API. Browser automation.
- **Intelly** — Business intelligence.

**Wanneer een nieuw systeem ter sprake komt:** vraag de gebruiker of dit een core systeem is dat in de systems registry moet worden opgenomen.

## Agent Swarm Design (orq-agent integratie)

Voor het ontwerpen van AI agent swarms, gebruik de `/orq-agent` skill. De MR Automations Toolkit verrijkt die met MR-specifieke context:

1. **Toolkit bepaalt:** Welke systemen zijn betrokken? API beschikbaar? Zapier connector? Browser automation nodig?
2. **Toolkit verrijkt:** De use case wordt aangevuld met kennis over jullie systemen, Zapier setup, Browserless patronen
3. **orq-agent ontwerpt:** De swarm wordt ontworpen met kennis van de juiste tools en integraties

Voorbeeld: "Ik wil een agent die facturen verwerkt" →
- Toolkit weet: iController heeft geen API, Browserless automation beschikbaar als MCP tool
- Toolkit weet: NXT data alleen via Zapier SQL (whitelisted IP)
- orq-agent ontwerpt: agent swarm met browser-automation tool en Zapier data-integratie

## Workflow — Get Shit Done (GSD)

**Install GSD:** `npx get-shit-done-cc@latest`

Voor non-triviale automations:
```
/gsd:new-project    — Nieuw automation project met research + roadmap
/gsd:plan-phase N   — Gedetailleerd plan voor fase N
/gsd:execute-phase N — Fase uitvoeren met atomic commits
/gsd:quick           — Snelle taak met GSD garanties
/gsd:debug           — Systematisch debuggen
```

### Plan First
Enter plan mode voor elke niet-triviale taak (3+ stappen of architectuurbeslissingen).

### Verify Before Done
Nooit een taak als compleet markeren zonder te bewijzen dat het werkt.

### Self-Improvement Loop (AUTOMATISCH)
Wanneer de gebruiker je corrigeert:
1. Erken de correctie
2. Schrijf een learning naar de `learnings` tabel in Supabase (via directe REST call)
3. Als de correctie universeel is, stel een CLAUDE.md wijziging voor
4. Commit en push zodat het team het krijgt

### Simplicity First
- Minimale code, minimale impact
- Geen tijdelijke fixes — zoek de root cause
- Als het hacky voelt: implementeer de elegante oplossing

## Kritieke Patronen

### Browserless.io

```typescript
import { chromium } from "playwright-core"; // NIET "playwright"
const wsEndpoint = `wss://production-ams.browserless.io?token=${token}&timeout=60000`;
const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });
```

- **Session reuse:** `context.storageState()` opslaan in Supabase, laden bij volgende run
- **Shadow DOM:** `state: 'attached'`, waarden zetten met `.evaluate()` NIET `.fill()`
- **SPA navigatie:** `waitUntil: 'domcontentloaded'` — NOOIT `'networkidle'`
- **Screenshots:** Altijd bij fout vastleggen VOOR `browser.close()`
- **2FA:** Twee Browserless calls met challenge state in Supabase ertussen

**Volledige referentie:** `docs/browserless-patterns.md`

### Orq.ai

1. **ALTIJD `response_format` met `json_schema` instellen** — prompt-only JSON faalt 15-20%
2. **ALTIJD agent updates verifiëren** — MCP `update_agent` kan stil falen. Lees terug met `get_agent`.
3. **Experiments via REST API, NIET MCP** — MCP heeft dataset-mapping problemen
4. **Alle LLM output valideren met Zod** — nooit LLM math vertrouwen
5. **3-4 fallback models configureren** — `anthropic/claude-sonnet-4-6` primary
6. **XML-tagged prompts** — `<role>`, `<task>`, `<constraints>`, `<output_format>`
7. **45 seconden client timeout** — Orq.ai retry is 31s intern
8. **Knowledge bases apart vullen** — aanmaken ≠ vullen
9. **`user_id` in metadata** — voor cost tracking

**Volledige referentie:** `docs/orqai-patterns.md`

### Supabase

- Admin client (service role) voor automation writes — geen RLS nodig server-side
- Supabase MCP voor schema exploratie en queries
- Key-value store: `settings` tabel met JSONB
- JSONB double-encoding: `while (typeof state === 'string') state = JSON.parse(state)`

**Volledige referentie:** `docs/supabase-patterns.md`

### Inngest

- Alle side effects in `step.run()` — code erbuiten herhaalt bij replay
- Streaming incompatibel met `step.run()` — stream erbuiten, check DB voor idempotency
- Grote outputs: opslaan in Supabase, referentie returnen vanuit `step.run()`
- `waitForEvent` voor HITL gates
- **Vercel timeout:** Free=10s, Pro=60s. Gebruik Inngest voor lang-lopende taken.

**Volledige referentie:** `docs/inngest-patterns.md`

### Zapier

- **Zapier MCP:** kan acties uitvoeren (Slack bericht sturen, spreadsheet updaten) — kan GEEN Zaps aanmaken
- **NXT SQL:** alleen via Zapier (whitelisted IP) — nooit direct verbinden
- **Zapier SDK:** `@zapier/zapier-sdk` voor programmatische automations
- **Orq.ai long-running calls:** via Cloudflare Workers (Zapier timeout te kort)

**Volledige referentie:** `docs/zapier-patterns.md`

## Commands

- `/mr-automations:automate` — Begeleid een nieuwe automation (Zapier-first)
- `/mr-automations:learn` — Leg een debugging-inzicht vast voor het team
- `/mr-automations:setup` — Controleer of alles goed is ingesteld

## API Documentatie

- **Zapier SDK:** https://docs.zapier.com/sdk
- **Zapier Apps:** https://zapier.com/apps
- **Orq.ai:** https://docs.orq.ai
- **Supabase:** https://supabase.com/docs
- **Browserless.io:** https://docs.browserless.io
- **Inngest:** https://www.inngest.com/docs
- **Playwright:** https://playwright.dev/docs
- **Vercel:** https://vercel.com/docs

## Project Structuur

```
web/                          # Next.js app (Vercel)
  app/api/automations/        # Automation API routes (Zapier hybrid endpoints)
  lib/automations/            # Automation logica (Browserless scripts, etc.)
docs/                         # Referentie documenten (patronen, gotchas)
  browserless-patterns.md
  orqai-patterns.md
  supabase-patterns.md
  inngest-patterns.md
  zapier-patterns.md
.claude/commands/mr-automations/  # Toolkit slash commands
```
