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

## Volledige Analyse Resultaten (16 april 2026)

Categorisatie compleet: **34,358 / 34,368 emails (99.97% success)**.

### Volume

| Metric | Aantal |
|--------|--------|
| Totaal opgehaald | 34,368 |
| Geanalyseerd | 34,358 (99.97%) |
| Auto-handleable (requires_action=false) | 4,996 (15%) |
| Vereist menselijke actie | 29,362 (85%) |

### Per richting
- Inbound: 17,644 (51%)
- Outbound: 14,642 (43%)
- Internal: 2,072 (6%)

### Per urgentie
- Medium: 25,070 (73%)
- Low: 6,286 (18%)
- High: 2,938 (9%)
- Critical: 64 (<1%)

### Top 10 categorieën (werkelijke aantallen)

| # | Categorie | Aantal | % |
|---|-----------|--------|---|
| 1 | quote | 8,755 | 25.5% |
| 2 | internal | 7,458 | 21.7% |
| 3 | service | 6,984 | 20.3% |
| 4 | order | 2,823 | 8.2% |
| 5 | admin | 2,345 | 6.8% |
| 6 | contract | 1,864 | 5.4% |
| 7 | auto_reply | 1,845 | 5.4% |
| 8 | finance | 1,363 | 4.0% |
| 9 | complaint | 412 | 1.2% |
| 10 | spam | 106 | 0.3% |

### Top 15 intents

| # | Intent | Aantal | % |
|---|--------|--------|---|
| 1 | internal_delegation | 5,517 | 16.1% |
| 2 | quote_acceptance | 2,898 | 8.4% |
| 3 | appointment_scheduling | 2,576 | 7.5% |
| 4 | contact_update | 2,294 | 6.7% |
| 5 | quote_followup | 2,077 | 6.0% |
| 6 | appointment_change | 1,593 | 4.6% |
| 7 | no_show_report | 1,551 | 4.5% |
| 8 | quote_revision | 1,457 | 4.2% |
| 9 | quote_rejection | 1,449 | 4.2% |
| 10 | auto_reply | 1,331 | 3.9% |
| 11 | quote_request | 1,294 | 3.8% |
| 12 | maintenance_request | 1,147 | 3.3% |
| 13 | contract_termination | 998 | 2.9% |
| 14 | order_placement | 876 | 2.5% |
| 15 | order_change | 778 | 2.3% |

---

## Top 5 Quick-Win Automations (referentie — focus eerst op #1)

**HUIDIGE FOCUS:** Eerst een werkend systeem bouwen voor auto-antwoorden (concept-antwoorden) die Andrew Cosgrove (CEO) goedkeurt. De andere quick-wins zijn voor later.

Onderstaande lijst is **puur voor referentie** zodat je de scope ziet.

### 1. Auto-reply Archive (3,176 emails, ~9%) ← **PRIO**
**Wat:** Out-of-office en delivery notifications direct archiveren in SugarCRM.
**Zapier SDK:** `update_record/write` → `state: 'Archived'`
**Risico:** Zeer laag — auto-replies vereisen nooit antwoord
**Waarom prio:** Geen draft response nodig, geen Andrew-review, direct ROI

### 2. Contact Update Sync (2,294 emails, ~7%)
**Wat:** Klant geeft contactgegevens/openingstijden door → SugarCRM Contact/Account updaten.
**Zapier SDK:** `record/search` → `update_record/write` op Contact → `update_record/write` op email
**Risico:** Medium — vereist HITL approval in begin
**Status:** Later — wacht tot Andrew loop draait

### 3. Quote Acceptance Acknowledgement (2,898 emails, ~8%)
**Wat:** Klant accepteert offerte → bevestigingsmail + interne task voor order processing.
**Zapier SDK:** `record/write` (Email + Task) → `update_record/write` op origineel
**Risico:** Medium — concept antwoord eerst review door Andrew
**Status:** Later

### 4. No-Show Rescheduling (1,551 emails, ~5%)
**Wat:** Monteur kon niet binnen → case aanmaken voor herinplannen + email naar klant.
**Zapier SDK:** `record/write` (Cases + Emails) → `update_record/write` op origineel
**Risico:** Laag-medium
**Status:** Later

### 5. Internal Delegation Routing (5,517 emails, ~16%)
**Wat:** Collega stuurt email door naar collega → automatisch toewijzen aan juiste persoon.
**Zapier SDK:** `update_record/write` → `assigned_user_id: <correct_user>`
**Risico:** Laag (geen externe communicatie)
**Status:** Later — **vereist UI in agent-workforce app**

> **BELANGRIJK voor #5 (Internal Routing):** Hard-coded routing werkt niet. Bijvoorbeeld: Patrick werkt niet meer bij Smeba. Personeel wisselt regelmatig. De Agent Swarm front-end in de agent-workforce Next.js app moet een **eenvoudige routing-configuratie UI** hebben waar het team:
> - Routing-regels kan toevoegen/wijzigen ("offerte-vragen → Melissa", "technische vragen → Ad")
> - Personeelsleden kan activeren/deactiveren
> - Default fallbacks kan instellen
>
> Dit is een vereiste voor alle automations met routing/assignment, niet alleen voor #5.

---

