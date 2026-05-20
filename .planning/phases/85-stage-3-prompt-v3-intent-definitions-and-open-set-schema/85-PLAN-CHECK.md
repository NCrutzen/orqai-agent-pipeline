# Phase 85 — Plan Check

**Datum:** 2026-05-20
**Checker:** gsd-plan-checker (claude-sonnet-4-6)
**Planner-iteratie:** 1 (initieel)
**Plans gecontroleerd:** 85-01-PLAN.md, 85-02-PLAN.md, 85-03-PLAN.md, 85-04-PLAN.md

---

## Eindverdict: GEEL — kleine revisies vereist vóór executie

Drie blokkerende issues, allemaal in Plan 02. Geen herplannen nodig. Plans zijn structureel
solide; de issues zijn localised en oplosbaar met chirurgische toevoegingen.

---

## Per-focus-area verdicts

### Focus 1 — Stale path drift
**PASS**

Elk plan verwijst uitsluitend naar `web/lib/inngest/functions/debtor-email-coordinator.ts`
als het coördinatorbestand. Het stale pad `coordinator-orchestrator.ts` verschijnt in alle
vier plans **alleen** als expliciete "DO NOT"-waarschuwing in de `<deviation_rules>` blokken.
Plan 01 r.174, Plan 02 r.267, Plan 03 impliciet via PATTERNS-referentie. Geen enkel plan
instruceert de executor om dat stale bestand aan te raken of aan te maken.

---

### Focus 2 — Single-switch backward-compat parser
**PASS (met kanttekening — zie Focus 11)**

Plan 02 Task 2 implementeert de discriminator als een `version`-sniff vóór `safeParse`,
niet als `z.discriminatedUnion` op de parse-aanroep. Dit is functioneel equivalent met
de enkelvoudige switch-eis: één discriminatie-site in `invoke-intent.ts:185-201`.
RESEARCH §2 documenteert beide vormen als geldig; de gekozen sniff-vorm is zelfs de
aanbevolen shape in PATTERNS §invoke-intent.ts. Er zijn geen verspreide
`if (output.intent_version === ...)` branches over andere files.

Kanttekening: de `InvokeIntentResult.output` type-verbreding van `IntentAgentOutputV2`
naar `IntentAgentOutputV2 | IntentAgentOutputV3` wordt vermeld in Plan 02 Task 2 actie
(r.181), maar de twee hardcoded `IntentAgentOutputV2` casts in de coordinator
(r.205 en r.257 in het live bestand) vallen buiten het expliciete bereik van die taak.
Dit levert een afzonderlijk issue op (zie Focus 11).

---

### Focus 3 — Orq.ai PATCH ritueel
**PASS**

Plan 03 Task 2 (`checkpoint:human-verify`) volgt alle vier verplichte CLAUDE.md-learnings:

| Vereiste | In plan? | Bewijs |
|---|---|---|
| `list_models` pre-flight (f980a2a1) | ✅ | Task 2 stap 1 r.141 |
| `update_agent` met human-readable KEY `debtor-intent-agent` (feedback_orq_update_agent_key_vs_id) | ✅ | Task 2 stap 3 r.162-163 + interfaces r.69-70 |
| anyOf voor nullable velden (3970bad9) | ✅ | Task 2 stap 2 r.146 + interfaces json_schema blok |
| `get_agent` verify na PATCH (cba7352b) | ✅ | Task 2 stap 4 r.165-174 |

Plan 03 bevat ook een expliciete `DO NOT use create_agent` regel (r.255) en controleert
op null `response_format` na PATCH (r.173).

---

### Focus 4 — Cache invalidation lock-step
**PASS (met nuance)**

De cache-key flip (van `INTENT_VERSION_V2` naar `INTENT_VERSION_V3` in
`debtor-email-coordinator.ts:190-196`) zit in **Plan 02 Task 3**, Wave 1. Plan 03
(Orq deploy) is Wave 2 en `depends_on: ["85-01", "85-02"]`. De code landt dus vóór
de agent-deploy, zoals vereist.

De wave-volgorde is correct:
- Wave 0 (Plan 01): RED tests + corpus
- Wave 1 (Plan 02): code + cache-flip
- Wave 2 (Plan 03): Orq deploy + smokes
- Wave 3 (Plan 04): operator verificatie

RESEARCH Pitfall 5 stelt correct dat V3-cache-flip + V2-cache-hit tijdens de
transitie-window geen probleem is omdat de code V3-keys opzoekt en bij cache-miss
vers classified wordt. Het omgekeerde (Plan 03 voor Plan 02) zou mixed-version chaos
opleveren. Die volgorde is geblokkeerd door de `depends_on`.

