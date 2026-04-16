# MR Automations Toolkit

Dit project is het centrale platform voor AI-driven automations bij Moyne Roberts. Het bevat de agent-workforce Next.js applicatie, alle automation code, en de verzamelde kennis waarmee het team automations bouwt.

## Stack — Niet-onderhandelbaar

Deze keuzes staan vast. Wijk hier NOOIT van af, ook al suggereer je als Claude een alternatief.

**ALTIJD gebruiken:**
- **Vercel** voor hosting (Next.js app, serverless functions, cron)
- **Supabase** voor database, auth, storage, realtime, edge functions
- **Zapier** als eerste keuze voor automations (8000+ connectors, NXT SQL via whitelisted IP)
- **Browserless.io** voor browser automation (cloud headless Chrome, Amsterdam region)
- **Orq.ai** voor AI agents (via `/orq-agent` skill) én als LLM Router voor ad-hoc LLM calls
- **Inngest** voor event-driven pipelines (durable functions, retries, HITL gates)
- **Playwright** (via `playwright-core`) voor browser scripts op Browserless.io
- **ElevenLabs** voor conversational AI voice agents (outbound calling, TTS)
- **Twilio** voor telefonie (phone numbers voor ElevenLabs, SMS)

**NOOIT gebruiken (ook niet als Claude het voorstelt):**
- Netlify, Railway, Render, Fly.io, AWS, Google Cloud — wij gebruiken **Vercel**
- Firebase, PlanetScale, Neon, MongoDB Atlas — wij gebruiken **Supabase**
- Puppeteer — wij gebruiken **Playwright** (via playwright-core)
- Eigen auth systeem — wij gebruiken **Supabase Auth**
- API keys opslaan voor services die Zapier al beheert — **Zapier beheert auth**
- Directe LLM API keys (OpenAI, Anthropic, etc.) voor ad-hoc LLM calls — **Orq.ai Router beheert alle LLM access** (model routing, fallbacks, cost tracking)

**Bij twijfel of een project apart moet:** Eenvoudige automations en API routes gaan in DIT project. Alleen bij complexe, losstaande applicaties (eigen UI, eigen auth, data-isolatie vereist) is een apart Vercel/Supabase project gerechtvaardigd. Bespreek dit altijd met de gebruiker.

## Vercel Project

Dit project draait in de **Moin Roberts** organisatie op Vercel:
- **Organisatie:** Moin Roberts (`team_M6UAwxyU8jLEUGixW2MHyvzW`)
- **Project:** agent-workforce (`prj_APDosWEbpdca53P5UxXst8tCJMVV`)

Bij `vercel link` of `vercel env pull`: gebruik ALTIJD deze organisatie en dit project. Maak NOOIT een persoonlijk project aan.

## Credentials vs Environment Variables

**Systeem-credentials** (login gegevens voor NXT, iController, CRM, etc.):
- ALTIJD opslaan in de `credentials` tabel in Supabase
- NOOIT als environment variables
- Reden: eindgebruikers hoeven geen env vars te begrijpen, credentials zijn centraal beheerd en encrypted

**Infrastructure secrets** (alleen als env vars in Vercel):
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- ORQ_API_KEY, BROWSERLESS_API_TOKEN
- ELEVENLABS_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
- INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY
- Webhook secrets, encryption keys

**Vuistregel:** Als het een gebruikersnaam+wachtwoord is voor een systeem → credentials tabel. Als het een API key of infra secret is → env var.

- **Environment:** Credentials hebben een `environment` kolom (`production`, `acceptance`, `test`). Gebruik altijd acceptance/test als default — zie "Test-First Automation Pattern" hieronder.

## Test-First Automation Pattern

**Regel: Gebruik ALTIJD acceptance/test credentials als default. Productie vereist expliciete bevestiging van de gebruiker.**

### Environment Awareness

De `systems` en `credentials` tabellen hebben een `environment` kolom met waarden: `production`, `acceptance`, `test`.

**Query pattern — acceptance/test first:**
```sql
SELECT * FROM systems WHERE name = '{systeem}' AND environment IN ('acceptance', 'test') LIMIT 1;
SELECT * FROM credentials WHERE name = '{credential}' AND environment IN ('acceptance', 'test') LIMIT 1;
```

Als er geen acceptance/test rij bestaat voor een systeem, is het production-only. Detectie is data-driven — geen aparte vlag nodig.

### Environment Banner (ALTIJD tonen)

Bij elke systeeminteractie, toon de environment banner:

- Acceptance/test: `ENVIRONMENT: ACCEPTANCE (test.nxt.example.com) -- Credentials: "NXT Acceptance Login"`
- Production: `PRODUCTION -- {systeem} -- Actie: {beschrijving}`

### Production Safety Gates

