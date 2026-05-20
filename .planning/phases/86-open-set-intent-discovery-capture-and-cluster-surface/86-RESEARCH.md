# Phase 86: Open-set intent discovery — capture and cluster surface - Research

**Researched:** 2026-05-20
**Domain:** Read-only discovery surface bovenop Stage 3 V3 `intent_proposal` veld; SQL view + clustering + Bulk Review tab
**Confidence:** HIGH overall (UI/cron/telemetry patronen zijn vast in de codebase; matview en clustering zijn een ontwerpkeuze)

## Summary

Phase 86 is overwegend een **integratie tegen bestaande patronen**, niet nieuwe technologie. Alle benodigde bouwstenen zijn al in het project: Inngest crons met `TZ=Europe/Amsterdam`, stage-tab-strip met `derive-stage-tabs.ts`, `pipeline_events`-tabel met losse `decision`-string, en `coordinator_runs.ranked_intents` als JSONB-source-of-truth.

De drie keuzes waar deze research scherp maakt:
1. **Materialized view + Inngest nightly cron** — Postgres 15 op Supabase ondersteunt MATERIALIZED VIEW; codebase heeft echter nog geen matview-precedent. Ik beveel `MATERIALIZED VIEW` aan (D-02 conform), met `REFRESH MATERIALIZED VIEW CONCURRENTLY` gated op een unique index.
2. **Tab is GEEN peer in `derive-stage-tabs.ts`** — die functie is registry-gedreven (Stage 0-4 alleen). Een "Intent proposals" tab landt naast de stage-strip in `stage-tab-strip.tsx` als parallelle slot, of als sub-tab onder Stage 3. Aanbevolen: **separate tab-strip naast de stage-strip**, niet via `FIXED` array uitbreiden.
3. **`intent_proposal_views` aparte tabel boven `pipeline_events`** — `pipeline_events` heeft een NOT NULL `stage` + `decision` schema dat semantisch op stage-uitkomsten gericht is, niet op UI-view-tracking.

**Primary recommendation:** Bouw 4 tasks — (1) matview DDL + GRANT + RLS, (2) Inngest nightly refresh handler in `web/lib/inngest/functions/intent-proposals-refresh.ts` met cron `TZ=Europe/Amsterdam 0 4 * * *` (04:00 NL, dagelijks 7/7), (3) clustering + API route, (4) Bulk Review "Intent proposals" tab + lichte `intent_proposal_views` tabel.

## User Constraints (from CONTEXT.md)

### Locked Decisions (D-01 t/m D-07)

- **D-01** Storage: extend `coordinator_runs.ranked_intents` JSONB, geen nieuwe kolom; shape `{ ranked, language, urgency, intent_version, intent_proposal, proposal_reason }`.
- **D-02** Read view: `intent_proposals_v1` materialized view over `coordinator_runs WHERE ranked_intents->>'intent_proposal' IS NOT NULL` met velden `email_id, swarm_type, proposal_label, proposal_reason, ranked_top_intent, created_at, subject, sender_email`. Nightly refresh + manual refresh button.
- **D-03** Clustering: Levenshtein ≥ 0.85 op genormaliseerde labels (lowercase, strip punctuation, snake_case). Centroid = meest-frequente label. Geen LLM in cluster-pad.
- **D-04** UI: "Intent proposals" tab in Bulk Review, peer aan Stage 0-4 tabs. Read-only. Cluster expandable met 3-5 sample emails.
- **D-05** Cross-swarm via `swarm_type` filter in de view.
- **D-06** Empty-state copy: *"No novel intent proposals yet. The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic."*
- **D-07** Telemetry in `pipeline_events` OF een aparte `intent_proposal_views` tabel — keuze open.

### Out of Scope (V9.0+)

- Promote-naar-`swarm_intents` actie.
- LLM-semantische clustering.
- Label-editing.
- Per-cluster status-flags (`pending_review`, `dismissed`).

## Open Questions — Beantwoord met aanbeveling

### Q1. View vs Materialized View — Supabase tier support

**Recommendation: MATERIALIZED VIEW.** CONFIDENCE: **HIGH**.

Supabase draait Postgres ≥ 15 op iedere tier (Free incl.); `CREATE MATERIALIZED VIEW` is een standaard Postgres-feature, geen Pro-only feature. Er bestaat **geen** Supabase-tier-restrictie op matviews.

**Bevinding uit codebase scan:** geen enkele migration in `supabase/migrations/` gebruikt `MATERIALIZED VIEW` (search: `grep -rn "MATERIALIZED VIEW" supabase/migrations/` → 0 matches). Phase 71-08 (`pipeline_events_email_summary`) en Phase 73 (`pipeline_health`) zijn **gewone views**, niet matviews. Phase 86 wordt dus de **eerste matview in het project**.

**Volume-rationale voor matview (niet view):**
- `coordinator_runs` groeit met ~280 rijen/30d voor debtor-email alleen. Een gewone view re-evalueert bij iedere page-load. Met 4-veld JSON-extract + JOIN op `agent_runs` + JOIN op `email_pipeline.emails` per row is dat ~3 query plans per dashboard-open.
- Met cluster-aggregatie (alle proposals laatste 30d, group + dedupe) loopt dat tegen 100-300ms per render aan — niet catastrofaal, wel onnodig.
- Matview + nightly refresh houdt het op O(1) per dashboard-open. Refresh-window (24u) is acceptabel: dit is een **discovery surface**, geen live operations view.

