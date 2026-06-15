---
phase: quick-260611-jwt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - web/scripts/sugar-open-items-report.ts
  - .planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md
autonomous: false
requirements: [INVENTARIS-01]
user_setup:
  - service: sugarcrm
    why: "Live read-only Cases-status lookup — een Sugar e-mail is 'open/onafgehandeld' als de gekoppelde Case nog open staat; die status zit NIET in de reeds-geïngeste email raw_json"
    env_vars:
      - name: SUGARCRM_URL
        source: "Sugar instance base URL (productie). Credential-row in Supabase `credentials` (name ilike '%sugar%', environment production) OF tijdelijk in web/.env.local"
      - name: SUGARCRM_USERNAME
        source: "Sugar service-account gebruikersnaam (read-only volstaat)"
      - name: SUGARCRM_PASSWORD
        source: "Sugar service-account wachtwoord"

must_haves:
  truths:
    - "Operator Nick weet hoeveel Sugar-e-mailitems nog open/onafgehandeld staan (via open linked Cases)"
    - "Operator ziet de Outlook-locatieverdeling van die open items (Inbox=zichtbaar vs Sugar Archive/overig=onzichtbaar vs niet-gevonden)"
    - "Operator ziet de ouderdom-verdeling van de open items (buckets op date_sent)"
    - "Operator krijgt een concrete lijst van de 'onzichtbare' items met subject, afzender, datum, Outlook-locatie"
    - "Fuzzy/onzekere matches staan apart benoemd, niet vermengd met zekere matches"
  artifacts:
    - path: "web/scripts/sugar-open-items-report.ts"
      provides: "Read-only npx tsx analyse-script (dry-run default, --apply schrijft RAPPORT.md)"
      min_lines: 120
    - path: ".planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md"
      provides: "Het gegenereerde inventarisatie-rapport voor operator Nick"
  key_links:
    - from: "web/scripts/sugar-open-items-report.ts"
      to: "email_pipeline.emails (source=sugarcrm)"
      via: "Supabase REST select op reeds-geïngeste rows"
      pattern: "source.*sugarcrm"
    - from: "web/scripts/sugar-open-items-report.ts"
      to: "Sugar Cases module"
      via: "live read-only REST lookup per distinct parent_id"
      pattern: "/Cases"
    - from: "web/scripts/sugar-open-items-report.ts"
      to: "verkoop@smeba.nl Outlook folders"
      via: "internet_message_id-match tegen outlook-rows + graphFetch parentFolderId fallback"
      pattern: "internetMessageId|parentFolderId"
---

<objective>
Inventariseer welke SugarCRM-e-mailitems na de Outlook cut-over nog open/onafgehandeld
staan, en waar de bijbehorende mail in `verkoop@smeba.nl` fysiek staat — met name de
items die in "Sugar Archive" of andere niet-Inbox-mappen zijn beland (onzichtbaar voor
het team dat nu volledig in Outlook werkt).

Purpose: operator Nick een beslis-rapport geven OF mail teruggezet moet worden. Het
verplaatsen zelf is EXPLICIET buiten scope (aparte beslissing ná dit rapport).
Output: een read-only `npx tsx` script + het gegenereerde `RAPPORT.md`.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md

<discovered_facts>
Tijdens planning geverifieerd tegen de live Supabase (read-only) — gebruik deze
feiten direct, niet opnieuw exploreren:

1. **Reeds geïngeste data is de primaire bron — GEEN nieuwe Sugar-sweep nodig voor de e-mails zelf.**
   - `email_pipeline.emails` bevat **34.725** rows met `source='sugarcrm'` (volledige
     `raw_json` per row) en **87.185** rows met `source='outlook'`.
   - Query-auth lokaal: `web/.env.local` → `NEXT_PUBLIC_SUPABASE_URL` +
     `SUPABASE_SERVICE_ROLE_KEY` (waarden kunnen double-quoted zijn — strip quotes;
     er is GEEN `SUPABASE_URL` var). Schema-header: `Accept-Profile: email_pipeline`.

2. **"Open/onafgehandeld" zit NIET in de email raw_json.** Élke Sugar-email heeft
   `state="Archived"` (Sugar archiveert alles) en `status` is "unread"/"sent" — geen
   open-signaal. `flagged` is in de steekproef altijd `false`. Het echte open-signaal is
   de **gekoppelde Case**: `raw_json.parent_type="Cases"` + `raw_json.parent_id`
   (~99% van de rows hangt aan een Case; een enkele aan Accounts). Een Sugar-e-mail telt
   als "open" wanneer de gekoppelde **Case nog open staat**. → Vereist een **live
   read-only lookup op de Sugar `Cases`-module** per distinct `parent_id`. Dit is de
   reden voor de Sugar-credential-checkpoint (Task 1).

