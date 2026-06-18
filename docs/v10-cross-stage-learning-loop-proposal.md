# V10 — De Unified Cross-Stage Learning Loop

> **Status:** voorstel (brainstorm-output, nog niet ge-GSD'd). Concept ter review.
> **Datum:** 2026-06-15
> **Scope:** Milestone V10. Vervangt de te smalle "Bulk Review aanpassen"-framing door een swarm-agnostische, zelf-evoluerende leer-loop over alle pijplijn-stages.

---

## 1. Kernthese

V10 bouwt **één swarm-agnostische leer-spine** die elke correctie — ongeacht herkomst — opvangt, lokaliseert, clustert tot een systemisch patroon, en omzet in een voorgestelde structurele wijziging per stage. De loop kan de pijplijn op **elk structureel niveau** verbeteren: van een karakter in een regex tot het voorstellen van een compleet nieuwe handler.

Twee invoerkanalen voeden dezelfde loop:
- **UX-reviews** (Bulk Review 4-axis) — rijk, gestructureerd, laag volume, supervisor-gedreven.
- **Ambient Outlook** (categorie-gestures + chip) — grof, hoog volume, operator-gedreven.

Het doel is niet losse fouten fixen, maar **per-stage correctie-rate systematisch omlaag drijven**, met een loop die zijn eigen effectiviteit meet.

---

## 2. De spine (stage- en swarm-agnostisch)

Zeven schakels, identiek voor elke stage en elke swarm. Alleen de adapters aan de uiteinden verschillen.

```
CAPTURE → DIAGNOSE → CLUSTER → PROPOSE → APPROVE → MUTATE → MEASURE
                                                              └──────┐
                                            (efficacy-signaal terug) ┘
```

1. **CAPTURE** — twee bronnen normaliseren naar één `correction_event`-contract:
   `{ stage, axis, swarm_type, source: ux_review | ambient | ai_diagnosis, email_id, before, after, evidence_event_ids, prose_notes? }`.
   Zowel de 4-axis Bulk Review-captures als de Outlook-gestures emitteren dit shape.

2. **DIAGNOSE (= óók de rung-router)** — voor grove bronnen (ambient) lokaliseert een AI-pass de stage/as + root-cause tegen een **gesloten per-stage taxonomie**, én beslist de ladder-sport:
   - verwees de correctie naar een **bestaand** registry-item → L1/L2 (tune/extend).
   - past **geen enkel** bestaand item met vertrouwen → de mail valt in de **residual pool** voor L3 (discover).
   Voor rijke bronnen (UX-review) is lokalisatie gratis: de operator zei al welke as én of het een bestaand item betrof.

3. **CLUSTER** — opgehoopte events groeperen op `swarm_type` + stage + signature (de Pattern-discovery mechaniek, sketches 006/007). Hier worden losse fixes systemische patronen.

4. **PROPOSE** — clusters boven een **registry-driven, per-swarm drempel** (volume + coherentie) worden `promotion_candidates` van het juiste `kind`.

5. **APPROVE** — supervisor in Patterns-mode (Apply / Refine / Dismiss). Poort-zwaarte verschilt per rung (zie §6).

6. **MUTATE (zelf-bewakend)** — een goedgekeurde candidate wordt **niet blind toegepast**:
   - **Shadow-eval** tegen een holdout van recente, bevestigde events (herclassificeert deze wijziging verkeerd wat eerder goed ging?), met een regressie-gate (hergebruikt `eval_type=regression`).
   - Pas bij groen licht schrijft de mutatie de swarm-gekeyde registry/config-rij weg.
   - Reversibel: "een engineer kan dit terugdraaien" — operator ziet nooit "onomkeerbaar".

7. **MEASURE (sluit op zichzelf)** — na de mutatie tracken we of de doel-correctie-rate daalt. Geen daling of stijging → de promotie wordt **auto-geflagd voor rollback**. De loop bewijst dat zijn eigen wijzigingen werken.

---

## 3. De per-stage adapters

| Stage | As | Ambient-signaal (Outlook) | UX-review input | Promotion `kind` | Mutatie-target |
|---|---|---|---|---|---|
| **1 Noise** | category | noise-categorie verwijderen *of* Junk-move (folder = extra self-encoding) | Stage 1 dropdown-override | `regex_rule` · `new_intent` | regex-registry · `swarm_noise_categories` |
| **2 Customer** | account | klant-categorie verwijderen | Stage 2 ResolverChain + nummer-override | `sender_mapping` | `resolver_index` |
| **3 Intent** | intent | **intent-categorie verwijderen** | Stage 3 ranked reorder + escalate | `new_intent` | `swarm_intents` |
| **4 Handler** | draft | **draft-vs-verzonden diff** (operator-edits) *(toekomst)* | Stage 4 output-correctie | `prompt_tune` · `draft_style` | agent-prompt *(framework-slot)* |

**Uniform ambient-mechanisme:** de AI schrijft per stage-conclusie een eigen gekleurde Outlook-categorie terug (multi-label set). Het wegklikken van één label is een schoon, gelokaliseerd "fout"-signaal — je weet meteen welke as. Stage 4 is de uitzondering: dat is een draft-edit-delta, geen categorie.

> UX-kanttekening: 3 categorieën per mail kan rommelig ogen. Kleur/naam-keuze is een bewust ontwerp-detail.

---

## 4. De ladder van structurele diepte

Elke sport gebruikt **dezelfde spine**; alleen het `kind` wordt structureler en de menselijke poort strenger.

| Rung | Stelt voor | Bron-signaal | `kind` | Poort |
|---|---|---|---|---|
| **L1 · Tune** | bestaande config bijstellen | correcties op een bekende as | `regex_rule` · `sender_mapping` · intent-rank | supervisor (licht) |
| **L2 · Extend** | nieuwe registry-rij binnen bestaande taxonomie | clusters van correcties | `regex_rule` · `sender_mapping` | supervisor (licht) |
| **L3 · Discover** | **een nieuw intent dat nog niet bestaat** | de "past nergens"-stapel | `new_intent` | supervisor + taxonomie-owner |
| **L4 · Evolve** | **een nieuwe handler/capability** | hoog-volume + automatiseerbaar intent | `new_handler` *(nieuw)* | engineering (zwaar) |

L1/L2 corrigeren een **bekende** as. L3/L4 ontdekken dat de **taxonomie zelf onvolledig is** en stellen voor hem uit te breiden.

### L3 · Nieuwe intents ontdekken
Leert van de **afwezigheid van een zelfverzekerde classificatie**. De residual pool wordt gevuld door drie bronnen:
- **Stage 3-escalaties** — de escalate-card vraagt al letterlijk *"welk intent ontbreekt?"* → kant-en-klare seed.
- **Stage 1 `unknown`-residue** — geen noise, geen helder intent.
- **Coordinator low-confidence** — clusters waar Stage 3 alles laag rankte.

Mechanisme: pool krijgt **embeddings** (pgvector), een **off-peak cron clustert ongesuperviseerd**, en per dichte+coherente cluster stelt een LLM een kandidaat-intent voor (label + beschrijving + sample-evidence) → `new_intent` candidate.

**Residual-pool lifecycle (anti-dubbeltelling):**
- Een mail komt in de pool als DIAGNOSE "geen bestaand intent past" rapporteert.
- Een mail verlaat de pool als (a) een discovered intent wordt goedgekeurd en hij eronder valt, of (b) een latere correctie hem alsnog aan een bestaand intent koppelt.
- Overlap tussen de drie bronnen wordt op `email_id` gededupliceerd.

### L4 · Nieuwe handlers voorstellen
Zodra een ontdekt intent bevestigd is én volume opbouwt, herkent de loop de kans en maakt een `new_handler`-candidate met:
- **Opportunity-score** = volume × handmatige tijd/item × **automatiseerbaarheid**.
- **Automatiseerbaarheid** (concreet) = LLM-beoordeelde structurele consistentie van de cluster **× of de vereiste actie op een bestaande capability mapt** (draft-reply → hoog; NXT-write → medium; telefoon → laag).
- **Concept-spec** — gegenereerd via de bestaande `orq-agent` architect→research→spec pipeline.

**Autonomie-grens (bewust, = volwassenheid):** de loop **detecteert de kans, bewijst de ROI en schrijft de concept-spec — maar bouwt en deployt de handler niet autonoom.** Een handler raakt swarm-shapes, agents en productie-deployment; dat blijft een mens-goedgekeurde engineering-actie. Volledige autonomie is het verre einde van de roadmap, gated op vertrouwen uit de lagere sporten.

---

## 5. Swarm-agnostische lock

De loop is gedeelde infrastructuur; `swarm_type` is slechts een dimensie die er doorheen loopt. Sluit aan op het bestaande registry-driven, cross-swarm canonieke pijplijn-ontwerp.

- **`swarm_type` draagt door de hele spine** (L1 t/m L4): `correction_event` → clustering (groepeert binnen swarm) → `promotion_candidates.swarm_type` → swarm-gekeyde registry-mutatie.
- **Nul swarm-specifieke code-paden in de loop.** Een nieuwe swarm aanzetten = registry-rijen toevoegen, geen loop-code, geen deploy.
- **Capture-adapters zijn de enige swarm-rand:** hoe een swarm zijn mailbox/categorieën leest kan verschillen; zodra het signaal een `correction_event` is, is de rest identiek.
- **Bonus (niet nu bouwen):** cross-swarm patroon-transfer wordt mogelijk — een regex geleerd in debtor kan als candidate aan info@smeba worden voorgesteld (Phase 88-spike "cross-swarm rule transferability"). Default = swarm-geïsoleerd; transfer is opt-in toekomstig.

**Anti-drift grep-gate (implementatie-fase):**
> Geen `if (swarm_type === '...')` of swarm-naam-literals in `web/lib/learning-loop/**`. Swarm-gedrag komt uitsluitend uit registry-lookups. Een hit = drift → block de PR.

---

## 6. Governance & module-grens

- **Poort-ownership:** L1/L2 = supervisor; L3 = supervisor + taxonomie-owner (nieuw intent wijzigt het registry-contract); L4 = engineering. Registry-mutaties lopen door CODEOWNERS (bestaand).
- **Module-grens:** spine = stage/swarm-agnostische core in `web/lib/learning-loop/`; adapters = dunne per-stage/per-swarm randen. Loop-logica smeert nooit in de stage-handlers.
- **Kosten/scheduling:** DIAGNOSE-pass wordt gebatcht/gedebounced (niet per signaal een LLM-call); de zware discovery-clustering draait off-peak (overnight cron). Via Orq-router.
- **Drempels:** registry-driven, per-swarm tuneerbaar (volume + coherentie per rung).

---

## 7. Fundering (Phase 0 — substraat, geen operator-UI)

Lock vóór enige UI:
- `correction_event` genormaliseerd contract (stage · axis · swarm_type · source · before/after · evidence · notes).
- Elke stage persisteert zijn beslissings-trace: Stage 1 passes/matched_span (deels aanwezig) · **Stage 2 `steps[]` + `candidates_considered[]` bijbouwen** (`resolve-debtor.ts` + sales-equivalent) · Stage 3 ranked list · Stage 4-slot gereserveerd.
- **Residual pool + embeddings** opzetten en vroeg laten ophopen (pgvector; let op extension-in-`public` opruim-todo) — anders heeft de L3-cron geen historie.
- `promotion_candidates`: reserveer `new_handler`-kind + Stage-4 `prompt_tune`/`draft_style`-kinds naast de bestaande.
- Promotion-pipeline (Phase 72) als gemeenschappelijke generalisatie-motor bedraden.

---

## 8. Gefaseerde roadmap

| Fase | Inhoud | Rungs |
|---|---|---|
| **P0 · Spine** | correction_event-contract, per-stage traces, residual pool + embeddings, gereserveerde kinds, promotion-motor | fundering |
| **P1 · UX-kanaal** | 4-axis captures → correction_events; Patterns-mode als cross-stage clustering/review-surface | L1/L2 |
| **P2 · Ambient-kanaal** | categorie-chip visibility (niet-muterend, werkt in observe-mode); gestures → correction_events; getokende deep-link → exact Bulk Review-item; tag-and-ignore op eigen writes | L1/L2 |
| **P3 · Diagnose + clustering** | rung-router diagnose; clustering over beide kanalen; **regex-discovery als headline-output**; shadow-eval + self-measure | L1/L2 |
| **P4 · Adapter-rollout** | Stage 1 (regex) + Stage 2 (customer) eerst, Stage 3 (intent) erachteraan | L1/L2 |
| **P5 · Discover** | residual clustering → `new_intent` voorstellen | L3 |
| **P6 · Evolve** | opportunity-detectie + ROI + concept-spec via orq-agent; mens bouwt | L4 |

Kritisch pad: **P0 → P1 → P3** is de ruggengraat van de leer-loop. P2 en P4 verbreden; P5/P6 zijn data/tijd-gated.

---

## 9. Succesmetrieken

- Per-stage correctie-rate over tijd (de hoofd-KPI; de loop drijft hem omlaag).
- Diagnose-accuraatheid (rung-router + root-cause vs mens-bevestigd).
- % auto-resolved vs geëscaleerd.
- Promotie-efficacy: % toegepaste wijzigingen dat de correctie-rate daadwerkelijk verlaagt (vs auto-rollback).
- Registry-groei via de loop (`resolver_index`-rijen, regex-rules, intents).
- L3/L4: aantal ontdekte intents bevestigd; aantal handler-voorstellen met positieve ROI.

---

## 10. Open beslissingen (bewust uitgesteld)

- **Footer-home** (inbound-annotatie vs draft-strip) → bij drafting-go-live, met data. Voorkeur: draft-strip (raakt geen ontvangen correspondentie — compliance in debtor-context).
- **Optie-1 micro-confirm** ("Amsterdam of Rotterdam?" 1-klik) → gated op P3-data over twijfelgevallen.
- **Outlook Add-in** → bewust uit scope; alleen heroverwegen als deep-link + reply-protocol aantoonbaar tekortschiet.
- **Cross-swarm patroon-transfer** → opt-in toekomstige uitbreiding na L3/L4.
- **Categorie kleur/naam-conventie** bij multi-label mailboxes.

---

## 11. Grondwaarheid-validatie (2026-06-18)

Vier read-only onderzoeks-agents + directe DB-queries op productie (`mvqjhlxfvtqqubqgdvhz`) hebben de kern-aannames van dit voorstel getoetst. Het voorstel houdt stand; één volgorde-correctie en één ontbrekende sluitsteen.

### 11.1 De twee kanalen zijn níét gelijkwaardig — ambient domineert 131 : 1

§1 stelt UX-review en ambient Outlook voor als twee co-equal invoerkanalen. De data weerspreekt de gelijkwaardigheid:

| Signaalbron | Rijen | Vers |
|---|---|---|
| Ambient Outlook (`swarm_review_signals`) | **131** | vandaag 10:00 |
| Bulk-review overrides (`pipeline_events.override`, voedt `promotion_candidates`) | **1** | 28 mei |

`promotion_candidates` is leeg (0 rijen ooit) — niet door een kapotte cron, maar omdat z'n enige brandstof (bulk-review-overrides) is opgedroogd nu feedback naar Outlook verhuisde. **Consequentie:** de roadmap-volgorde (§8) `P1 (UX-kanaal) → P2 (ambient)` hoort omgedraaid. Bouw het ambient-kanaal eerst; daar stroomt het signaal. Het UX-kanaal blijft waardevol (rijk, gestructureerd) maar is laag-volume en mag later.

### 11.2 CAPTURE-ambient is al ~80% gebouwd

`swarm_review_signals` ís feitelijk de ambient `correction_event`-store uit §7. Huidige verdeling (vers, 2 swarms voor de negatieven):

- `approve_replied` — 85 · `approve_handled` — 12 → **de confirm-signalen** (§3 "onveranderd beantwoord / naar juiste map").
- `reclassify` — 34 → **het "label gewijzigd/verwijderd = fout"-signaal** (§3 ambient negatief).

Pad: Graph-delta (P112.5, `delta-client.ts`) → `swarm_email_transitions` (ruwe ledger) → `signal-derive.ts` → `swarm_review_signals` (geïnterpreteerd verdict). Wat ontbreekt is enkel het genormaliseerde `correction_event`-contract eroverheen — niet de capture zelf.

### 11.3 De DIAGNOSE-join is de échte ontbrekende sluitsteen (= eerste bouwsteen)

DIAGNOSE (§2.2) kan vandaag niet draaien. `swarm_email_transitions` en `swarm_review_signals` zijn **bewust afgeschermd** van de live pipeline-ledger (expliciete anti-pattern in `swarm-behavior-sync.ts`: "deze signalen gaan NIET naar `pipeline_events`"). Bij een negatief signaal heeft het systeem wél:
- de originele mail (`email_id` → `email_pipeline.emails`), en
- wat de operator deed (transition + verdict),

maar **niet** wat de pijplijn voorspelde (Stage 3 ranked intents, confidence, `decision_details` per stage). Zonder die join kan een diagnose-agent alleen vaststellen *dát* het misging, niet *waarom*. **De join bouwen — een hydratie-view die een negatief signaal koppelt aan de meest-recente `pipeline_events`/`coordinator_runs`-context op `email_id` — is daarmee de eerste concrete P0-bouwsteen** en de directe voorwaarde voor de diagnose-agent.

### 11.4 Twee caveats om in §3 te verankeren

- **"Label verwijderd"** wordt alleen gedetecteerd als het systeem het label zélf schreef (baseline-rij in `swarm_written_categories`, P117). Geen baseline → geen `category_edited`-signaal (fail-safe: geen false positive, maar deels blind voor regels die een oudere systeemversie schreef).
- **"Onveranderd beantwoord"** is nu niet te onderscheiden van "beantwoord": er is géén draft-vs-verzonden diff (§3 noemt dit terecht "toekomst" / Stage 4). `approve_replied` betekent dus nu "er is een reply verstuurd in deze conversatie", niet "de AI-draft is onveranderd verstuurd".

### 11.5 Wat al bestaat vs. nog te bouwen (samenvatting)

| Spine-schakel | Status | Bewijs / gap |
|---|---|---|
| CAPTURE (ambient) | ~80% | `swarm_review_signals` levend; alleen `correction_event`-contract eroverheen |
| CAPTURE (UX-review) | aanwezig, laag volume | 4-axis Bulk Review geshipped (Phase 71/82); override-voeding bijna nul |
| DIAGNOSE | **ontbreekt (keystone)** | signaal↔pipeline-join niet gebouwd; firewall in `swarm-behavior-sync.ts` |
| CLUSTER / PROPOSE | schil bestaat, uitgehongerd | `promotion-recommender-cron.ts` + `cluster.ts` gebouwd ("Phase 4"), 0 output door dode bron |
| APPROVE | schil bestaat | `/automations/[swarm]/patterns` + `applyCandidate` (emit-migratie → `classifier_rules` candidate) |
| MUTATE / MEASURE | deels | `classifier_rules` promotie-pad + `eval_type=regression` aanwezig; self-measure/auto-rollback nog niet |

**Netto:** dit is een afmaak-/herrichtings-milestone, geen greenfield. De `promotion_candidates`/`/patterns`-machinerie bestaat al maar is op de verkeerde (dode) bron aangesloten; V10's werk is 'm herrichten op het ambient-signaal en de DIAGNOSE-join ertussen leggen.