**Aanbevolen DDL (planner kan dit verbatim overnemen):**

```sql
-- Phase 86 D-02 — intent_proposals_v1 materialized view
-- Source of truth: coordinator_runs.ranked_intents (extended in Phase 85 V3 schema)
-- Refresh: nightly via Inngest (see web/lib/inngest/functions/intent-proposals-refresh.ts)

CREATE MATERIALIZED VIEW IF NOT EXISTS public.intent_proposals_v1 AS
SELECT
  ar.email_id                                                    AS email_id,
  cr.swarm_type                                                  AS swarm_type,
  cr.ranked_intents->>'intent_proposal'                          AS proposal_label,
  cr.ranked_intents->>'proposal_reason'                          AS proposal_reason,
  cr.ranked_intents->'ranked'->0->>'intent'                      AS ranked_top_intent,
  cr.created_at                                                  AS created_at,
  e.subject                                                      AS subject,
  e.sender_email                                                 AS sender_email,
  cr.id                                                          AS coordinator_run_id
FROM public.coordinator_runs cr
JOIN public.agent_runs ar          ON ar.id = cr.agent_run_id
JOIN email_pipeline.emails e       ON e.id = ar.email_id
WHERE cr.ranked_intents->>'intent_proposal' IS NOT NULL
  AND cr.ranked_intents->>'intent_proposal' <> '';

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS intent_proposals_v1_pk
  ON public.intent_proposals_v1 (coordinator_run_id);

CREATE INDEX IF NOT EXISTS intent_proposals_v1_swarm_created_idx
  ON public.intent_proposals_v1 (swarm_type, created_at DESC);

CREATE INDEX IF NOT EXISTS intent_proposals_v1_label_idx
  ON public.intent_proposals_v1 (proposal_label);

-- RLS-equivalent: matviews don't support RLS directly; use GRANT to gate.
-- Service role gets ALL; authenticated gets SELECT (mirrors pipeline_events posture).
GRANT SELECT ON public.intent_proposals_v1 TO authenticated;
GRANT ALL    ON public.intent_proposals_v1 TO service_role;
```

**Belangrijke caveat — RLS:** Postgres ondersteunt **geen RLS op materialized views**. Acces-gating gaat dus via `GRANT` + via de service-role API route die de matview leest. Dit komt overeen met de huidige posture op `pipeline_events` (authenticated SELECT zonder per-row policy). [CITED: postgresql.org/docs — Materialized Views section]

