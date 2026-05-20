---
phase: 84-stage-1-noise-rules-for-ap-automation-fyi-traffic
verified: 2026-05-20T14:50:00Z
status: human_needed
score: 9/11 must-haves verified (2 PENDING-OPERATOR — shadow window not yet started)
overrides_applied: 0
human_verification:
  - test: "7-day shadow window — stap 1: Day-0 preflight uitvoeren"
    expected: "16 noise rows live, 16 classifier_rules candidate, CLASSIFIER_CRON_MUTATE=false, pipeline routes matches naar status='predicted' (geen auto-action)"
    why_human: "Vereist Vercel productie deploy-bevestiging en handmatige SQL-verificatie per PROMOTION-RUNBOOK.md sectie 1"
  - test: "D-05 gate evaluatie + promotie (Day 7+)"
    expected: "Per (category, swarm) row: Wilson-path (N>=30, CI-lo>=0.92) OF corpus-path (>=10 positives, 0 FPs, 0 shadow-FPs) gate gehaald; eligible rows gepromoveerd; R-04 per-swarm rollback gedispositioneerd"
    why_human: "Wall-clock 7 dagen + bulk-review queue werken + operator oordeel per categorie; niet door Claude uitvoerbaar"
---

# Phase 84: Stage 1 Noise Rules for AP-Automation FYI Traffic — Verificatierapport

**Phase Goal (verbatim ROADMAP):** Stage 1 noise rules for AP-automation FYI traffic — 8 noise categories locked 2026-05-20 (Coupa Betaald/Goedgekeurd, ISS PtP auto-reply, M365 quarantine, FrieslandCampina rejects, RSK phishing notices, FarmPlus supplier bank-change, own-domain outbound loopback — Coupa PO dropped per calibration). New `swarms.tenant_domains` column + codegen. Wilson-CI shadow gate before promotion. Cross-swarm by default (debtor-email + sales-email).

**Geverifieerd:** 2026-05-20T14:50:00Z
**Status:** HUMAN_NEEDED — code + data volledig en groen; 7-daags shadow window nog niet gestart
**Re-verificatie:** Nee — initiële verificatie

---

## Doel-bereik

### Observable Truths

| # | Truth | Status | Bewijs |
|---|-------|--------|--------|
| 1 | 8 D-01 category keys bestaan als `Category` union in classify.ts | VERIFIED | Lines 27-37: alle 8 keys aanwezig (incl. `own_outbound_invoice_loopback` voor type-volledigheid) |
| 2 | 7 in-classifier regex matchers zijn specificity-first geplaatst in classify.ts | VERIFIED | Lines 337-419: 7 matchers voor SUBJECT_AUTO_REPLY / SENDER_PAYMENT_ROLE branches; anchored `^$` + bounded `\d{1,12}`; ReDoS-safe |
| 3 | `own_outbound_invoice_loopback` worker-side regel met R-02 direction guard | VERIFIED | classifier-screen-worker.ts: direction-check (inbound default), fromDomain ∈ tenant_domains, enum na regex-abstentie; R-02 spoofing guard aanwezig |
| 4 | Direction field doorgesluisd van stage-0-safety-worker naar stage-1 | VERIFIED | stage-0-safety-worker.ts lines 102-177: `direction` destructured + doorgegeven in beide emit-sites (override + main) |
| 5 | `swarms.tenant_domains jsonb NOT NULL DEFAULT '[]'::jsonb` live in DB | VERIFIED | Live DB: `debtor-email: ["fire-control.nl","moyneroberts.com","smeba-fire.be","smeba.nl"]`, `sales-email: ["smeba.nl"]` |
| 6 | 16 `swarm_noise_categories` rows live (8 keys × 2 swarms), alle `action='categorize_archive'` | VERIFIED | Live DB-query: 16 rows, alle `categorize_archive`, geen nulls |
| 7 | 16 `classifier_rules` candidate rows live (8 `regex`/debtor-email + 8 `agent_intent`/sales-email) | VERIFIED | Live DB-query: 16 rows, alle `status='candidate'`, kinds `{'regex','agent_intent'}` |
| 8 | Hard-separation invariant: 0 overlap tussen `swarm_noise_categories` en `swarm_intents` | VERIFIED | Live DB-query: `swarm_intents overlap = 0`; static-check test 2/2 GREEN |
| 9 | Phase 83 hardcoded TENANT_DOMAINS stub retired; codegen-import live | VERIFIED | debtor-email-coordinator.ts line 43: `import TENANT_DOMAINS_BY_SWARM from …generated`; geen `"smeba-fire.be"` meer als literal |
| 10 | 7-daags shadow window gestart + D-05 gate geëvalueerd | PENDING-OPERATOR | Shadow window niet gestart; vereist Vercel deploy-bevestiging + PROMOTION-RUNBOOK.md sectie 1-7 |
| 11 | Per-category promotie gedispositioneerd (promoted OF R-04 rollback) | PENDING-OPERATOR | Afhankelijk van truth 10; 14/16 rows verwacht EXTEND-SHADOW per RUNBOOK disposition matrix |

