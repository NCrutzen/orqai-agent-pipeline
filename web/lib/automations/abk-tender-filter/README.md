# ABK Aanbestedingen Filter

**Status:** testing
**Type:** hybrid
**Eigenaar:** Albert
**Systemen:** Outlook/M365, ABK (Aanbestedingskalender), Orq.ai, Zapier, Vercel

## Wat doet het
Elke dag komt er een ABK-mail binnen ("Nieuwe projecten") met een lijst van 20–30
aanbestedingen, gunningen en rectificaties. Deze automation laat AI elk item
**semantisch** beoordelen en stuurt alleen de items door die passen bij onze
veiligheids-/BHV-dienstverlening. Niet-relevante items (groenonderhoud, ICT,
chauffeursdiensten, etc.) worden eruit gefilterd.

## Waarom
De dagelijkse ABK-mail handmatig doorlezen op relevante kansen kost tijd en je mist
makkelijk iets. AI matcht op betekenis — een titel als "onderhoud
brandbeveiligingsinstallaties" wordt herkend als blusmiddelen-kans, ook al staat het
woord "blusmiddelen" er niet letterlijk in.

## Trigger
Inkomende e-mail: de dagelijkse ABK-mail "Nieuwe projecten" in Outlook/M365.

## Aanpak
**Hybride** (Zapier → Vercel → Zapier), gekozen omdat:
- Trigger (Outlook-mail) en eindactie (mail versturen) kan Zapier native — auth blijft bij Zapier.
- Het AI-stuk vraagt om betrouwbare structured output. Onze huisregel schrijft
  `json_schema` + Zod-validatie voor (prompt-only JSON faalt 15–20%). Dat regelen we
  via Orq.ai in een Vercel-route, niet in een losse Zapier AI-stap.

Flow:
```
1. Zapier  → trigger: nieuwe Outlook-mail van ABK ("Nieuwe projecten")
2. Zapier  → POST mail-HTML naar /api/automations/abk-tender-filter (header x-webhook-secret)
3. Vercel  → Orq.ai (1 call, json_schema) extraheert + classificeert alle items
           → Zod-validatie → dedupe → bouwt gefilterde digest
           → geeft ALTIJD een mailbaar { subject, html, text } terug (zie hieronder)
4. Zapier  → Outlook "Send Email": stuur het resultaat naar Albert.Dias.Dullois.cb@moyneroberts.com
```

Eén batched Orq.ai-call houdt het binnen de Zapier-webhook-timeout (~5s in de test).

**Heartbeat — élke ABK-mail levert exact één mail op.** De route geeft nooit meer een
leeg resultaat terug, zodat een kapotte pipeline niet stil blijft (zoals juni 2026,
toen `from` niet werd meegestuurd en het twee dagen onopgemerkt bleef). Drie uitkomsten:
- **≥1 kans** → digest met de relevante aanbestedingen.
- **0 relevant, mail wél verwerkt** → "geen relevante aanbestedingen"-mail (bewijst dat de pipeline draaide).
- **Stille fout** (from ontbreekt / lege body) → ⚠️-alarmmail die vertelt wat er mis is.

Daarom is de oude `match_count > 0`-filterstap **verwijderd** — Zapier stuurt nu altijd
de mail die de route teruggeeft. Krijg je op een werkdag géén mail, dan is de ABK-mail
zelf niet binnengekomen (of de Zap staat uit) — dát is dan het signaal. Een echte
route-fout (Orq.ai down → HTTP 502) laat de POST-stap falen, wat Zapier zelf als
task-error meldt.

## Aannames
- De ABK-mail bevat de items als doorzoekbare HTML/tekst (Zapier levert de body aan).
- "VL" uit de oorspronkelijke vraag = **blusmiddelen**.
- Bij twijfel matcht het model conservatief; bij echte twijfel wordt het origineel
  alsnog gelezen (staat als disclaimer in de digest).
- ABK is een passieve mailbron, geen core-systeem → bewust NIET in de systems registry.