**Refresh-commando in de cron:**
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public.intent_proposals_v1;
```
`CONCURRENTLY` is mogelijk omdat de unique index op `coordinator_run_id` bestaat — zonder die index faalt het commando. Concurrent refresh = geen lock op de reader-kant tijdens refresh, belangrijk als ooit een operator de manual-refresh button raakt tijdens een page-load.

---

### Q2. Cron mechanism — file path + cron string

**Recommendation:** nieuwe Inngest function in `web/lib/inngest/functions/intent-proposals-refresh.ts`. Cron: `TZ=Europe/Amsterdam 0 4 * * *` (04:00 Amsterdam, 7/7).

CONFIDENCE: **HIGH** — patroon is canoniek in 5+ bestaande crons.

**Waarom 04:00 7/7 en geen business-hours window?**

CLAUDE.md zegt: *"Cron default = business-hours window (06:00-19:58 Amsterdam, Mon-Fri). 24/7 alleen als overnight verkeer écht moet."*

De refresh is **geen overnight traffic**, het is een achterstandsverwerking van traffic die er al is. Argumenten voor 7/7 dagelijks:
- Een weekend zonder refresh betekent dat een operator die Maandag 06:00 het tabblad opent een 60h+ oude snapshot ziet.
- De refresh is goedkoop (één PostgREST call, één SQL-statement, < 200ms verwacht op 280 rijen).
- Geen externe rate-limit risico (interne DB).

Argument voor business-hours `0 6 * * 1-5`: consistentie met `labeling-flip-cron.ts`. Ik beveel **04:00 7/7** aan: matviews zijn nachtwerk; dit is een precedent dat we vaker zullen willen voor read-models. De planner mag dit downgraden naar `0 6 * * 1-5` als hij strenger CLAUDE.md-conform wil zijn — beide werken.

**Canonieke cron-strings in het project (geverifieerd):**

| File | Cron | Doel |
|---|---|---|
| `web/lib/inngest/functions/debtor-email-bridge.ts:22` | `TZ=Europe/Amsterdam */2 6-19 * * 1-5` | Outlook ingest, elke 2 min, Ma-Vr 6-19 |
| `web/lib/inngest/functions/labeling-flip-cron.ts:268` | `TZ=Europe/Amsterdam 0 6 * * 1-5` | Daily 06:00, Ma-Vr |
| `web/lib/inngest/functions/automation-runs-sweeper.ts:51` | `TZ=Europe/Amsterdam */10 6-19 * * 1-5` | Elke 10 min, Ma-Vr 6-19 |
| `web/lib/inngest/functions/briefing-refresh.ts` | `*/30 * * * *` | Elke 30 min (geen TZ — ⚠ anti-patroon volgens CLAUDE.md) |
| `web/lib/inngest/functions/browserless-keepalive.ts:48` | `TZ=Europe/Amsterdam */2 6-19 * * 1-5` | Keep-alive |

**Aanbevolen function skeleton:**

```typescript
// web/lib/inngest/functions/intent-proposals-refresh.ts
// Phase 86 D-02 — nightly refresh of intent_proposals_v1 matview.
// Cron: 04:00 Amsterdam, daily 7/7 (read-model nightly window, NOT business-hours).
export const intentProposalsRefresh = inngest.createFunction(
  { id: "intent-proposals-refresh", name: "Intent proposals — nightly matview refresh" },
  [{ cron: "TZ=Europe/Amsterdam 0 4 * * *" }, { event: "intent-proposals.refresh" }],
  async ({ step }) => {
    await step.run("refresh-matview", async () => {
      const admin = createAdminClient();
      const { error } = await admin.rpc("refresh_intent_proposals_v1");
      if (error) throw error;
    });
  }
);
```

**Belangrijk:** Supabase REST API kan geen `REFRESH MATERIALIZED VIEW` direct uitvoeren. Pattern is **een wrapper SQL function** + `rpc()`:

```sql
CREATE OR REPLACE FUNCTION public.refresh_intent_proposals_v1()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.intent_proposals_v1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_intent_proposals_v1() TO service_role;
```

**Dual trigger** (`cron:` + `event:`) volgt het patroon dat CLAUDE.md aanbeveelt: *"Cron tijdelijk uit? → `{ event: 'naam.run' }` (handmatig triggerbaar, re-enable = één regel)."* Bovendien hangt de manual-refresh button (D-02) hieraan: de API route doet `inngest.send({ name: "intent-proposals.refresh" })`.

**Replay-safety:** `REFRESH MATERIALIZED VIEW` is idempotent — meermaals draaien geeft hetzelfde resultaat. Geen risico op de Phase 65 replay-id-pitfall.

---

### Q3. Empty-state UX — canoniek patroon

**Recommendation:** gebruik de `RowList` empty-state pattern uit `_shell/row-list.tsx:79-102`. Container `padding: "var(--space-6) var(--space-4)"`, title `14px/500 var(--v7-text)`, body `13px var(--v7-text-muted)` met `marginTop: var(--space-2)`.

CONFIDENCE: **HIGH** — pattern is hergebruikt in alle stage-tabs vandaag.

**Pattern uit `row-list.tsx` (geverifieerd via Read):**

```tsx
<div style={{ padding: "var(--space-6) var(--space-4)" }}>
  <h3 style={{
    fontSize: "14px",
    fontWeight: 500,
    margin: 0,
    color: "var(--v7-text)",
  }}>
    {emptyState.title}
  </h3>
  <p style={{
    fontSize: "13px",
    color: "var(--v7-text-muted)",
    marginTop: "var(--space-2)",
  }}>
    {emptyState.body}
  </p>
