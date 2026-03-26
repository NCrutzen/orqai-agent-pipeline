Begeleid de gebruiker bij het bouwen van een nieuwe automation. Lees eerst `CLAUDE.md` voor de volledige stack-regels en beslisboom.

## Stap 1: Begrijp de use case

Vraag:
- **Wat wil je automatiseren?** (bijv. "facturen herverstuuren vanuit iController")
- **Welk systeem/systemen?** Raadpleeg de systems registry: `SELECT name, integration_method, url FROM systems ORDER BY name;`
- **Hoe moet het getriggerd worden?** (handmatig, scheduled, email, event uit ander systeem)

## Stap 2: Zapier-first discussie

**VERPLICHT: bespreek Zapier VOORDAT je code schrijft.**

Zeg iets als:
"Voordat we code gaan schrijven — kan dit een simpele Zapier Zap zijn? Zapier verbindt 8000+ apps, regelt authenticatie, en kan schedulen, SQL queries draaien naar NXT, en notificaties sturen. Als het target systeem een Zapier connector heeft, is een Zap waarschijnlijk sneller en stabieler dan custom code."

Check https://zapier.com/apps voor de target systemen.

### Beslisflow:

**Kan Zapier de hele flow?**
→ JA: Help de gebruiker de Zap te ontwerpen. Documenteer de configuratie.

**Kan Zapier triggeren, maar is browser/custom code nodig voor een deel?**
→ Hybrid: Zapier triggert een Vercel API route of Inngest function. Zie `docs/zapier-patterns.md` voor het hybrid patroon.

**Geen Zapier connector, geen API, browser interactie nodig?**
→ Browser automation: Browserless.io + Playwright. Lees `docs/browserless-patterns.md`.

**Is het eigenlijk een AI agent use case?**
→ Verrijk de use case met MR-specifieke context (systemen, integratiemethodes, beschikbare tools) en gebruik `/orq-agent` voor het swarm design. Browser automations kunnen als MCP tools aan agents meegegeven worden.

**Interactieve interface of custom UI nodig?**
→ Mogelijk apart project. Bespreek met de gebruiker of een apart Vercel/Supabase project gerechtvaardigd is.

**Is dit een nieuw systeem dat we nog niet kennen?**
→ Vraag of het een core systeem is dat in de systems registry moet. Zo ja, voeg toe via Supabase MCP.

## Stap 3: Bouw

Afhankelijk van het gekozen patroon:

**Zapier Zap:**
- Geen code. Help de gebruiker de Zap te ontwerpen in de Zapier UI.
- Documenteer de Zap configuratie in een README of notitie.

**Custom code (API route, Inngest function, Browserless script):**
- Schrijf code in `web/app/api/automations/{name}/` of `web/lib/automations/{name}/`
- Gebruik patronen uit de referentiedocumenten in `docs/`
- Gebruik Supabase MCP voor database operaties (tabellen aanmaken, data)
- Test lokaal, deploy via git push naar main

**Agent swarm:**
- Verrijk use case met systeem-context
- Roep `/orq-agent` aan voor het design
- Implementeer eventuele tools (Browserless, API clients) als MCP tools

## Stap 4: Verifieer

- Test de automation end-to-end
- Controleer of het resultaat klopt (Supabase data, Zapier logs, screenshots)
- Bij debugging-inzichten: leg vast met `/mr-automations:learn`

## Reminders

- ALTIJD Zapier eerst bespreken
- NOOIT Netlify/Firebase/andere platforms — zie CLAUDE.md stack regels
- Code deployt naar DIT project (agent-workforce op Vercel)
- Gebruik Supabase MCP voor alle database operaties
- Nieuwe systemen → vraag of het in de systems registry moet
