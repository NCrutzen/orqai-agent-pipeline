# Sales Email Pipeline — Project Handoff

**Datum:** 15 april 2026
**Van:** Nick Crutzen
**Voor:** Koen
**Expert contact:** Sam Cody (interne SugarCRM expert)

---

## Wat is het doel?

We bouwen een AI-pipeline die inkomende sales emails van Smeba Brandbeveiliging (verkoop@smeba.nl) automatisch kan beantwoorden. Het systeem moet:

1. **Emails categoriseren** — intent, urgentie, klant, offerte-nummers extraheren
2. **Knowledge base opbouwen** — zodat agents context hebben om antwoorden te genereren
3. **Concept-antwoorden genereren** — op basis van de knowledge base
4. **CEO review loop** — Andrew Cosgrove (CEO, Engelstalig) beoordeelt wekenlang concept-antwoorden met thumbs up/down + rewrites voordat het systeem live gaat
5. **Pas daarna: live integratie** — agents handelen emails af in SugarCRM

**Belangrijk:** We zijn nog NIET in de fase van live afhandeling. De prioriteit is:
- Categorisatie analyseren + quick-wins identificeren
- Knowledge base bouwen
- Concept-antwoorden laten genereren en beoordelen
- Agent Swarm architectuur bedenken op basis van analyse + quickwins

---

## Wat is er gebouwd (15 april 2026)

### Database

Alles draait op Supabase (project: `mvqjhlxfvtqqubqgdvhz`).

**`email_pipeline.emails`** — Gedeelde tabel voor ALLE ruwe emails (Outlook + SugarCRM)
- 34,368 SugarCRM sales emails opgehaald (12 maanden: apr 2025 - apr 2026)
- 44,731 Outlook debtor emails (bestaand)
- Kolom `source` onderscheidt herkomst: `outlook` of `sugarcrm`
- Kolom `source_id` is de unieke ID per bron (was `graph_id`)

**`sales.email_analysis`** — AI categorisatie resultaten
- Wordt gevuld door het categorisatie-script (draait nu, klaar op 16 april ochtend)
- Bevat: `category`, `email_intent`, `urgency`, `customer_name`, `quote_numbers`, `case_number`, `order_numbers`, `ai_summary`, `suggested_response`, `assigned_to`
- Plus agent swarm kolommen: `draft_response`, `draft_status`, `approved_at`, `approved_by`
- FK naar `email_pipeline.emails(id)`

**`sales.emails`** — GEDROPPED (was overbodig, alles zit in email_pipeline.emails)

### Scripts

Allemaal in `web/lib/automations/sales-email-analyzer/src/`:

| Script | Doel | Status |
|--------|------|--------|
| `fetch-sugarcrm-emails.ts` | Haalt emails op uit SugarCRM REST API | Klaar (34,368 emails) |
| `categorize-sales.ts` | Categoriseert emails via Orq.ai | Draait nu, klaar ~16 april ochtend |
| `discover-sales-intents.ts` | Discovery pass voor data-driven taxonomy | Klaar (resultaten verwerkt) |
| `test-sugarcrm.ts` | Test script voor SugarCRM connectie | Kan verwijderd worden |

### Draaien

```bash
cd web/lib/automations/sales-email-analyzer
npx tsx src/categorize-sales.ts    # Herstart als het gestopt is (idempotent)
```

Het script skipt al-geanalyseerde emails automatisch.

---

## Architectuurbeslissingen

1. **Gedeelde email tabel** — Eén `email_pipeline.emails` voor alle bronnen (Outlook + SugarCRM). Analyse-tabellen apart per domein (`debtor.email_analysis` / `sales.email_analysis`).

2. **Data-driven taxonomy** — Categorieën en intents zijn NIET bedacht maar ontdekt via een discovery pass op 160 echte emails. Resultaat: 11 categorieën, 31 intents.

3. **SugarCRM toegang** — Twee methodes:
   - **Zapier SDK** (`runAction`) — voor standaard CRUD (read/write/update/search records). Werkt altijd.
   - **Directe REST API** — voor bulk fetch met filters. Vereist username/password auth (credentials zijn verwijderd uit .env na gebruik).

4. **Zapier `.eu` domein blokkade** — `zapier.fetch()` proxy blokkeert `.sugaropencloud.eu`. Gebruik `runAction()` of directe REST API.