**Score:** 9/11 truths geverifieerd (2 PENDING-OPERATOR per design — shadow window is wall-clock + operator-driven)

---

## Vereiste Artefacten

| Artefact | Verwacht | Status | Details |
|----------|----------|--------|---------|
| `web/lib/debtor-email/classify.ts` | 7 D-01 regex matchers | VERIFIED | 7 matchers lines 345-419; alle 56 tests GREEN (commit `0b3a4a07`) |
| `web/lib/inngest/functions/classifier-screen-worker.ts` | loopback worker-rule + direction | VERIFIED | Lines 239-276: loopback branch; commit `b6707bf8` |
| `web/lib/inngest/functions/stage-0-safety-worker.ts` | direction passthrough | VERIFIED | Lines 102-316: direction in beide emit-sites; commit `b6707bf8` |
| `web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts` | codegen output — 2 swarms, 5 domains total | VERIFIED | Bestand aanwezig; `TENANT_DOMAINS_BY_SWARM` met juiste inhoud; `as const` |
| `web/scripts/gen-tenant-domains.ts` | codegen script | VERIFIED | Bestand aanwezig; foutmelding als kolom nog niet bestaat |
| `supabase/migrations/20260520_phase84_tenant_domains.sql` | `ADD COLUMN IF NOT EXISTS tenant_domains jsonb` + backfill | VERIFIED | Bestand aanwezig; idempotent; per-swarm UPDATEs correct |
| `supabase/migrations/20260520_phase84_noise_categories.sql` | 8 × 2 = 16 idempotente INSERTs | VERIFIED | 8 ON CONFLICT blokken geverifieerd; 16 rows live in DB |
| `supabase/migrations/20260520_phase84_classifier_rules_seed.sql` | 16 rows (8 regex + 8 agent_intent) | VERIFIED | 16 VALUES rows; live DB bevestigt |
| `web/__tests__/static-checks/swarm-hard-separation.test.ts` | hard-separation invariant CI-gate | VERIFIED | 2/2 GREEN |
| `web/lib/debtor-email/__tests__/classify.test.ts` | 28 Phase 84 matcher tests GREEN | VERIFIED | 56/56 passed (28 Phase 84 + 28 pre-existing); geen regressions |
| `web/lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` | 4 loopback tests GREEN + 19 existing | VERIFIED | 23/23 passed |
| `web/lib/classifier/corpus-mapping.ts` | AGREEMENT_MAP exhaustiviteit | VERIFIED | 8 lege mappings toegevoegd (commit `1fe541b1`); tsc clean |
| `.planning/phases/84-…/CORPUS-SAMPLES.md` | per-category positives + D-05 rollup + Day-7 kolommen | VERIFIED | 8 H2 secties; rollup tabel met Day-7 + promotion_date kolommen |
| `.planning/phases/84-…/PROMOTION-RUNBOOK.md` | 7-sectie operator-runbook | VERIFIED | Secties 0-7 + Appendix A+B aanwezig; live wilson.ts constanten geciteerd (0.92, N>=30) |