3. **Geen Sugar-credentials aanwezig.** `credentials` tabel heeft GEEN row matchend
   `%sugar%`; `web/.env.local` heeft geen `SUGARCRM_*` vars. De geretireerde fetcher
   (`git show 55f7e79e:web/lib/automations/sales-email-analyzer/src/fetch-sugarcrm-emails.ts`)
   authenticeerde via `POST {SUGARCRM_URL}/rest/v11_0/oauth2/token` (grant_type=password,
   client_id="sugar"), daarna `OAuth-Token` header. Hergebruik dit auth-patroon voor de
   `Cases`-lookup. Sugar = productie-only → PRODUCTION-banner in script-output, read-only.

4. **Outlook-locatie komt van Graph, niet uit de DB.** Outlook-rows bewaren wél
   `raw_json.internetMessageId` maar GEEN map-referentie. `outlook_folder_map` (mailbox
   `verkoop@smeba.nl`) bevat de relevante mappen incl. de risico-map **"Sugar Archive"**
   (bucket `other`), `Inbox` (bucket `inbox`), `Archive` (bucket `archive`), `Sent Items`
   (bucket `sent`) en talloze `afgehandeld`-jaarmappen. Zichtbaarheidsregel: bucket
   `inbox` = ZICHTBAAR; al het andere (incl. "Sugar Archive") = ONZICHTBAAR voor het team.

5. **Match-strategie Sugar→Outlook (twee-traps, betrouwbaarheid apart rapporteren):**
   - **Trap A (zeker, DB-only, gratis):** match op `internet_message_id`. Sugar-row heeft
     `raw_json.message_id` → genormaliseerd matchen tegen outlook-row
     `raw_json.internetMessageId` (let op `<...>`-haken / case). Dit geeft direct de
     outlook `source_id` (= Graph message id) waarmee je `parentFolderId` ophaalt.
   - **Trap B (fuzzy, fallback):** voor Sugar-items zonder message_id-hit → Graph
     `$search`/`$filter` op de mailbox op subject + afzender + datum (±dag). Markeer als
     `match_confidence='fuzzy'`.
   - **Niet gevonden:** geen DB-hit én geen Graph-hit → aparte categorie "nergens gevonden".

6. **Outlook-toegang lokaal bewezen** via `graphFetch` in `web/lib/outlook/client.ts`
   (Zapier SDK keychain). Voor de map van een message:
   `GET /users/verkoop@smeba.nl/messages/{id}?$select=parentFolderId,internetMessageId,subject`
   → `parentFolderId` → join tegen `outlook_folder_map.folder_id`.
</discovered_facts>

<interfaces>
From web/lib/outlook/client.ts:
```typescript
export async function graphFetch(
  path: string,
  options?: { method: string; body?: unknown; prefer?: string },
): Promise<Response>;
```

From web/scripts/bootstrap-behavior-folders.ts (dotenv + admin-client + dry-run patroon — kopieer dit):
```typescript
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(__dirname, "..", ".env.local") });
import { createClient } from "@supabase/supabase-js";
const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g, "");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g, "");
const admin = createClient(url, key); // .schema("email_pipeline") voor emails-tabel
const apply = process.argv.includes("--apply");
```

Geretireerde Sugar-auth (uit git 55f7e79e) — hergebruiken voor Cases-lookup:
```
POST {SUGARCRM_URL}/rest/v11_0/oauth2/token  body: {grant_type:"password", client_id:"sugar", client_secret:"", username, password, platform:"base"}
GET/POST {SUGARCRM_URL}/rest/v11_0/Cases/filter  header: OAuth-Token: <token>
```
</interfaces>
</context>

<tasks>

