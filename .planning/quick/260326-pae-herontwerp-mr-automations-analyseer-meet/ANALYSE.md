# Analyse: MR Automations Toolkit Meeting -- 26 maart 2026

## Samenvatting

Op 26 maart 2026 heeft het team (Nick, Amy, Koen, Albert) een sessie van 4,5 uur besteed aan het opzetten van de MR Automations Toolkit. Het doel was: iedereen een werkende omgeving geven zodat ze zelfstandig automations kunnen bouwen met Claude Code en de toolkit.

Het resultaat: na 4,5 uur had slechts een deel van het team een werkende setup, en de problemen die opdoken onthulden fundamentele architectuurfouten in de toolkit. De toolkit was gebouwd met MCP servers als harde afhankelijkheid, maar MCP bleek onbetrouwbaar genoeg om het hele fundament onderuit te halen.

---

## Problemen

### P1: MCP servers werken niet betrouwbaar

**Beschrijving:**
Supabase MCP authenticatie faalde herhaaldelijk. De MCP server gaf aan verbonden te zijn, maar werkte niet. Claude meldde "het werkt" terwijl queries faalden. Het probleem was map-specifiek: MCP configuratie in de verkeerde directory zorgde voor onvoorspelbaar gedrag.

**Root cause:**
MCP servers zijn afhankelijk van correcte `settings.json` configuratie per map. Er is geen duidelijke foutmelding wanneer de configuratie verkeerd staat. Claude Code kan niet betrouwbaar detecteren of MCP daadwerkelijk werkt -- het rapporteert "connected" ook wanneer dat niet het geval is.

**Impact:**
Alles dat op MCP leunt (learnings opslaan, systems registry bevragen, database operaties) is daardoor onbetrouwbaar. Het team verloor meer dan een uur aan MCP debugging.

**Ernst:** Kritiek -- fundamenteel architectuurprobleem

---

### P2: Setup te complex

**Beschrijving:**
De setup vereiste 10+ stappen in de juiste volgorde: GitHub account -> organisatie-invite -> Vercel account -> Vercel invite -> Supabase invite -> git clone -> npm install -> vercel link -> vercel env pull -> MCP servers configureren -> Zapier setup -> skills installeren -> API keys configureren. Dit kostte 4+ uur en was niet af.

**Root cause:**
De setup was ontworpen vanuit een technisch perspectief (wat heeft de ontwikkelaar nodig?) in plaats van vanuit het gebruikersperspectief (wat kan een niet-technisch teamlid zelfstandig doen?). Er was geen onderscheid tussen prerequisites (die Nick moet regelen) en stappen die het teamlid zelf kan doen.

**Impact:**
Team gefrustreerd na uren setup zonder resultaat. Het vertrouwen in de toolkit is beschadigd.

**Ernst:** Kritiek -- barrier to entry voor het hele team

---

### P3: Map-hierarchie verwarring

**Beschrijving:**
MCP configuratie werd aangemaakt in de verkeerde directory. De `settings.json` voor MCP servers moet in de juiste map staan, maar er was geen duidelijke instructie over welke map dat is. Door de hierarchische werking van MCP (het zoekt omhoog in de directorystructuur) gaven verkeerde configuraties moeilijk te traceren fouten.

**Root cause:**
De setup documentatie specificeerde niet expliciet de juiste directory voor MCP configuratie. Claude Code's MCP systeem is gevoelig voor de werkdirectory, maar dit was niet gedocumenteerd.

**Impact:**
Meerdere teamleden hadden MCP configuratie in de verkeerde map, wat leidde tot niet-werkende MCP servers die WEL als werkend werden gemeld.

**Ernst:** Hoog -- verwarring en tijdverlies

---

### P4: Vercel organisatie verwarring

**Beschrijving:**
Bij `vercel link` koppelde het project aan een persoonlijk Vercel account in plaats van de Moin Roberts organisatie. Daardoor werden environment variables niet gevonden (die staan op organisatie-niveau), en de deployment zou naar het verkeerde project gaan.

**Root cause:**
De Vercel CLI vraagt bij het linken welk account te gebruiken, maar de setup instructies specificeerden niet dat de organisatie gekozen moet worden. Voor een niet-technisch teamlid is het verschil tussen persoonlijk account en organisatie niet vanzelfsprekend.

**Impact:**
Environment variables ontbraken, waardoor de rest van de setup niet kon werken. Debugging kostte aanzienlijk tijd.

**Ernst:** Hoog -- blokkerend voor de setup

---

### P5: Environment variables vs credentials tabel

**Beschrijving:**
Credentials voor systemen (NXT, iController, CRM logins) werden als environment variables opgeslagen of gesuggereerd. De gebruiker vroeg terecht: "hoe leg ik een eindgebruiker uit dat die een env var moet maken?" Credentials horen in de Supabase `credentials` tabel -- centraal beheerd, encrypted, zonder dat gebruikers env vars hoeven te begrijpen.