---

### Focus 5 — Hard separation invariant
**PASS**

Geen enkel plan bevat een taak die `swarm_intents` aanraakt. De enige vermelding
van `swarm_intents` in de plannen is in `out_of_scope` secties (Plan 02 r.277,
Plan 04 r.218) en als referentie in PATTERNS §Architectuur. `intent_proposal`
is in alle plans consistent beschreven als telemetrie-only, captured in JSONB,
niet gerouteerd. Promotie naar `swarm_intents` is expliciet V9.0 scope.

---

### Focus 6 — Geen schema-migratie
**PASS**

Grep op alle vier PLAN.md-bestanden: nul verwijzingen naar `supabase/migrations/`.
Plan 02 Task 3 en PATTERNS §C zijn expliciet: proposal-velden landen in bestaand
JSONB (`agent_runs.tool_outputs.intent_first_pass` via `mergeToolOutputs`, en
`coordinator_runs.decision_details` via spread-conditional). Plan 02 `deviation_rules`
r.263: "DO NOT add a coordinator_runs/agent_runs column or migration."

---

### Focus 7 — Stage 4 dispatcher onaangeroerd
**PASS**

`stage-3-dispatcher.ts` verschijnt in alle plans uitsluitend als expliciete verbodsbepaling.
In de `files_modified` frontmatters van alle vier plans: geen vermelding van
`stage-3-dispatcher.ts`. Plan 02 r.74: "Stage 4 dispatcher — DO NOT TOUCH (D-05)."
D-05 is volledig gehonoreerd.

---

### Focus 8 — Few-shot sourcing realisme
**PASS (met voorwaarde — Phase 83)**

Plan 01 Task 1 vereist dat de executor SQL uitvoert via `mcp__supabase__execute_sql`
met `received_at > '2026-05-01'` als floor (RESEARCH §1.1). De actie instrueert om
slots te documenteren als `## Slot Gaps` als een slot geen usable real row oplevert.

RESEARCH §Environment Availability lijn: "Phase 83 deployed (body_full_text populated):
**MUST CONFIRM**" — de executor wordt expliciet geïnstrueerd om Phase 83 deploy-staat
te bevestigen vóór executie van de SQL-queries.