---

## Categorisatie — Wat zit erin

### Taxonomy (data-driven)

**Categorieën (11):** `quote`, `order`, `service`, `contract`, `admin`, `finance`, `complaint`, `auto_reply`, `spam`, `internal`, `other`

**Intents (31):** `quote_request`, `quote_followup`, `quote_reminder`, `quote_acceptance`, `quote_rejection`, `quote_revision`, `appointment_scheduling`, `appointment_change`, `maintenance_request`, `inspection_order`, `no_show_report`, `order_placement`, `order_confirmation`, `order_change`, `delivery_inquiry`, `contract_termination`, `contract_takeover`, `contract_inquiry`, `contact_update`, `location_closure`, `data_correction`, `invoice_inquiry`, `payment_reminder`, `credit_request`, `billing_correction`, `auto_reply`, `spam`, `internal_delegation`, `complaint`, `general_inquiry`, `other`

### Tussenresultaten (bij ~6,400 emails)

| Categorie | % | Potentie voor automatisering |
|-----------|---|------------------------------|
| quote | 26% | Hoog — follow-ups, reminders, acceptaties |
| internal | 22% | Medium — routing, delegatie |
| service | 19% | Hoog — scheduling, maintenance |
| order | 9% | Hoog — bevestigingen, routering |
| admin | 7% | Hoog — adreswijzigingen, data correcties |
| contract | 5% | Medium — opzeggingen, overnames |
| auto_reply | 5% | **Quick win** — direct archiveren |
| finance | 4% | Medium — factuurvragen |
| complaint | 1% | Laag — vereist menselijke aandacht |
| spam | <1% | **Quick win** — direct archiveren |

---

## Volgende stappen voor Koen

### Stap 1: Categorisatie resultaten analyseren

De categorisatie is klaar (of bijna klaar). Analyseer de resultaten:

```sql
-- Verdeling per categorie
SELECT category, count(*) as cnt FROM sales.email_analysis GROUP BY category ORDER BY cnt DESC;

-- Verdeling per intent
SELECT email_intent, count(*) as cnt FROM sales.email_analysis GROUP BY email_intent ORDER BY cnt DESC;

-- Quick-wins: hoeveel emails zijn direct archiveerbaar?
SELECT category, count(*) FROM sales.email_analysis 
WHERE category IN ('auto_reply', 'spam') GROUP BY category;

-- Top klanten
SELECT customer_name, count(*) as cnt FROM sales.email_analysis 
WHERE customer_name IS NOT NULL GROUP BY customer_name ORDER BY cnt DESC LIMIT 20;

-- Emails die actie vereisen vs niet
SELECT requires_action, count(*) FROM sales.email_analysis GROUP BY requires_action;
```

### Stap 2: Quick-wins implementeren

Op basis van de analyse, begin met de categorie die het meeste volume heeft en het makkelijkst te automatiseren is. Waarschijnlijk:
- **auto_reply + spam** → Direct archiveren/verwijderen in SugarCRM (via Zapier SDK `update_record`)
- **quote_reminder** (geautomatiseerde herinneringen) → Archiveren

### Stap 3: Knowledge Base opbouwen in Supabase

**Dit is de kern-prioriteit.** Zonder knowledge base kunnen agents geen goede antwoorden genereren.

**Let op: KB bouwen in Supabase, NIET in Orq.ai.** Dit is een teambreed patroon (zie CLAUDE.md → "Knowledge Base Patroon"). Data moet in ons eigen systeem blijven.

**Aanpak:**
- Supabase Storage voor PDF/Word documenten (productcatalogi, procedures, tarieven)
- Supabase tabel voor geextraheerde tekst + metadata
- pgvector extensie voor semantic search (embeddings)
- De 34K emails + analyses dienen als eerste trainingsdata
- Organisatie-documenten worden later toegevoegd via Supabase Storage
- Orq.ai agents raadplegen de KB als tool via Supabase API call

### Stap 4: Agent Swarm ontwerpen

Gebruik `/orq-agent` om de agent swarm te ontwerpen voor Smeba sales email handling.