---

## Key Link Verificatie

| Van | Naar | Via | Status | Details |
|-----|------|-----|--------|---------|
| `stage-0-safety-worker.ts` emit | `classifier/screen.requested` event | `direction` field in payload | VERIFIED | Beide emit-sites (override + main safe-verdict branch) sturen `direction` door |
| `classifier-screen-worker.ts` loopback | `swarmRow.tenant_domains` | `loadSwarm` cache + `swarms.tenant_domains` column | VERIFIED | `(swarmRow.tenant_domains as string[])` op line 257; reads live registry |
| `debtor-email-coordinator.ts` | `TENANT_DOMAINS_BY_SWARM` | `tenant-domains.generated.ts` import | VERIFIED | Hardcoded stub retired; spread naar mutable `string[]` op call site (TS4104 fix) |
| `classify.ts` | `from` sender field | `fromFromEvent ?? ""` in classifier-screen-worker | VERIFIED | Pre-Phase-84 had `from: ""` hardcoded; gerepareerd in commit `b6707bf8` |
| `classifier-promotion-cron` (Phase 60) | `classifier_rules.status` | `classifier_rule_telemetry` view + Wilson-CI | WIRED (Phase 60 infra) | Niet aangeraakt in Phase 84; `CLASSIFIER_CRON_MUTATE` env-var beheert promotie |

---

## Data-Flow Trace (Level 4)

| Artefact | Data variable | Source | Produceert echte data | Status |
|----------|---------------|--------|----------------------|--------|
| `classify.ts` | `from`, `subject`, `bodySnippet` | Event payload via `classifier-screen-worker.ts` | Ja — live email velden | FLOWING |
| `classifier-screen-worker.ts` loopback | `swarmRow.tenant_domains` | `public.swarms.tenant_domains` (live DB, `loadSwarm` cache) | Ja — DB-rij live bevestigd | FLOWING |
| `swarm_noise_categories` | Categorie-routing | DB registry + classificatie-resultaat | Ja — 16 rows live, `action='categorize_archive'` | FLOWING |
| `classifier_rules` | Wilson-CI telemetrie | `classifier_rule_telemetry` view (Phase 60 infra) | Ja, maar: requires bulk-review queue gewerkt worden tijdens shadow | FLOWING (conditie: bulk-review queue) |

**Kritieke architecturale noot (gedocumenteerd in RUNBOOK Appendix B):** `classifier_rule_telemetry` filtert alleen rijen met `human_verdict IS NOT NULL`. Voor Phase 84 `candidate` regels, vallen gematchte emails door naar `status='predicted'` in bulk-review. De Wilson-path (Method A) is alleen bereikbaar als de operator de bulk-review queue werkt tijdens het shadow window. De corpus-path (Method B) werkt onafhankelijk. Dit is gedocumenteerd in PROMOTION-RUNBOOK.md en is geen defect van Phase 84 zelf.

---

## Gedragsspot-checks

| Gedrag | Commando | Resultaat | Status |
|--------|----------|-----------|--------|
| classify.ts 28 Phase 84 tests groen | `npx vitest run lib/debtor-email/__tests__/classify.test.ts` | 56/56 passed | PASS |
| classifier-screen-worker.ts 23 tests groen | `npx vitest run lib/inngest/functions/__tests__/classifier-screen-worker.test.ts` | 23/23 passed | PASS |
| Hard-separation static check groen | `npx vitest run __tests__/static-checks/swarm-hard-separation.test.ts` | 2/2 passed | PASS |
| TypeScript clean | `npx tsc --noEmit -p tsconfig.json` | Geen output (exit 0) | PASS |
| 16 noise rows live in DB | DB-query via REST API | 16 rows, alle `categorize_archive` | PASS |
| 16 classifier_rules candidate rows live | DB-query via REST API | 16 rows, `{'candidate'}`, `{'regex','agent_intent'}` | PASS |
| `swarms.tenant_domains` populated per swarm | DB-query via REST API | debtor-email: 4 domains, sales-email: 1 domain | PASS |
| swarm_intents overlap = 0 | DB-query + static check | 0 overlap | PASS |