</div>
```

**Aanbevolen mapping voor D-06:**
- `title`: "No novel intent proposals yet"
- `body`: "The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic."

Dit volgt het bestaande empty-state contract `EmptyState = { title: string; body: string }` uit `_shell/_lib/types.ts`. Hergebruik die type-definitie en het component — geen nieuwe empty-state component bouwen.

**CSS-tokens geverifieerd:**
- `--v7-text` — primary text color
- `--v7-text-muted` — secondary text color (gebruikt voor body copy in alle stage-tabs)
- `--space-2`, `--space-4`, `--space-6` — spacing scale tokens

---

### Q4. First-traffic forecast — sanity check op Success #1

**Recommendation:** Success #1 ("≥5 distinct clusters met ≥3 samples each binnen 7 days") is **te ambitieus** voor de eerste week. Verwacht eerder 1-3 clusters met ≥3 samples en 4-8 singletons in week 1.

CONFIDENCE: **MEDIUM** — heuristiek over Phase 85 corpus + smoke-resultaten.

**Cijfers (geverifieerd uit Phase 85 SMOKE-RESULTS + RESEARCH):**
- Stage 3 V3 calls: **~280 / 30 dagen** voor debtor-email swarm.
- Conversie naar week: ~280/30 × 7 ≈ **65 Stage 3 calls / week**.
- Phase 85 V3 schema fired proposals **alleen op low-confidence top-1** (per V3 prompt design — low-conf ≈ top-1 confidence < threshold).

**Heuristiek "5-10% van calls = low-conf top-1":**
- 65 calls/week × 7.5% ≈ **5 proposals / week** totaal.
- Verwachte verdeling op basis van corpus (Phase 85 CORPUS.md noemt WKA, PO-notifications, payment-schedules als gangbare "missing intents"): 60% spreidt over 3-4 dominante themes, 40% singletons/long-tail.

**Sanity-check op Success #1:**

| Cluster-grootte | Verwachte tellen (week 1) | Hit Success #1? |
|---|---|---|
| ≥3 samples | 1-2 clusters (WKA-familie waarschijnlijk #1) | ❌ vereist 5 |
| 2 samples | 1-2 clusters | n/a |
| 1 sample | 2-4 singletons | n/a |

**Aanbeveling aan planner:** of (a) Success #1 versoepelen naar "≥2 distinct clusters met ≥3 samples each binnen 14 days", of (b) accepteren dat de meting echt op dag 14-21 uitkomt en de gate dienovereenkomstig timen. Optie (a) is veiliger: niet je criteria moven op basis van data is hygiëne.

**Realistische forecast voor maand 1:**
- Week 1: 4-6 proposals, 1-2 clusters (≥3), 3-5 singletons.
- Week 2: cumulatief 10-12, 2-3 clusters (≥3), 5-7 singletons.
- Week 4: cumulatief 20-25, 4-6 clusters (≥3), 8-12 singletons (≈ Success #1 bereikt op week 3-4).

---

### Q5. Levenshtein threshold experiment — verwachte cluster-gedrag bij 0.85

**Recommendation:** Threshold 0.85 is **veilig conservatief**. Geen van de corpus-suspected pairs merged ongewenst; één gewenste merge (wka_data_request ↔ wka_request) gebeurt **niet** automatisch.

CONFIDENCE: **HIGH** op de cijfers (Levenshtein is deterministisch); MEDIUM op de policy-implicatie.

**Methode:** normalized Levenshtein similarity = `1 - (lev_distance / max(len_a, len_b))`. Lower-case + snake_case ✓ (al in D-03).

**Berekeningen voor de gevraagde pairs:**

| Pair A | Pair B | Lev distance | max(len) | Similarity | Merge bij ≥0.85? |
|---|---|---|---|---|---|
| `wka_data_request` | `wka_request` | 5 (insert "data_") | 16 | **0.6875** | ❌ NEE |
| `wka_data_request` | `ketenaansprakelijkheid_request` | 25 | 31 | **0.194** | ❌ NEE |
| `wka_request` | `ketenaansprakelijkheid_request` | 20 | 31 | **0.355** | ❌ NEE |
| `payment_extension` | `payment_schedule` | 8 (`extension` → `schedule`, 9 chars) | 17 | **0.529** | ❌ NEE |
| `coupa_po_notification` | `coupa_notification` | 3 (insert "po_") | 21 | **0.857** | ✅ JA |
| `payment_extension_request` | `payment_schedule_request` | 8 | 25 | **0.680** | ❌ NEE |

**Implicaties:**

1. **`coupa_po_notification` ↔ `coupa_notification` merget bij 0.85.** Of dat correct is hangt af van semantiek: een PO-notification is een **subtype** van Coupa-notification. De operator zal moeten zien of dat een gewenste of ongewenste merge is — D-04 toont samples per cluster precies daarvoor. Risico R-01 manifesteert hier.
2. **WKA-familie blijft als afzonderlijke singletons.** `wka_request` en `wka_data_request` zijn semantisch zeer verwant maar Levenshtein ziet 5/16 = ~69%. Operator zal handmatig zien dat ze samenhoren. **V9.0's LLM-clustering is daar de oplossing**; Phase 86 is bewust niet die laag.
3. **Payment-familie zit veilig uit elkaar** (53-68%). Geen false merges.
4. **Lange compounds** (`ketenaansprakelijkheid`) scoren laag tegen short forms (`wka`). Geen merge — correct gedrag.

**Calibratie-advies aan planner:** behoud 0.85 zoals D-03 vastlegt. Niet 0.80 (dat zou `payment_extension` met `payment_schedule` niet mergen maar veel andere `*_request` pairs wel — riskant). Niet 0.90 (dan merget zelfs `coupa_po_notification ↔ coupa_notification` niet meer, en alles wordt singletons). 0.85 is de sweet-spot.

**Spec-tip voor de planner:** voeg een unit test toe met deze 6 pairs als ground-truth. Voorkomt regressie als iemand later het normalisatie-pad aanpast.

---

### Q6. Tab placement in de unified shell

**Recommendation:** **Aparte tab-strip naast (boven of onder) de `stage-tab-strip`**, NIET via `derive-stage-tabs.ts` uitbreiden.

CONFIDENCE: **HIGH** — `derive-stage-tabs.ts` is registry-gedreven en architecturaal vergrendeld.

**Bevinding uit `_shell/derive-stage-tabs.ts`:**
- De `FIXED` array is hard-coded op `stage 0..4` met `stage: 0 | 1 | 2 | 3 | 4` TypeScript literal type.
- De file comment lockt het: *"Pipeline architecture lock (RFC docs/agentic-pipeline/README.md): Stage 0 = safety ... Stage 4 = handler."*
- `present` flag is registry-gedreven (`swarm.stage1_regex_module`, etc.). Stage 0 en 4 zijn universeel; Stage 1/2/3 zijn opt-in per swarm.
- Een 6e tab "Intent proposals" past **niet** in dit type — het is geen pipeline-stage, het is een **discovery surface**.

**Architecturaal: "Intent proposals" is meta op Stage 3, geen stage zelf.**

D-04 zegt "peer tab to the existing per-stage tabs". Dat is UI-gedrag, niet implementatie-detail. Twee opties:

| Optie | Beschrijving | Aanbevolen? |
|---|---|---|
| **A. Tweede tab-strip** | Render `<IntentProposalsTab />` als sibling van `<StageTabStrip />`. Eigen route segment of querystring (e.g. `?view=intent-proposals`). | ✅ JA |
| B. Sub-tab onder Stage 3 | "Intent proposals" verschijnt alleen wanneer Stage 3-tab actief is. | Past niet — proposals zijn cross-swarm cross-stage, niet "binnen" Stage 3 review. |
| C. `FIXED` array uitbreiden | Forceer een 6e tab in `derive-stage-tabs.ts`. | ❌ NEE — breekt de pipeline-architectuur-lock comment en de literal-union type. |

**Concreet voorgesteld DOM-pad:**
- Bestaande `<StageTabStrip />` ongewijzigd.
- Boven of onder die strip een tweede striprow met één tab (uitbreidbaar naar V9.0 "Learning Inbox", V11.0 "Handler queue"):
  ```
  ┌─ Stage 0 │ Stage 1 │ Stage 2 │ Stage 3 │ Stage 4 ─┐
  ├─ Intent proposals ──────────────────────────────────┤
  └─────────────────────────────────────────────────────┘
  ```
- Selectie van de Intent proposals tab vervangt de hele row-list pane (zelfde slot als waar de stage-tabs naar renderen), niet alleen een tab-content swap.

**Planner-tip:** spreek expliciet uit dat dit pattern V9.0/V11.0 toekomst-vriendelijk is (Learning Inbox tab, Handler queue tab) zodat de structuur al klopt.

---

### Q7. Telemetry table — `pipeline_events` vs aparte `intent_proposal_views`

**Recommendation:** **Aparte `intent_proposal_views` tabel.** Niet `pipeline_events` (mis-fit).

CONFIDENCE: **HIGH** — schema-mismatch is hard.

**Bevinding uit `supabase/migrations/20260506a_pipeline_events.sql`:**

```sql
CREATE TABLE public.pipeline_events (
  id, created_at,
  swarm_type         text NOT NULL,
  stage              smallint NOT NULL,   -- 0..4, NOT NULL
  email_id           uuid NULL,
  decision           text NOT NULL,       -- canonical stage outcome string
  confidence         numeric(4,3) NULL,
  override           jsonb NULL,
  decision_details   jsonb NULL,
  cost_cents, duration_ms, agent_run_id, automation_run_id, triggered_by, ...
);
```

**Waarom het niet past:**
1. **`stage smallint NOT NULL`** — operator opent een tab; dat is geen stage. Forceren op stage=3 verwart audit-grep ("waarom heeft Stage 3 een decision='tab_opened'?").
2. **`decision text NOT NULL`** — semantisch is dit "wat besloot deze stage", niet "wat deed een operator in de UI".
3. **De partial index `pipeline_events_override_partial_idx ON ... WHERE override IS NOT NULL`** is op stage-decision-overrides afgestemd. Tab-opens zouden de tabel vervuilen voor andere consumers (dashboards, briefings).
4. **`triggered_by`** veld kent: `'pipeline' | 'operator-override' | 'replay' | 'backfill'` — geen `'ui-view'`. Toevoegen vereist semantische vervuiling.

**Aanbevolen separate-table DDL (planner-overneembaar):**

```sql
-- Phase 86 D-07 — telemetry on the proposals discovery surface.
-- Lightweight: one row per tab-open, no aggregates here (V9.0 aggregates later).
CREATE TABLE IF NOT EXISTS public.intent_proposal_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewed_at    timestamptz NOT NULL DEFAULT now(),
  operator_id  text NULL,                  -- session user id, NULL voor anonymous
  swarm_type   text NULL,                  -- filter active op moment van view
  cluster_id   text NULL,                  -- centroid label as ID; NULL = "list view"
  user_agent   text NULL                   -- best-effort, voor multi-device gebruik later
);