**BELANGRIJK bij het aanroepen van `/orq-agent`:** Vermeld altijd in de use case description:
> "Knowledge Base is in Supabase (pgvector semantic search), NIET in Orq.ai. Agents krijgen een Supabase search tool om de KB te raadplegen via API call."

Dit voorkomt dat de skill met Orq.ai KB oplossingen komt. De CLAUDE.md bevat dit patroon ook, maar wees expliciet.

**Orchestratie patroon:**
```
Zapier trigger (nieuw email in SugarCRM)
  → Zapier roept Orq.ai V2 aan (via Cloudflare Worker voor lange runs)
    → Agent Swarm met tools:
       - SugarCRM lezen/schrijven (via Zapier SDK)
       - Knowledge Base raadplegen
       - Concept-antwoord genereren
       - Opslaan in sales.email_analysis (draft_response)
```

**Agents die nodig zijn:**
1. **Classifier Agent** — Categoriseert inkomend email (hebben we al als script, moet agent worden)
2. **Context Agent** — Haalt klanthistorie, gerelateerde cases/offertes op uit SugarCRM
3. **Draft Agent** — Genereert concept-antwoord op basis van KB + context
4. **Router Agent** — Bepaalt of email auto-handled kan worden of menselijke review nodig heeft

### Stap 5: CEO Review Loop (V7.0 Milestone)

Andrew Cosgrove (CEO, Engelstalig) beoordeelt concept-antwoorden:
- Thumbs up / thumbs down per concept-antwoord
- Bij thumbs down: rewrite/reformulate het antwoord
- Dit draait weken op de achtergrond als leerproces
- Pas na voldoende goede beoordelingen gaat het systeem live

De review UI wordt geimplementeerd als onderdeel van Milestone V7.0 in de agent-workforce app.

---

## Technische referenties

### SugarCRM connectie via Zapier SDK

```typescript
import { createZapierSdk } from "@zapier/zapier-sdk";
const zapier = createZapierSdk();
const CONNECTION_ID = "58816663"; // Sugar CRM // NCrutzen

// Lezen
const result = await zapier.runAction({
  app: 'SugarCRMCLIAPI', action: 'get_records', actionType: 'read',
  connectionId: CONNECTION_ID, inputs: { module: 'Emails' }
});

// Schrijven (bijv. draft email aanmaken)
await zapier.runAction({
  app: 'SugarCRMCLIAPI', action: 'record', actionType: 'write',
  connectionId: CONNECTION_ID, inputs: { module: 'Emails', name: 'Subject', description: 'Body', ... }
});

// Updaten (bijv. email archiveren)
await zapier.runAction({
  app: 'SugarCRMCLIAPI', action: 'update_record', actionType: 'write',
  connectionId: CONNECTION_ID, inputs: { module: 'Emails', id: 'email-id', state: 'Archived' }
});

// Zoeken
await zapier.runAction({
  app: 'SugarCRMCLIAPI', action: 'record', actionType: 'search',
  connectionId: CONNECTION_ID, inputs: { module: 'Accounts', search_field_1: 'name', value_for_search_field_1: 'Smeba' }
});
```

### Supabase schemas

- `email_pipeline` — ruwe emails (source: outlook/sugarcrm)
- `sales` — email analyse + draft responses
- `debtor` — debtor email analyse (apart project)

### SugarCRM instance

- URL: `https://walkerfire.sugaropencloud.eu`
- Teams: "Smeba Brandbeveiliging BV" (53K emails totaal, 34K in scope)

### Learnings

Check altijd de learnings tabel bij sessiestart:
```bash
curl "https://mvqjhlxfvtqqubqgdvhz.supabase.co/rest/v1/learnings?select=system,title,solution&order=created_at.desc&limit=20" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12cWpobHhmdnRxcXVicWdkdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NzkzMzAsImV4cCI6MjA4OTE1NTMzMH0.8mKWUcA5o_0g0GKBc9OVBcA9MtHeo6I5kUOtbEfbK1U"
```

---

## Vragen?

- **SugarCRM:** Vraag Sam Cody
- **Debtor Email project (referentie):** Zie `web/lib/automations/sales-email-analyzer/src/categorize.ts` voor het werkende patroon
- **Orq.ai agents:** Gebruik `/orq-agent:help` voor beschikbare commando's
- **Knowledge bases:** Gebruik `/orq-agent:kb` voor KB management