---

## Requirements Coverage

| Vereiste | Beschrijving | Status | Bewijs |
|----------|--------------|--------|--------|
| D-01 | 8 noise categories, elk een eigen registry row | SATISFIED | 16 rows (8 × 2 swarms) in `swarm_noise_categories` live |
| D-02 | Regels in Stage 1 (classifier_rules), NIET Stage 0 | SATISFIED | Alle 16 rows in `classifier_rules`; 0 rows in Stage 0 safety tabellen |
| D-03 | `own_outbound_invoice_loopback` via `swarms.tenant_domains` lookup | SATISFIED | Kolom live; codegen committed; worker-rule geïmplementeerd met direction guard |
| D-04 | Alle 8 categories `action='categorize_archive'` | SATISFIED | Alle 16 DB rows bevestigd |
| D-05 | Volume-adaptive shadow gate (7-dag floor; Wilson OR corpus-pad) | PENDING-OPERATOR | PROMOTION-RUNBOOK.md met beide paden gereed; shadow niet gestart |
| D-06 | Subject-pattern stabiliteitscheck upfront (Coupa) | SATISFIED | CORPUS-SAMPLES.md en CONTEXT.md bevestigen 3+ maanden template-stabiliteit; `door ISS`-anchor only |
| D-07 | Geen handler-logica in Phase 84 | SATISFIED | Geen Stage 4 code aangeraakt |
| D-08 | Cross-swarm by default (debtor-email + sales-email) | SATISFIED | 16 rows = 8 × 2 swarms |
| R-02 | Direction guard op loopback (spoofing mitigation) | SATISFIED | `effectiveDirection === 'inbound'` check aanwezig in worker; test `negative (Pitfall 3 spoofing)` GREEN |
| R-05 | Codegen drift gate (`npm run codegen && git diff --exit-code`) | SATISFIED | Generated file byte-identical aan script output (verified pre-push); CI gate in `package.json` |

---

## Anti-Patronen

| Bestand | Patroon | Ernst | Impact |
|---------|---------|-------|--------|
| `CORPUS-SAMPLES.md` — 7 van 8 categorieën hebben <10 hand-confirmed positives | Corpus te klein voor Wilson-path op korte termijn | Waarschuwing | Verwacht per D-05; PROMOTE-RUNBOOK disposition matrix adresseert dit (14/16 rows: EXTEND-SHADOW / HOLD-CANDIDATE) |
| `supplier_bank_change_notification` — slechts 1 corpus-positief | Zwakste categorie; promotie niet aanbevolen | Waarschuwing | RUNBOOK disposition matrix: row 13+14 = HOLD-CANDIDATE; geen auto-promotie |
| CONTEXT.md vermeldt `auto_active` en `0.95`; live code gebruikt `promoted` en `0.92` | Terminologie-drift | Info | Gedocumenteerd in PROMOTION-RUNBOOK.md Appendix A; operationeel niet-blokkerend |

Geen blokkerende anti-patronen gevonden in code.

---

## Uitgestelde items (later in v8.1/v8.2 opgepakt)