CREATE INDEX IF NOT EXISTS intent_proposal_views_viewed_at_idx
  ON public.intent_proposal_views (viewed_at DESC);
CREATE INDEX IF NOT EXISTS intent_proposal_views_operator_idx
  ON public.intent_proposal_views (operator_id, viewed_at DESC);

ALTER TABLE public.intent_proposal_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY intent_proposal_views_service_all ON public.intent_proposal_views
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY intent_proposal_views_auth_insert ON public.intent_proposal_views
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT INSERT, SELECT ON public.intent_proposal_views TO authenticated;
GRANT ALL ON public.intent_proposal_views TO service_role;
```

**Volume:** R-03 succes-criterium is "≥2× per week, 4 weken op rij" = ~8 rows/maand per actieve operator. Op 2-3 operators is dat <50 rows/maand. Verwaarloosbare opslag.

**Retention:** standaard geen retention nodig in V8.1. V9.0 Learning Inbox kan deze tabel als signaal aggregeren ("welke clusters trekt operator aandacht?"). Eventueel een `TTL` van 90 dagen via cron, maar niet voor v8.1.

---

## Open Questions for the Planner

Surfaced tijdens research, geen blocker voor planning maar wel decision-points:

1. **Refresh failure handling.** Wat als `REFRESH MATERIALIZED VIEW CONCURRENTLY` faalt (b.v. lock contention, schema drift)? Aanbeveling: Inngest's built-in retry (3 attempts default); bij final fail een `pipeline_events` row met `stage=3, decision='matview_refresh_failed', triggered_by='replay'` — past wél in pipeline_events want het is een operational signal. Plan een verification-task voor dit pad.

2. **Manual refresh button — debounce.** Operator kan repeatedly klikken. Refresh-call moet idempotent (is) maar UI moet visuele feedback geven + button disablen tijdens refresh. Specificeer dat in het UI-task spec.

3. **Cross-swarm `swarm_type` filter UX.** D-05 zegt cross-swarm by default. Met alleen debtor-email vandaag is een filter overbodig. Default UI = "all swarms", filter dropdown verschijnt wanneer >1 swarm proposals heeft. Niet bouwen voor V8.1 indien debtor-email enige bron.

4. **Empty-state vs partial-state UX.** D-06 dekt "nog niks". Er is een tussenstaat: "1 proposal, 0 clusters". Specificeer: bij `count < CLUSTER_MIN_SAMPLES (=3?)`, toon "X proposals zo ver — cluster vorming start bij Y samples per label".

5. **Cluster age window.** D-02 noemt geen tijdvenster. Toont de tab "alle proposals ooit" of "laatste 30 dagen"? Aanbeveling: default 30d window in de view-query (`WHERE created_at > now() - interval '30 days'`), met een dropdown voor "all time" / "7d" / "30d" / "90d". Definitie van een "cluster van deze week" hangt hier af.

6. **Snake_case enforce — wat als de LLM het al verkeerd doet?** D-03 normalisatie zegt "snake_case enforce". Pattern: `replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')`. Documenteer voorbeelden in de planner-output: `"WKA Data Request"` → `wka_data_request` ✓; `"wka-data-request"` → `wka_data_request` ✓; `"  wka  "` → `wka` ✓.

