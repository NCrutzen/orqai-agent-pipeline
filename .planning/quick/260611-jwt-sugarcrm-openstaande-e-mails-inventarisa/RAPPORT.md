# Inventarisatie — open SugarCRM-e-mails & Outlook-locatie

> PRODUCTION -- SugarCRM (Cases-status, read-only) + Microsoft Graph (read-only)
> Quick task 260611-jwt · gegenereerd 2026-06-11 12:53 · mailbox `verkoop@smeba.nl`

## 1. Context

Na de cut-over werkt het verkoopteam volledig in Outlook (`verkoop@smeba.nl`); de oude Power Automate / SugarCRM-sweep is uit. Dit rapport inventariseert welke van de reeds-geïngeste SugarCRM-e-mails nog **open/onafgehandeld** staan en **waar** die mail fysiek in Outlook ligt — met nadruk op items in **"Sugar Archive"** en andere niet-Inbox-mappen, die onzichtbaar zijn voor het team.

**Open-definitie:** een SugarCRM-e-mail telt als *open* wanneer de gekoppelde Case (`parent_type=Cases`) NIET in een gesloten status staat. Gesloten = `closed`, `resolved`, `duplicate`, `rejected`, `cancelled`, `canceled` (case-insensitive). Alle andere statussen (New, In Progress, Pending …) tellen als open.

Filter toegepast op de bron: **geen (alle sugarcrm rows)**.

> **Verplaatsen is buiten scope.** Dit is een beslis-rapport; of/welke mail teruggezet moet worden is een aparte stap NA dit rapport.

## 2. Totalen

| Metric | Aantal |
| --- | ---: |
| SugarCRM-mails bekeken | 34725 |
| Open items | 28 |
| % open van totaal | 0.1% |
| → zichtbaar (Inbox) | 0 |
| → **onzichtbaar (niet-Inbox)** | 16 |
| → niet teruggevonden in Outlook | 12 |

_Match-budget: Trap A (exact, message-id) gratis; Trap B (fuzzy Graph `$search`) gebruikt 28/300. Items boven de cap zonder exact-hit vallen in "niet teruggevonden"._

## 3. Outlook-locatieverdeling (open items)

| Outlook-map | Bucket | Open items | Zichtbaarheid |
| --- | --- | ---: | --- |
| Sugar Archive | other | 15 | **onzichtbaar** |
| Sent Items | sent | 1 | **onzichtbaar** |
| _(niet teruggevonden)_ | — | 12 | n.v.t. |

> 🔴 **Hoofd-risico:** 15 open items staan in **"Sugar Archive"** (bucket `other`) — onzichtbaar voor het team dat in de Inbox werkt.

## 4. Ouderdom-verdeling

| Bucket (op received_at) | Alle open | Onzichtbare open |
| --- | ---: | ---: |
| <30d | 0 | 0 |
| 30-90d | 24 | 14 |
| 90-180d | 3 | 1 |
| 180-365d | 0 | 0 |
| >1jaar | 1 | 1 |

## 5. Concrete lijst — onzichtbare open items

Oudste eerst. Exact- en fuzzy-matches gescheiden (betrouwbaarheid niet vermengen).

### 5a. Exact-matches (message-id, zeker) — 0

_Geen._

### 5b. Fuzzy-matches (subject+datum, onzeker) — 16

