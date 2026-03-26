# Herontwerp: MR Automations Toolkit

Dit document beschrijft het concrete herontwerp van de MR Automations Toolkit naar aanleiding van de analyse in ANALYSE.md.

---

## 1. Ontwerpprincipes

### MCP is optionele versneller, niet vereiste dependency
Elke functie in de toolkit moet werken zonder MCP. MCP mag als bonus gebruikt worden wanneer het beschikbaar is, maar het pad zonder MCP moet altijd functioneren.

### Credentials in Supabase, nooit als environment variables
Systeem-credentials (gebruikersnaam + wachtwoord voor NXT, iController, CRM, etc.) gaan altijd in de `credentials` tabel in Supabase. Environment variables zijn uitsluitend voor infrastructure secrets (API keys, service role keys, tokens).

### Prerequisites apart van tool setup
Account-aanmaak en invites zijn dingen die Nick moet regelen VOORDAT een teamlid begint. Dit moet een aparte checklist zijn, niet verweven met de technische setup.

### Complexiteit pas introduceren wanneer het team er klaar voor is
Geen Inngest, geen complex hybrid flows in de eerste versie voor het team. De toolkit begint simpel: Zapier-first, browser automation als nodig, credentials uit Supabase.

### Elke stap moet werken voor een niet-technisch teamlid met alleen Claude Code
Als een stap terminal-expertise vereist die het team niet heeft, moet Claude Code die stap kunnen uitvoeren OF moet de stap vereenvoudigd worden.

---

## 2. Wat verandert

### CLAUDE.md

**a) Supabase MCP van "ALTIJD gebruiken" naar "optioneel"**
- Oud: `**Supabase MCP** voor database operaties (tabellen aanmaken, queries, migrations)`
- Nieuw: `**Supabase MCP** (optioneel) voor database operaties -- als MCP niet werkt, gebruik directe REST API calls`

**b) NOOIT-lijst aanpassen**
- Verwijder: `Handmatig tabellen aanmaken in SQL -- gebruik Supabase MCP apply_migration` (te strikt als MCP niet werkt)

**c) Nieuwe sectie: "Credentials vs Environment Variables"**
- Duidelijke regel: systeem-credentials -> `credentials` tabel. Infra secrets -> env vars.
- Voorbeelden van beide categorieen.
- Vuistregel: "Als het een gebruikersnaam+wachtwoord is voor een systeem -> credentials tabel."

**d) Self-Improvement Loop: verduidelijk REST API pad**
- Toon het exacte curl-commando voor het schrijven naar de `learnings` tabel.
- MCP is niet meer de enige optie.

**e) Supabase Kritieke Patronen: voeg REST fallback toe**
- Documenteer het patroon: `curl "${SUPABASE_URL}/rest/v1/{table}?select=*"` met service role key.

### learn.md

**MCP vervangen door REST API als primair pad**
- Oud: alleen MCP SQL insert
- Nieuw: twee opties
  - Optie A: MCP (als beschikbaar, probeer eerst)
  - Optie B: REST API curl-commando (altijd beschikbaar)
- Het REST API pad werkt altijd, ongeacht MCP status.
- De `learnings` tabel aanmaken kan via MCP of via Supabase Dashboard SQL editor.

### setup.md

**Volledig herschreven met nieuwe structuur:**

- **Deel 1: Prerequisites** (Nick regelt dit)
  - Checklist: GitHub org invite, Vercel team invite, Supabase project invite, Claude Code installatie
  - Als iets ontbreekt: "Vraag Nick om [X] te regelen"

- **Deel 2: Project Setup**
  - Stap 1: Clone en installeer
  - Stap 2: Vercel linken -- EXPLICIET naar Moin Roberts organisatie, niet persoonlijk account
  - Stap 3: Environment variables ophalen via `vercel env pull`

- **Deel 3: Optioneel -- MCP Servers**
  - Supabase MCP: optioneel, voordeel beschreven, alternatief (REST API) benoemd
  - Orq.ai MCP: optioneel, voordeel beschreven, alternatief (Dashboard) benoemd
  - Geen MCP is ook prima -- alles werkt zonder

