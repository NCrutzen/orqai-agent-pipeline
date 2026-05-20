# MR Automations Toolkit

Centraal platform voor AI-driven automations bij Moyne Roberts.

## ⚠️ READ-FIRST for pipeline work

**When asked anything about pipeline runtime behavior — what Stage X does, why a row didn't progress, where an Inngest event lands, why Bulk Review shows what it shows — READ the architecture docs below BEFORE answering. Do NOT infer the architecture from code shape; the runtime evolves through phases (most recent: Phase 74 LLM 2nd-pass at Stage 1, Phase 75 noise-vs-intent registry split) and the docs are the locked source of truth.**

This block exists because past sessions drifted by reasoning from `web/lib/inngest/functions/*` straight to architectural conclusions, missing the locked RFC. The RFC always wins.

## Canonical Architecture Docs

- **Agentic Pipeline (cross-swarm canonical)** → `docs/agentic-pipeline/README.md` — the v8.0 5-stage funnel architecture (Stage 0 safety → Stage 1 regex+LLM noise filter → Stage 2 entity → Stage 3 coordinator → Stage 4 handler), Stage 2→3 context-shape contract, 4-axis override model, graduated-automation hooks. Read this BEFORE designing any new agentic pipeline or extending an existing swarm.
  - **Stage 1 specifics** → `docs/agentic-pipeline/stage-1-regex.md` — two-pass noise filter (regex Pass 1, LLM `stage-1-category-classifier` Pass 2 on `unknown`); closed list = noise keys + `unknown` only.
  - **Stage 3 specifics** → `docs/agentic-pipeline/stage-3-coordinator.md` — ranked-intent classifier; uses `swarm_intents` for handler dispatch. Hard separation: a row exists in **exactly one** of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — never both.
- **Debtor Email Pipeline (swarm-specific implementation)** → `docs/debtor-email-pipeline-architecture.md` — implementation map for the debtor-email swarm specifically: Outlook ingest, classifier, swarm_noise_categories registry, per-category handlers (label-resolver, invoice-copy), Bulk Review vs Kanban surfaces. Read this before editing any file in `web/lib/automations/debtor-email/` or `web/app/api/automations/debtor*/`.

## Auto-loaded Skills
- **Sketch findings voor agent-workforce** (design decisions, CSS patterns, visual direction voor Smeba Draft Review frontend) → `Skill("sketch-findings-agent-workforce")`

## Stack — Niet-onderhandelbaar

**ALTIJD gebruiken:**
- **Vercel** — hosting (Next.js, serverless functions, cron)
- **Supabase** — database, auth, storage, realtime
- **Zapier** — eerste keuze voor automations (NXT SQL via whitelisted IP)
- **Browserless.io** — browser automation (`BROWSERLESS_API_TOKEN`, Amsterdam region)
- **Orq.ai** — AI agents (`/orq-agent` skill) + LLM Router voor ad-hoc LLM calls
- **Inngest** — event-driven pipelines (durable functions, retries, HITL)
- **Playwright** via `playwright-core` — browser scripts op Browserless.io
- **ElevenLabs** — conversational AI voice agents
- **Twilio** — telefonie (phone numbers voor ElevenLabs, SMS)

**NOOIT gebruiken:** Netlify/Railway/AWS, Firebase/Neon, Puppeteer, eigen auth, directe LLM API keys (OpenAI/Anthropic) — gebruik Orq.ai Router.

**Vercel project:** Moyne Roberts org (`team_xILPwdz1coAgNKNP0zjMteGI`) · agent-workforce (`prj_APDosWEbpdca53P5UxXst8tCJMVV`). Nooit een persoonlijk project aanmaken.

## Credentials vs Env Vars

