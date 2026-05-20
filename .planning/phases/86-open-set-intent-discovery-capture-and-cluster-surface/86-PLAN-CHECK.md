# Phase 86 — Plan Check

**Datum:** 2026-05-20
**Checker:** gsd-plan-checker (Revision Gate)
**Plans gecontroleerd:** 86-01, 86-02, 86-03, 86-04
**Focuspunten:** 12 (zie instructie)

---

## Eindvonnis: GEEL — chirurgische patches vereist voor 3 items

Twee focuspunten bevatten een blocker en één heeft een warning. De overige negen zijn groen. De plannen zijn inhoudelijk solide; de patches zijn klein en gericht.

---

## Focus-per-focus verdichten

### FA-1 — Storage truth lock: pipeline_events, NIET coordinator_runs

**Verdict: PASS met kanttekening**

Plan 01 heeft de storage truth correct gelocked (zie `<storage_truth>` blok, regels 70–82): de view leest van `pipeline_events.decision_details`, niet van `coordinator_runs.decision_details`. De task-1-action bouwt zelfs een branch-conditionele DDL die de executor bij run-time forceert om `list_tables` te draaien en de juiste primaire tabel te selecteren (regels 160–167).

Plan 02 (cron) leest van `intent_proposals_v1` via Supabase client `.from('intent_proposals_v1').select('*')` — de view zelf abstraheert de tabel; de cron hoeft `pipeline_events` of `coordinator_runs` niet direct te kennen. **PASS.**

Plan 03 (UI) leest van `intent_proposal_clusters` (snapshot-tabel) — één laag verwijderd van de view. Geen directe verwijzing naar `coordinator_runs.decision_details`. **PASS.**

Plan 04 (runbook) bevat SQL-checks op `intent_proposals_v1` en `intent_proposal_clusters` — geen stale `coordinator_runs.decision_details` referentie. **PASS.**

**Kanttekening (geen blocker):** Plan 01 Task 1 action laat de executor kiezen tussen twee DDL-paden afhankelijk van de `list_tables`-uitkomst (regels 165–167). De storage_truth-sectie zegt echter al dat `pipeline_events.decision_details` de definitieve sink is. De conditionele branch is conservatief maar risico-vrij: als executor het branch-pad "coordinator_runs.decision_details" kiest op basis van een verkeerde `list_tables` interpretatie, keert de view nul rijen terug — zichtbaar via Task 1 verify-stap #2. Geen aanpassing nodig.

---

### FA-2 — Geen MATERIALIZED VIEW

**Verdict: PASS**

- Plan 01 `deviation_rules` (regel 406): `DO NOT use MATERIALIZED VIEW — regular VIEW + snapshot table per drift #2`.
- Plan 01 Task 2 action DDL: `CREATE TABLE IF NOT EXISTS public.intent_proposal_clusters` — dat is de snapshot-tabel, geen MV.
- Plan 01 Task 1 action DDL: `CREATE OR REPLACE VIEW public.intent_proposals_v1` — reguliere view.
- Geen enkel plan bevat het token `MATERIALIZED VIEW` in een DDL-positie.

**PASS — conform focus-area.**

---

### FA-3 — Tab placement: peer strip, NIET derive-stage-tabs uitbreiden

**Verdict: PASS**

Plan 03 maakt een nieuwe component `discovery-tab-strip.tsx` (frontmatter `files_modified`, regel 8) met zijn eigen `DiscoveryTab` interface en `deriveDiscoveryTabs()` functie. De component is expliciet gescheiden van `stage-tab-strip.tsx`.

Plan 03 `deviation_rules` (regel 397): `DO NOT widen derive-stage-tabs.ts or modify the StageTab literal-union type. Drift #3 lock.`

Plan 03 Task 1 verify (regels 210–212): controleert actief dat `derive-stage-tabs.ts` ongewijzigd blijft via:
```
grep -n "FIXED\|StageTab\[\]" .../derive-stage-tabs.ts
# Expect: unchanged from baseline
```

`derive-stage-tabs.ts` (gelezen in deze sessie, regels 20–21): `stage: 0 | 1 | 2 | 3 | 4` union ongewijzigd.

**PASS — conform focus-area.**

---

### FA-4 — Hard separation invariant

**Verdict: PASS**

Alle vier plans bevatten expliciete `deviation_rules`:
- Plan 01 regel 405: `DO NOT write to swarm_intents or read from swarm_noise_categories`
- Plan 02 regel 368: `NO writes to swarm_intents. NO reads from swarm_noise_categories.`
- Plan 03 regel 399: `DO NOT write to swarm_intents; DO NOT read from swarm_noise_categories.`
- Plan 04: geen code-schrijf-taken; runbook bevat uitsluitend SELECT-queries op `intent_proposal_clusters` en `intent_proposal_views`.