<task type="checkpoint:human-action" gate="blocking">
  <name>Task 1: Sugar read-only credentials beschikbaar maken</name>
  <decision>Het script heeft live read-only toegang tot de Sugar `Cases`-module nodig om "open/onafgehandeld" te bepalen — die status zit niet in de reeds-geïngeste e-maildata.</decision>
  <context>
    Er bestaat momenteel GEEN Sugar-credential (geen row in `credentials` matchend
    `%sugar%`, geen `SUGARCRM_*` env var). Zonder Case-status kan het script alleen de
    Outlook-locatie + ouderdom rapporteren, NIET het open/dicht-onderscheid — dat is de
    kern van de vraag. Sugar is productie-only → read-only service-account volstaat
    (alleen `Cases.filter` GET-achtige reads).
  </context>
  <how-to-verify>
    Operator levert één van twee opties:
    1. Een row in Supabase `credentials` (name bevat "sugar", environment `production`,
       status `active`) met username/password + de base-URL, OF
    2. Tijdelijk in `web/.env.local`: `SUGARCRM_URL`, `SUGARCRM_USERNAME`, `SUGARCRM_PASSWORD`.
    Daarna verifieert de executor met een enkele read-only token-call:
    `POST {SUGARCRM_URL}/rest/v11_0/oauth2/token` → HTTP 200 + access_token.
  </how-to-verify>
  <resume-signal>Type "sugar-ready" zodra credentials geplaatst zijn (of "skip-sugar" om alleen de Outlook-locatie+ouderdom te rapporteren zonder open/dicht-onderscheid)</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Read-only analyse-script — open Sugar-items + Outlook-locatie matchen</name>
  <files>web/scripts/sugar-open-items-report.ts</files>
  <action>
    Bouw een `npx tsx`-script (dry-run default; `--apply` schrijft het rapport in Task 3)
    dat het bootstrap-behavior-folders.ts dotenv/admin-client-patroon kopieert. Print
    BOVENAAN een `PRODUCTION -- SugarCRM (Cases-status, read-only) -- Actie: inventarisatie`
    banner (CLAUDE.md productie-regel). Read-only: NOOIT writes naar Sugar, Outlook of
    productie-tabellen.

    Pipeline:
    1. **Laad Sugar-mails** uit `email_pipeline.emails` waar `source='sugarcrm'` (paginate
       over alle ~34.7k; selecteer `source_id, subject, received_at, sender_name,
       internet_message_id, raw_json`). Filter desgewenst op verkoop-relevante team
       (raw_json.team_name bevat "Smeba"/"Brandbeveiliging") — rapporteer het toegepaste
       filter.
    2. **Bepaal open items via gekoppelde Case.** Verzamel distinct `raw_json.parent_id`
       waar `raw_json.parent_type='Cases'`. Doe per distinct parent_id (gebatcht, bv.
       `Cases/filter` met `id $in`) een live read-only lookup en lees de Case-status.
       Behandel een Sugar-mail als OPEN wanneer de gekoppelde Case NIET in een gesloten
       status staat (closed/resolved/duplicate — bevestig de exacte gesloten-waarden uit
       de eerste Cases-respons en log de aangetroffen status-enumeratie). Bij `skip-sugar`
       (Task 1): sla deze stap over en markeer ALLE items als `open_status='unknown'` +
       zet dat expliciet bovenaan het rapport als beperking.
    3. **Match elke open Sugar-mail → Outlook-locatie (twee-traps):**
       - Trap A (`match_confidence='exact'`): normaliseer `internet_message_id` (strip
         `<>`, lowercase) en match tegen outlook-rows `raw_json.internetMessageId`. Laad de
         outlook-rows één keer in een Map(normId → {source_id, mailbox}). Voor elke hit:
         `graphFetch('/users/verkoop@smeba.nl/messages/{source_id}?$select=parentFolderId,subject,internetMessageId')`
         → `parentFolderId` → join tegen `outlook_folder_map` (mailbox verkoop@smeba.nl)
         voor `display_name`+`bucket`.
       - Trap B (`match_confidence='fuzzy'`): geen message_id-hit → `graphFetch` met
         `$search="subject:..."` of `$filter` op subject+ontvangstdatum (±1 dag) binnen de
         verkoop-mailbox; eerste plausibele hit → parentFolderId → folder. Markeer fuzzy.
       - Geen enkele hit → categorie `not_found`.
    4. **Classificeer zichtbaarheid:** bucket `inbox` = `visible`; elke andere map (incl.
       "Sugar Archive", Archive, afgehandeld-jaren, Sent, Deleted) = `invisible`;
       `not_found` apart.
    5. Houd robuuste Graph-throttling aan (kleine delay tussen calls, retry leunt al op
       graphFetch). Cache parentFolderId→folder-resolutie. Bouw een in-memory resultaat-
       array `{source_id, subject, sender, received_at, open_status, outlook_folder,
       bucket, visibility, match_confidence}` die Task 3 aggregeert.

    Verboden: code-fences in actie zijn dit; in het script zelf is implementatie prima.
    NOOIT message moves of property-writes via Graph.
  </action>
  <verify>
    <automated>cd web && npx tsx scripts/sugar-open-items-report.ts 2>&1 | grep -E "PRODUCTION -- SugarCRM|sugarcrm rows|open items|Trap A|exact|fuzzy|not_found" | head -20</automated>
  </verify>
  <done>Script draait read-only, print de PRODUCTION-banner, laadt de ~34.7k sugar-rows, bepaalt open-status per Case (of markeert unknown bij skip-sugar), en classificeert elke open mail naar Outlook-map + zichtbaarheid + match-confidence. Geen writes uitgevoerd.</done>