## Thema's
De filtercriteria staan in [`themes.ts`](./themes.ts) en zijn vrij aan te passen.
Huidige set: BHV, Blusmiddelen, Brandveiligheid, Ontruiming, EHBO/AED,
Veiligheidsopleidingen. Albert kan termen toevoegen/verwijderen — het model matcht
semantisch, dus losse trefwoorden zijn niet nodig.

## Credentials
Geen credentials uit de Supabase-tabel nodig. Outlook-auth wordt door Zapier beheerd.
Vereiste env vars (al aanwezig in Vercel/`.env.local`):
- `ORQ_API_KEY` — Orq.ai router
- `AUTOMATION_WEBHOOK_SECRET` — beveiligt de Vercel-route (Zapier stuurt dit mee als `x-webhook-secret`)

## Zapier configuratie
1. **Trigger** — Microsoft Outlook → *New Email* (map: Inbox). Voeg **direct na de
   trigger een Filter-stap** toe: *Only continue if…* `From Email` **(exact) is**
   `noreply@ggp.aanbestedingskalender.nl` (of `From Email` *contains*
   `aanbestedingskalender.nl`). Zónder deze filter triggert elke inbox-mail de Zap
   en kan een willekeurige mail als "aanbesteding" doorglippen.
2. **Action** — Webhooks by Zapier → *POST*
   - URL: `https://<agent-workforce-domein>/api/automations/abk-tender-filter`
   - Payload type: `json`
   - Data:
     - `html` = de **Body** (HTML-versie) van de mail
     - `text` = de **Body Preview** / Body Plain (fallback als HTML leeg is)
     - `from` = het **From Email**-adres van de mail — **verplicht**. De route
       classificeert alléén mail van het `aanbestedingskalender.nl`-domein; ontbreekt
       `from` of klopt het domein niet, dan komt een ⚠️-alarmmail terug i.p.v. stilte.
     - `date` = de mail-datum (optioneel)
   - Headers: `x-webhook-secret` = waarde van `AUTOMATION_WEBHOOK_SECRET`
   - ⚠️ Map **zowel `html` als `text`**. Outlook levert niet altijd een HTML-body;
     dan zorgt `text` dat de body alsnog meekomt. Het endpoint pakt `html` → `text`
     → `bodyPreview` in die volgorde. Bij een echt lege mail komt een ⚠️-alarmmail
     terug (geen stilte), zodat je zo'n fout meteen ziet.
3. **Action** — Microsoft Outlook → *Send Email* (géén match_count-filter meer; de
   route geeft altijd een mailbaar resultaat — zie "Heartbeat" hierboven)
   - To: `Albert.Dias.Dullois.cb@moyneroberts.com`
   - Subject: `subject` (uit stap 2)
   - Body type: HTML → `html` (uit stap 2)

## Endpoint-contract
`POST /api/automations/abk-tender-filter`
- Headers: `x-webhook-secret: <AUTOMATION_WEBHOOK_SECRET>`
- Body: `{ "html"?: string, "text"?: string, "date"?: string, "themes"?: [{label, omschrijving}] }`
  (minstens `html` of `text` vereist; `html` heeft de voorkeur)
- Response: `{ ok: true, match_count, total_scanned, subject, html, text, note? }`
  (`subject`/`html`/`text` zijn altijd gevuld: digest, "geen relevante aanbestedingen",
  óf een ⚠️-alarm met `note`)

## Status / openstaand
- ✅ Logica end-to-end geverifieerd tegen Orq.ai (8/9 testitems correct gefilterd,
  geplant BHV-item gevangen, dedupe werkt).
- ⬜ Deploy naar Vercel (via `git push` naar `main`).
- ⬜ Zapier Zap aanmaken volgens bovenstaande config.
- ⬜ Projectregistratie in Supabase: de `automation_projects`-tabel uit CLAUDE.md
  bestaat niet meer (schema is herontworpen → `projects` met auth/RLS). Registratie
  is daarom uitgesteld; zie de learning hierover.