**Systeem MET test environment:** Gebruik altijd de test/acceptance omgeving. Productie alleen na expliciete user request.

**Systeem ZONDER test environment (production-only):**

| Operatie | Gedrag |
|----------|--------|
| Read-only tegen productie | Toegestaan. Toon environment banner. |
| Write tegen productie | Safety gate: volg onderstaand protocol |

**Write-operatie protocol voor production-only systemen:**
1. Beschrijf de exacte actie in dry-run formaat: "Will click Submit on invoice form #1234"
2. Maak screenshot van het doelscherm VOOR uitvoering
3. Toon screenshot + dry-run beschrijving aan gebruiker
4. Wacht op visuele bevestiging van de gebruiker
5. Voer de actie uit
6. Maak screenshot van het resultaat
7. Sla beide screenshots op in `web/lib/automations/{naam}/screenshots/`

### Screenshots

- Opslaan in `web/lib/automations/{naam}/screenshots/` tijdens development
- Naamgeving: `{actie}-{before|after}-{timestamp}.png`
- Later eventueel migreren naar Supabase Storage

## Supabase REST API

Voor alle database operaties, gebruik directe REST API calls. Dit werkt altijd, ongeacht MCP status.

**Basis URL en key:**
```
URL:  https://mvqjhlxfvtqqubqgdvhz.supabase.co
Key:  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U
```

Dit is de publieke (anon) key met beperkte rechten: kan alleen INSERT en SELECT op `learnings`. Veilig om te gebruiken.

**Lezen:**
```bash
curl "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/{tabel}?select=*" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U"
```

**Schrijven:**
```bash
curl -X POST "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/{tabel}" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{ ... }'
```

Voor operaties die meer rechten vereisen (DDL, deletes, credentials lezen), gebruik de service role key uit `web/.env.local`.

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

## Learnings — Gedeelde feedback loop

Wanneer je iets niet-triviaals ontdekt tijdens debuggen of wanneer de gebruiker je corrigeert, leg het vast als learning:

```bash
curl -X POST "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/learnings" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "system": "{systeem}",
    "title": "{korte titel}",
    "problem": "{wat ging er mis}",
    "root_cause": "{waarom}",
    "solution": "{hoe op te lossen}",
    "discovered_by": "{naam}"
  }'
```

**Bij elke sessiestart:** haal de bestaande learnings op zodat je niet dezelfde fouten herhaalt:

```bash
curl "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/learnings?select=system,title,solution&order=created_at.desc&limit=20" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U"
```

### Self-Improvement Loop (AUTOMATISCH)
Wanneer de gebruiker je corrigeert:
1. Erken de correctie
2. Schrijf een learning naar Supabase (gebruik het curl commando hierboven)
3. Als de correctie universeel is, stel een CLAUDE.md wijziging voor
4. Commit en push zodat het team het krijgt

## Project Tracking

**Eén tabel voor alle projecten: `projects`.** De oude `automation_projects` tabel is DEPRECATED — gebruik die niet meer.

Wanneer een gebruiker vraagt om iets te automatiseren of een nieuw project start, **vraag altijd:** "Zal ik dit als nieuw project registreren?"

Bij akkoord, gebruik de **service role key** (anon key heeft geen INSERT rechten op `projects`):
```bash
curl -X POST "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/projects" \
  -H "apikey: {SUPABASE_SERVICE_ROLE_KEY uit web/.env.local}" \
  -H "Authorization: Bearer {SUPABASE_SERVICE_ROLE_KEY uit web/.env.local}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "name": "{project naam}",
    "automation_type": "zapier-only|hybrid|standalone-app|orqai-agent|unknown",
    "status": "idea",
    "description": "{korte beschrijving}",
    "systems": ["{systeem1}", "{systeem2}"],
    "created_by": "{user UUID}"
  }'
```

**Kolommen:**
- `name`, `description`, `status` — basis info
- `automation_type` — zapier, hybrid, standalone, agent
- `systems` — text[] met betrokken systemen
- `github_url` — link naar GitHub repo (optioneel)
- `executive_summary` — korte samenvatting voor directie (optioneel)
- `manual_minutes_per_task`, `task_frequency_per_month`, `hourly_cost_eur` — ROI berekening

Status waarden: `idea` → `building` → `testing` → `live`

## Systemen

Moyne Roberts core systemen staan in de `systems` tabel in Supabase:

