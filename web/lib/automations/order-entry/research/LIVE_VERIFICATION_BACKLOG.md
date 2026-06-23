# Live-verificatie-backlog — Koens voorwerk getoetst aan live bronnen

**Datum:** 2026-06-23 · **Opsteller:** Claude (deep-dive over de hele `order-entry/research/`-set)
**Waarom:** werkregel "Koens commits = provisional until live-verified" ([[source-trust-cto-vs-koen]]).
De Ans-ronde (`ANS_VERIFICATIE_RESOLVED_2026-06-02.md`) heeft de domein-ambiguïteit opgelost en
leverde **harde, toetsbare feiten** op (klantnummers, artikelnummers, order-types, tarieven). Dit doc
zet die feiten om in een **uitvoerbare checklist tegen de levende systemen**, geordend naar bereikbare
bron en geprioriteerd op leverage. Het is bedoeld als de executie-spec vóór een V10.5-fase wordt
gepland — de validatielaag boven de spikes 012–016.

**Bronnen geharvest:** `OrderEntry_AI_Enablement_v1.1.md`, `KLAPPER_DIGITAAL_v0.1.md`, `REVIEW_v0.5.md`,
`NIEUWE_CLAIMS_ORDERENTRY.md`, `NXT_CLAIMS_MATRIX.md`, `BIJLAGE_B_NXT_Handleiding_v1.0_oude_bron.md`,
`Te_verifieren_met_Ans_v1.0 (002).docx` (Ans ingevuld), `Standaard assortiment VBT…docx`,
Gwenda-set (cheatsheet/werkdoc/SOP-19/leeswijzer).

---

## §0. Al live-bevestigd (2026-06-23, Supabase `mvqjhlxfvtqqubqgdvhz`, read-only)

Down-payment die ik nu al kon draaien tegen `email_pipeline.emails` + `public.swarm_intents`:

| Claim | Live-resultaat | Verdict |
|---|---|---|
| Order-mailbox `order@smeba.nl` / `order@fire-control.nl` / `order@berki.nl` actief | 30.469 / 2.980 / 137 incoming | ✅ multi-brand NL/FI/BB live |
| `order@smeba-fire.be` "actief" (Ans §8.2) | **0 rijen** in corpus (wél 1.314 `@smeba-fire.be`-afzenders) | ⚠️ mailbox bestaat als domein, **order-inbox niet geïngest** |
| `Storing.Smeba@smeba.nl` (AED, handleiding B9b) | 0 rijen | ⚠️ onbevestigd / niet geïngest |
| Ans-correctie "`elger@` i.p.v. `eger@`" (§8.2) | `elger@` = 607, `eger@` = 0 | ✅ correctie hard bevestigd |
| AED-Keurmerk `aedkeurmerkinstituut.nl` | 76 afzender-mails | ✅ correspondentie live |
| SOP-19 batch-mail subject "ordernummers opvragen" | 3 hits | ✅ batch-flow bestaat |
| `stefaniejanssen@emrode.com` (Emrode tekenpartij) | 1 | ✅ (laag volume) |
| sales-email intents incl. `quote_acceptance` | 13 rijen, **alle `handler_status=placeholder`** | ✅ (zie spike 015) |

### §0b. Klantnummer-batch live getoetst (NXT-resolver `resolver_customer` via Zapier-SQL)

31 nummers uit de harvest gecheckt op bestaan + `environment_id` + `brand_id` + `status` + `postcode`.

- **✅ 28/31 bestaan, juist merk, postcode bevestigt identiteit onafhankelijk:** Defensie-cluster
  (481523 + 213031/213367/415950/418930/420872/518739 @ Utrecht 3509 AA/AB; 519613 @ 3170 AA);
  Dirk 454413 / Deka 454170 / Detail Result 453362/491530/494943 — **allen Venray 5800 AJ** (= Dirk
  factuuradres Postbus 395 5800 AJ Venray, SOP-20); Jumbo NL 473608/530418 (Veghel 5462 CE), 523450
  (5460 AA); Plus 540576/532391 (Utrecht 3508 AK); ASML/Equans 531242 (Bunnik 3980 CA); Gasunie 540842
  (Groningen 9727 KC); STB Eindhoven 529735 (5602 LS); Lidl-indexed 524141; Jumbo BE 530964/526938 (merk **SF**).