</task>

<task type="auto">
  <name>Task 3: Rapport genereren (RAPPORT.md) en --apply afronden</name>
  <files>web/scripts/sugar-open-items-report.ts, .planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md</files>
  <action>
    Voeg aan het script een rapport-renderer toe die bij `--apply` `RAPPORT.md` in de
    quick-task dir schrijft (dry-run zonder `--apply`: print samenvatting naar stdout,
    schrijf niets). Rapport-secties:

    1. **Kop + context** — datum, mailbox `verkoop@smeba.nl`, cut-over-context (Power
       Automate sweep uit, team werkt in Outlook), en de open-definitie ("open = gekoppelde
       Case nog open"; bij skip-sugar: expliciete beperking dat open-status onbekend is).
    2. **Totalen** — totaal Sugar-mails bekeken, totaal OPEN items, % van geheel.
    3. **Outlook-locatieverdeling** — tabel: map (display_name) → aantal open items →
       bucket → zichtbaar/onzichtbaar. Bovenaan de samenvatting: `visible` vs `invisible`
       vs `not_found` counts. Benoem "Sugar Archive" expliciet als het hoofd-risico als het
       voorkomt.
    4. **Ouderdom-verdeling** — buckets op `received_at`: <30d, 30-90d, 90-180d, 180-365d,
       >1jaar. Apart voor de invisible-groep (dat zijn de zorgwekkende).
    5. **Concrete lijst onzichtbare items** — tabel: subject | afzender | datum |
       Outlook-map | match_confidence. Sorteer oudste eerst. Splits exact-matches en
       fuzzy-matches in twee sub-tabellen (betrouwbaarheid niet vermengen).
    6. **Niet-gevonden items** — aparte tabel (subject/afzender/datum) + één zin waarom
       (mogelijk verwijderd, andere mailbox, of nooit naar Outlook gemigreerd).
    7. **Beperkingen & vervolg** — match-betrouwbaarheid eerlijk benoemen; expliciete regel
       dat verplaatsen/terugzetten BUITEN scope is (aparte beslissing ná dit rapport).

    Draai `--apply` om RAPPORT.md daadwerkelijk te genereren. (Bij skip-sugar levert het
    rapport nog steeds locatie+ouderdom; de open/dicht-kolom staat op "onbekend".)
  </action>
  <verify>
    <automated>cd web && npx tsx scripts/sugar-open-items-report.ts --apply >/dev/null 2>&1; grep -cE "^## |Outlook-locatie|Ouderdom|Onzichtbare|Sugar Archive|Beperkingen" /Volumes/Developer/agent-workforce/.planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/RAPPORT.md</automated>
  </verify>
  <done>RAPPORT.md bestaat in de quick-task dir met alle 7 secties, een locatieverdeling-tabel die "Sugar Archive"/invisible items benoemt, een ouderdom-verdeling, een concrete onzichtbare-items-lijst (exact + fuzzy gesplitst), een niet-gevonden-lijst, en een expliciete out-of-scope-noot over verplaatsen. Geen mailbox-/Sugar-/prod-table-writes.</done>
</task>

</tasks>

<verification>
- Script is read-only: geen Graph message-writes/moves, geen Sugar writes, geen
  INSERT/UPDATE op productie-tabellen. `grep -nE "PATCH|POST.*messages.*move|\.update\(|\.insert\(|\.upsert\(" web/scripts/sugar-open-items-report.ts` levert geen mailbox-/prod-write op (Sugar token-POST + Cases-filter-POST zijn reads en toegestaan).
- PRODUCTION-banner aanwezig in script-output (CLAUDE.md productie-regel).
- RAPPORT.md gegenereerd in `.planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/`.
- "Sugar Archive" + andere niet-Inbox-mappen als onzichtbaar geclassificeerd; Inbox als zichtbaar.
- Fuzzy matches expliciet apart van exact matches gerapporteerd.
</verification>

<success_criteria>
Operator Nick heeft een RAPPORT.md met: totaal open Sugar-items, Outlook-locatieverdeling
(zichtbaar/onzichtbaar/niet-gevonden), ouderdom-verdeling, en een concrete lijst van de
onzichtbare items (subject/afzender/datum/map) met exact- en fuzzy-matches gescheiden —
genoeg om te beslissen of/welke mail teruggezet moet worden. Verplaatsen blijft buiten scope.
</success_criteria>

<output>
Create `.planning/quick/260611-jwt-sugarcrm-openstaande-e-mails-inventarisa/260611-jwt-SUMMARY.md` when done.
</output>