- **Systeem-credentials** (gebruikersnaam+wachtwoord voor NXT, iController, CRM etc.) → `credentials` tabel in Supabase. NOOIT als env var.
- **Infra secrets** (API keys, tokens) → env vars in Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ORQ_API_KEY`, `BROWSERLESS_API_TOKEN`, `ELEVENLABS_API_KEY`, `TWILIO_*`, `INNGEST_*`
- Credentials hebben een `environment` kolom (`production`, `acceptance`, `test`). **Default: acceptance/test.**

## Test-First Pattern

**Gebruik ALTIJD acceptance/test credentials. Productie vereist expliciete bevestiging.**

Query pattern: `SELECT * FROM credentials WHERE name = '{x}' AND environment IN ('acceptance', 'test') LIMIT 1`

Environment banner altijd tonen:
- Test: `ENVIRONMENT: ACCEPTANCE -- Credentials: "{naam}"`
- Productie: `PRODUCTION -- {systeem} -- Actie: {beschrijving}`

**Write naar productie-only systeem:** dry-run beschrijven → screenshot VOOR → wacht op bevestiging → uitvoeren → screenshot NA. Screenshots in `web/lib/automations/{naam}/screenshots/`.

## Supabase REST API

```
URL:      https://mvqjhlxfvtqqubqgdvhz.supabase.co
ANON KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U
```

Anon key: alleen INSERT/SELECT op `learnings`. Voor DDL/deletes/credentials: service role key uit `web/.env.local`.

## Zapier-First Beslisboom

```
Kan Zapier de HELE flow?
  JA  → Bouw in Zapier (NXT SQL via whitelisted IP, AI via Cloudflare Worker → Orq.ai)
  DEELS → Zapier triggert Vercel API route of Inngest function
            Browser nodig? → Zapier → Vercel → Browserless.io
  NEE → Interactieve UI? → Next.js  |  Agent-driven? → Orq.ai  |  Browser testing? → Playwright