**Root cause:**
De toolkit maakte geen duidelijk onderscheid tussen infrastructure secrets (API keys die in env vars horen) en systeem-credentials (gebruikersnaam/wachtwoord die in de database horen). De documentatie verwees naar env vars voor alles.

**Impact:**
Verwarrend voor het team, en een beveiligingsrisico als credentials in lokale `.env` bestanden terechtkomen op meerdere laptops.

**Ernst:** Hoog -- beveiligings- en usability-probleem

---

### P6: Learnings en project registratie werkt niet

**Beschrijving:**
Het `/mr-automations:learn` commando verwijst naar Supabase MCP voor het opslaan van learnings. Omdat MCP niet werkt (P1), kan het team geen learnings vastleggen. De hele self-improvement loop is daardoor kapot.

**Root cause:**
De `learn.md` command file heeft alleen een MCP-pad voor het schrijven naar de database. Er is geen fallback. Als MCP faalt, is er geen alternatief.

**Impact:**
Het team kan geen learnings delen. De collectieve kennisopbouw -- een kernfeature van de toolkit -- functioneert niet.

**Ernst:** Hoog -- kernfunctionaliteit kapot

---

### P7: Team ervaringsniveau niet meegenomen

**Beschrijving:**
Amy, Koen en Albert zijn niet-technische teamleden. Ze hebben geen ervaring met terminals, git, npm, environment variables, of MCP configuratie. De toolkit veronderstelt technische basiskennis die niet aanwezig is.

**Root cause:**
De toolkit is ontworpen door en voor een technisch persoon (Nick). De instructies gebruiken jargon en veronderstellen kennis die bij het team ontbreekt. Er is geen onderscheid gemaakt tussen wat technisch noodzakelijk is en wat vereenvoudigd kan worden.

**Impact:**
Het team voelt zich overweldigd en afhankelijk. Het doel -- zelfstandig automations bouwen -- is niet bereikbaar met de huidige complexiteit.

**Ernst:** Hoog -- structureel probleem

---

## Wat wel werkte

### Automate flow
De `/mr-automations:automate` flow zelf werkte goed zodra de omgeving klaar was. De Prolius automation werd in ongeveer 20 minuten gebouwd. Dit bewijst dat het concept werkt -- de uitvoering van de setup is het probleem, niet het idee.

### CLAUDE.md context
De Zapier-first beslisboom in CLAUDE.md werd goed opgepakt door Claude Code. Bij een nieuwe automation werd automatisch eerst Zapier overwogen. De stack-regels werden gerespecteerd. Dit patroon is waardevol en moet behouden blijven.

### Concept shared learnings
Het idee van een gedeelde learnings database is goed ontvangen door het team. Iedereen zag de waarde van het vastleggen van debugging-inzichten zodat collega's niet dezelfde fouten maken. De implementatie via MCP was kapot, maar het concept is solide.

### Browser automation
Browserless.io werkt betrouwbaar. De Playwright scripts draaien succesvol op de cloud Chrome instances. Dit patroon hoeft niet te veranderen.

### Credentials tabel
De benadering om systeem-credentials in een Supabase tabel op te slaan (encrypted, centraal beheerd) werd als logisch en veilig ervaren. Dit moet de standaard worden voor alle systeem-logins.

---

## Conclusie

### Kernprobleem

De MR Automations Toolkit is gebouwd met MCP servers als fundament. Elke kernfunctie -- learnings opslaan, systems registry bevragen, database operaties, setup checks -- leunt op MCP. Maar MCP is niet betrouwbaar genoeg om als harde dependency te dienen:

- MCP configuratie is fragiel (map-afhankelijk, onduidelijke foutmeldingen)
- Claude Code kan niet betrouwbaar detecteren of MCP daadwerkelijk werkt
- Er zijn geen fallbacks wanneer MCP faalt

**Het gevolg:** wanneer MCP niet werkt (en dat is vaker dan verwacht), valt de hele toolkit om. Het team kan niets doen behalve MCP debuggen -- en dat is precies wat niet-technische teamleden niet kunnen.

### De oplossing

MCP moet verschuiven van "vereist fundament" naar "optionele versneller." Elke functie die nu op MCP leunt moet een alternatief pad hebben dat werkt zonder MCP -- via directe REST API calls naar Supabase. MCP mag gebruikt worden wanneer het werkt, maar het team moet niet vastlopen wanneer het niet werkt.

Daarnaast moet de setup drastisch vereenvoudigd worden: duidelijk onderscheid tussen wat Nick voorbereidt (accounts, invites) en wat het teamlid zelf doet (clone, link, pull). MCP configuratie wordt optioneel.