- **⚠️ Jumbo BE "vervallen" 530984 + 540649 zijn nog ACTIVE (SF)** — geen supersession-link naar de
  actuele nrs. Sync-lag óf Ans' "vervallen" = usage-stop, niet NXT-status. **Te bevestigen.**
- **⚠️ 491961 (Detail Result Productie) = INACTIVE** terwijl Koen 'm als actuele klant lijst.
- **✅ 530293 = INACTIVE** bevestigt "superseded" (klapper-nummer).
- **❓ Niet in resolver:** 514295 (Defensie NBCD-school), 477533 (Lidl-parent), 426199 (STB Houten).
  Let op: `resolver_customer` is een gesynct *subset* (resolution-scope) — afwezig ≠ bestaat-niet in NXT.

### §0c. Klant-flags + artikelen autoritatief getoetst (`nxt.dbo.customer_bx` / `item_bx`, mét namen)

**Klant-identiteit ✅:** 454413 Dirk Supermarkten · 454170 Deka Supermarkten · 481523 *Ministerie van
Defensie 4600126806* (raamovk-nr zit in de naam) · 531242 EQUANS West-NL (Jan-Peter de Groot) · 532391
PLUS Supermarkten · 540576 PLUS Retail (franchise) · 540842 Gasunie · 529735 STB Eindhoven · 526938/530964
Jumbo België. Alle `classification = Retail`.

**⚠️ Correcties op Koen/klapper:**
- **530984 ≠ oude Jumbo-BE** → in NXT = **"De Grabbelton"** (andere klant, ACTIVE). Klapper-mislabel.
- **540649** ("vervallen Jumbo-BE") = Jumbo Supermarkten BV [RBM-België], **nog ACTIVE**.
- **491961** ("Detail Result Productie", actueel) = **"Detailresult Slagerijen", INACTIVE**.
- **514295 / 477533 / 426199** niet in `customer_bx` (BX) — nummer onjuist of andere regio/env.

**Artikelen ✅ (`item_bx`):** `51270005` Voorrijkosten €76,79 · `1310123102` CO2 2kg zij-uitlaat staal ·
`O0XXVT004/07000105/07000101` verbandtrommels · `5590090011/12` Herstel blusleiding/hydrant ·
**`O0XXTEXT` = "(Niet gebruiken)", €0, `minimum_technician_time = 18` min** (bevestigt NIEUWE_CLAIMS A6).
**⚠️** Picto **`3100313489` nog ACTIVE** (Ans: "vervallen per 15-04-2026"); `VW0004` niet gevonden.
**Let op:** `sales_package_price` = standaard catalogusprijs, **niet** de klant-/contractprijs → Defensie
€20,98 en Lidl-prijzen vereisen de pricelist-join (`customer_item_group_discount` / `price_list_*`).

### §0d. Prijzen (A4) + order-type-volumes (B) live getoetst

**Defensie all-in €20,98/eenheid ✅ BEVESTIGD** — meerdere controle-brandblusser-items staan op exact
`20.98` in Defensie's klant-prijslijst (`price_bx` source_type=Customer, source_id 481523:
B1XXHV136/137, 97110002/06/09/12, 51010010, 51060001/09…). Defensie heeft een volledige
contract-prijslijst met diepe korting (02110206 €62,52 vs catalogus €251,66; 1310123102 €201,40 vs
€297,71; veel all-in items €0). `customer_bx.pricelist_id` is NULL → pricing zit op `price_bx` per klant.

**Lidl-prijslijst ✅ bestaat, ⚠️ Koens prijzen verouderd** — pricelist `E4DFC062…` hangt op de
installateur-accounts (Lagendijk 482221, Hegeman 531400). Live vs klapper: 02130006 **€80,97** (Koen
€64,91/74,65) · 21001327 €150,54 (€138,79) · 21001127 €168,98 (€155,78) · 1670091000 €0 (€93). → live = waarheid.

