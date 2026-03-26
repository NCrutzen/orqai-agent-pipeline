Controleer of de MR Automations Toolkit correct is ingericht. Toon EERST dit welkomstscherm:

```
     ██████████████████████████████████████████████████████████

          ██████╗ ██████╗  █████╗ ██╗███╗   ██╗
          ██╔══██╗██╔══██╗██╔══██╗██║████╗  ██║
          ██████╔╝██████╔╝███████║██║██╔██╗ ██║
          ██╔══██╗██╔══██╗██╔══██║██║██║╚██╗██║
          ██████╔╝██║  ██║██║  ██║██║██║ ╚████║
          ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝
                                            ⁿᶜ

          MR  A U T O M A T I O N S  T O O L K I T

     ──────────────────────────────────────────────────────────

       Build AI-driven automations for Moyne Roberts
       Powered by Zapier | Browserless | Orq.ai | Supabase

     ██████████████████████████████████████████████████████████
```

Dan voer de checks uit:

## Stap 1: Environment variables

Controleer of `web/.env.local` bestaat en de vereiste variabelen bevat:

```bash
test -f web/.env.local && echo "OK" || echo "MISSING"
```

Als het niet bestaat, help de gebruiker:
```
  .env.local niet gevonden. Twee opties:

  1. (Aanbevolen) Pull vanuit Vercel:
     cd web && vercel env pull .env.local

  2. (Handmatig) Kopieer van een collega of vraag Nick
```

Check deze variabelen (lees het bestand, toon alleen of ze gevuld zijn — toon NOOIT de waarden):

```
  ┌─────────────────────────────────────────┬──────────┐
  │ Variabele                               │ Status   │
  ├─────────────────────────────────────────┼──────────┤
  │ NEXT_PUBLIC_SUPABASE_URL                │ [?]      │
  │ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY    │ [?]      │
  │ SUPABASE_SERVICE_ROLE_KEY               │ [?]      │
  │ ORQ_API_KEY                             │ [?]      │
  │ BROWSERLESS_TOKEN                       │ [?]      │
  │ INNGEST_EVENT_KEY                       │ [?]      │
  │ INNGEST_SIGNING_KEY                     │ [?]      │
  └─────────────────────────────────────────┴──────────┘
```

Vul [?] in met OK of MISSING na het controleren.

## Stap 2: MCP Servers

**Supabase MCP:**
Test met `mcp__supabase__list_tables`. Als het werkt → Connected. Anders: begeleid de gebruiker:
```
  Supabase MCP niet verbonden. Zo stel je het in:
  1. Claude Code herkent de Supabase MCP automatisch
  2. Bij eerste gebruik word je gevraagd in te loggen via de browser
  3. Selecteer het "Agent-Workforce" project
```

**Orq.ai MCP:**
Test met `mcp__orqai-mcp__list_models`. Als het werkt → Connected. Anders: leg uit dat de ORQ_API_KEY nodig is en hoe de MCP in te stellen.

## Stap 3: Tools

**GSD Workflow:**
```bash
ls ~/.claude/get-shit-done/VERSION 2>/dev/null
```
Als niet geinstalleerd:
```
  GSD niet gevonden. Installeer met:
  npx get-shit-done-cc@latest
```

**Orq Agent Skill:**
```bash
ls ~/.claude/skills/orq-agent/SKILL.md 2>/dev/null
```
Als niet geinstalleerd:
```
  Orq Agent skill niet gevonden. Vraag Nick voor install instructies.
```

**Vercel CLI:**
```bash
vercel --version 2>/dev/null
```
Als niet geinstalleerd:
```
  Vercel CLI niet gevonden. Installeer met:
  npm i -g vercel
  vercel link    (selecteer het bestaande agent-workforce project)
```

## Stap 4: Systems Registry

Check of de systems tabel bereikbaar is via Supabase MCP:
```sql
SELECT name, integration_method, has_api, is_core_system FROM systems ORDER BY name;
```

## Stap 5: Samenvatting

Toon dit overzicht met de werkelijke resultaten:

```
     ██████████████████████████████████████████████████████████

       SETUP STATUS

     ──────────────────────────────────────────────────────────

       Environment
       ├─ .env.local           ✓ OK / ✗ MISSING
       ├─ Supabase URL         ✓ OK / ✗ MISSING
       ├─ Orq.ai Key           ✓ OK / ✗ MISSING
       ├─ Browserless Token    ✓ OK / ✗ MISSING
       └─ Inngest Keys         ✓ OK / ✗ MISSING

       MCP Servers
       ├─ Supabase MCP         ✓ Connected / ✗ Not connected
       └─ Orq.ai MCP           ✓ Connected / ✗ Not connected

       Tools
       ├─ GSD Workflow          ✓ v1.25.1 / ✗ Not installed
       ├─ Orq Agent Skill       ✓ Installed / ✗ Not installed
       └─ Vercel CLI            ✓ v37.x / ✗ Not installed

       Systems Registry         X core systemen gevonden

     ──────────────────────────────────────────────────────────

       Alles in orde? Begin met:

       /mr-automations:automate   Bouw een nieuwe automation
       /mr-automations:learn      Leg een inzicht vast
       /orq-agent                 Ontwerp een agent swarm
       /gsd:new-project           Start een complex project

     ██████████████████████████████████████████████████████████
```

Als iets ✗ is, bied aan om het stap voor stap op te lossen. Begin met het meest kritieke item (env vars eerst, dan MCP, dan tools).