Geen enkel task-action verwijst naar `swarm_intents` (voor schrijven) of `swarm_noise_categories` (voor lezen).

**PASS.**

---

### FA-5 — Stage 4 dispatch onaangetast

**Verdict: PASS**

Geen plan bevat een bestandsreferentie naar `stage-3-dispatcher.ts` of welke Stage 4 handler dan ook. Plan 02 `deviation_rules` (regel 369): `NO change to coordinator_runs schema or the Stage 3 dispatcher.`

**PASS.**

---

### FA-6 — Success #1 verfijning toegepast in Plan 04

**Verdict: PASS**

Plan 04 `must_haves.truths[0]` (regel 14): `"Success #1 is RELAXED to 14 days with a day-7 sub-criterion (drift #4: plan-time refinement; CONTEXT.md remains unchanged)"`.

Plan 04 `success_criteria_recap` tabel (regels 75–80) documenteert expliciet de driedeling:
- Day 7: ≥1 cluster sub-criterium
- Day 14: ≥2 clusters (≥3 samples) — revised primary
- Day 21-28: ≥5 clusters (origineel CONTEXT target, opgeschoven)

Plan 04 Task 1 action beschrijft alle vier checks (day-7, day-14, day-21-28, wekelijks) met exacte SQL en verdicht de Success #4 wekelijkse meting (elke vrijdag, vier opeenvolgende weken).

**PASS — conform focus-area.**

---

### FA-7 — Geen backfill

**Verdict: PASS**

Plan 01 `must_haves.truths[3]` (regel 20): `"View pre-V3 rows (no intent_proposal) are filtered out by IS NOT NULL clause — no backfill needed"`.

Plan 01 storage_truth (regel 79): `V2 telemetry rows naturally have decision_details->>'intent_proposal' IS NULL (the spread-conditional only fires for intent_version === INTENT_VERSION_V3) — that is the open-set predicate; no backfill needed.`

Plan 02 `adopted_research_defaults` (regel 105): `No backfill: snapshot table starts empty post-deploy.`

Bevestigd via live code: `debtor-email-coordinator.ts:329-332` — spread-conditional vuur uitsluitend voor V3-outputs. V2-rijen produceren geen `intent_proposal` veld in `decision_details`.

**PASS.**

---

### FA-8 — Geen nieuwe npm dependencies (Levenshtein inline)

**Verdict: PASS**

Plan 02 `deviation_rules` (regel 367): `NO new npm dependencies. Levenshtein is dependency-free.`

Plan 02 Task 1 `done`-criterium (regels 190–191): `Both test files pass... no new npm deps.`

De cluster.ts skeleton in Plan 02 Task 1 action (regels 157–176) bevat een dependency-vrije twee-rij-DP implementatie van < 80 LoC. Geen `import` van `fast-levenshtein` of enige andere externe package.

**PASS.**

---

### FA-9 — Wave dependency volgorde

**Verdict: PASS**

| Plan | Wave | depends_on |
|------|------|------------|
| 86-01 | 1 | [] |
| 86-02 | 2 | [86-01] |
| 86-03 | 3 | [86-01, 86-02] |
| 86-04 | 4 | [86-01, 86-02, 86-03] |

Geen circulaire afhankelijkheden. Plan 03 afhankelijkheid van Plan 02 is correct: de UI leest `intent_proposal_clusters` die pas door de Plan 02 cron gevuld wordt.

**PASS.**

---

### FA-10 — Acceptance criteria falsifieerbaar

**Verdict: FLAG — WARNING**

**Plan 04 Success #3 heeft een verificatie-cirkel:**

CONTEXT Success #3 is: `"Top-3 clusters: ≥80% same-intent on 10 random samples each"`. Plan 04 Task 1 action (regel 118–120) beschrijft de spot-check als "operator leest elk sample, wijst verdict toe — ≥8/10 same-intent = PASS". Het SQL-helper dat de samples ophaalt is gedocumenteerd als `JOIN door coordinator_run_id terug naar email subject+body`.

Probleem: `intent_proposal_clusters.sample_email_ids` slaat `coordinator_run_ids` op als `text[]` (Plan 01 DDL, Task 2). Het runbook verwijst naar een JOIN via `coordinator_run_id → email subject+body`, maar de join-chain is niet helemaal uitgeschreven in het runbook. Een executor die de runbook-SQL letterlijk volgt kan vastlopen als de JOIN naar `email_pipeline.emails` de intermediate stap via `agent_runs` of `pipeline_events` mist.