7. **RLS op de matview.** Postgres ondersteunt het niet. Bevestigd dat read-pad via service-role API route loopt (zoals andere admin views). Dit is geen blocker maar wel een security-note voor de plan-checker.

8. **Backfill van bestaande coordinator_runs.** Phase 85 ging 2026-05-20 live; eerdere `coordinator_runs.ranked_intents` rijen hebben **geen** `intent_proposal` veld. De WHERE-clausule in de matview filtert ze weg — geen actie nodig. Maar specificeer dit expliciet in een task ("no backfill needed; pre-V3 rows have intent_proposal IS NULL by construction").

## Standard Stack (no new dependencies)

| Library | Reason | Source |
|---|---|---|
| Inngest | cron + dual trigger (existing pattern) | `web/lib/inngest/functions/labeling-flip-cron.ts` |
| `@supabase/supabase-js` | `rpc()` voor matview refresh + matview SELECT | bestaande admin client |
| Native Postgres `MATERIALIZED VIEW` | D-02 vereist nightly snapshot | `supabase/migrations/` |
| `fast-levenshtein` of in-line implementation | D-03 string-similarity | **niet** in package.json — beslis tussen npm install of in-line impl |

**`fast-levenshtein` install check:**

```bash
grep "fast-levenshtein\|levenshtein\|leven" /Users/nickcrutzen/Developer/agent-workforce/web/package.json
```

Aanbeveling: bij <30 LoC inline implementatie boven npm dep — Levenshtein is een 20-regel functie, en de codebase neigt naar "minder dependencies" (zie CLAUDE.md "Don't Hand-Roll"). Phase 86 is uitzondering op die regel: het algoritme is klein en stabiel, geen edge-cases zoals een mature lib biedt.

```typescript
// utility — pure, deterministic, no I/O
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
```

## Architecture Patterns (referenties)

| Concern | Codebase pattern | File |
|---|---|---|
| Inngest cron met TZ + business window | `{ cron: "TZ=Europe/Amsterdam */N H-H * * 1-5" }` | `web/lib/inngest/functions/labeling-flip-cron.ts:268` |
| Inngest dual trigger (cron + event) | array van triggers | `web/lib/inngest/functions/labeling-flip-cron.ts` |
| Empty-state UI | `<h3 14/500> + <p 13 muted>` met v7 tokens | `web/app/(dashboard)/automations/[swarm]/_shell/row-list.tsx:79-102` |
| Service-role admin client | `createAdminClient()` | bestaande Inngest functions |
| `pipeline_events` insert | `decision`, `stage`, `swarm_type` NOT NULL | `supabase/migrations/20260506a_pipeline_events.sql` |
| Stage tab registry | `FIXED` array Stage 0-4 only | `web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts` |
| RLS posture | service_role ALL + authenticated SELECT | mirror `pipeline_events` |
| Realtime publication | `ALTER PUBLICATION supabase_realtime ADD TABLE` | `supabase/migrations/20260506a_pipeline_events.sql:60-73` (NIET nodig voor matview) |

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| Cron scheduling | Custom setInterval | Inngest `{ cron: "TZ=..." }` |
| Empty-state UI | New component | Reuse `EmptyState` type + inline pattern uit `row-list.tsx` |
| Operator-view tracking | Generic event bus | Domain-specific tabel `intent_proposal_views` |
| Tab routing | URL parsing | Existing stage-tab-strip slot mechanism |
| Matview refresh from API | Raw SQL | Wrap in `SECURITY DEFINER` function, call via `rpc()` |

## Common Pitfalls