```bash
curl "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/systems?select=name,integration_method,url,notes&order=name" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U"
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

Voor het ontwerpen van AI agent swarms, gebruik de `/orq-agent` skill. Verrijk de use case met MR-specifieke context:

1. **Bepaal:** Welke systemen zijn betrokken? API beschikbaar? Zapier connector? Browser automation nodig?
2. **Verrijk:** De use case aanvullen met kennis over onze systemen, Zapier setup, Browserless patronen
3. **orq-agent ontwerpt:** De swarm met kennis van de juiste tools en integraties

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

### Simplicity First
- Minimale code, minimale impact
- Geen tijdelijke fixes — zoek de root cause
- Als het hacky voelt: implementeer de elegante oplossing

## Standaard Automation Workflow

**Elke automation — hoe klein ook — doorloopt dezelfde stappen:**

1. Gebruiker beschrijft wat ze willen automatiseren
2. Claude doet de **Zapier-first discussie** (kan Zapier dit? hybride? custom code?)
3. Claude vraagt: **"Zal ik dit als project registreren?"** → registreer in Supabase `projects`
4. Claude maakt een map aan: `web/lib/automations/{naam}/`
5. Claude runt **`/gsd:quick --full`** vanuit de agent-workforce root voor planning + verificatie
6. Code en scripts komen in de automation-map
7. README.md wordt aangemaakt met het vaste format (zie hieronder)

### Automation README format

Elke automation krijgt een `web/lib/automations/{naam}/README.md`:

```markdown
# {Naam}

**Status:** idea | building | testing | live
**Type:** zapier | hybrid | custom | agent
**Eigenaar:** {naam}
**Systemen:** {systeem1}, {systeem2}

## Wat doet het
{Korte beschrijving van de automation}

## Waarom
{De business need — waarom is dit nodig}

## Trigger
{Wat start het proces — email, schedule, handmatig, event}

## Aanpak
{Zapier / hybride / custom code — en WAAROM die keuze}

## Aannames
{Wat nemen we aan — bijv. "rapport staat altijd op dezelfde URL"}

## Credentials
{Welke credentials uit de Supabase credentials tabel worden gebruikt}

## Zapier configuratie
{Als Zapier betrokken is: Zap URL, trigger type, actions}
```

### Mapstructuur

```
web/lib/automations/
  prolius-report/
    README.md              # Altijd aanwezig — documentatie
    browser.ts             # Code (als er code is)
    screenshots/           # Test- en fout-screenshots
