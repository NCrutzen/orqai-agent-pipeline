---
phase: 86-open-set-intent-discovery-capture-and-cluster-surface
verified: 2026-05-20T18:10:00Z
status: human_needed
score: 7/7
overrides_applied: 0
human_verification:
  - test: "Navigeer naar /automations/debtor-email/intent-proposals in productie"
    expected: "200 OK, lege staat met tekst 'No novel intent proposals yet'"
    why_human: "Vereist live Vercel-deploy verificatie; kan niet programmatisch worden getest zonder de server te starten"
  - test: "Open de Intent proposals tab en check de Supabase tabel intent_proposal_views"
    expected: "Na het openen van de pagina staat er één rij in intent_proposal_views met een server-gestempelde operator_id en user_agent"
    why_human: "Vereist actieve browsersessie en live auth-context (operator_id = Supabase auth user.id)"
  - test: "Wacht tot de eerste 04:00 Amsterdam cron tick na Vercel-deploy en check Inngest dashboard"
    expected: "Inngest functie 'intent-proposals-refresh' zichtbaar, eerste run = 0 clusters (verwacht pre-V3-traffic), geen error"
    why_human: "Cron-tick vindt plaats op een specifiek tijdstip; kan niet gesimuleerd worden zonder live Inngest-omgeving"
  - test: "Voer Day-0 pre-flight uit zoals gedocumenteerd in 86-DAY-0-CHECKPOINT.md"
    expected: "Alle stappen PASS; kalenderdata ingevuld in 86-VERIFICATION-LOG.md onder 'Calendar dates'"
    why_human: "Plan 04 Task 2 is expliciet autonomous:false; operatorhandeling vereist"
---

# Phase 86: Open-set intent discovery — Verificatierapport

**Phase Goal:** Operator-facing discovery surface voor novel intent proposals van Phase 85's V3 agent — read-only, klaar voor de 4-week observatieperiode voor V9.0 promotie.
**Geverifieerd:** 2026-05-20T18:10:00Z
**Status:** human_needed
**Re-verificatie:** Nee — initiële verificatie

---

## Doel bereikt?

### Observable Truths

| # | Truth | Status | Bewijs |
|---|-------|--------|--------|
| 1 | Hard separation: geen `swarm_intents` writes, geen `swarm_noise_categories` reads | PASS | grep op alle 5 Phase 86 runtime-bestanden: alle treffers zijn uitsluitend commentaar-regels, nooit runtime-code |
| 2 | View leest `pipeline_events.decision_details` (NIET `coordinator_runs`) | PASS | `20260520_phase86_intent_proposals_v1.sql` r.37: `FROM public.pipeline_events pe ... WHERE pe.stage = 3 AND pe.decision_details->>'intent_proposal' IS NOT NULL` |
| 3 | `derive-stage-tabs.ts` onaangeroerd; `DiscoveryTabStrip` is een aparte component | PASS | `git log -- derive-stage-tabs.ts` toont geen Phase 86 commit; `discovery-tab-strip.tsx` is een zelfstandige component met eigen `DiscoveryTab` type |
| 4 | Geen matviews met `intent_proposal*` prefix | PASS | PostgREST geeft `PGRST205` "Could not find 'intent_proposals_v1_mv'" + hint-verwijzing naar de reguliere view, confirmeert dat er geen matview bestaat |
| 5 | Geen nieuwe npm-dependencies | PASS | `python3 -c` filter op `package.json` geeft `{}` voor levenshtein/cluster-packages; alle algoritmen zijn pure-JS in `cluster.ts` |
| 6 | Cron string correct + event trigger + Inngest registratie | PASS | Regel 44: `{ cron: "TZ=Europe/Amsterdam 0 4 * * *" }`, regel 45: `{ event: "intent-proposals.refresh" }`; `route.ts` r.82: `intentProposalsRefresh` geregistreerd; `events.ts` r.625: event gedeclareerd |
| 7 | Lege staat crasht niet op 0 clusters; telemetry server-gestempeld | PASS | `client-shell.tsx` r.198-219: `clusters.length === 0` branch toont `EMPTY_STATE`; `actions.ts` r.44-48: `operator_id` via `supabase.auth.getUser()`, `user_agent` via `headers()` |