| Datum | Subject | Afzender | Outlook-map |
| --- | --- | --- | --- |
| 2025-05-21 | [CASE:553434] RE: Offerte n.a.v. onderhoud SMEQ74930 / SMEQ74931 | esther.dokter-houtman@magnitglobal.com | Sent Items |
| 2026-03-12 | [CASE:730585] FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 Tango Ni | q8@contrall.nl | Sugar Archive |
| 2026-03-16 | [CASE:732661] offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | Sugar Archive |
| 2026-03-16 | FW: [CASE:730585] FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 Tang | Anja Hol | Sugar Archive |
| 2026-03-17 | Betreft: [CASE:730585] FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 | verkoop@smeba.nl | Sugar Archive |
| 2026-03-17 | Betreft: [CASE:730585] FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 | Theo Coenders | Sugar Archive |
| 2026-03-17 | RE: [CASE:730585] FW: Rapport n.a.v. werkzaamheden 1606686 op locatie 535098 - 202104 Tang | theo@smeba.nl | Sugar Archive |
| 2026-03-18 | [CASE:733950] FW: Herinnering offerte SB011037 n.a.v. bezoek monteur op locatie: 479182 -  | servicegroep76@klimaatservice.nl | Sugar Archive |
| 2026-03-23 | Betreft: [CASE:733950] FW: Herinnering offerte SB011037 n.a.v. bezoek monteur op locatie:  | Leny Smits | Sugar Archive |
| 2026-03-27 | Betreft: [CASE:732661] offertes AKD en Deloitte keuringen FY27 | Corrie Hakkert | Sugar Archive |
| 2026-03-27 | Automatisch antwoord: Betreft: [CASE:732661] offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | Sugar Archive |
| 2026-03-30 | FW: Betreft: [CASE:733950] FW: Herinnering offerte SB011037 n.a.v. bezoek monteur op locat | servicegroep76@klimaatservice.nl | Sugar Archive |
| 2026-03-30 | RE:Betreft: [CASE:732661] offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | Sugar Archive |
| 2026-03-31 | FW: Betreft: [CASE:732661] offertes AKD en Deloitte keuringen FY27 begrotingen voor 2027 | Corrie Hakkert | Sugar Archive |
| 2026-04-09 | RE:Betreft: [CASE:732661] offertes AKD en Deloitte keuringen FY27 | ovanbavel@deloitte.nl | Sugar Archive |
| 2026-04-15 | [CASE:749166] Aanvraag onderhoud TUe Brandbestrijdingsinstallaties | JOost@unica.nl | Sugar Archive |

## 6. Niet teruggevonden in Outlook — 12

Geen exact message-id-hit én geen fuzzy Graph-hit (of boven de fuzzy-cap). Mogelijke oorzaken: verwijderd, in een andere mailbox, of nooit naar Outlook gemigreerd. Toon eerste 200 (oudste eerst).

| Datum | Subject | Afzender |
| --- | --- | --- |
| 2026-03-06 | [CASE:727335] Beoordelen plattegronden / brandveiligheid nieuwe locaties | thomas@fyeo.nl |
| 2026-03-09 | [CASE:728187] Dagelijks overzicht PIT | no-reply@rbm-it.nl |
| 2026-03-13 | [CASE:731673] Offerte SB011308 n.a.v. bezoek monteur op locatie: 456121 - 634 Karwei Bouwmarkt Delfg | verkoop@smeba.nl |
| 2026-03-16 | [CASE:732683] Herinnering offerte SB010405 n.a.v. bezoek monteur op locatie: 454932 - 687 Gamma Bouw | verkoop@smeba.nl |
| 2026-03-16 | [CASE:732684] Herinnering offerte SB010405 n.a.v. bezoek monteur op locatie: 454932 - 687 Gamma Bouw | verkoop@smeba.nl |
| 2026-03-18 | Betreft: [CASE:727335] Beoordelen plattegronden / brandveiligheid nieuwe locaties | Melissa Van De Boogaart |
| 2026-03-27 | [CASE:739696] RFQ 2185719 POEDERBLUSSERS | Heidi.Peeters@rubix.com |
| 2026-03-30 | [CASE:741143] Herinnering offerte SB010405 n.a.v. bezoek monteur op locatie: 454932 - 687 Gamma Bouw | verkoop@smeba.nl |
| 2026-04-08 | [CASE:745823] Offerte SB012839 n.a.v. bezoek monteur op locatie: 479530 - 811 Gamma Bouwmarkt Gronin | verkoop@smeba.nl |
| 2026-04-10 | [CASE:747030] Herinnering offerte SB011308 n.a.v. bezoek monteur op locatie: 456121 - 634 Karwei Bou | verkoop@smeba.nl |
| 2026-04-13 | [CASE:747507] FW: Hobrand BV - Inkooporder INK124767 | orders@hobrand.nl |
| 2026-04-13 | FW: [CASE:747507] FW: Hobrand BV - Inkooporder INK124767 | Corrie Hakkert |