Dit is een **warning**, geen blocker — de verificatie is niet on-falsifiable, maar de SQL is onvolledig en een operator die blind de runbook volgt kan de spot-check niet uitvoeren.

**Fix:** Plan 04 Task 1 moet de volledige 3-staps SQL in het runbook opnemen:
```sql
-- sample_email_ids zijn coordinator_run_ids (text)
SELECT pe.email_id, e.subject, e.sender_email,
       pe.decision_details->>'intent_proposal' AS proposal_label
  FROM public.pipeline_events pe
  JOIN email_pipeline.emails e ON e.id = pe.email_id
 WHERE pe.decision_details->>'intent_proposal' IS NOT NULL
   AND pe.agent_run_id = ANY(
     ARRAY['<coordinator_run_id_1>', '...']::text[]
   )
 ORDER BY pe.created_at DESC;
```
(Of het equivalent via `intent_proposals_v1` view als die coordinator_run_id bevat.)

**Severity: WARNING — uitvoerbaar maar runbook is incompleet voor Success #3 spot-check.**

---

### FA-11 — Cron string formaat

**Verdict: PASS**

Plan 02 `must_haves.truths[0]` (regel 19): `"Daily Inngest cron at TZ=Europe/Amsterdam 0 4 * * * AND event trigger..."`

Plan 02 Task 2 action (regel 234): `{ cron: "TZ=Europe/Amsterdam 0 4 * * *" }`

Plan 02 `cron_constraints_from_CLAUDE_md` (regels 93–97) documenteert expliciet alle CLAUDE.md-vereisten inclusief het JSDoc-anti-patroon. Plan 02 Task 2 verify controleert actief de cron-string via `grep -nE "TZ=Europe/Amsterdam 0 4 \* \* \*"`.

De afwijking van de business-hours default (`0 4 * * *` = dagelijks 04:00, 7 dagen per week) is gedocumenteerd in RESEARCH Q2 (regels 109–117): weekend-refresh nodig omdat operators maandag anders een 60-uur oude snapshot zien. Plan 02 Task 2 `behavior` (regel 199): comment `// Cron: TZ=Europe/Amsterdam 0 4 (asterisk asterisk asterisk) daily 04:00 Amsterdam, 7 days/week.` — bewuste keuze, geen vergissing.

**PASS — conform focus-area, rationale aanwezig.**

---

### FA-12 — Telemetry table choice: intent_proposal_views (niet pipeline_events misbruiken)

**Verdict: BLOCKER**

**Het probleem:** Plan 01 kiest correct voor een dedicated `intent_proposal_views` tabel (deviation_rules, plan 01 regel 407 impliciet; Task 3 maakt de tabel aan). Plan 03 schrijft via `logTabView()` naar `intent_proposal_views`. Tot zover correct.

**Het risico zit in Plan 01 Task 1 action (regels 165–167):**

```
- If coordinator_runs.decision_details exists → primary table is coordinator_runs cr,
  join email_pipeline.emails e ON e.id = cr.email_id::uuid.
- If only pipeline_events.decision_details exists → primary table is pipeline_events pe
  WHERE stage = 3, join coordinator_runs cr ON cr.run_id = pe.agent_run_id::uuid
  (or equivalent — verify column), join email_pipeline.emails e ON e.id = pe.email_id.
```

Het storage_truth-blok in hetzelfde plan (regels 74–82) stelt categorisch dat `pipeline_events.decision_details` **de** Phase 86 read target is, en dat lezen van `coordinator_runs.decision_details` nul rijen zou geven. Toch laat de task-action de executor een branch open die `coordinator_runs.decision_details` kiest als primaire tabel. De `coordinator_runs.decision_details`-branch stelt bovendien `cr.run_id = pe.agent_run_id::uuid` voor als JOIN-pad — maar dit JOIN-pad is niet geverifieerd en de `agent_run_id` kolom op `pipeline_events` is niet als geldig bevestigd in de `<schema_facts>` sectie.