```

## Learnings

Bij debuggen of correctie door gebruiker → vastleggen via `/mr-automations:learn` of direct in Supabase `learnings` tabel.

**Self-improvement:** correctie → learning schrijven → CLAUDE.md wijziging voorstellen → commit + push.

## Project Tracking

Tabel: `projects` (NIET `automation_projects` — deprecated). Vraag altijd: "Zal ik dit registreren?"

Vereist service role key. Velden: `name`, `description`, `status` (idea→building→testing→live), `automation_type` (zapier-only|hybrid|standalone-app|orqai-agent), `systems` (text[]), `github_url`.

## Systemen

Core systemen in `systems` tabel. Belangrijkste:
- **NXT** — ERP. Geen API. Browser automation of SQL via Zapier.
- **iController** — Facturatie. Geen API. Browser automation.
- **Cura-portaal** — Zorgplatform. Heeft API.
- **Linqur** — E-learning.
- **CRM** — Geen API. Browser automation.
- **Intelly** — Business intelligence.

## Agent Swarms

Gebruik `/orq-agent` skill. Verrijk met MR-context: welke systemen, API beschikbaar, Zapier/Browserless patronen.

## Workflow (GSD)

```
/gsd:new-project     — Nieuw project: research + roadmap
/gsd:plan-phase N    — Plan voor fase N
/gsd:execute-phase N — Fase uitvoeren
/gsd:quick           — Snelle taak
/gsd:debug           — Systematisch debuggen
```

Plan first · Verify before done · Simplicity first.

## Standaard Automation Workflow

1. Zapier-first discussie
2. "Zal ik dit registreren?" → Supabase `projects`
3. Map aanmaken: `web/lib/automations/{naam}/`
4. `/gsd:quick --full` voor planning + verificatie
5. README.md aanmaken (status, type, eigenaar, systemen, trigger, aanpak, aannames, credentials)

## Kritieke Patronen

### Browserless.io
```typescript
import { chromium } from "playwright-core"; // NIET "playwright"
const browser = await chromium.connectOverCDP(
  `wss://production-ams.browserless.io?token=${process.env.BROWSERLESS_API_TOKEN}&timeout=60000`,
  { timeout: 30_000 }
);
```
- Shadow DOM → `.evaluate()` NIET `.fill()`
- SPA navigatie → `waitUntil: 'domcontentloaded'` NOOIT `'networkidle'`
- Screenshots altijd bij fout, VOOR `browser.close()`
- 2FA → twee Browserless calls met state in Supabase

→ `docs/browserless-patterns.md`

### Orq.ai
- ALTIJD `response_format` met `json_schema` — prompt-only JSON faalt 15-20%
- ALTIJD `anyOf` voor nullable velden in strict-mode schema's, NIET `"type": ["string", "null"]`. De array-shorthand is geldig JSON Schema 2020-12 maar wordt door OpenAI strict mode én Orq.ai's json_schema tool validator afgewezen ("Invalid JSON detected"). Pattern: `{"anyOf": [{"type": "string"}, {"type": "null"}]}`. Geldt voor agent `model.parameters.response_format.json_schema.schema`, json_schema tool resources, én `public.orq_agents.output_schema` (waaruit `client.ts` per-call response_format bouwt). Learning `3970bad9-4c97-4ccf-a2f5-46475313ed1a`.
- ALTIJD `list_models` **vóór** `create_agent`/`update_agent` om primary + iedere fallback ID tegen de catalog te valideren. PATCH accepteert onbekende IDs zonder fout en `get_agent` echoot ze terug — Studio rendert de Model-dropdown leeg en blokkeert "Add tool" (incl. JSON Schema). Learning `f980a2a1-4500-4c2e-98c5-803261ab7d78`.
- `create_agent` **dropt** `model.parameters.response_format` stilzwijgend; `update_agent` persisteert het wel. Pattern: create met bare model-id, dan direct PATCH met de volledige `model.parameters` (incl. `response_format` strict json_schema) en verifieer met `get_agent`. Learning `cba7352b-4feb-4d11-94f8-0ebd24f15cd0`.
- **JSON output enforcement workflow** (canoniek, per Studio observatie 2026-05-01): (1) maak een json_schema resource aan in Studio → Tools → Add → JSON Schema (vul `name`, `description`, `schema` met `anyOf` voor nullable, `strict: true`); (2) op de agent → Model parameters → **Response Format dropdown = "JSON Schema"** en selecteer in het rechter veld de naam van de tool. De tool wordt door Studio gerefereerd in `model.parameters.response_format`, NIET als entry in `settings.tools`. De Orq MCP exposeert geen tool CRUD; aanmaken loopt via Studio.
- ALTIJD agent updates verifiëren met `get_agent` na `update_agent` (let op: dit verifieert persistentie, **niet** catalog-validiteit van model IDs — zie hierboven)
- Experiments via REST API, NIET MCP
- Zod validatie op alle LLM output
- **Anthropic model routing in Orq.ai (2026-05):**
  - **Opus 4.6** → `aws/eu.anthropic.claude-opus-4-6-v1` (Bedrock EU; only 4.6 variant in catalog — er is GEEN `anthropic/claude-opus-4-6` of `anthropic/claude-sonnet-4-6`)
  - **Sonnet 4.5** → `anthropic/claude-sonnet-4-5-20250929` (Anthropic-direct) of `aws/eu.anthropic.claude-sonnet-4-5-20250929-v1:0` (Bedrock EU)
  - **Haiku 4.5** → `aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0` (Bedrock EU only — er is GEEN Anthropic-direct Haiku in de catalog)
  - **Let op:** eerdere CLAUDE.md guidance noemde "Primary model: `anthropic/claude-sonnet-4-6`" — dat ID bestaat **niet** in Orq's catalog. Wat in projectcontext "4.6" heet is in Orq's catalog `aws/eu.anthropic.claude-opus-4-6-v1` (Opus, Bedrock EU). Verifieer altijd via `list_models` vóór agent create/update.
  - Fallback chain bestaande agents: `openai/gpt-4o-mini` (of `openai/gpt-4o` voor zwaardere agents), `google-ai/gemini-2.5-flash` (of `google-ai/gemini-2.5-pro`), `mistral/mistral-large-2411` (EU-hosted, dated pin — NIET `mistral-large-latest`, dat ID bestaat niet in de catalog). Vermijd `mistral/mistral-large-latest`, `anthropic/claude-3-5-haiku-20241022`, `anthropic/claude-sonnet-4-5` (zonder datum) — allemaal niet in de catalog.
- XML-tagged prompts: `<role>`, `<task>`, `<constraints>`, `<output_format>`
- 45s client timeout (Orq.ai intern retry = 31s)
- Knowledge bases in Supabase, NIET in Orq.ai

→ `docs/orqai-patterns.md`

### ElevenLabs
- SDK: `@elevenlabs/elevenlabs-js` (NIET `elevenlabs`)
- Phone numbers via Twilio
- LLM: `gemini-2.5-flash` (laagste latency ~350ms)
- Tool timeout max 15s — stilte op telefoon is dodelijk

→ `docs/elevenlabs-patterns.md`

### Supabase
- Service role voor automation writes (geen RLS server-side)
- JSONB double-encoding: `while (typeof state === 'string') state = JSON.parse(state)`
- **RLS verplicht op élke nieuwe tabel in een PostgREST-exposed schema** (`public, debtor, sales, email_pipeline, email_insights, automation`). De Supabase security advisor flagt `rls_disabled_in_public` als ERROR-level en `npm run check:supabase` faalt CI bij elke ERROR-level lint. Pattern (één migration, drie SQL-statements minimum):
  1. `CREATE TABLE ...`
  2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
  3. Minstens één expliciete policy. Backend-only tabel → `CREATE POLICY <name>_service_all ON ... FOR ALL TO service_role USING (true) WITH CHECK (true);`. UI-zichtbare tabel → daarbij `FOR SELECT TO authenticated USING (...)`.
- **NOOIT** een policy met `TO anon` of `TO public` met `USING (true)` toevoegen. Anon writes zijn globaal gerevoked + default privileges blokkeren dat ook voor nieuwe tabellen (migration `20260520_harden_rls`). Als anon-toegang écht moet, justificeer in PR + comment in de migration.
- **NOOIT** een view met `SECURITY DEFINER` op `public` of een exposed schema. Gebruik altijd `CREATE VIEW ... WITH (security_invoker = true)` (of `ALTER VIEW ... SET (security_invoker = true)` voor bestaande) zodat RLS van de aanroepende rol geldt.
- Migration template: `supabase/migrations/_template.sql` — kopiëren bij elke nieuwe tabel.
- Pre-push hook draait `npm run check:supabase` automatisch (geïnstalleerd via `bash scripts/install-git-hooks.sh`, eenmalig per clone). Faalt op élke ERROR-level advisor lint. Bypass alleen met `git push --no-verify` en alleen als je weet waarom.
- **Nieuwe SECURITY DEFINER functies**: altijd `SET search_path = <schema>, pg_catalog, pg_temp` toevoegen (zonder dit flagt de advisor `function_search_path_mutable`). Anon/authenticated EXECUTE alleen toekennen als de UI de functie via RPC moet aanroepen; verder `REVOKE EXECUTE ... FROM anon, authenticated, public`. Trigger-functies hebben géén EXECUTE-grants nodig — triggers vuren onafhankelijk van EXECUTE-rechten.
- **Nieuwe extensions**: nooit in `public`. Gebruik `CREATE EXTENSION ... WITH SCHEMA extensions;`. `pg_trgm` en `vector` staan momenteel nog in `public` (zie `.planning/todos/pending/2026-05-20-move-public-extensions-out.md`).
- **Build-time codegen for registry-driven literal-union TS types** (Phase 69 D-03). Wanneer een registry-tabel kolom (e.g. `swarms.entity_brand` jsonb) source-of-truth is voor een gesloten enumeratie EN de codebase strict TS-typing wil, hardcode de literal-union NIET in code. In plaats daarvan: schrijf een `tsx`-script (`scripts/gen-entity-types.ts`) dat de registry op build-time leest en een `*.generated.ts` file emit met `as const` array + literal-union type. Run via `npm run codegen`. CI gate: `npm run codegen && git diff --exit-code` om drift te detecteren. Pattern: stable diffs vereisen alfabetische sortering van codes in het script. Idempotency: lees bestaande file, skip write als identiek. NOOIT `*.generated.ts` met de hand bewerken. Verlengt het 'registry as source of truth'-principe (Phase 68 swarms/swarm_intents) tot het type-systeem zonder onboarding-friction.

→ `docs/supabase-patterns.md`

### Inngest
- Alle side effects in `step.run()` — buiten herhaalt bij replay
- Grote outputs → Supabase, referentie returnen
- Pro timeout = 60s. Inngest voor lang-lopende taken.
- **Cron default = business-hours window**: `{ cron: "TZ=Europe/Amsterdam */N 6-19 * * 1-5" }` (06:00-19:58 Amsterdam, Mon-Fri). 24/7 alleen als overnight verkeer écht moet. `TZ=` prefix verplicht — anders draait UTC.
- **Cron tijdelijk uit?** → `{ event: "naam.run" }` (handmatig triggerbaar, re-enable = één regel). Niet de file deleten.
- **Watermark-syncs**: bump `LOOKBACK_WINDOW` zodat de eerste tick na een gap (Mon 06:00) ook weekend-data pakt.
- **NOOIT** een cron-string letterlijk in een `/** */` JSDoc zetten — `*/N` sluit het comment. Beschrijf in woorden ("every 2 minutes, hours 6-19, Mon-Fri") of gebruik `//` single-line.
- **Replay-onveilige id-generatie** (Phase 65 leer): élk niet-deterministisch waarde dat als DB-key gebruikt wordt (UUIDs, `Date.now()`, random nonces) MOET binnen `step.run()` worden gegenereerd, niet erbuiten. Buiten step.run regenereert Inngest de waarde op iedere replay → INSERT op key-A, UPDATE op key-B, `.eq()` matcht 0 rijen, UPDATE no-op zonder error. Symptoom: rij blijft op INSERT-defaults staan terwijl `agent_runs.tool_outputs` de echte data wel heeft. Pattern: `const run_id = await step.run("resolve-run-id", async () => event.data.run_id ?? crypto.randomUUID())`.
- **`inngest.send` niet destructureren**: `const send = inngest.send` verliest `this`-binding → runtime `TypeError: Cannot read properties of undefined (reading '_send')` bij eerste call. Inline aanroepen: `(inngest.send as unknown as SendFn)({...})` of expliciet `inngest.send.bind(inngest)`. Mocked tests vangen dit niet — alleen live smoke. Phase 65 leer (commit `dae6276`).