| Item | Uitgesteld naar | Bewijs |
|------|----------------|--------|
| `coupa_po_notification` noise rule | V8.2 / Phase 86 discovery | CONTEXT.md "Dropped from scope"; 40-email cluster vereist Phase 86 discovery surface voor veilige promotie |
| Handler logica voor `supplier_bank_change` (AP master-data update) | V8.2 | D-07 expliciet |
| Handler logica voor `m365_quarantine` (IT ticket) | V8.2 | D-07 expliciet |
| Sales-email `kind='agent_intent'` Wilson-path fix | Phase 85+ | 84-04-SUMMARY defect #3: LLM-keying mismatch betekent dat sales-email rows Wilson-path niet kunnen halen; HOLD-CANDIDATE per disposition matrix |
| Expliciete `direction='inbound'` op ingest-route emit | Toekomstig | 84-03-SUMMARY open follow-up; current default = `'inbound'`; functionaliteit ongewijzigd |

---

## Menselijke Verificatie Vereist

### 1. Shadow Window Start (Day 0)

**Test:** Voer PROMOTION-RUNBOOK.md sectie 1 uit: pre-flight SQL (16 noise rows + 16 classifier_rules candidate), bevestig `CLASSIFIER_CRON_MUTATE` is `false`/unset in Vercel, voer Day-0 shadow spot-check uit (gematchte emails moeten `status='predicted'` krijgen in bulk-review, geen auto-action).

**Verwacht:** Alle vier Day-0 checks passeren; `shadow_start` datum geregistreerd per categorie in CORPUS-SAMPLES.md.

**Waarom operator:** Vereist Vercel productie deploy-log verificatie en live pipeline-output beoordeling die niet programmatisch uitvoerbaar zijn.

### 2. D-05 Gate Evaluatie + Promotie (Day 7+)

**Test:** Voer PROMOTION-RUNBOOK.md secties 2-7 uit over 7 dagen: dagelijkse telemetrie SQL, loopback spot-check (CONTEXT verificatie 2), Stage 3 volume-drop spot-check (verificaties 3-4), Day-7 gate evaluatie per (category, swarm) row, Method A of B promotie voor eligible rows, R-04 per-swarm rollback als sales-email FPs opduiken.

**Verwacht:** Alle 16 (category, swarm) rows gedispositioneerd (promoted OF EXTEND-SHADOW OF DROP-sales-email per R-04); CORPUS-SAMPLES.md "Day 7 decision" kolom ingevuld; `promotion_date` ingevuld voor gepromoveerde rows; Phase 84 closure signaal via `/gsd:resume`.

**Waarom operator:** Wall-clock 7 dagen; vereist bulk-review queue te werken voor Wilson-path; oordeel over false positives; handmatige DB-updates voor corpus-path promotie.

---

## Gaps Samenvatting

Geen code- of data-defecten gevonden die het fase-doel blokkeren. Alle 10 commits zijn aanwezig en geverifieerd. De twee PENDING-OPERATOR items zijn geen gaps — ze zijn structureel operator-gedreven per D-05 ontwerp en vereisen wall-clock tijd plus live pipeline-data.

**Aanbeveling: KEEP-OPEN-PENDING-SHADOW**

De code + data deliverables van Phase 84 zijn volledig en correct. De fase sluit zodra de operator het 7-daagse shadow window voltooit en alle 16 (category, swarm) rows dispositioneert via PROMOTION-RUNBOOK.md. Aanbevolen operator-volgorde:

1. Bevestig Wave 2 + Wave 1 deploy live in Vercel productie (Inngest dashboard + deploy log)
2. Bevestig `CLASSIFIER_CRON_MUTATE` is `false` in Vercel env
3. Voer PROMOTION-RUNBOOK.md sectie 1 Day-0 SQL uit; registreer `shadow_start` in CORPUS-SAMPLES.md
4. Volg secties 2-3 dagelijks (7 dagen)
5. Day 7: evalueer D-05 gate per row; voer Method A of B uit voor eligible rows
6. Signaal `/gsd:resume "Phase 84 closure complete"` met per-category samenvatting

---

_Geverifieerd: 2026-05-20T14:50:00Z_
_Verifier: Claude (gsd-verifier)_
