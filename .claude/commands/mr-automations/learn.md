Leg een debugging-inzicht of geleerde les vast voor het team.

Dit is de collectieve leerloop. Wanneer je iets niet-triviaals ontdekt tijdens debuggen, wordt het hier vastgelegd zodat het hele team ervan profiteert.

## Proces

### 1. Verzamel de learning

Vraag (of leid af uit de conversatiecontext):

- **Wat ging er mis?** (het probleem of onverwacht gedrag)
- **Wat was de root cause?** (waarom het gebeurde)
- **Wat is de fix/het patroon?** (hoe het te vermijden of op te lossen)
- **Welk systeem?** (Browserless, Orq.ai, Supabase, Inngest, Zapier, NXT, iController, etc.)

Als de conversatie deze context al bevat (we hebben net iets gedebugd), extract het automatisch en bevestig met de gebruiker.

### 2. Schrijf naar Supabase

Sla de learning op in de `learnings` tabel via REST API of Supabase MCP.

**Optie A: MCP beschikbaar** (probeer dit eerst)

Als Supabase MCP werkt, gebruik het:

```sql
INSERT INTO learnings (system, title, problem, root_cause, solution, discovered_by)
VALUES ('{system}', '{title}', '{problem}', '{root_cause}', '{solution}', '{user name or "team"}');
```

**Optie B: REST API** (als MCP niet werkt)

Gebruik een directe REST call. Haal SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY uit `web/.env.local`:

```bash
curl -X POST "${SUPABASE_URL}/rest/v1/learnings" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{
    "system": "{system}",
    "title": "{title}",
    "problem": "{problem}",
    "root_cause": "{root_cause}",
    "solution": "{solution}",
    "discovered_by": "{user name or team}"
  }'
```

Als de `learnings` tabel nog niet bestaat, maak hem aan via Supabase MCP `apply_migration` of via de Supabase Dashboard SQL editor:

```sql
CREATE TABLE IF NOT EXISTS learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  system TEXT NOT NULL,
  title TEXT NOT NULL,
  problem TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  solution TEXT NOT NULL,
  code_example TEXT,
  discovered_by TEXT DEFAULT 'team',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 3. Check of CLAUDE.md aangepast moet worden

**Toevoegen aan CLAUDE.md als:**
- Het een patroon is dat voor ALLE automations geldt
- Het een gotcha is die significant tijd zou verspillen
- Het een bestaande instructie in CLAUDE.md tegenspreekt of verfijnt

**Alleen in learnings tabel als:**
- Het specifiek is voor één systeem of automation
- Het een minor edge case is
- Het al gedekt wordt door CLAUDE.md

Als CLAUDE.md aangepast moet worden, toon de diff en vraag goedkeuring.

### 4. Bevestig

```
==============================================================
  LEARNING VASTGELEGD
==============================================================

  Systeem: {system}
  Titel: {title}
  CLAUDE.md aangepast: {ja/nee}

  Opgeslagen in Supabase — beschikbaar voor het hele team.

==============================================================
```

## Quick mode

Als de gebruiker de learning inline geeft (bijv. `/mr-automations:learn Browserless sessies verlopen na 6 uur niet 24`), sla de interview over en schrijf direct. Bevestig voor opslaan.

## Automatisch

Deze command hoeft niet altijd handmatig aangeroepen te worden. De self-improvement loop in CLAUDE.md schrijft ook automatisch learnings wanneer de gebruiker Claude corrigeert.