**512887 = "Lidl Nederland Regio Etten-Leur"** — dit is de klant waarop spike-011's `/api/quotes/search`
álles liet vallen (false-positive default nu geïdentificeerd).

**Order-type-volumes (`orders_bx`, laatste 12 mnd, BX) ✅** — alle codes live mét volume: MO 82.505
(stammaand auto-gen domineert), ER 10.965, DOTR 2.691, MOFAS 2.330, TO 1.994, MOELS 1.581, CO 1.268,
EI 923, AR 882, MOEX 871, MORI 743, MOFASMTHLY 568, EX 361, EMLR 302, MOHY 274, UOW 109, AI 106, UO 50.
**⚠️ Scope-inzicht:** Koens absolute cijfers (3.181 totaal, TO 866, AR 117…) zijn een **order-desk-subset**,
niet heel-BX — de relatieve vorm klopt (ER dominant onder handmatige types), de absolute aantallen waren
scope-beperkt (exclusief de auto-gegenereerde MO-massa).

> **Reachability-DOORBRAAK (2026-06-23):** de Zapier-SQL-connectie ziet de **hele NXT SQL-server** —
> niet alleen `zapier.dbo` (resolver) maar ook `nxt`, `nxt_stock`, `nxt_benelux_prod`, `nxt_interface`,
> `nxt_ireland_prod`, `nxt_uk_prod`. Cross-DB-query's (`nxt.dbo.order_type_bx`, `nxt.dbo.item_bx`, …)
> werken. **Lanes A1/A2/A3/A4 + B zijn dus ALLEMAAL van hier uit te voeren** (read-only SQL). De dev-env
> is alleen nog nodig voor: NXT **writes** (create-order test), **UI-mechanica** (button-labels/wizards),
> en **DocuWare/QuoteWerks/portals**.

### A1 — order-types ✅ UITGEVOERD 2026-06-23 (`nxt.dbo.order_type_bx`, 34 codes, autoritatief)
STRIJDIG handleiding-vs-audio beslecht. **Handler-relevant bevestigd:** `MO` Preventief onderhoud ·
`MOEX` Periodiek onderhoud extern bedrijf (AED-batch) · `ER` Blusmiddelen correctief (QW-conversie
default) · `TO` Magazijn order · `UO`/`UOW` Retour(opdracht/magazijn) · `EX` Order tbv extern bedrijf ·
`CO` Storing · `EI` Blusmiddelen installatie · `AR`/`AI` Detectie · `EMLR` Noodverlichting reparatie ·
`MORI` Onderhoud stijgleiding (CAPS) · `MOFASMTHLY` Onderhoud BMC maandelijks.
**Gecorrigeerd (geen live BX order-type):** `OP`, `CAPS`, `MOEL`, `MOAE`, `MOPE`, `MOFIT`, `MOEI`, `TAO`
— `CAPS`=omschrijving van `MORI`; "OP/BMC-maandelijks"=`MOFASMTHLY`; `MOF`=inactive.
**Asset-types = aparte as** (`order_asset_type_bx`): `EX`(blusser), `HR`(haspel), `AED`, `ELS`, `FB`, `NRV`, `RI`.

---

## §1. Lane A — NXT acceptance REST (hoogste leverage; vereist dev-env + token-harvest)

> Transport: `nxtRequest`/`nxt-client.ts` tegen `acc.sb.n-xt.org` (env-aware, read = GET maar NXT doet
> reads óók via POST → `allowWrite` n.v.t. voor acc-reads). **Niet bereikbaar vanuit deze shell** —
> dit is de executie van een aparte verificatie-run (token via Browserless). Dit is wat spike-017 draait.

### A1 — `listOrderTypes` → één call, lost de grootste STRIJDIG op  ⭐ TOP-PRIO
Koen/handleiding/audio spreken elkaar tegen over de order-type-taxonomie. De live lijst is autoritatief.
- **Toets:** bestaan deze codes + omschrijvingen? `MO, MOEX, MOHY, MOEL, MOAE/MOPE, OP, CAPS` (handleiding §2.6)
  vs audio-varianten `MOFAS, MOFIT, MOEI, MOELS, EMLR, TAO`; en de v1.1-set van 17 met volumes:
  `MO, ER/EERTL, CO, EP, MOEX, OP, TO, AR, EX, UOW, EI, MORI, AI, EMLR, UO, DO, CAPS`.