De voorwaardelijke blokkering is geborgd in Plan 01 `out_of_scope` ("Wave 1 owns
those") en de dependency-notitie in CONTEXT.md (§Dependencies: "Phase 83 must land
first"). Geen extra actie vereist in de plans; dit is een pre-executie check die de
operator zelf doorloopt.

---

### Focus 9 — Acceptance criteria zijn falsifieerbaar
**GEMENGD — één zwak, drie sterk**

**Plan 01 must_haves** zijn sterk operationeel: `test -s 85-CORPUS.md`, telregel op
`### Slot`, csv-blok aanwezig. De V3-test-criteria zijn mechanisch verifieerbaar
("tests FAIL met 'is not exported'").

**Plan 02 must_haves** zijn sterk: `INTENT_VERSION_V3` exact byte-voor-byte,
`intentAgentOutputSchemaAny` geëxporteerd, Vitest suite groen, tsc clean.

**Plan 03 must_haves — Smoke #3** is zwak:

> "Smoke #3 (12-email payment_dispute regression set) shows ≤1/12 changing top-1 closed-list intent."

Dit is een vibes-check zolang het "≤1" niet gebonden is aan een machine-verifieerbare
exit-code. De smoke harness (Task 3) schrijft wel een exit-nonzero bij `M > 1`, maar de
`<verify>` van Task 4 checkt alleen:

```bash
grep -q "ALL 3 SMOKES GREEN" 85-AGENT-RITUAL-LOG.md
```

Dit is een grep op een string die de operator zelf schrijft — geen automatisch gate op
de smoke-harness exit-code. Dit is een WARNING-niveau issue, geen blocker (het smoke-
script zelf heeft de juiste exit-code logica; de plan-check staat het toe als ze via
menselijke taak worden uitgevoerd).

**Plan 04** is uitsluitend checkpoint-tasks (human-verify), waarvan falsifieerbaarheid
via operatorbeoordeling loopt. Dat is acceptabel voor post-deploy observatie.

---

### Focus 10 — Wave dependency ordering
**PASS**

Frontmatter:
- Plan 01: `wave: 0`, `depends_on: []`
- Plan 02: `wave: 1`, `depends_on: ["85-01"]`
- Plan 03: `wave: 2`, `depends_on: ["85-01", "85-02"]`
- Plan 04: `wave: 3`, `depends_on: ["85-03"]`

Plan 03 kan pas starten nadat Plan 02 (code + cache-flip) is gemerged. Correct.

---

### Focus 11 — BLOCKER: Impliciete type-casts in coordinator niet gedekt
**FLAG — BLOCKER**

Het live bestand `debtor-email-coordinator.ts` heeft twee hardcoded `IntentAgentOutputV2`
type-annotaties die Plan 02 Task 3 **niet** expliciet benoemt:

| Locatie | Code | Probleem |
|---|---|---|
| r.205 (live file) | `const output: IntentAgentOutputV2 = cachedFirst ?? (await invokeIntentAgent(...)).output` | Na Task 2 retourneert `invokeIntentAgent` `IntentAgentOutputV2 \| IntentAgentOutputV3`; de expliciete `IntentAgentOutputV2`-annotatie maakt dit een TypeScript-fout. |
| r.257 (live file) | `const output = (classifyResult as unknown as { output: IntentAgentOutputV2; ... }).output` | De `unknown`-cast kan de TS-fout onderdrukken, maar `output` is daarna getypeerd als `IntentAgentOutputV2`, waardoor `output.intent_proposal` niet bestaat in de type-check van de spread-conditional in Edit 2. |

Plan 02 Task 3 noemt "Edit 3 — provenance fix" voor de hardcoded `INTENT_VERSION_V2`
literal op r.242 en r.294. Het noemt ook de `must_haves`-truth: "Provenance write of
`intent_version` uses `output.intent_version`". Maar de type-annotaties op r.205 en r.257
worden niet in de actie benoemd.

**Risico:** `tsc --noEmit` faalt na Plan 02 Task 2 + Task 3, of de spread-conditional
`output.intent_proposal` geeft een TypeScript-fout ("Property 'intent_proposal' does not
exist on type 'IntentAgentOutputV2'"). Hoewel `tsc` wordt uitgevoerd in de `<verify>` van
Task 2 (`npx tsc --noEmit -p tsconfig.json`), zal de fout verschijnen op de regels in
`debtor-email-coordinator.ts`, niet in `invoke-intent.ts` — waardoor de grepping op
`grep -E "invoke-intent"` het mist en de verify-stap mogelijk niet de juiste fout oppikt.

**Fix:** Voeg aan Plan 02 Task 3 actie toe als Edit 4:

```
Edit 4 — type-annotaties verbreden in debtor-email-coordinator.ts:
- r.38: wijzig `type IntentAgentOutputV2` import naar ook `IntentAgentOutputV3` of
  `IntentAgentOutputAny` importeren.
- r.205: wijzig `const output: IntentAgentOutputV2 = ...` naar
  `const output: IntentAgentOutputV2 | IntentAgentOutputV3 = ...`
  (of `IntentAgentOutputAny` als dat type geëxporteerd wordt door types.ts).
- r.257: wijzig de `classifyResult`-cast naar `{ output: IntentAgentOutputV2 | IntentAgentOutputV3; ... }`.
```

En wijzig de `<verify>` van Task 3 om de tsc-check te doen zonder de grep-filter die
`debtor-email-coordinator.ts`-fouten zou missen:

```bash
cd web && npx vitest run lib/automations/debtor-email/coordinator lib/inngest 2>&1 | tail -40 && npx tsc --noEmit 2>&1 | grep -v "node_modules" | head -30
```

---

### Focus 12 — BLOCKER: Plan 02 Task 3 `<verify>` mist tsc-check
**FLAG — BLOCKER**

Aansluitend op Focus 11: Plan 02 Task 3 `<verify>` is:

```bash
cd web && npx vitest run lib/automations/debtor-email/coordinator lib/inngest 2>&1 | tail -40
```

Er is **geen `tsc --noEmit`** in deze verify-stap. De Task 2 verify doet wél een tsc-check,
maar filtert op `grep -E "invoke-intent"` — TypeScript-fouten in
`debtor-email-coordinator.ts` (de primaire file van Task 3) vallen er doorheen.

Plan 02 `<verification>` (fase-niveau, r.254-260) bevat wel een `npx tsc --noEmit`
maar die wordt uitgevoerd nadat alle tasks klaar zijn — pas dan worden coordinator-typefouten
zichtbaar. Dit verhoogt de kans op een verrassing nadat de executor denkt klaar te zijn.

**Fix:** Voeg aan Plan 02 Task 3 `<verify>` een tsc-stap toe zonder grep-filter:

```bash
cd web && npx vitest run lib/automations/debtor-email/coordinator lib/inngest 2>&1 | tail -40 && npx tsc --noEmit 2>&1 | grep -E "debtor-email-coordinator|invoke-intent|types" | head -20 || true
```

---

### Focus 13 — BLOCKER: Plan 02 mist expliciete behandeling van `cachedFirst` type op r.197-199
**FLAG — BLOCKER**

Aanvullend detail van hetzelfde type-probleem: het live bestand heeft op r.197-199:

```typescript
const cachedFirst = cached?.intent_first_pass as
  | IntentAgentOutputV2
  | undefined;
```

Na de cache-key flip (Edit 1) kan de cache een V2 **of** V3 resultaat teruggeven.
De cast `as IntentAgentOutputV2 | undefined` is dan incorrect voor cached V3 outputs —
`cachedFirst` mist `intent_proposal` en `proposal_reason` in zijn type. Hoewel dit op
runtime geen runtime-fout geeft (de JSONB bevat de velden ongeacht de cast), geeft het
wél een TypeScript-fout zodra `output.intent_proposal` wordt gerefereerd.

RESEARCH §2 Pitfall 5 adresseert de *semantische* cache-kwestie (V3 invalidates V2)
maar niet de type-annotatie. PATTERNS §A beschrijft de flip maar niet de cast-update.

**Fix:** Deel van dezelfde Edit 4 als hierboven: wijzig ook de `cachedFirst`-cast naar:

```typescript
const cachedFirst = cached?.intent_first_pass as
  | IntentAgentOutputV2
  | IntentAgentOutputV3
  | undefined;
```

---

## Samenvatting issues

```yaml
issues:
  - plan: "85-02"
    dimension: task_completeness
    severity: blocker
    description: >
      Plan 02 Task 3 instrueert type-annotaties op debtor-email-coordinator.ts r.205,
      r.197-199, en r.257 niet te verbreden. Na Task 2 retourneert invokeIntentAgent
      IntentAgentOutputV2 | IntentAgentOutputV3; de drie hardcoded IntentAgentOutputV2
      annotaties in de coordinator veroorzaken tsc-fouten en verhinderen de
      spread-conditional op output.intent_proposal.
    task: 3
    fix_hint: >
      Voeg Edit 4 toe aan Task 3 actie: verbreed r.197-199 (cachedFirst cast),
      r.205 (output annotatie), en r.257 (classifyResult cast) naar
      IntentAgentOutputV2 | IntentAgentOutputV3. Voeg import van IntentAgentOutputV3
      toe aan het import-blok van de coordinator (r.38).

  - plan: "85-02"
    dimension: task_completeness
    severity: blocker
    description: >
      Plan 02 Task 3 <verify> stap voert geen tsc-check uit op debtor-email-coordinator.ts.
      Task 2 <verify> filtert tsc-output op 'invoke-intent' waardoor coordinator-fouten
      onzichtbaar zijn. TypeScript-fouten in de primaire Task 3 file worden pas gevangen
      door de fase-niveau verification nadat de executor denkt klaar te zijn.
    task: 3
    fix_hint: >
      Voeg toe aan Task 3 <verify>:
      && npx tsc --noEmit 2>&1 | grep -E "debtor-email-coordinator|invoke-intent|types" | head -20 || true

  - plan: "85-03"
    dimension: verification_derivation
    severity: warning
    description: >
      Plan 03 Task 4 <verify> checkt alleen grep -q "ALL 3 SMOKES GREEN" op een door de
      operator zelf geschreven string. De smoke-harness exit-code (exit non-zero bij
      changed > 1) wordt niet als automatische gate gebruikt in de plan-verify stap.
    task: 4
    fix_hint: >
      Optioneel: voeg een tweede automated verify-stap toe die de harness in dry-run
      aanroept, of accepteer het huidige patroon als intentioneel (operator-driven
      checkpoint). Huidige aanpak is functioneel maar niet machine-verifieerbaar.
```

---

## Wat te wijzigen vóór executie

Alle drie issues zitten in **85-02-PLAN.md**. Geen andere plans hoeven gewijzigd.

### Wijziging 1 (Blocker): Plan 02, Task 3 — voeg Edit 4 toe aan `<action>`

Voeg de volgende paragraaf toe aan het einde van de `<action>` van Task 3
(na het grep-verificatieblok, vóór "Per PATTERNS"):

```
**Edit 4 — type-annotaties verbreden in debtor-email-coordinator.ts:**
Importeer `IntentAgentOutputV3` in het import-blok (r.38 — naast de bestaande
`IntentAgentOutputV2` import). Wijzig vervolgens drie annotaties:

1. r.197-199: cast `as IntentAgentOutputV2 | undefined` → `as IntentAgentOutputV2 | IntentAgentOutputV3 | undefined`
2. r.205: `const output: IntentAgentOutputV2 = ...` → `const output: IntentAgentOutputV2 | IntentAgentOutputV3 = ...`
3. r.257: cast `{ output: IntentAgentOutputV2; ... }` → `{ output: IntentAgentOutputV2 | IntentAgentOutputV3; ... }`

Zonder deze verbreding faalt `tsc --noEmit` op de spread-conditional in Edit 2
(`output.intent_proposal` bestaat niet op type IntentAgentOutputV2).
```

### Wijziging 2 (Blocker): Plan 02, Task 3 — vervang `<verify>`

Huidig:
```xml
<verify>
  <automated>cd web && npx vitest run lib/automations/debtor-email/coordinator lib/inngest 2>&1 | tail -40</automated>
</verify>
```

Vervangen door:
```xml
<verify>
  <automated>cd web && npx vitest run lib/automations/debtor-email/coordinator lib/inngest 2>&1 | tail -40 && npx tsc --noEmit 2>&1 | grep -v "node_modules" | grep -E "coordinator|invoke-intent|types" | head -20; echo TSC-DONE</automated>
</verify>
```

---

## Dekking requirements vs. plans

| Req ID | Omschrijving | Plans | Status |
|---|---|---|---|
| P85-R1 | Deploy prompt v3 + json_schema V3 | 85-03 | GEDEKT |
| P85-R2 | 11+ few-shots, ≥8 nieuw, boundary-weighted | 85-01 | GEDEKT |
| P85-R3 | TS Zod V3 schema + INTENT_VERSION constant | 85-01 (RED), 85-02 (GREEN) | GEDEKT |
| P85-R4 | Backward-compat parser V2 + V3 | 85-01 (RED), 85-02 (GREEN) | GEDEKT |
| P85-R5 | Smoke test non-null + null proposal | 85-03 | GEDEKT |
| P85-R6 | Disambiguation regression ≤1/12 | 85-01 (baseline), 85-03 (smoke), 85-04 (onafhankelijk) | GEDEKT |

---

## Plan-overzicht

| Plan | Tasks | Files | Wave | Autonomous | Status |
|---|---|---|---|---|---|
| 85-01 | 2 | 4 | 0 | ja | Geldig |
| 85-02 | 3 | 3 | 1 | ja | Geldig na revisies |
| 85-03 | 4 | 2 | 2 | nee (checkpoints) | Geldig |
| 85-04 | 4 | 2 | 3 | nee (checkpoints) | Geldig |

Scope is binnen budget: max 4 tasks per plan, max 4 files per plan.

---

## Context-compliance (CONTEXT.md decisions)

| Decision | Gedekt door | Status |
|---|---|---|
| D-01 intent_definitions blok | Plan 03 Task 1 (prompt-compositie) | ✅ |
| D-02 disambiguatietabel | Plan 03 Task 1 (6 boundary-regels) | ✅ |
| D-03 ≥8 few-shots real corpus | Plan 01 Task 1 (SQL-sourcing) | ✅ |
| D-04 V3 schema anyOf-nullable | Plan 02 Task 1 + Plan 03 Task 2 | ✅ |
| D-05 Stage 4 dispatcher unchanged | Alle plans: explicit DO NOT TOUCH | ✅ |
| D-06 Orq ritual (list_models→PATCH→get_agent) | Plan 03 Task 2 | ✅ |
| D-07 Backward-compat (V2+V3) | Plan 01 RED, Plan 02 implementatie | ✅ — maar stale path `coordinator-orchestrator.ts` in CONTEXT D-07 is correct als "DOES NOT EXIST" aangemerkt in alle plans |

Geen deferred ideas (Phase 86 storage, V9.0 Learning Inbox, sales-email) zijn in scope geslopen.

---

## CLAUDE.md compliance

Alle relevante CLAUDE.md-learnings zijn correct verankerd:
- `3970bad9` (anyOf nullable): Plan 03 Task 2 + interfaces blok
- `f980a2a1` (list_models pre-flight): Plan 03 Task 2 stap 1
- `cba7352b` (create drops response_format): Plan 03 Task 2 stap 3b + deviation_rules
- `feedback_orq_update_agent_key_vs_id` (key niet slug): Plan 03 Task 2 stap 3a + interfaces
- Inngest replay-safety: geen nieuwe IDs geïntroduceerd; bestaand patroon ongewijzigd
- Supabase JSONB double-encoding: niet van toepassing (geen nieuwe JSON parse in scope)

---

*Plan check compleet. Retourneer naar planner met de drie gemarkeerde revisies.*