## 7. Beperkingen & vervolg

- **Match-betrouwbaarheid:** Trap A (exact message-id) is zeker. Trap B (fuzzy Graph `$search` op subject + datum ±1 dag) is een best-effort gok — verifieer fuzzy-rijen handmatig vóór actie.
- **Fuzzy-cap:** 300 (gebruikt 28). Verhoog met `--fuzzy-cap=<n>` voor volledige dekking (kost meer Graph-calls/tijd).
- **Gesloten-statussen:** `closed`, `resolved`, `duplicate`, `rejected`, `cancelled`, `canceled`. Controleer of Sugar nog andere eindstatussen kent die hier ontbreken.
- **Verplaatsen blijft buiten scope** — dit rapport beslist NIET; het levert de feiten voor een aparte terugzet-beslissing.

---

## ⚠️ ADDENDUM (2026-06-11, later die dag) — oorspronkelijke telling ACHTERHAALD

Operator-signaal "het team had het over ~100" klopte. Her-verificatie rechtstreeks tegen Sugar (Cases als source of truth i.p.v. onze e-mail-snapshot) wees twee fouten in §2 aan:

1. **Onze Sugar-mailkopie loopt maar t/m 2026-05-06** — de laatste ±5 weken (precies waar open werk zich ophoopt) ontbraken volledig. Vandaar ook "0 items <30 dagen" in §4: een afkap-artefact, geen werkelijkheid.
2. **De gesloten-lijst miste Sugar's status `AutoClosed`** (13.010 cases groep-breed).

### Gecorrigeerde cijfers (bron: Sugar Cases, live 2026-06-11)

| Wat | Aantal |
| --- | ---: |
| Actief in behandeling, hele groep (In Progress + Pending*) | 1.734 |
| → waarvan team **Smeba Brandbeveiliging BV** | **12** |
| Onaangeraakt ("New", auto-aangemaakt per inkomende mail), Smeba/NL-teams | **2.067** |
| → waarvan aangemaakt mei 2026 | 630 |
| → waarvan aangemaakt juni 2026 (t/m 10 juni!) | 267 |
| (oude bulk-clusters 2023-10 / 2024-08/09, vermoedelijk import-artefacten) | ±1.128 |

### Twee nieuwe bevindingen die om actie vragen

1. **Sugar maakt NOG STEEDS cases aan** — de meest recente "New" cases dateren van gisteren (10 juni). De inbound-mailkoppeling van Sugar draait dus nog, terwijl niemand er meer naar kijkt. → IT-vraag: connector uitzetten als onderdeel van de cut-over.
2. **De échte terugzet-vraag is de mei-lichting (±630 mails):** in mei was de Power Automate-sweep nog actief, dus die mails zijn vrijwel zeker van de Outlook-Inbox naar "Sugar Archive" geveegd — onzichtbaar voor het team. De juni-mails (267) staan vermoedelijk gewoon in de Inbox (sweep was toen uit). Een her-run van de locatie-match op déze populatie (Sugar als bron, niet de DB-snapshot) geeft de definitieve terugzet-lijst.

**Conclusie §2-§6 hierboven is daarmee vervangen**; de "28 open / 16 onzichtbaar" gold alleen binnen de verouderde snapshot. De methodiek (twee-traps Outlook-match) blijft bruikbaar voor de her-run.