- **Bron:** v1.1 Glossary; `NXT_CLAIMS_MATRIX` A5; BIJLAGE_B §2.6. **Waarde:** ontwart de hele intent→ordertype-map in één keer.

### A2 — klantnummer-batch ✅ UITGEVOERD 2026-06-23 (zie §0b — via Zapier-resolver, niet REST)
28/31 bevestigd ACTIVE+merk+postcode; 3 discrepanties geflagd. Resterend: de 3 niet-gevonden nrs en de
Jumbo-BE-vervallen-status tegen de volledige NXT (REST/`nxt`-DB) bevestigen. Onderstaande batch was de input:

| Klant | Klantnr | Bron |
|---|---|---|
| Defensie (parent) | 481523 | v1.1 §3.5 |
| Defensie Gebouwen / Schepen / Voertuigen | 213031 / 420872 / 518739 | v1.1 SOP19 |
| Defensie Trainingsbl. / NBCD / Vliegbasis / DPO / Voorraad | 415950 / 514295 / 418930 / 519613 / 213367 | v1.1 SOP19 |
| Dirk Supermarkten | 454413 (WI 737.07) | v1.1 SOP20 |
| Deka Supermarkten | 454170 (WI 182) | v1.1 SOP20 |
| Detail Result Logistiek/Productie/Bakkerij/Services | 453362 / 491961 / 491530 / 494943 | v1.1 SOP20 |
| Lidl (+ geïndexeerd) | 477533 / 524141 | v1.1 SOP21 |
| Plus franchise (Udo Tomassen) / Plus eigen | 540576 / 532391 | v1.1 SOP25, Ans §6.1 |
| STB Houten / Eindhoven | 426199 / 529735 | v1.1 SOP24 |
| Jumbo NL eigen / franchise / HUB | 473608 / 523450 / 530418 | KLAPPER §1.4 |
| Jumbo BE actueel (oude 530984/540649 vervallen) | 530964 / 526938 | Ans §2.3 |
| ASML/Equans (alu blussers) | 531242 | v1.1 SOP26 |
| Gasunie | 540842 | KLAPPER §2 |
| All-in (resolve op naam) | RUG · AECOM/Shell · Mokobouw NL · FOD BE | Ans §3.2 |

Plus de Universiteit-Tilburg/Berki gebouwen-set (≈19 nummers, KLAPPER §1.6) als bulk-check.

### A3 — `searchItems` → artikelnummers (exhaustief in de harvest; valideer het kern-assortiment)
Kern (hoog gebruik / hard claim): `1310123102` (CO2 staal 2kg Defensie-marine), `02110206` (poeder 6kg),
`3100313489` (picto — **moet VERVALLEN/inactief zijn per 15-04-2026**), `51270005` (voorrijkosten),
`O0XXTEXT` (vrije-tekst/monteurtijd, "(Niet gebruiken)"), verbandtrommels `O0XXVT004 / 07000105 / 07000101`,
`VW0004` (werktekening, prijs 0), `5590090010/11/12` (Noordam herstel). Volledige Lidl/Jumbo/plattegrond-
assortimentslijsten staan in v1.1 Bijlagen B/C/D/F/G + KLAPPER §4 — als batch te draaien.
- **Let op:** de oude verbandtrommel-codes (`O0XXVT002/005`, `4601010035` etc.) moeten **deprecated** zijn.

### A4 — `determinePrice` → tarieven (tegen huidige prijslijst)
`Defensie €20,98/eenheid` (oude €18,29 moet wég), `slangsystemen €18,65`, `verrijdbaar €171,79`;
Lidl `02130006 €74,65 (2025, was €64,91)`; plattegrond-tarieven Bijlage F. **Cascade-check** (A3 v1.1
K3): prijs werkadres→klant→moeder→grandparent.

---

## §2. Lane B — NXT-SQL (whitelisted IP, via Zapier) — aggregaten & deprecatie

