# Routing Swarm Go-Live — Milestone Charter (proposal)

> **Status:** voorstel (data-gedreven brainstorm-output, nog niet ge-GSD'd). Concept ter review.
> **Datum:** 2026-06-16
> **Auteur-context:** geschreven na een live data-analyse op de pipeline (zie §2). Vervolg op de "wat na V9.5?"-afweging tussen *routing-swarm* en *draft-reply-handlers*.
> **Aanbeveling:** routing eerst (lager risico, ~10× schoner adresseerbaar volume, zichtbaarder voor medewerkers), draft-reply-handlers daarna en smal (1 intent).

---

## 1. Kernthese

Bouw de **routing-laag** van de canonieke funnel uit: na Stage 0/1 (safety + noise) classificeert een Stage-3 *router* elke actionable mail op **bestemming** (afdeling/mailbox) en stuurt 'm daarheen door — i.p.v. een mens die info@/verkoop@ met de hand sorteert. Medewerkers sturen via **natural language** wélke mail (inhoud, onderwerp, afzender) naar wie moet; die regels worden registry-data, geen code.

Dit is **geen** klant-gerichte content-generatie (dat is de draft-reply-track). Routing is intern doorsturen — omkeerbaar, laag risico, direct zichtbaar.

## 2. Datafundament (live gemeten, 30 dagen, 2026-06-16)

**Volume per mailbox (inbound/30d):**

| Mailbox | Swarm | Inbound | Huidige automatisering |
|---|---|---|---|
| info@smeba.nl | info-routing 🟢 | 1.073 | alleen noise-archief (Stage 0/1) |
| verkoop@smeba.nl | sales-email 🟢 | 944 | Stage 0-3, geen order-routing |
| debiteuren@smeba.nl | debtor-email 🟢 | 497 | volledige funnel |
| administratie@fire-control.nl | debtor-email 🟢 | 316 | volledige funnel |
| debiteuren@smeba-fire.be | debtor-email 🟢 | 297 | volledige funnel |
| debiteuren@berki.nl | debtor-email 🟢 | 259 | volledige funnel |
| info@fire-control.nl | info-routing 🟢 | 219 | alleen noise-archief |

**info-routing funnel (30d):** 1.238 in → Stage 1: 473 spam + 28 payment_admittance (geno-archiveerd, 359 stage-4 auto_archived_noise) → **663 "unknown"** = de pool die nu 100% handmatig wordt getrieerd, zonder Stage 2/3 (de swarm-rij heeft `stage2_entity_resolver=null`, `stage3_coordinator_agent_key=null`).

**Twee harde bevindingen uit een 120-sample van de "unknown"-pool:**

1. **~50% is latent noise** dat Stage 1 niet vangt: koude SEO/sales-spam, nieuwsbrieven, auto-dealer-spam, sollicitaties (firemail.de), survey-invites. → de info@ noise-filter is onder-getuned; dit is zowel een makkelijke aparte win als een randvoorwaarde voor schone routing.
2. **De echte routeerbare mail (~300/mnd) valt in 6-7 eindige bestemmingen** — geen long tail:

| Bestemming | Signaal-voorbeelden | Volume |
|---|---|---|
| **Verkoop** (offerte/bestelling) | "offerteaanvraag brandslanghaspels", "order blussers", "brandblusser bestellen" | hoog |
| **Order-entry / inkoop** (klant-PO's) | "inkooporder 4502095378", "inkooporder INK0082833", cargill PO | midden |
| **Fire-Control inspecties** | "ontruimingsplattegronden" ×3, "brandveiligheidsonderzoek", "storing brandhaspel", "droge stijgleidingen" | hoog (vooral fire-control.nl) |
| **Opleidingen / BHV** | "BHV herhaling", "inschrijving herhaling BHV", "online cursus" | midden |
| **Debiteuren / facturen** | "vraag over factuur", "retour factuur" ×5, "digitale aanmaning", "openstaande postenlijst" | midden |
| **Algemeen / contactformulier** | "Inzending contactformulier smeba.nl" | laag |
| **Aanbestedingen** | "County Council opportunity", "overheidsopdracht" | laag |

**verkoop@ → order@ (jouw tweede geval):** binnen sales is de order-overdracht het signaal `quote_acceptance` (9/mnd) + `order_status` (6/mnd) + een deel van `service_request` (23/mnd) → door naar order@smeba.nl. Kleiner volume, maar hoge waarde (concrete orderintake).

**Geverifieerde doelmailboxen (2026-06-16) — bestaan écht (versturen actief = levende afdelings-mailboxen):**

| Routing-bucket | Doelmailbox (bevestigd actief) | Bewijs (verzonden/60d) |
|---|---|---|
| Order-entry / PO's | `order@smeba.nl` · `order@fire-control.nl` · `order@berki.nl` | order@smeba: 636 verzonden / 2.413 ontvangen — grootste afdelingsmailbox |
| Verkoop / offerte | `verkoop@smeba.nl` · `verkoop@fire-control.nl` · `verkoop@berki.nl` | alle drie versturen actief (155/136/57) |
| Inspecties / keuringen inplannen | `planning@smeba.nl` | 147 |
| Storingen | `storing.smeba@smeba.nl` | 28 (matcht "storing brandhaspel") |
| Opleidingen / BHV | `opleidingen@fire-control.nl` | 16 (matcht "BHV herhaling") |
| Debiteuren (klant↔onze facturen) | `debiteuren@smeba.nl` / `-fire.be` / `berki.nl` | bestaande debtor-swarm |
| Crediteuren (leverancier factureert óns) | `crediteuren@smeba.nl` | 45 |
| Sollicitaties | `hrm@smeba.nl` | 24 (matcht firemail.de "Initiativbewerbung") |

Twee implicaties:
- **order@smeba.nl wordt al apart geïngest** (2.413 "incoming") maar nog niet pipeline-verwerkt — de data ligt er al voor verkoop→order verificatie.
- **De router moet brand-aware zijn**: info@smeba.nl ontvangt fire-control-inspectiemail (mankr8, pietervanforeest) die naar de *fire-control* mailboxen moet, niet smeba. Sluit aan op de bestaande `scope_key`/brand-logica (env_id='BX' blijft hard filter).

## 3. Waarom routing vóór draft-replies

| As | Routing-swarm | Draft-reply-handlers |
|---|---|---|
| Schoon adresseerbaar volume/mnd | ~300 (info@) + ~30 (verkoop→order) | ~65 (copy_document_request 36 + address_change 28) |
| Risico | laag — intern forward, omkeerbaar, geen klant-content | hoog — klant-gerichte tekst, compliance (dunning) |
| Zichtbaarheid medewerkers | hoog — mail landt in hún inbox | medium — concepten in review-queue |
| Substraat gereed | Stage 0/1 + ingest draaien al | invoice-copy handler bestaat deels |
| NL-config ("medewerkers sturen zelf") | kernfeature | n.v.t. |
| Afhankelijk van V9.5 (resolver) | **nee** (geen Stage 2 nodig) | deels |

Draft-replies blijven de logische **tweede** stap — start dan met **precies één intent** (`copy_document_request`, factuurkopie): veilig, repetitief, handler bestaat al deels.

## 4. Scope

**In scope:**
- **Stage 1 noise-recalibratie voor info@** — nieuwe regex/LLM-noise-rules tegen de ~50% leaking noise (cold-sales, nieuwsbrieven, auto-spam, sollicitaties, surveys), via de bestaande `classifier_rules` + Wilson-CI shadow→promote gate.
- **Stage 3 router-agent voor info-routing** — nieuwe Orq-agent (`info-routing-coordinator`) die op bestemming classificeert i.p.v. op intent; `swarm_intents`-achtige bestemmings-registry. **Geen Stage 2** (routing heeft geen klant-resolutie nodig).
- **Forward-side-effect (Stage 4)** — Outlook-forward naar de doelmailbox via de bestaande Graph-integratie; idempotent; dry-run-gated; categorie-stempel terug op de bron (V10 ambient-signaal).
- **Natural-language routing-config UI** — medewerker typt "facturen en aanmaningen → debiteuren@; offerteaanvragen → verkoop@"; LLM zet dit om naar registry-routing-rules (sender/subject/content-predikaten → bestemming). Mens keurt goed vóór live.
- **verkoop@ → order@ routing** — `quote_acceptance`/`order_status` → forward naar order@smeba.nl als eerste cross-mailbox sales-routing.
- **Bulk Review surface** voor info-routing (hergebruik stage-keyed shell) zodat routing te volgen/corrigeren is.

**Out of scope:**
- Draft-reply-generatie (aparte track, na deze milestone).
- Klant-resolutie (Stage 2) voor info-routing.
- De 4 dormante info@-mailboxen (smeba-fire.be, berki.nl, sicli-noord/sud.be) — aanzetten = `info_routing_mailbox_settings`-rij flippen zodra smeba+fire-control bewezen zijn (registry-INSERT, geen code).

## 5. Architectuur (registry-driven, SWARM-02-conform)

- info-routing is al een geregistreerde swarm op de canonieke funnel. Deze milestone vult de Stage-3/4 shell: `stage3_coordinator_agent_key` + een bestemmings-registry + een forward-`side_effects`-rij.
- **Nul `if swarm_type==='info-routing'`-branches.** Bestemmingen, routing-regels en de NL-afgeleide regels zijn registry-data. Een nieuwe mailbox/bestemming = INSERT.
- Sluit aan op het **V10 ambient-kanaal**: de teruggeschreven Outlook-categorie + een weggeklikte/verplaatste mail = `correction_event` → de leer-loop tuned routing-regels. Routing is daarmee de eerste concrete consument van de V10-spine.
- Verhouding tot bestaande milestones: dit is de uitwerking van **SEED-001** (info@smeba routing swarm, v8.0 dormant seed) + de **spike-findings Phase 88** blueprint (registry-driven Stage-1 noise + cross-swarm transferability). Het deelt geen kritisch pad met V9.5 (resolver-correctheid).

## 6. Succescriteria

- ≥ X% van de info@ actionable mail bereikt een Stage-3 bestemmings-verdict en wordt geforward zonder mens (target TBD; huidige baseline = 0% via routing).
- info@ noise-recall stijgt: het "unknown"-aandeel dat eigenlijk noise is daalt van ~50% → < 20% na recalibratie.
- Forward-precisie ≥ Y% (verkeerde-afdeling-rate gemeten op operator-correcties); een verkeerde forward is omkeerbaar maar moet zeldzaam.
- Medewerker kan een nieuwe routing-regel via NL toevoegen en die is binnen 1 review-klik live (geen deploy).
- verkoop@ → order@ routing live voor `quote_acceptance`/`order_status`.
- Zero `if swarm_type==='…'`-branches (SWARM-02 houdt).

## 7. Open vragen (gate planning, blokkeren definitie niet)

1. ~~**Bestemmings-taxonomie bevriezen** — kloppen de doelmailboxen?~~ **OPGELOST 2026-06-16** — doelmailboxen geverifieerd uit de data (zie tabel in §2). Resterende operator-check: is er een aparte aanbestedingen-bestemming, en gaat fire-control-planning via `planning@smeba.nl` of een eigen fire-control-mailbox?
2. **Forward-mechaniek** — echte Outlook-forward (mail verlaat info@) vs. categorie+verplaatsen-naar-map vs. een gedeelde-mailbox-toewijzing? Raakt hoe "zichtbaar" het voor de ontvangende afdeling is.
3. **Noise-recalibratie als aparte quick-win vooraf?** — de ~50% leak is los te trekken en levert direct rust in info@; kan vóór de router landen.
4. **NL-config-eigenaarschap** — wie mag routing-regels toevoegen/goedkeuren (supervisor vs. afdeling zelf)? Raakt CODEOWNERS-achtige governance.

## 8. Voorgestelde fasering

| Fase | Inhoud |
|---|---|
| **P0 · Noise-recalibratie info@** | mine de "unknown"-pool, registreer nieuwe noise-rules, shadow→promote — schoont de denominator |
| **P1 · Bestemmings-taxonomie + router-agent** | bevries buckets + doelmailboxen; Orq `info-routing-coordinator`; bestemmings-registry |
| **P2 · Forward-side-effect + Bulk Review** | Stage-4 forward (dry-run → live), categorie-stempel, info-routing Bulk Review-surface |
| **P3 · NL-routing-config** | medewerker-UI → LLM → routing-rules (mens-goedgekeurd); verkoop@ → order@ als eerste sales-routing |
| **P4 · Ambient-loop-koppeling** | weggeklikte/verplaatste mail → `correction_event` → V10-spine tuned routing |

Kritisch pad: **P0 → P1 → P2**. P3 verbreedt (de NL-config + sales-routing); P4 koppelt aan de leer-loop.