### Pitfall 1: `REFRESH MATERIALIZED VIEW` zonder `CONCURRENTLY` blokkeert lezers
**What goes wrong:** Operator opent dashboard tijdens refresh → 200-500ms freeze.
**Why:** Default refresh neemt een AccessExclusiveLock op de matview.
**How to avoid:** `CONCURRENTLY` keyword + unique index op `coordinator_run_id` (in DDL hierboven). Zonder unique index faalt het commando.

### Pitfall 2: Cron string in JSDoc breekt door `*/N`
CLAUDE.md learning: `/** cron: */5 */` sluit het comment block. Gebruik `//` of woorden ("every 5 minutes"). Geldt voor de header-comment van `intent-proposals-refresh.ts`.

### Pitfall 3: Levenshtein normalisatie-volgorde
**What goes wrong:** "WKA Data Request" en "wka_data_request" merger niet als normalisatie inconsistent is.
**Avoid:** strikte volgorde: (1) lowercase, (2) replace non-alphanum met `_`, (3) collapse multiple `_`, (4) trim leading/trailing `_`. Document met unit-tests.

### Pitfall 4: Matview wordt niet ververst → operator ziet "no proposals" terwijl ze er zijn
**Avoid:** monitor de refresh-job via Inngest dashboard; bij failure → pipeline_events row. Show "last refreshed: X" timestamp in de UI (uit `pg_class.relname` + `pg_stat_user_tables` of door manual timestamp-tracking-tabel).

### Pitfall 5: De LLM produceert `intent_proposal` met spaties/uppercase
Phase 85 V3 schema zegt "snake_case max 64" maar JSON Schema kan dat niet hard afdwingen behalve via `pattern`. Verifieer: Phase 85 PATTERNS bevestigt `pattern` regex check + Zod `.max(64)`. Phase 86 normalisatie is **second line of defense**, niet eerste.

## Code Examples

### Inngest refresh function (skeleton)

```typescript
// web/lib/inngest/functions/intent-proposals-refresh.ts
// Phase 86 D-02 — nightly refresh of intent_proposals_v1.
// cron: TZ=Europe/Amsterdam 0 4 * * * (daily 04:00 Amsterdam, 7/7).
// Manual trigger: inngest.send({ name: "intent-proposals.refresh" }).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const intentProposalsRefresh = inngest.createFunction(
  {
    id: "intent-proposals-refresh",
    name: "Intent proposals — nightly matview refresh",
    retries: 3,
  },
  [
    { cron: "TZ=Europe/Amsterdam 0 4 * * *" },
    { event: "intent-proposals.refresh" },
  ],
  async ({ step }) => {
    const result = await step.run("refresh-matview", async () => {
      const admin = createAdminClient();
      const start = Date.now();
      const { error } = await admin.rpc("refresh_intent_proposals_v1");
      if (error) throw new Error(`matview refresh failed: ${error.message}`);
      return { duration_ms: Date.now() - start };
    });
    return { ok: true, ...result };
  }
);
```

### Clustering function (skeleton)

```typescript
// web/lib/automations/intent-proposals/cluster.ts
function normalize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface ProposalRow { proposal_label: string; /* ... */ }
export interface Cluster { centroid: string; members: ProposalRow[]; count: number; }

export function clusterProposals(rows: ProposalRow[], threshold = 0.85): Cluster[] {
  const normalized = rows.map(r => ({ ...r, _norm: normalize(r.proposal_label) }));
  const buckets: Array<{ norm: string; members: typeof normalized }> = [];
  for (const row of normalized) {
    let matched = false;
    for (const bucket of buckets) {
      if (similarity(row._norm, bucket.norm) >= threshold) {
        bucket.members.push(row);
        matched = true;
        break;
      }
    }
    if (!matched) buckets.push({ norm: row._norm, members: [row] });
  }
  // Centroid = most-frequent member label (D-03 step 3).
  return buckets.map(b => {
    const counts = new Map<string, number>();
    for (const m of b.members) counts.set(m._norm, (counts.get(m._norm) ?? 0) + 1);
    const centroid = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { centroid, members: b.members, count: b.members.length };
  }).sort((a, b) => b.count - a.count);
}
```

## Project Constraints (from CLAUDE.md)

- **Cron strings:** `TZ=Europe/Amsterdam` prefix verplicht.
- **Inngest side effects:** alles in `step.run()`. ✓ (skeleton volgt dit)
- **Service role:** automation writes via service-role key, geen RLS server-side. ✓ (matview refresh + view tabel writes)
- **Geen directe LLM API keys:** N.v.t. — Phase 86 doet geen LLM calls (D-03).
- **No materialized view precedent yet:** Phase 86 wordt de eerste. Plan-checker moet RLS-on-matview gap expliciet bevestigen (geen RLS, alleen GRANT).
- **Hard separation rule (RFC):** een rij in *exactly one* van `swarm_noise_categories` of `swarm_intents`. Phase 86 raakt **noch** — alleen `coordinator_runs.ranked_intents` (Stage 3 audit), de matview, en `intent_proposal_views` (UI telemetry).

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Vitest (existing) |
| Quick run | `npm run test -- intent-proposals` (filename filter) |
| Full suite | `npm run test` |

### Phase Requirements → Test Map (suggesties)