**Score:** 7/7 truths geverifieerd

---

## Artefacten

### Plan 01 — Data layer

| Artefact | Status | Bewijs |
|----------|--------|--------|
| `supabase/migrations/20260520_phase86_intent_proposals_v1.sql` | PASS | Bestand aanwezig; `security_invoker=true` aanwezig; leest `pipeline_events.decision_details`; 10 correcte kolommen |
| `supabase/migrations/20260520_phase86_intent_proposal_clusters.sql` | PASS | Bestand aanwezig; `BEGIN/COMMIT` wrapper aanwezig; PK = `id`, UPSERT-key = `(swarm_type, centroid_label, window_end)`; RLS aan |
| `supabase/migrations/20260520_phase86_intent_proposal_views.sql` | PASS | Bestand aanwezig; `BEGIN/COMMIT` wrapper aanwezig; RLS aan; INSERT-policy voor `authenticated` |
| `web/lib/automations/intent-proposals/types.ts` | PASS | `ProposalRow.email_id: string | null` (correcte nullable type); 10 velden matchen view-projectie |

### Plan 02 — Clustering + Inngest

| Artefact | Status | Bewijs |
|----------|--------|--------|
| `web/lib/automations/intent-proposals/normalize.ts` | PASS | Pure-JS, geen imports, idempotent snake_case normalisatie |
| `web/lib/automations/intent-proposals/cluster.ts` | PASS | Two-row DP Levenshtein; greedy single-link clustering; deterministisch gesorteerde output |
| `web/lib/inngest/functions/intent-proposals-refresh.ts` | PASS | Dual-trigger (cron + event); debounce 5 min event-pad; alle DB-I/O in `step.run`; geen `/** */` JSDoc-blokken; geen destructuring van `inngest.send` |
| `web/lib/inngest/events.ts` | PASS | `"intent-proposals.refresh"` event gedeclareerd op r.625 |
| `web/app/api/inngest/route.ts` | PASS | `intentProposalsRefresh` geïmporteerd (r.41) en geregistreerd op `serve()` (r.82) |

### Plan 03 — UI surface

| Artefact | Status | Bewijs |
|----------|--------|--------|
| `_shell/discovery-tab-strip.tsx` | PASS | Aparte component; `DiscoveryTab.key` union; `present`-flag via `stage3_coordinator_agent_key`; read-only contract in header |
| `intent-proposals/page.tsx` | PASS | RSC; leest `intent_proposal_clusters`; `notFound()` bij onbekende swarm of geen stage3-key; cross-swarm distinct-count |
| `intent-proposals/client-shell.tsx` | PASS | Geen promote/approve/dismiss/reject buttons; `useEffect` telemetrie-mount; 5s client debounce |
| `intent-proposals/actions.ts` | PASS | `operator_id` server-gestempeld; `user_agent` server-gestempeld; `inngest.send` niet gedestructureerd; Zod-validatie op input |

### Plan 04 — Docs

| Artefact | Status | Bewijs |
|----------|--------|--------|
| `86-OPERATOR-RUNBOOK.md` | PASS | 26× "Success #"; day-0/7/14/21/28/Friday secties aanwezig; day-21-28 SQL gebruikt `id` en `window_end` (niet de draft-kolomnamen `cluster_id`/`refresh_window_end`); schema-noot verwijst naar migratie |
| `86-VERIFICATION-LOG.md` | PASS | Lege templates aanwezig voor alle checkdatums |
| `86-DAY-0-CHECKPOINT.md` | PASS | Bestand aanwezig met pre-flight stappen |

---

## Sleutelverbindingen (key links)