## Volgende stappen voor Koen

### Stap 1: Resultaten verifiëren (NIET opnieuw analyseren!)

**De globale analyse is al gedaan** — zie sectie "Volledige Analyse Resultaten" hierboven. Begin NIET opnieuw met het draaien van categorisatie of het opnieuw analyseren van de cijfers.

Voer alleen onderstaande queries uit als je iets specifieks wilt verdiepen:

```sql
-- Top klanten (waar volume zit, voor klant-specifieke patronen)
SELECT customer_name, count(*) as cnt FROM sales.email_analysis 
WHERE customer_name IS NOT NULL GROUP BY customer_name ORDER BY cnt DESC LIMIT 20;

-- Top topics binnen 'auto_reply' (om de exacte archive-criteria te bepalen)
SELECT email_intent, count(*) FROM sales.email_analysis 
WHERE category = 'auto_reply' GROUP BY email_intent ORDER BY count(*) DESC;

-- Steekproef emails per intent (om de prompt te tunen)
SELECT a.email_intent, e.subject, e.body_text 
FROM sales.email_analysis a 
JOIN email_pipeline.emails e ON e.id = a.email_id
WHERE a.email_intent = 'auto_reply' 
LIMIT 10;
```

### Stap 2: Knowledge Base bouwen in Supabase (FUNDERING)

**Dit is de kern-prioriteit en de fundering voor alles wat daarna komt.** Zonder KB kunnen agents geen goede antwoorden genereren. Quick-wins komen PAS NADAT de KB en agent swarm draaien.

**Let op: KB bouwen in Supabase, NIET in Orq.ai.** Dit is een teambreed patroon (zie CLAUDE.md → "Knowledge Base Patroon"). Data moet in ons eigen systeem blijven.

**Bron data — gebruik ALLES (inkomend + uitgaand + intern):**
- 17,644 inbound emails — wat klanten vragen
- 14,642 outbound emails — **HOE Smeba antwoordt** (essentieel: stijl, formuleringen, oplossingen, tone of voice)
- 2,072 internal emails — hoe het team intern coördineert
- + alle bijbehorende analyses uit `sales.email_analysis`

Het uitgaande mailverkeer is de gouden bron — daarmee leren we de agents Smeba's eigen antwoord-patronen.

**Aanpak — denk goed na over:**
- Hoe extraheren we waardevolle informatie? Vraag-antwoord paren? Hele threads? Per intent?
- Welke embedding strategie? OpenAI text-embedding-3? Cohere? Anders?
- Hoe maken we het uitbreidbaar voor PDF/Word documenten later (productcatalogi, procedures, tarieven)?
- Hoe scheid je customer-specifieke context van algemene kennis?

**Architectuur:**
- Supabase Storage voor toekomstige PDF/Word documenten
- Supabase tabel voor geëxtraheerde tekst + metadata
- pgvector extensie voor semantic search (embeddings)
- De 34K emails + analyses als eerste trainingsdata
- Orq.ai agents raadplegen de KB als tool via Supabase API call

### Stap 3: Agent Swarm ontwerpen (NA de KB)

Gebruik `/orq-agent` om de agent swarm te ontwerpen voor Smeba sales email handling. Doe dit PAS NADAT de KB staat — anders ontwerp je in het luchtledige.

**BELANGRIJK bij het aanroepen van `/orq-agent`:** Vermeld altijd in de use case description:
> "Knowledge Base is in Supabase (pgvector semantic search), NIET in Orq.ai. Agents krijgen een Supabase search tool om de KB te raadplegen via API call."

Dit voorkomt dat de skill met Orq.ai KB oplossingen komt. De CLAUDE.md bevat dit patroon ook, maar wees expliciet.

**Orchestratie patroon:**
```
Zapier trigger (nieuw email in SugarCRM)
  → Zapier roept Orq.ai V2 aan (via Cloudflare Worker voor lange runs)
    → Agent Swarm met tools:
       - SugarCRM lezen/schrijven (via Zapier SDK)
       - Knowledge Base raadplegen (Supabase pgvector)
       - Concept-antwoord genereren
       - Opslaan in sales.email_analysis (draft_response)
```

**Agents die nodig zijn:**
1. **Classifier Agent** — Categoriseert inkomend email (hebben we al als script, moet agent worden)
2. **Context Agent** — Haalt klanthistorie, gerelateerde cases/offertes op uit SugarCRM
3. **Draft Agent** — Genereert concept-antwoord op basis van KB + context
4. **Router Agent** — Bepaalt of email auto-handled kan worden of menselijke review nodig heeft

### Stap 4: Quick-wins implementeren (PAS NA agent swarm draait)

Zodra de KB en agent swarm staan, kunnen we de quick-wins implementeren. Begin met #1 (auto-reply archive). Zie sectie "Top 5 Quick-Win Automations" hierboven voor de volledige lijst en prioritering.

Aanpak voor #1 (auto-reply archive):
- Filter: `category = 'auto_reply'` of `category = 'spam'`
- Zapier SDK actie: `update_record/write` op Emails module → `state: 'Archived'`
- Optioneel: tag toevoegen `auto_archived` voor audit trail
- Geen menselijke review nodig (laagste risico-categorie)

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