**Concreet risico:** Een executor die de `list_tables` pre-write stap uitvoert en concludeert dat `coordinator_runs.decision_details` bestaat (het bestaat — zie schema_facts regel 87), kiest branch A. De view retourneert dan nul rijen, omdat Phase 85 proposals uitsluitend naar `pipeline_events.decision_details` schrijft. De verify-stap (#2: `SELECT count(*) FROM public.intent_proposals_v1`) retourneert `n=0` — maar dat is conform de view-spec ("0 is fine for the migration smoke"), dus de executor markeert de task als DONE. Pas na de eerste cron-tick en een `COUNT=0` in intent_proposal_clusters valt het op.

**Fix:** Plan 01 Task 1 action moet de conditionele branch verwijderen en de DDL hardcoderen op `pipeline_events` als primaire tabel. De storage_truth is immers al locked. De action-tekst bij regels 165–167 moet worden:

```
DDL schrijft pipeline_events pe als primaire tabel (storage_truth is locked).
Geen branch. Filter: WHERE pe.decision_details->>'intent_proposal' IS NOT NULL
AND pe.stage = 3.
Join chain: LEFT JOIN coordinator_runs cr ON cr.run_id::text = pe.agent_run_id
(voor ranked_top_intent via cr.ranked_intents->0->>'intent')
LEFT JOIN email_pipeline.emails e ON e.id = pe.email_id.
```

Bovendien: het verify-commando #2 moet de nul-rij situatie als **onvoldoende** markeren als Phase 85 langer dan 24u live is, niet als acceptabel:
```
# Als Phase 85 >24h live: n >= 1 verwacht. Als n=0 na 24h: escaleer naar storage_truth onderzoek.
```

**Severity: BLOCKER — stale branch in de action laat de executor bewust het verkeerde DDL-pad kiezen, met stille zero-row view als gevolg die de verify-check passeert.**

---

## Overige dimensies (standaard verificatiedimensies)

### Requirement Coverage

| Requirement | Plan(s) | Taken | Status |
|---|---|---|---|
| D-01 | 01 | Task 1, 2, 3 | GEDEKT |
| D-02 | 01, 02 | 01-Task 1-2, 02-Task 2 | GEDEKT |
| D-03 | 02 | Task 1 | GEDEKT |
| D-04 | 03 | Task 1-3 | GEDEKT |
| D-05 | 01, 03 | 01-Task 1, 03-Task 2-3 | GEDEKT |
| D-06 | 03 | Task 3 | GEDEKT |
| D-07 | 01, 03 | 01-Task 3, 03-Task 2 | GEDEKT |
| V-Success-1..4 | 04 | Task 1-2 | GEDEKT |

Alle requirements uit CONTEXT en de vier Success criteria zijn gedekt.

### Task Completeness

Alle taken hebben `<files>`, `<action>`, `<verify>` met `<automated>` sub-element, en `<done>`. Plan 04 Task 2 is type `checkpoint:human-verify` — geen automated-verify vereist voor dit type. **PASS.**

### Scope Sanity

| Plan | Taken | Files |
|---|---|---|
| 86-01 | 3 | 5 |
| 86-02 | 2 | 7 |
| 86-03 | 3 | 6 |
| 86-04 | 2 (1 auto + 1 checkpoint) | 2 |

Alle plans binnen drempelwaarden (2-3 taken, ≤10 files). **PASS.**

### Key Links

Alle drie kritieke verbindingen zijn aantoonbaar bedraad:
- `intent_proposals_v1 → pipeline_events.decision_details` (Plan 01 key_links)
- `cron → intent_proposals_v1 → intent_proposal_clusters` (Plan 02 key_links)
- `client-shell.tsx mount → logTabView → intent_proposal_views` (Plan 03 key_links)

**PASS.**

### Context Compliance (D-01 t/m D-07 + deferred scope)

CONTEXT D-02 beschrijft een "materialised view" — plans implementeren correct een reguliere VIEW + snapshot table (drift #2 gedocumenteerd). Dit is een plan-time verfijning op basis van PATTERNS-onderzoek, niet een contradictie van een locked beslissing. CONTEXT D-01 beschrijft de verkeerde JSONB-kolom; plans passen dit correct aan (storage_truth amendment). Geen deferred ideeën (V9.0+ promote, LLM clustering, per-cluster flags) verschijnen in enig plan-task.

**PASS.**

### Scope Reduction (FA-7b)

Geen "v1/simplified/static" taalgebruik op user decisions aangetroffen. De read-only constraint (D-04) is expliciet in-scope en correct geïmplementeerd als feature, niet als simplificatie.

**PASS.**

---

## Samenvatting issues

### BLOCKER — 1

**[FA-12 / storage_truth] Plan 01 Task 1 bevat een stale conditionele branch die de executor naar het verkeerde DDL-pad leidt**

- **Plan:** 86-01-PLAN.md
- **Task:** Task 1, regels 165–167 van het action-blok
- **Probleem:** Storage truth is locked op `pipeline_events.decision_details`. Toch biedt de action twee branches aan, waarbij branch A (`coordinator_runs.decision_details`) per de storage_truth nul rijen retourneert. De verify-stap accepteert `n=0` als geldig ("migration smoke"), waardoor de fout onopgemerkt blijft.
- **Fix:** Verwijder de conditionele branch. Hardcode `pipeline_events` als primaire tabel. Verscherp verify-stap #2: "Als Phase 85 >24h live, verwacht n ≥ 1; anders escaleer."

### WARNING — 1

**[FA-10 / verificatie_derivation] Plan 04 Task 1 runbook mist de volledige SQL voor Success #3 spot-check**

- **Plan:** 86-04-PLAN.md
- **Task:** Task 1, regels 115–120
- **Probleem:** De drie-staps JOIN-chain (coordinator_run_id → pipeline_events → email_pipeline.emails) is niet uitgeschreven. Een operator die de runbook letterlijk volgt kan de spot-check niet uitvoeren zonder aanvullende kennis.
- **Fix:** Voeg de volledige helper-SQL toe aan de day-21-28 sectie van het runbook (zie FA-10 hierboven voor het SQL-sjabloon).

---

## Patches vereist voor uitvoering

### Patch 1 (BLOCKER) — 86-01-PLAN.md: verwijder stale branch uit Task 1 action

**Bestand:** `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-01-PLAN.md`
**Locatie:** Task 1 action, regels 163–167 (het `**Based on (a):**` blok)

**Vervang:**
```
**Based on (a):**
- If `coordinator_runs.decision_details` exists → primary table is `coordinator_runs cr`, join `email_pipeline.emails e ON e.id = cr.email_id::uuid`.
- If only `pipeline_events.decision_details` exists → primary table is `pipeline_events pe WHERE stage = 3`, join `coordinator_runs cr ON cr.run_id = pe.agent_run_id::uuid` (or equivalent — verify column), join `email_pipeline.emails e ON e.id = pe.email_id`.
```

**Door:**
```
**Primary table: `pipeline_events` (locked per storage_truth above).** No branch.
DDL uses:
- FROM public.pipeline_events pe WHERE pe.stage = 3 AND pe.decision_details->>'intent_proposal' IS NOT NULL AND pe.decision_details->>'intent_proposal' <> ''
- LEFT JOIN public.coordinator_runs cr ON cr.run_id::text = pe.agent_run_id (for ranked_top_intent via cr.ranked_intents->0->>'intent')
- LEFT JOIN email_pipeline.emails e ON e.id = pe.email_id
The list_tables pre-write step still runs to confirm column names, but the primary table choice is not conditional.
```

**Verify stap #2 aanpassen** (regel ~209):
```
# Verwacht: n >= 0 (migration smoke accepteert 0).
# ALS Phase 85 > 24h geleden live ging: n >= 1 verwacht; n=0 → escaleer naar storage_truth check.
```

### Patch 2 (WARNING) — 86-04-PLAN.md: voeg volledige spot-check SQL toe

**Bestand:** `.planning/phases/86-open-set-intent-discovery-capture-and-cluster-surface/86-04-PLAN.md`
**Locatie:** Task 1 action, dag-21-28 sectie (na regel 117)

**Toevoegen na de `≥8/10 same-intent per cluster = PASS Success #3` zin:**
```markdown
SQL helper (voeg in het runbook op de dag-21-28 sectie):
```sql
-- Haal sample emails op voor een cluster op basis van sample_email_ids (coordinator_run_ids).
-- Vervang de array met de sample_email_ids uit intent_proposal_clusters.
SELECT pe.email_id,
       e.subject,
       e.sender_email,
       left(e.body_plain_text, 200)        AS body_preview,
       pe.decision_details->>'intent_proposal' AS proposal_label
  FROM public.pipeline_events pe
  JOIN email_pipeline.emails e ON e.id = pe.email_id
 WHERE pe.stage = 3
   AND pe.agent_run_id = ANY(
         -- Kopieer de sample_email_ids uit de intent_proposal_clusters rij:
         ARRAY['<coordinator_run_id_1>','<coordinator_run_id_2>',...]::text[]
       )
   AND pe.decision_details->>'intent_proposal' IS NOT NULL
 ORDER BY pe.created_at DESC;
```
```

---

## Klaar om uit te voeren na patches

Na het verwerken van de twee patches (één edit in 86-01-PLAN.md, één aanvulling in 86-04-PLAN.md) zijn alle vier plans gereed voor uitvoering. Wave-volgorde: Plan 01 → Plan 02 → Plan 03 → Plan 04.
