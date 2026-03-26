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

Dan voer de setup uit:

## Deel 1: Prerequisites (Nick regelt dit)

Dit zijn dingen die VOOR de setup klaar moeten zijn. De gebruiker kan deze niet zelf doen.

Vraag de gebruiker of deze stappen al geregeld zijn:

- [ ] GitHub account uitgenodigd voor Moyne Roberts organisatie?
- [ ] Vercel invite ontvangen voor Moin Roberts team?
- [ ] Supabase invite ontvangen voor Agent-Workforce project?
- [ ] Claude Code geinstalleerd? (claude.ai/code)

Als iets ontbreekt: "Vraag Nick om [ontbrekend item] te regelen voordat je verder gaat."

## Deel 2: Project Setup

### Stap 1: Clone en installeer

```bash
git clone [repo url]
cd agent-workforce
npm install
```

### Stap 2: Vercel linken

**BELANGRIJK:** Link naar de **Moin Roberts ORGANISATIE**, niet naar je persoonlijke account!

```bash
vercel link
```

- Kies "Link to existing project" en zoek "agent-workforce"
- Als je een keuze krijgt tussen persoonlijk account en organisatie: kies ALTIJD de **organisatie**
- Als het project niet gevonden wordt, controleer of je Vercel invite geaccepteerd is (Deel 1)

### Stap 3: Environment variables ophalen

```bash
cd web && vercel env pull .env.local
```

Controleer of `.env.local` bestaat en deze variabelen bevat (toon NOOIT de waarden):

```
  ┌─────────────────────────────────────┬──────────┐
  │ Variabele                           │ Status   │
  ├─────────────────────────────────────┼──────────┤
  │ NEXT_PUBLIC_SUPABASE_URL            │ [?]      │
  │ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY│ [?]      │
  │ SUPABASE_SERVICE_ROLE_KEY           │ [?]      │
  │ ORQ_API_KEY                         │ [?]      │
  │ BROWSERLESS_TOKEN                   │ [?]      │
  │ INNGEST_EVENT_KEY                   │ [?]      │
  │ INNGEST_SIGNING_KEY                 │ [?]      │
  └─────────────────────────────────────┴──────────┘
```

Vul [?] in met OK of MISSING na het controleren.

## Deel 3: Optioneel -- MCP Servers

MCP servers zijn **OPTIONEEL**. Alles in de toolkit werkt ook zonder MCP via REST API calls.

Als je ze wil installeren voor extra gemak:

### Supabase MCP (optioneel)

Test: `mcp__supabase__list_tables`

**Voordeel:** Database queries direct vanuit Claude -- sneller dan REST API calls.
**Zonder MCP:** REST API calls werken ook. Zie CLAUDE.md voor het patroon.

### Orq.ai MCP (optioneel)

Test: `mcp__orqai-mcp__list_models`

**Voordeel:** Agent management direct vanuit Claude.
**Zonder MCP:** Gebruik de Orq.ai Dashboard UI.

## Deel 4: Tools (optioneel)

**GSD Workflow:**
```bash
ls ~/.claude/get-shit-done/VERSION 2>/dev/null
```
Als niet geinstalleerd: `npx get-shit-done-cc@latest`

**Orq Agent Skill:**
```bash
ls ~/.claude/skills/orq-agent/SKILL.md 2>/dev/null
```
Als niet geinstalleerd: vraag Nick voor install instructies.

## Deel 5: Samenvatting

Toon dit overzicht met de werkelijke resultaten:

```
     ██████████████████████████████████████████████████████████

       SETUP STATUS

     ──────────────────────────────────────────────────────────

       Vereist
       ├─ Prerequisites        ✓ Compleet / ✗ Vraag Nick
       ├─ Project gecloned     ✓ OK / ✗ Niet gevonden
       ├─ Vercel gelinkt       ✓ Moin Roberts org / ✗ Niet gelinkt
       └─ .env.local           ✓ OK / ✗ MISSING

       Optioneel
       ├─ Supabase MCP         ✓ Connected / ─ Niet ingesteld (OK)
       ├─ Orq.ai MCP           ✓ Connected / ─ Niet ingesteld (OK)
       ├─ GSD Workflow          ✓ Installed / ─ Niet ingesteld (OK)
       └─ Orq Agent Skill      ✓ Installed / ─ Niet ingesteld (OK)

     ──────────────────────────────────────────────────────────

       Alles in orde? Begin met:

       /mr-automations:automate   Bouw een nieuwe automation
       /mr-automations:learn      Leg een inzicht vast
       /gsd:new-project           Start een complex project

     ██████████████████████████████████████████████████████████
```

Als een vereist item ontbreekt, help de gebruiker dat eerst op te lossen. Optionele items kunnen later worden ingesteld.
