# Uren Controle

**Status:** building
**Type:** hybrid (Zapier trigger + Vercel/Inngest pipeline + Next.js review UI)
**Eigenaar:** HR / Platform Team
**Systemen:** SharePoint (via Zapier), Supabase, Inngest, Next.js dashboard

## Wat doet het

Elke maand levert het Hour Calculation proces een Excel bestand op in SharePoint. Deze automation:

1. Detecteert het bestand (Zapier SharePoint connector)
2. Stuurt de base64-gecodeerde inhoud naar een Vercel API route
3. Laat Inngest het bestand naar Supabase Storage uploaden
4. Parseert alle 4 tabbladen (`Uren`, `Mutaties`, `Storingsdienst`, `Bonus`)
5. Draait 4 detectie-regels (zie hieronder)
6. Toont de flagged rijen in een HR review dashboard (accept/reject met reason)

## Waarom

HR besteedt ongeveer 8 uur per maand aan handmatige controle van het Hour Calculation rapport. De 4 regels in de engine reproduceren die controle, zodat HR alleen nog hoeft te reviewen in plaats van scannen.

## Trigger

Zapier detecteert een nieuw bestand in de Hour Calculation SharePoint folder en stuurt een webhook naar `/api/automations/uren-controle`.

## Aanpak

**Hybrid** — Zapier handelt de SharePoint auth af, wij bouwen de parser/rules/review UI.

**Waarom hybrid:** SharePoint signed URLs zijn fragiel en auth-intensief. Door Zapier het bestand te laten downloaden en base64 encoderen in de Zap, krijgt onze pipeline de content binnen zonder enige SharePoint credential in onze stack.

## File delivery contract

De Zap stuurt JSON:

```json
{
  "filename":      "Hour_Calculation_2026-02.xlsx",
  "contentBase64": "UEsDBBQAB...",  // Zapier's Formatter "Utilities → Encode to base64"
  "environment":   "acceptance",    // default — lock to acceptance until HR sign-off
  "triggeredAt":   "2026-04-01T08:00:00Z",
  "sourceUrl":     "https://mr.sharepoint.com/.../Hour_Calculation_2026-02.xlsx"
}
```

Header: `x-automation-secret: <AUTOMATION_WEBHOOK_SECRET>` (zelfde secret als `prolius-report`).

**Belangrijk:** Onze pipeline downloadt NOOIT opnieuw van SharePoint — `sourceUrl` is puur metadata. Dit voorkomt auth walls en houdt credentials uit onze stack.

## Environment pattern

Conform CLAUDE.md test-first pattern:

- **Default: `acceptance`.** De API normaliseert elke ontbrekende of onbekende `environment` waarde naar `acceptance`.
- **Productie** vereist expliciet `"environment": "production"` in de Zap body — en een bevestigd HR sign-off moment.
- De `uren_controle_runs.environment` kolom heeft DEFAULT `'acceptance'` in de migration.
- Het dashboard toont een **environment banner** bovenaan die wisselt van kleur (amber = acceptance, rood = production).

## Aannames

- Het Excel schema (sheet names, kolom layout) blijft stabiel binnen een maand. Wijzigingen worden via een v2 migration opgevangen.
- Zapier levert altijd één bestand per webhook call (geen batching).
- Het bestand is ≤ ~5 MB base64 — binnen Next.js default body limit.

## Credentials

- **Zapier SharePoint connector:** Zapier beheert de auth. Niet in onze `credentials` tabel.
- **`AUTOMATION_WEBHOOK_SECRET`:** Vercel env var — al aanwezig (gedeeld met prolius-report).
- Geen systeem-credentials nodig voor deze automation (geen direct systeemcontact vanuit onze kant).

## Zapier configuratie