| Van | Naar | Via | Status |
|-----|------|-----|--------|
| `intent-proposals-refresh.ts` | `intent_proposals_v1` | Supabase `.from("intent_proposals_v1").select("*")` | PASS |
| `intent-proposals-refresh.ts` | `intent_proposal_clusters` | `.upsert(rows, { onConflict: "swarm_type,centroid_label,window_end" })` | PASS |
| `actions.ts` | `intent_proposal_views` | `admin.from("intent_proposal_views").insert(...)` | PASS |
| `actions.ts` | Inngest event | `inngest.send({ name: "intent-proposals.refresh", data: {} })` | PASS |
| `page.tsx` | `intent_proposal_clusters` | `admin.from("intent_proposal_clusters").select("*")` | PASS |
| `route.ts` | `intentProposalsRefresh` | import + functie-array in `serve()` | PASS |

---

## Live DB-verificatie

| Check | Resultaat | Betekenis |
|-------|-----------|-----------|
| `intent_proposals_v1` PostgREST-respons | `[]` (HTTP 200, alle 10 kolommen selecteerbaar) | View bestaat en is zugankelijk; 0 rijen = verwacht (Phase 85 V3 nog geen traffic) |
| `intent_proposal_clusters` count | `[{"count":0}]` | Tabel bestaat; 0 clusters = verwacht (cron nog niet getikt) |
| `intent_proposal_views` count | `[{"count":0}]` | Tabel bestaat; 0 views = verwacht (geen operator heeft de tab geopend) |
| Matview `intent_proposals_v1_mv` | `PGRST205 not found` | Geen matview aanwezig — correct (drift #2: reguliere view + snapshot-tabel) |

---

## Testresultaten

| Testsuite | Bestanden | Tests | Resultaat |
|-----------|-----------|-------|-----------|
| `lib/automations/intent-proposals/__tests__/view-shape.test.ts` | 1 | 4 | PASS |
| `lib/automations/intent-proposals/__tests__/normalize.test.ts` | 1 | 14 | PASS |
| `lib/automations/intent-proposals/__tests__/cluster.test.ts` | 1 | 28 | PASS |
| `lib/inngest/functions/__tests__/intent-proposals-refresh.test.ts` | 1 | 8 | PASS |
| `_shell/__tests__/discovery-tab-strip.test.tsx` | 1 | 7 | PASS |
| `intent-proposals/__tests__/client-shell.test.tsx` | 1 | 8 | PASS |
| **Totaal** | **4 bestanden** | **54 tests** | **54/54 PASS** |

`npx tsc --noEmit` → **exit 0**, nul fouten.

---

## Anti-pattern scan

| Bestand | Patroon | Bevinding |
|---------|---------|-----------|
| `intent-proposals-refresh.ts` | Geen JSDoc-blokken (`/** */`) | 0 gevonden — geen cron-string-sluit-comment risico |
| `actions.ts` | `inngest.send` niet gedestructureerd | 0 gevonden — Phase 65 this-binding pitfall vermeden |
| `client-shell.tsx` | Promote/approve/dismiss/reject knoppen | 0 gevonden — read-only contract intact |
| `client-shell.tsx` | Empty state op 0 clusters | Aanwezig op r.198-219 — geen crash |
| `intent-proposals-refresh.ts` | Niet-deterministisch buiten `step.run` | Alle `Date.now()` calls zitten binnen `step.run("cluster-and-upsert")` — replay-veilig |

Geen blokkerende anti-patterns gevonden.

---

## Human Verification Required

### 1. Live page smoke-test

**Test:** Navigeer naar `/automations/debtor-email/intent-proposals` in de productie-dashboard na Vercel-deploy.
**Expected:** HTTP 200; lege staat zichtbaar met tekst "No novel intent proposals yet. The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic."
**Waarom human:** Vereist live geauthenticeerde browsersessie en actieve Vercel-deploy.

### 2. Telemetrie-insert bij tab open

**Test:** Open de Intent proposals pagina terwijl ingelogd; voer daarna uit: `SELECT * FROM public.intent_proposal_views ORDER BY viewed_at DESC LIMIT 1;`
**Expected:** Één rij met een niet-null `operator_id` (= Supabase auth user.id van de ingelogde operator) en een niet-null `user_agent` string.
**Waarom human:** Vereist actieve auth-sessie; `operator_id` wordt server-gestempeld uit `supabase.auth.getUser()` — kan niet worden gesimuleerd zonder live context.

### 3. Eerste Inngest cron-tick observatie

**Test:** Controleer Inngest dashboard na de eerste 04:00 Amsterdam tick post-deploy.
**Expected:** Functie `intent-proposals-refresh` zichtbaar in Inngest Cloud; run succesvol met `{ proposals: 0, clusters_upserted: 0, views_purged: 0 }` (verwacht totdat Phase 85 V3 traffic produceert).
**Waarom human:** Cron tikt op een specifiek tijdstip; live Inngest-observatie vereist.

### 4. Day-0 pre-flight checkpoint (operator-owned)

**Test:** Voer `86-DAY-0-CHECKPOINT.md` stap-voor-stap uit en vul `86-VERIFICATION-LOG.md` §"Calendar dates" in.
**Expected:** Alle pre-flight stappen PASS; observatievenster van 4 weken start.
**Waarom human:** Plan 04 Task 2 is expliciet `autonomous: false` — de 4-week observatieperiode is operator-paced (PENDING-OPERATOR per fase-scope).

---

## Afwijkingen van CONTEXT.md succes-criteria

De vier succes-criteria uit `86-CONTEXT.md` zijn allen **operator-paced wall-clock checks** die pas na respectievelijk 7, 14, 21 en 28 dagen gemeten kunnen worden. Ze zijn PENDING-OPERATOR, niet gefaald:

| Success criterium | Status | Toelichting |
|-------------------|--------|-------------|
| #1: ≥5 clusters binnen 7 dagen | PENDING-OPERATOR | Observatievenster nog niet gestart; Drift #4 (86-04-SUMMARY) legt uit dat ≥1 cluster op dag 7 voldoende is als sub-criterium |
| #2: ≥1 cluster matcht verwacht "missing intent" | PENDING-OPERATOR | Vereist live V3 traffic (Phase 85 PR #32 merged op 2026-05-20T15:14 UTC) |
| #3: ≥80% precisie op top-3 clusters (operator spot-check) | PENDING-OPERATOR | Vereist voldoende clusters; runbook plaatst dit op dag 21–28 |
| #4: Operator opent de tab ≥2× per week gedurende 4 weken | PENDING-OPERATOR | Kan pas na week 4 worden vastgesteld |

---

## Slotbeoordeling

**Aanbeveling: KEEP-OPEN-PENDING-OPERATOR-WINDOW**

De code-deliverables van Phase 86 zijn volledig en correct:
- Alle 11 commits aanwezig en geverifieerd
- 3 migraties toegepast op de live Supabase-database (3 objecten bereikbaar via PostgREST)
- 54/54 tests groen
- `tsc --noEmit` exit 0
- Hard separation volledig gerespecteerd
- Geen matviews, geen nieuwe npm-dependencies
- Cron string correct, Inngest registratie wired
- Runbook SQL gebruikt correcte kolomnamen (`id`, `window_end`, `refreshed_at`)

De fase kan niet worden gesloten als PASSED totdat:
1. De 4 human verification items boven zijn afgevinkt (live smoke, telemetrie, Inngest tick, Day-0 pre-flight)
2. De 4-weekse observatieperiode is doorlopen met PASS-verdicts in `86-VERIFICATION-LOG.md`

De observatieperiode is bewust operator-paced en staat buiten de scope van geautomatiseerde verificatie. Phase 87 leest `86-VERIFICATION-LOG.md` als invoer voor de V8.1 milestone-retro.

---

_Geverifieerd: 2026-05-20T18:10:00Z_
_Verifier: Claude (gsd-verifier)_