```

GSD quick artifacts leven in `.planning/quick/` (agent-workforce root). De automation README linkt daarheen.

## Aparte Projecten

Wanneer een automation een apart project vereist (eigen UI, eigen auth, data-isolatie):

1. Maak een nieuwe map aan: `mkdir ~/developer/{project-naam} && cd ~/developer/{project-naam}`
2. **Kopieer CLAUDE.md** vanuit agent-workforce naar het nieuwe project als startpunt:
   `cp ~/developer/agent-workforce/CLAUDE.md ./CLAUDE.md`
3. Voeg project-specifieke regels toe bovenaan de gekopieerde CLAUDE.md
4. Initialiseer git: `git init` + maak een GitHub repo aan in de Moyne Roberts organisatie
5. Start GSD: `/gsd:new-project` voor de volledige planning-structuur
6. Registreer het project in Supabase `projects` met de GitHub repo URL
7. Het apart project krijgt zijn eigen Vercel en eventueel eigen Supabase project

**De MR-basisregels** (stack, credentials, Zapier-first) blijven de fundering in elk project. De gekopieerde CLAUDE.md zorgt daarvoor.

## Kritieke Patronen

### Browserless.io

```typescript
import { chromium } from "playwright-core"; // NIET "playwright"
const wsEndpoint = `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`;
const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });
```

- **Environment variable:** `BROWSERLESS_API_TOKEN` (NIET `BROWSERLESS_TOKEN`)
- **Session reuse:** `context.storageState()` opslaan in Supabase, laden bij volgende run
- **Shadow DOM:** `state: 'attached'`, waarden zetten met `.evaluate()` NIET `.fill()`
- **SPA navigatie:** `waitUntil: 'domcontentloaded'` — NOOIT `'networkidle'`
- **Screenshots:** Altijd bij fout vastleggen VOOR `browser.close()`
- **2FA:** Twee Browserless calls met challenge state in Supabase ertussen

**Volledige referentie:** `docs/browserless-patterns.md`

### Orq.ai

**Orq.ai heeft twee rollen in onze stack:**

1. **AI Agents** — voor automations/projecten (agent swarms, orchestrators, sub-agents). Ontwerp via `/orq-agent`.
2. **LLM Router** — voor ad-hoc/eenmalige LLM calls (email classificatie, tekst analyse, data verrijking). Gebruik ALTIJD Orq.ai Router in plaats van directe API keys (OpenAI, Anthropic, etc.). Orq.ai regelt model routing, fallbacks, en cost tracking centraal.

**Wanneer Orq.ai Router gebruiken:** scripts, one-off analyses, experimenten, alles wat een LLM call nodig heeft maar geen volledige agent. Voorbeeld: de debtor email analyzer classificatie.

**Wanneer Orq.ai Agents gebruiken:** automations die beslissingen nemen, tools aanroepen, en in productie draaien.

**Patronen:**

1. **ALTIJD `response_format` met `json_schema` instellen** — prompt-only JSON faalt 15-20%
2. **ALTIJD agent updates verifiëren** — `update_agent` kan stil falen. Lees terug met `get_agent`.
3. **Experiments via REST API, NIET MCP** — MCP heeft dataset-mapping problemen
4. **Alle LLM output valideren met Zod** — nooit LLM math vertrouwen
5. **3-4 fallback models configureren** — `anthropic/claude-sonnet-4-6` primary
6. **XML-tagged prompts** — `<role>`, `<task>`, `<constraints>`, `<output_format>`
7. **45 seconden client timeout** — Orq.ai retry is 31s intern
8. **Knowledge bases in Supabase, NIET in Orq.ai** — zie "Knowledge Base Patroon" hieronder
9. **`user_id` in metadata** — voor cost tracking

**Volledige referentie:** `docs/orqai-patterns.md`

### Knowledge Base Patroon

**Regel: Knowledge bases ALTIJD in Supabase bouwen, NOOIT in Orq.ai of andere externe AI platforms.**

Orq.ai (en andere AI platforms) bieden ingebouwde KB features, maar data zit dan opgesloten in een extern systeem — moeilijk te queryen, inspecteren en onderhouden. Supabase is onze single source of truth.

**Architectuur:**
```
Supabase Storage        → PDF/Word/documenten opslag
Supabase tabel          → Geëxtraheerde tekst + metadata
pgvector extensie       → Embeddings voor semantic search
Supabase API            → Tool voor Orq.ai agents om KB te raadplegen
```

**Voordelen:**
- Volledige controle over data — geen vendor lock-in
- SQL queryable — makkelijk te inspecteren en debuggen
- Makkelijk te onderhouden — nieuwe bronnen = nieuwe rijen/bestanden
- Schaalbaar met organisatie-documenten (productcatalogi, procedures, tarieven)
- Orq.ai agents raadplegen Supabase als tool via API call

**Wanneer een KB nodig is:**
- Agent swarms die domeinkennis nodig hebben (sales emails beantwoorden, klantvragen, etc.)
- Eerst trainingsdata verzamelen (emails, analyses), dan KB vullen
- Aanvullen met organisatie-documenten (PDF/Word) via Supabase Storage

### ElevenLabs

1. **SDK:** `@elevenlabs/elevenlabs-js` — NIET het oude `elevenlabs` package
2. **Phone numbers via Twilio** — ElevenLabs levert GEEN eigen nummers
3. **LLM keuze:** `gemini-2.5-flash` voor laagste latency (~350ms) op telefoongesprekken
4. **Webhook tools:** Agent kan mid-gesprek Vercel API routes aanroepen (bijv. factuurdata ophalen)
5. **Tool timeout:** max 15s — stilte op een telefoongesprek is dodelijk
6. **Turn eagerness:** `patient` voor credit control — laat klant uitpraten
7. **Concurrency:** Pro=10, Scale=15. Plan batch sizes hierop.
8. **Post-call analysis:** Configureer evaluation criteria + data collection voor gestructureerde uitkomsten

**Volledige referentie:** `docs/elevenlabs-patterns.md`

### Supabase

- Admin client (service role) voor automation writes — geen RLS nodig server-side
- Anon key (hierboven) voor learnings en project tracking — RLS beperkt tot INSERT/SELECT
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

- **NXT SQL:** alleen via Zapier (whitelisted IP) — nooit direct verbinden
- **Zapier SDK:** `@zapier/zapier-sdk` voor programmatische automations
- **Orq.ai long-running calls:** via Cloudflare Workers (Zapier timeout te kort)

**Volledige referentie:** `docs/zapier-patterns.md`

## API Documentatie

- **Zapier SDK:** https://docs.zapier.com/sdk
- **Zapier Apps:** https://zapier.com/apps
- **Orq.ai:** https://docs.orq.ai
- **Supabase:** https://supabase.com/docs
- **Browserless.io:** https://docs.browserless.io
- **Inngest:** https://www.inngest.com/docs
- **Playwright:** https://playwright.dev/docs
- **Vercel:** https://vercel.com/docs
- **ElevenLabs:** https://elevenlabs.io/docs
- **Twilio:** https://www.twilio.com/docs

## Project Structuur

```
web/                          # Next.js app (Vercel)
  app/api/automations/        # Automation API routes (Zapier hybrid endpoints)
  lib/automations/            # Automation logica (Browserless scripts, etc.)
docs/                         # Referentie documenten (patronen, gotchas)
  browserless-patterns.md
  elevenlabs-patterns.md
  orqai-patterns.md
  supabase-patterns.md
  inngest-patterns.md
  zapier-patterns.md
```