1. **Trigger:** SharePoint "New File in Folder" op de Hour Calculation output folder.
2. **Action 1 (optioneel):** SharePoint "Get File Content" → levert file binary.
3. **Action 2:** Formatter "Utilities → Encode to base64".
4. **Action 3:** Webhooks "POST" naar `https://<vercel-app>/api/automations/uren-controle`:
   - Header: `x-automation-secret: <AUTOMATION_WEBHOOK_SECRET>`
   - Body: zie _File delivery contract_ hierboven.

Laat de Zap in **OFF** staan tot HR de fixture-run heeft goedgekeurd. Bij productie go-live: flip de Zap body naar `"environment": "production"` en zet ON.

## Detectie-regels (v1)

Alle regels leven in `rules.ts`. Elke regel is een pure functie met getest signature.

| Regel | Thresholds | Scope | Beschrijving |
|---|---|---|---|
| `detectTnTMismatch` | 30 min | monteur/detexie (niet kantoor) | Flagt afwijkingen > 30 min tussen T&T (`i*`) en urenbriefje (`u*`) times op dezelfde dag. |
| `detectVerschilOutlier` | ±2 uur | monteur/detexie | Flagt `verschil` kolom > +2u of < -2u op dezelfde dag. |
| `detectWeekendFlip` | n.v.t. | alle | Flagt weken waar vrijdag leeg is (`ar/aw/ew/er` alle leeg) én zaterdag wél gevuld. |
| `detectVerzuimBcsDuplicate` | zie v1-contract | alle | v1 heuristiek: flagt dagen waar `day.verzuim` zowel "ziek" als ("verlof"/"vakantie"/"atv") bevat. |

### v1 heuristiek voor `detectVerzuimBcsDuplicate`

Als de echte BCS duplicate signature in productie afwijkt van de v1 heuristiek (ziekte+verlof zelfde dag), is dit een v2 refinement — documenteer in de flagged row comments en open een ticket. De heuristiek is bewust smal: valide data bevat één verzuim-oorzaak per dag.

### Kantoor-suppressie

Medewerkers met `category === 'kantoor'` hebben geen T&T registratie. De regels `tnt_mismatch` en `verschil_outlier` worden voor hen onderdrukt. `weekend_flip` en `verzuim_bcs_duplicate` gelden wel.

## Known exceptions

De `known_exceptions` tabel bevat medewerker+regel tuples waarvoor flags als `suppressed_by_exception=true` worden gemarkeerd (niet verwijderd — auditable).

**Seed:** de migration zet één placeholder row `Medewerker_01 / verschil_outlier` met `active=false`. HR vervangt deze na go-live via een approved Supabase update met echte namen en `active=true`.

## Rules tuning

- Thresholds staan als `const` bovenaan `rules.ts`. Voor dynamische tuning zonder redeploy: verplaats later naar `settings` tabel key `uren_controle_thresholds`.
- `exceljs` is gekozen boven `xlsx/sheetjs` vanwege betere OOXML support voor Office 365, streaming API voor grote files, en geen licensing-gedoe.

## Known limitations (v1)

- `detectVerzuimBcsDuplicate` is een heuristiek — v2 refinement op basis van echte BCS data mogelijk.
- Dashboard: geen bulk-accept per medewerker, geen CSV export — staan op de backlog.
- Geen learn-loop voor known_exceptions; HR onderhoudt hem handmatig in v1.
- Geen terugschrijven van gecorrigeerde uren naar SharePoint.

## Routes

- **Trigger webhook:** `POST /api/automations/uren-controle`
- **Review action:** `POST /api/automations/uren-controle/review` (Supabase session auth)
- **Dashboard:** `/automations/uren-controle` (behind `(dashboard)` layout → Supabase auth gate)

## Fixture

`__fixtures__/sample.xlsx` — geanonimiseerd (226 namen → `Medewerker_NN`, IDs → 9000-range, emails → `medewerker_NN@example.test`, geboortedatum/in-dienst gestripped). Gebruik dit voor tests en lokale verificatie.

## Running tests

```bash
cd web
npm test -- rules
```

Verwacht: alle 8+ testcases pass tegen `sample.xlsx`.