- **Deprecatie-checks:** oude Jumbo-nrs `530293 / 530984 / 540649` inactief? NS-debiteur `487748` / `51270005` inactief (NS geen klant)?
- **Aantallen (valideren tegen Koens cijfers):** Defensie `34.475` eenheden (33.257 controle); order-type-jaarvolumes (TO 866, AR 117, EX 102, …); `MOEX` ~44/maand; €0-regels `1.949/jr`; `description`-veld NULL op 6.802 regels; discount-veld 106 regels/jr.
- **Structuur:** werkordernummer-format Smeba NL `163xxxx`; rayon/planner-tabel (Bijlage E, incl. de open NH/ZH-postcode-overlap M2); Mono-TO-leveranciers + volumes (Lasaulec 27, Hobrand 22, …).
- **"Inzake"-patroon:** aannemer↔eindklant-paren (CBRE inzake Shell, Heijmans inzake ASML, …) — `customer.name ILIKE '%inzake%'`.

---

## §3. Lane C — Supabase corpus (bereikbaar NU; rest na §0)

- Contact-/afzenderadressen uit de harvest die nog niet getoetst zijn (utomassen@plusretail.nl, helpdeskbouwbureau@dekamarkt.nl, dennis@jezzprojectmanagement.nl, defensie@smeba.nl, RiSc@smeba.nl, opdracht@smeba.nl) — presence-check in `sender_email`.
- Volume-claims: ~3.500+ mails/jr op order@; klant-cancel ≥154/jr → tellen in corpus.
- `sales@inprevo.nl` bounce-records (migratie Inprevo, NIEUWE_CLAIMS T2).
- Exception-patronen die in mail zichtbaar zijn: Holland & Barrett (detectie vóór akkoord), KLM/Inditex jaaropdracht-bulk (feb/okt-piek).

---

## §4. NIET live-verifieerbaar vanuit NXT/Supabase (eerlijk geflagd)

Verifiëren vereist de bronsystemen/documenten zelf, niet onze data-bronnen:
- **Contractdata & -nummers, SLA's, mandaten als beleid:** Defensie t/m 8-4-2029 + raamovk `4600126806`/`4600121705`; STB €0-mandaat; Dirk/Dekamarkt €500/gebouw; AED 4-uurs SLA. → contract-docs.
- **Werkinstructie-doc-ID's** `737.07 / 182 / 069.38 / 150.34 / 467.01`: dit zijn DocuWare/bestandsregister-ID's, geen NXT-records. → DocuWare.
- **DocuWare doc-types & entry-levels (BX)**, **externe portals** (Certeso/Shell/Gasunie), **bestandspaden** (`G:\Verkoop\…`), **telefoonnummers/persoonsrollen**. → respectieve systemen / Gwenda-Henk.
- ~~QuoteWerks~~ — **uitgefaseerd (Nick, 2026-06-23)**. Alle QW-claims (SMEQ-templates, Convert-to-Order, prefix-mapping) vervallen; offertes lopen via NXT (`SB`-prefix). Niet meer verifiëren.
- **NXT-UI-mechanica** (button-labels "Order Genereren"/"Verwijder instelling", stammaand-wizard-stappen, `stockAllocationRequired`-gedrag): geen read-call → vereist **één NXT-acc test-order** (visuele bevestiging), niet een query.

---

## Aanbevolen volgorde
1. **A1 `listOrderTypes`** (1 call, grootste onzekerheid weg).
2. **A2 `searchCustomers`-batch** (Ans-feiten hard maken; raakt elke per-klant-guardrail).
3. **A3/A4 artikel+prijs-batch** (assortiment-handlers steunen hierop).
4. **§3 corpus-rest** (gratis, parallel).
5. **B aggregaten** (sizing/QA).
6. **§4** apart beleggen (DocuWare/contract/QuoteWerks) — Fase-1-onderzoek, niet blokkerend voor de eerste handler.

> Executie-noot: Lane A/B vereisen de dev-env (NXT-token-harvest / Zapier-NXT-SQL) en zijn niet vanuit
> de assistant-shell te draaien. §0 + §3 zijn dat wél (Supabase MCP).
