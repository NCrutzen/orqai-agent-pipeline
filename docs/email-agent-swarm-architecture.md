# Email Agent Swarm Architecture

Gedeelde architectuur voor alle email automation projecten bij Moyne Roberts.
Geldt voor: **Debtor Email Cleanup** en **Sales Email** (en toekomstige email projecten).

## Principe

**Zapier triggert, Agents orkestreren, Tools voeren uit.**

Elke email automation volgt dezelfde architectuurlaag, ongeacht het mailbox of email type.

## Architectuur

```
Outlook Shared Mailbox
  │
  ▼
Zapier (trigger only)
  ├─ Trigger: nieuwe email in shared mailbox
  ├─ Minimale verwerking (sender, subject, body extract)
  └─ Webhook → Vercel API route
        │
        ▼
Vercel API Route (/api/email-swarm/process)
  ├─ Validatie + logging
  └─ Orq.ai Orchestrator Agent aanroepen
        │
        ▼
Orchestrator Agent (Orq.ai)
  ├─ Classificeert email (auto-reply / payment / dispute / ...)
  ├─ Kiest sub-agent(s) via call_sub_agent
  └─ Stuurt email context door
        │
        ▼
Sub-Agents (Orq.ai)
  ├─ Auto-Reply Agent
  │   ├─ HTTP Tool: outlook.categorize(emailId, "Auto-Reply")
  │   ├─ HTTP Tool: outlook.archive(emailId)
  │   └─ HTTP Tool: icontroller.deleteEmail(company, subject, from)
  │
  ├─ Payment Notice Agent
  │   ├─ HTTP Tool: outlook.categorize(emailId, "Payment Notice")
  │   ├─ HTTP Tool: outlook.archive(emailId)
  │   └─ HTTP Tool: icontroller.deleteEmail(company, subject, from)
  │
  ├─ (Toekomst) Dispute Agent
  │   ├─ HTTP Tool: outlook.flag(emailId)
  │   ├─ HTTP Tool: icontroller.assignToCollector(...)
  │   └─ HTTP Tool: crm.createTask(...)
  │
  └─ (Toekomst) Credit Control Agent
      ├─ HTTP Tool: nxt.queryDebtor(...)
      ├─ HTTP Tool: icontroller.checkPaymentPlan(...)
      └─ HTTP Tool: outlook.reply(emailId, template)
```

## Tool Endpoints (Vercel API Routes)

Herbruikbare tool endpoints die door alle sub-agents worden gedeeld:

| Tool | Endpoint | Systeem | Methode |
|------|----------|---------|---------|
| outlook.categorize | POST /api/tools/outlook/categorize | Outlook | Graph API via Zapier |
| outlook.archive | POST /api/tools/outlook/archive | Outlook | Graph API via Zapier |
| outlook.delete | POST /api/tools/outlook/delete | Outlook | Graph API via Zapier |
| outlook.flag | POST /api/tools/outlook/flag | Outlook | Graph API via Zapier |
| outlook.reply | POST /api/tools/outlook/reply | Outlook | Graph API via Zapier |
| icontroller.deleteEmail | POST /api/tools/icontroller/delete-email | iController | Browserless |
| nxt.query | POST /api/tools/nxt/query | NXT | Zapier SQL (whitelisted IP) |
| crm.createTask | POST /api/tools/crm/create-task | CRM | Browserless |

Elke tool:
- Ontvangt gestructureerde JSON input
- Maakt before/after screenshots (waar relevant, via shared lib `@/lib/browser`)
- Logt naar `automation_runs` tabel
- Returnt compact resultaat (< 1KB — Orq.ai tool response size is ongedocumenteerd)
- Timeout: < 10s aanbevolen (Orq.ai HTTP tool timeout is ongedocumenteerd)
  - Browserless acties die langer duren: Inngest function met polling

## Orq.ai Agent Configuratie

### Orchestrator Agent
```
key: email-orchestrator
tools: [retrieve_agents, call_sub_agent]
team_of_agents: [
  { key: "auto-reply-agent", role: "Handles auto-reply / out-of-office emails" },
  { key: "payment-notice-agent", role: "Handles payment confirmations and notices" },
  ... (uitbreidbaar)
]
max_execution_time: 120s
max_iterations: 10
```

### Sub-Agents
```
key: auto-reply-agent / payment-notice-agent / ...
tools: [HTTP tools per agent — zie tabel hierboven]
max_execution_time: 60s
max_iterations: 5
```

## Orq.ai Capabilities & Beperkingen (april 2026)

### Bevestigd werkend
- **HTTP Tools:** Agents roepen externe HTTP endpoints aan (URL, method, headers, body). Dynamische waarden via `{{variable}}` syntax. Auth via Bearer token (encrypted at rest).
- **Sub-agent delegatie:** `call_sub_agent` + `retrieve_agents` tools. Orchestrator → sub-agent is first-class.
- **Function Tools:** Client-side continuation pattern (agent returnt `requires_action`, app voert uit, post resultaat terug). Werkt in Agents én Deployments.
- **MCP Tools:** Agents kunnen tools van externe MCP servers gebruiken.
- **Structured tool responses:** Agents verwerken tool resultaten en nemen vervolgbeslissingen.

### Beperkingen / Risico's
- **HTTP tool timeout:** NIET gedocumenteerd. Houd Vercel routes < 10s.
- **Tool response size:** NIET gedocumenteerd. Houd responses compact (< 1KB).
- **Aantal tools per agent:** NIET gedocumenteerd. Geen expliciet limiet gevonden.
- **HTTP/MCP/Code/JSON Schema tools:** Alleen beschikbaar in Agents, NIET in Deployments. Function Tools werken in beide.
- **Tool approval:** Configureerbaar per agent (`all`, `respect_tool`, `none`). Zet op `none` voor volledig autonome executie.
- **Agent instructions:** Moeten expliciet beschrijven wanneer welke tool te gebruiken. Modellen ontdekken tool-doel niet automatisch.

## Evolutiepad

### V1 (nu) — Zapier Direct
```
Zapier → Vercel API routes → Tools direct aanroepen
```
- Snel te bouwen, werkt vandaag
- Tools worden gebouwd als standalone endpoints
- Classificatie via Zapier regels of losse AI stap

### V2 (straks) — Agent Swarm
```
Zapier → Vercel → Orq.ai Orchestrator → Sub-agents → dezelfde Tool endpoints
```
- Dezelfde tool endpoints hergebruikt
- Intelligente classificatie door Orchestrator
- Uitbreidbaar: nieuwe sub-agent toevoegen = nieuw email type ondersteunen
- Error handling en retry door agents

### V3 (toekomst) — Volledig Autonoom
```
Zapier → Orchestrator met geheugen + leer-loop
```
- Agents leren van feedback (Orq.ai experiments)
- Nieuwe email types automatisch herkennen
- Escalatie naar mens bij onzekerheid

## Audit Trail

Elke actie wordt gelogd:
- `automation_runs` tabel: status, result (JSONB), error, triggered_by
- Screenshots: `automation-screenshots` bucket in Supabase Storage, subfolder per automation
- Before/after screenshots bij elke destructieve actie (via `captureBeforeAfter()` uit `@/lib/browser`)

## Gerelateerde Projecten

- **Debtor Email Cleanup** — Shared mailbox debtors. Auto-replies + payment notices.
- **Sales Email** — (projectnaam TBD). Dezelfde architectuur, ander mailbox, andere email types.
- **EASY Email Agent Swarm** — Apart project (info@curabhv.nl). Kan dezelfde tool endpoints hergebruiken.