→ `docs/inngest-patterns.md` · learnings `eb434cfd-107e-4a9c-bf8e-c1a443d36802`, Phase 65 commits `dd2583a` (replay-id) + `dae6276` (this-binding)

### Zapier
- NXT SQL alleen via Zapier (whitelisted IP)
- **NXT-documenten op S3 ook via Zapier SDK** (`@zapier/zapier-sdk`) — niet direct met AWS SDK vanuit Vercel. Één credential-grens, één auth-pad. Pattern: `web/debtor-email-analyzer/src/fetch-emails.ts`.
- Orq.ai long-running calls via Cloudflare Workers (Zapier timeout te kort)
- **Zapier-tool routing via `public.zapier_tools` registry — NIET via per-Zap env vars.** Eén row per tool (`tool_id`, `backend`, `pattern`, `target_url`, `auth_method`, `auth_secret_env`, `input_schema`). Nieuwe automation = INSERT één row; geen env var, geen Vercel deploy, geen code-change voor routing. Auth-secrets blijven in env vars; registry verwijst naar de **naam** van de env var (`auth_secret_env` veld). Hergebruik bestaande secret env var waar mogelijk (e.g. `DEBTOR_FETCH_WEBHOOK_SECRET` voor alle NXT-tools). Pattern: `supabase/migrations/20260429_zapier_tools_registry.sql` + `web/lib/automations/debtor-email/nxt-zap-client.ts`. Learning: `de425a88-ac72-438d-bf8b-523e55ba63ef`.
- Catch Hook trigger toont **niet** alle headers betrouwbaar in Zapier's field picker. Voor auth-validatie: gebruik **body field** (`auth: "<secret>"`) ipv `Authorization: Bearer` header. Beide Zaps (invoice-fetch én NXT generic-lookup) volgen dit patroon.

→ `docs/zapier-patterns.md`

## Project Structuur

```
web/
  app/api/automations/   # Automation API routes
  lib/automations/       # Scripts + README per automation
docs/                    # Patroon-referenties per systeem
```