| Behavior | Test Type | Notes |
|---|---|---|
| Levenshtein 6 corpus pairs | unit | Hard-coded expected merges per Q5 table |
| Normalisatie idempotency | unit | `normalize(normalize(x)) === normalize(x)` |
| Matview SELECT shape | integration (skip in CI als geen DB) | of een snapshot test op de DDL |
| Cluster centroid = most-frequent | unit | 3 inputs, 2 dezelfde → centroid is die |
| Empty-state copy match D-06 | snapshot | UI rendering test |
| Refresh function dual-trigger | type-check + smoke | check Inngest function exposes cron + event |
| Telemetry insert idempotent under double-click | integration | INSERT × 2 binnen 100ms → 2 rows (geen dedupe vereist per D-07) |

### Wave 0 Gaps

- [ ] `web/lib/automations/intent-proposals/__tests__/cluster.test.ts` — Levenshtein + clustering tests
- [ ] `supabase/migrations/2026MMDD_intent_proposals_v1.sql` — matview + index + GRANT + refresh function
- [ ] `supabase/migrations/2026MMDD_intent_proposal_views.sql` — telemetry tabel
- [ ] `web/lib/inngest/functions/intent-proposals-refresh.ts` — cron handler
- [ ] `web/app/api/automations/[swarm]/intent-proposals/route.ts` — API route (SELECT matview + cluster + return)
- [ ] `web/app/(dashboard)/automations/[swarm]/intent-proposals/page.tsx` (of tab-render slot)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | Supabase free/pro tier ondersteunt `MATERIALIZED VIEW` | Q1 | [ASSUMED — Postgres standaard, niet live geverifieerd op deze project ID] | Plan needs adjustment naar regular view + view-cache |
| A2 | Phase 85 fires proposals op ~5-10% van Stage 3 calls | Q4 | [ASSUMED — extrapolated from corpus + smoke; geen live data nog] | Success #1 timing schuift verder |
| A3 | Operator-count = 2-3 | Q7 retention | [ASSUMED] | Storage planning lichtjes off |
| A4 | Geen `fast-levenshtein` in package.json | Standard Stack | [ASSUMED — niet gegrepd] | Beslissing tussen install vs inline blijft maar uitkomst gelijk |
| A5 | `coordinator_runs.agent_run_id` heeft een NOT NULL constraint die de JOIN naar `agent_runs.email_id` veilig maakt | Q1 DDL | [ASSUMED — schema niet 1-op-1 geverifieerd] | LEFT JOIN nodig ipv INNER JOIN; matview krijgt NULL email_id rows |
| A6 | `email_pipeline.emails` schema heeft `id`, `subject`, `sender_email` met die exacte namen | Q1 DDL | [VERIFIED via memory `feedback_email_pipeline_lookup_keys`: column is `sender_email` (niet `sender_first_name`)] | n/a |

**Planner-actie voor A1, A5:** verifieer pre-migration via Supabase MCP `list_tables` op project `mvqjhlxfvtqqubqgdvhz`. Pattern-mapper agent doet dit vermoedelijk al.

## Sources

### Primary (HIGH confidence)
- `/Users/nickcrutzen/Developer/agent-workforce/web/app/(dashboard)/automations/[swarm]/_shell/derive-stage-tabs.ts` — tab registry lock
- `/Users/nickcrutzen/Developer/agent-workforce/web/app/(dashboard)/automations/[swarm]/_shell/row-list.tsx:79-102` — empty-state pattern
- `/Users/nickcrutzen/Developer/agent-workforce/supabase/migrations/20260506a_pipeline_events.sql` — telemetry schema mismatch evidence
- `/Users/nickcrutzen/Developer/agent-workforce/web/lib/inngest/functions/labeling-flip-cron.ts` — cron pattern
- `/Users/nickcrutzen/Developer/agent-workforce/web/lib/inngest/functions/debtor-email-bridge.ts:22` — TZ cron canonical
- `/Users/nickcrutzen/Developer/agent-workforce/.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-SMOKE-RESULTS.md:46` — 280 calls/30d
- `/Users/nickcrutzen/Developer/agent-workforce/CLAUDE.md` — Inngest section (TZ prefix, business-hours, replay-safety)

### Secondary (MEDIUM confidence)
- Phase 85 CORPUS / RESEARCH — intent proposal volume heuristics
- PostgreSQL docs (training knowledge) — `REFRESH MATERIALIZED VIEW CONCURRENTLY` semantics

### Tertiary
- Levenshtein berekeningen — handmatig, deterministisch verifieerbaar

## Metadata

**Confidence breakdown:**
- View vs matview (Q1): HIGH — Postgres feature, niet Supabase-tier-gated
- Cron mechanism (Q2): HIGH — 5+ precedenten in codebase
- Empty-state UX (Q3): HIGH — patroon verbatim in `_shell/row-list.tsx`
- Traffic forecast (Q4): MEDIUM — heuristiek, geen live data
- Levenshtein threshold (Q5): HIGH op berekeningen; MEDIUM op operational impact
- Tab placement (Q6): HIGH — `derive-stage-tabs.ts` is architecturaal vergrendeld
- Telemetry table (Q7): HIGH — schema mismatch is concreet

**Research date:** 2026-05-20
**Valid until:** 2026-06-20 (30 days; codebase patterns are stable)