- **Deel 4: Samenvatting**
  - Vereenvoudigd statusoverzicht
  - MCP servers als "Optioneel" gelabeld
  - Duidelijke volgende stappen

### automate.md

**a) Systems registry: MCP + REST fallback**
- Oud: alleen MCP SQL query
- Nieuw: Optie A (MCP) en Optie B (REST API curl)

**b) Credentials sectie in Stap 3 (Bouw)**
- Nieuwe subsectie: systeem-credentials gaan in Supabase `credentials` tabel
- Ophalen via REST API of MCP
- Infrastructure secrets blijven in env vars via Vercel

**c) Credentials check bij Zapier-first discussie**
- Bij "Geen Zapier connector" pad: credentials check via REST API

**d) Reminders uitgebreid**
- Nieuwe reminder: "Credentials voor systemen in Supabase credentials tabel, NOOIT als env vars"

---

## 3. Wat blijft

Deze onderdelen hebben bewezen te werken en worden niet aangepast:

- **Zapier-first beslisboom** -- werkte goed tijdens de meeting, wordt gerespecteerd door Claude Code
- **Browserless.io patronen** -- betrouwbare browser automation, geen wijzigingen nodig
- **Orq.ai agent integratie** -- het agent swarm design patroon blijft intact
- **CLAUDE.md als kennisbron** -- het concept van CLAUDE.md als altijd-geladen context is effectief
- **Commands structuur** -- `.claude/commands/mr-automations/` met automate, learn, setup
- **Credentials tabel in Supabase** -- het patroon is goed, alleen de documentatie moet het afdwingen

---

## 4. Nieuwe architectuur

```
Laag 1: CLAUDE.md (altijd geladen, bevat alle kennis)
         |
         |-- Stack regels, Zapier-first boom, patronen
         |-- Credentials vs env vars regel
         |-- REST API fallback documentatie
         |
Laag 2: Commands (automate, learn, setup -- werken ZONDER MCP)
         |
         |-- /mr-automations:automate   -> Zapier-first, dan code
         |-- /mr-automations:learn      -> REST API schrijft naar learnings
         |-- /mr-automations:setup      -> Prerequisites + tool setup
         |
Laag 3: REST API fallbacks (Supabase REST voor learnings, systems, credentials)
         |
         |-- curl POST voor schrijven (learnings, systems)
         |-- curl GET voor lezen (credentials, systems registry)
         |-- Werkt altijd met SUPABASE_URL + SERVICE_ROLE_KEY uit .env.local
         |
Laag 4: MCP servers (OPTIONELE versneller als ze werken)
         |
         |-- Supabase MCP: snellere queries, schema exploratie
         |-- Orq.ai MCP: agent management vanuit Claude
         |-- Zapier MCP: acties uitvoeren
         |-- Niet vereist -- alles werkt ook zonder
```

**Cruciale verandering:** De pijlen gaan van boven naar beneden. Laag 1 en 2 moeten altijd werken. Laag 3 is het vangnet. Laag 4 is bonus.

---

## 5. Migratie

De volgende concrete wijzigingen moeten nu doorgevoerd worden (Task 2 in het plan):

### CLAUDE.md
1. Supabase MCP markeren als optioneel in de stack-sectie
2. "Handmatig tabellen aanmaken" verwijderen uit NOOIT-lijst
3. Nieuwe sectie "Credentials vs Environment Variables" toevoegen
4. Self-Improvement Loop: REST API curl erbij
5. Supabase patronen: REST fallback documenteren

### learn.md
1. Stap 2 herschrijven: MCP als Optie A, REST API als Optie B
2. Tabel-aanmaak: MCP of Supabase Dashboard

### setup.md
1. Volledig herschrijven met 4-delige structuur
2. Prerequisites checklist apart
3. MCP servers naar optionele sectie
4. Vercel org-instructie expliciet maken

### automate.md
1. Systems registry: dual-pad (MCP + REST)
2. Credentials subsectie in Stap 3
3. Credentials check in Zapier-first flow
4. Nieuwe reminder over credentials

---

*Dit document dient als beslisdocument. Na goedkeuring worden de wijzigingen in Task 2 doorgevoerd.*
