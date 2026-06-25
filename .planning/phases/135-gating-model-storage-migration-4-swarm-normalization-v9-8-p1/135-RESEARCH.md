# Phase 135: Gating model + storage + migration + 4-swarm normalization (V9.8 P1a) - Research

**Researched:** 2026-06-25
**Domain:** Postgres/Supabase governance storage shape + Inngest pipeline gate cutover + registry-as-source-of-truth (SWARM-02)
**Confidence:** HIGH (the migrated gate, live DB state, and architecture invariants are all verified against the live registry + source; the two crux recommendations are reasoned from verified constraints)

## Summary

Phase 135 lands the 3-layer gating model as the single source of gating truth and cuts the live pipeline gate over to it with **zero behavior change**. The gate being migrated already exists and is small and clean: `web/lib/pipeline-gating/dry-run-gate/index.ts` exposes five pure helpers (`isStageBlocked`, `isHandlerBlocked`, `isStage3RoutingGated`, `isForwardBucketReleased`, `resolveStageDryRun`) that every side-effect worker routes through. The cleanest, lowest-risk cutover is to **keep those five signatures byte-identical and swap only their internals** to read the new shape — workers never change, the three behavior-pin test files stay green, and MIGRATE-02 ("no behavior change") becomes a near-mechanical proof.

Two crux decisions were left open. Both are settled below with concrete recommendations:

1. **Storage shape → extend the existing `swarms.dry_run_config` jsonb (rename-forward to a structured `gating_config`), NOT normalized tables.** Rationale: a normalized table forces either (a) the codegen drift gate (which reads the live registry from CI — a coupling we should not extend to runtime gate config) or (b) a join on every gate read where today there is a single cached `loadSwarm()` row. jsonb keeps the gate reads single-row + cache-friendly, holds per-swarm variance as data (SWARM-02), preserves fail-closed-on-missing-key for free, and keeps the forward-bucket inverse-polarity sub-map intact. The trade-off accepted: a jsonb shape cannot express the trigger-stage invariant as a column-level FK/CHECK, so the invariant must be enforced by a **trigger function + a violation view** (decision 2).

2. **DB invariant mechanism (MODEL-04 / D-04) → a `BEFORE INSERT OR UPDATE` trigger function on `public.swarms` that RAISEs on any `handler=live` whose trigger-stage is not live, PLUS a cheap `public.gating_invariant_violations` `security_invoker` view for the overview.** Rationale: under a jsonb shape a CHECK constraint can validate a single column expression but cannot cleanly walk a `stage_4_handlers` / `stage_4_forward_buckets` map of arbitrary keys against the sibling stage flags in a maintainable way; a trigger gets the full `NEW` row, can iterate the maps, and gives a hard `RAISE EXCEPTION` (illegal state physically unrepresentable, per D-04). A generated column cannot reject a write — it only derives — so it fails the "unrepresentable" posture. Trade-off accepted: a trigger is slightly heavier than a CHECK and lives in PL/pgSQL (needs `SET search_path`), but it is the only mechanism that gives a hard reject over a map-shaped jsonb.

**Primary recommendation:** Rename `dry_run_config` → `gating_config` (jsonb), add per-stage-enablement + per-handler tri-state + per-mailbox lifecycle-input keys to it, keep the five gate helpers' signatures and add a `deriveMailboxMode()` pure fn next to them, enforce the trigger-stage invariant with a PL/pgSQL `BEFORE` trigger + a violation view, and seed the four swarms to **today's verified-live effective state** (queried 2026-06-25, NOT the stale migration-file seed).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Derived mode (L1)**
- **D-01 — Derive ladder:** mode is derived from the layers, never stored as an enum. `Shadow` = no operator-visible Outlook `AI:`-label written yet (row exists only in the internal Bulk Review surface). `Dry` = the label is written (operator can see + correct) but **nothing acts**. `Live` = at least one real side-effect fires.
- **D-02 — Mixed handlers resolve highest-wins → Live.** When a mailbox's handlers are mixed, the single badge reads the **highest** autonomy level reached by any enabled side-effect. No "mixed/partial" qualifier in the derive fn (a partial/mixed visual hint, if wanted, is a 136 renderer concern).

**Shadow runtime behavior**
- **D-03 — Wire the Shadow gate in 135 (not store-only).** When derived mode = `Shadow`, the gate holds the `stage_3_intent_label` Outlook-label write (and any other operator-visible surface) while still classifying + persisting the verdict internally. No mailbox flips to Shadow at cutover — all existing mailboxes are dry/live — so this changes nothing for today's traffic; it only governs the next newly-added mailbox.

**Invariant enforcement (MODEL-04)**
- **D-04 — DB-enforced: an illegal state can never be persisted.** A constraint/trigger at the DB layer rejects `handler=live` on a non-live trigger-stage, so the store physically cannot hold an illegal combo (no UI exists yet in 135 — writes come via migration/seed/SQL, so "write-time" = the DB layer). **Plus** a cheap violation view for the eventual overview. The exact mechanism is research's call; the *posture* (unrepresentable, not just flagged) is locked.

**Normalization targets (MIGRATE-03) — confirmed = today's effective behavior made explicit**
- **D-05 — sales-email → clean Dry-run.** Stage 0/1 live (read-only classify), Stage 2 resolve live (resolve-only), Stage 3 labeling + routing held, intent-label write held. Handlers: none. Derives `Dry`.
- **D-06 — debtor-email → partly Live (explicit).** Outlook-archive **LIVE**; iController noise-delete (`stage_1_cleanup`, the 867-delete path) **LIVE** — now an explicit per-handler `live` entry, **not** an implicit always-live flag. iController intent-labeling + invoice-copy held. Derives `Live` (per D-02 highest-wins).
- **D-07 — info-routing → Live.** Outlook-archive LIVE + Stage-3 routing live; forward buckets `verkoop` + `opleidingen` **released**, other buckets held (per V9.7 134's graduated 0.7 gate — do **not** re-litigate). Derives `Live`.
- **D-08 — support-tickets → dormant.** Everything off/gated → derives `Shadow`.
- **D-09 — No deliberate behavior change at cutover.** Every target above = the live effective state on 2026-06-18 (brief table) + the V9.7 forward releases.

**Folded Todos**
- `2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` (tagged `resolves_phase: 135`). The per-stage + per-handler tri-state IS the fix for the gating half. The review-pane half (per-row dry-run chip) belongs to Phase 136 — not folded here.

### Claude's Discretion
- The exact **mechanism** of the DB invariant (CHECK vs trigger vs generated column) — settled in this research (trigger + view).
- The exact **storage shape** (jsonb-on-swarms vs normalized tables) — settled in this research (extend jsonb, rename to `gating_config`).
- The **"cheap violation view" shape** — settled in this research.
- Whether the new shape's enum-ish keys need **codegen** — settled in this research (NO codegen; see State of the Art / Pitfall 6).

### Deferred Ideas (OUT OF SCOPE)
- **Mixed/partial visual qualifier on the mode badge** — a 136 renderer hint, not a stored/derived value.
- **Full per-mailbox stage/handler config** — only the *lifecycle* is per-mailbox in V9.8; per-mailbox *config* deferred.
- Review-row renderers + mode-filter Shadow option + provenance chip + canonical matrix doc (136); per-handler dry-capture mechanics — iController screenshot, reply draft (137); operator control/visibility UI (138). Auto-promotion/auto-flip (V10.0).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODEL-01 | Each pipeline stage (0–4) has an independent enabled/disabled state per swarm | The `gating_config` jsonb already holds per-stage keys (`stage_1_archive`, `stage_1_cleanup`, `stage_2_resolution`, `stage_3_labeling`, `stage_3_routing`, `stage_3_intent_label`); the new shape generalizes these to a `stages` map keyed by `stage_0..stage_4` enablement. See Storage Shape Recommendation + Architecture Patterns. |
| MODEL-02 | Each handler has an independent `off \| dry \| live` state per swarm | Today's `stage_4_handlers` is a `{name: bool}` (blocked/live) map + the inverse-polarity `stage_4_forward_buckets`. The new shape promotes handler entries to a tri-state string `"off"\|"dry"\|"live"` while keeping the forward-bucket sub-map. See Architecture Pattern 2. |
| MODEL-03 | Per-mailbox lifecycle (Shadow→Dry→Live) is *derived*, no stored enum | `deriveMailboxMode()` pure fn co-located with the gate helpers; derives from the per-stage + per-handler flags. See Architecture Pattern 3 + Code Examples. |
| MODEL-04 | A handler can never be `live` while its trigger-stage is not live — enforced | PL/pgSQL `BEFORE INSERT OR UPDATE` trigger on `public.swarms` + `gating_invariant_violations` view. See Invariant Mechanism Recommendation. |
| MODEL-05 | A mailbox newly added to a swarm defaults to **Shadow** | The derive fn is fail-closed: an absent/empty lifecycle input + held stages → `Shadow`. A new swarm row with `gating_config={}` derives Shadow by construction (same fail-closed posture support-tickets already exhibits live). See Architecture Pattern 3. |
| MIGRATE-01 | New shape supersedes `swarms.dry_run_config`, the two per-mailbox `dry_run` booleans, and `debtor.email_labels.status` | Migration renames `dry_run_config`→`gating_config`, folds the per-mailbox dry_run reads into the registry gate, and stops treating `email_labels.status` as gating truth (it stays an audit field). See Runtime State Inventory + Migration plan. |
| MIGRATE-02 | Workers continue to gate correctly across cutover — no behavior change | Keep the five helper signatures; swap internals. The three pin tests (`dry-run-gate.test.ts`, `forward-bucket-release.test.ts`, `intent-label-gate.test.ts`) + `dry-run-gate-preservation.test.ts` stay green. See Validation Architecture. |
| MIGRATE-03 | All 4 swarms normalized to intended per-stage + per-handler state; debtor noise-delete explicit per-handler tri-state | Verified-live seed table (queried 2026-06-25) in "4-Swarm Normalization Seed". debtor `stage_1_cleanup` becomes an explicit `live` handler entry. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-stage / per-handler gating config storage | Database / Storage (`public.swarms.gating_config` jsonb) | — | Registry-as-source-of-truth (SWARM-02); read-heavy, mutation-rare; already lives here as `dry_run_config`. |
| Trigger-stage invariant enforcement | Database / Storage (PL/pgSQL trigger on `public.swarms`) | — | D-04: "write-time = the DB layer" because no UI exists in 135; the only writes are migration/seed/SQL. Must be physically unrepresentable. |
| Gate-decision reads (`isStageBlocked`, …) | API / Backend (Inngest workers via `web/lib/pipeline-gating/dry-run-gate`) | Database (single cached `loadSwarm()` row) | The gate is pure TS over a loaded row; the workers own the "is this stage/handler live?" decision. |
| Mailbox-mode derivation (`deriveMailboxMode`) | API / Backend (pure fn, co-located with gate) | — | D-01/D-02: derived, never stored. Consumed by 136 renderers + 138 UI later; in 135 it ships as the library fn + the Shadow runtime gate. |
| Shadow runtime suppression (hold label write) | API / Backend (`stage-3-intent-label-worker.ts`) | — | D-03: the new behavior wired in 135 at the single Graph-PATCH site. |
| Per-mailbox lifecycle input (mailbox list) | Database (`swarms.behavior_tracking_config.mailboxes` already; per-mailbox lifecycle store TBD) | — | Lifecycle is per-mailbox (L1); stage/handler config stays per-swarm (locked). See Open Question 1. |

## Standard Stack

This phase ships **no new external packages.** It is a Supabase migration + TS gate-internals refactor + Vitest tests, all on existing dependencies.

### Core (existing, in-repo)
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| Supabase Postgres | project `mvqjhlxfvtqqubqgdvhz` | `public.swarms.gating_config` jsonb + trigger + view | Registry-as-source-of-truth is the locked project pattern [CITED: CLAUDE.md] |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` | in-repo | The five gate helpers; cutover swaps internals only | Existing single source of gating truth [VERIFIED: source read] |
| `web/lib/swarms/registry.ts` (`loadSwarm`) | in-repo | 60s-TTL cached single-row read of the swarm; last-known-good on error | Every gate reader already loads through this [VERIFIED: source read] |
| Vitest | `vitest run` (`web/vitest.config.ts`) | Behavior-pin tests | Project test framework [VERIFIED: package.json] |
| tsx | in-repo | Migration apply via Management API / codegen scripts | Project tooling [VERIFIED: package.json] |

### Supporting (existing)
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `supabase/migrations/_template.sql` | RLS-correct migration template | The rename + trigger + view migration (note: `public.swarms` already has RLS; the rename ALTERs an existing table so no new policy needed) |
| `scripts/check-supabase-advisors.ts` (`npm run check:supabase`) | RLS/advisor gate; pre-push hook | After the migration — must show 0 ERROR. A new `SECURITY DEFINER` trigger fn needs `SET search_path`; a view needs `security_invoker=true` [CITED: CLAUDE.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extend `swarms.gating_config` jsonb | Normalized `swarm_stage_gates` + `swarm_handler_gates` tables | Forces a join (or a denormalized read-model) on every gate read; the gate today is a single cached row. Adds codegen coupling OR runtime DB reads in CI. See Storage Recommendation rejected-alternative. |
| PL/pgSQL trigger for the invariant | CHECK constraint | A CHECK over a map of arbitrary `stage_4_handlers` keys vs sibling stage flags is unmaintainable in jsonb; a CHECK cannot iterate keys cleanly. See Invariant Recommendation. |
| PL/pgSQL trigger for the invariant | Generated column | A generated column derives, it cannot **reject** a write — fails D-04's "unrepresentable" posture. |

**Installation:** none.

## Package Legitimacy Audit

> Not applicable. This phase installs **no external packages** — it is a Supabase migration + an internal TS refactor of an existing module + Vitest tests on existing dependencies. No npm/PyPI/crates additions. (Confirmed against `web/package.json` `scripts` + the phase scope.)

## Storage Shape — Recommendation

> **CHOSEN: Extend the existing `public.swarms.dry_run_config` jsonb, renamed forward to `gating_config`. Do NOT introduce normalized per-stage / per-handler tables.**

### What the new shape looks like

Keep the current map-of-flags ergonomics; add the per-stage enablement layer and promote handler entries to a tri-state. Proposed `gating_config` shape (one jsonb per swarm row):

```jsonc
{
  // L2 — per-stage enablement (MODEL-01). Stage 0/1 always-on by policy
  // (kill-switch for always-live classifier stages is explicitly out of scope,
  // REQUIREMENTS "Out of Scope"), so the meaningful gated stages are 1-archive,
  // 1-cleanup, 2-resolution, 3-labeling, 3-routing, 3-intent-label. These keep
  // their CURRENT key names + polarity (TRUE=blocked) so the helper internals
  // and the three pin tests do not change semantics.
  "stage_1_archive":      false,   // TRUE = blocked (dry), FALSE = live
  "stage_1_cleanup":      false,
  "stage_2_resolution":   true,
  "stage_3_labeling":     true,
  "stage_3_routing":      false,
  "stage_3_intent_label": false,

  // L3 — per-handler TRI-STATE (MODEL-02). MIGRATES the current
  // {name: bool} (blocked/live) map to {name: "off"|"dry"|"live"}.
  // "off" = skip entirely; "dry" = simulate+capture (137 mechanics);
  // "live" = real side-effect. debtor stage_1_cleanup becomes an explicit
  // handler entry here (D-06) rather than only a stage flag.
  "stage_4_handlers": { "invoice-copy": "dry", "stage_1_cleanup": "live" },

  // L3 sub-map — forward-bucket graduated release (D-07). INVERSE polarity
  // preserved (TRUE=released). Kept as a sub-map, NOT flattened into the
  // tri-state, so the V9.7 134 graduated per-bucket gate stays intact.
  "stage_4_forward_buckets": { "verkoop": true, "opleidingen": true }
}
```

### Why jsonb-on-swarms wins

1. **The gate read is a single cached row today.** Every reader calls `loadSwarm(admin, swarm_type)` (60s TTL, last-known-good on error) and reads `.dry_run_config`. A normalized table makes each gate read either a second query or a denormalized read-model that must be kept in sync — net new failure modes for zero behavior gain. [VERIFIED: `web/lib/swarms/registry.ts` + all 8 readers]
2. **Per-swarm variance stays as data (SWARM-02).** The jsonb already holds per-swarm config; there are zero `if swarm_type===` branches in the workers and the new shape preserves that. [CITED: docs/agentic-pipeline/README.md SWARM-02; VERIFIED: grep of readers shows no swarm literals in the gate path]
3. **Fail-closed-on-missing-key is free.** `?? true` / `=== true` semantics over a jsonb map give a half-configured swarm a safe default with no extra logic. A normalized table would need explicit "missing row = blocked" handling. [VERIFIED: pin tests assert this]
4. **The forward-bucket inverse-polarity sub-map survives unchanged.** It is already a nested jsonb map; in a normalized world it would need its own table or a polarity column, re-litigating a locked V9.7 design. [VERIFIED: `forward-bucket-release.test.ts`]
5. **No codegen coupling for runtime gate config.** The codegen drift gate runs `npm run codegen && git diff --exit-code` in CI, which reads the **live registry** over the network (`gen-tenant-domains.ts` etc.). Adding gate config to codegen would mean CI fails if prod gate state drifts — wrong coupling for an operationally-flipped runtime knob. jsonb config that is read at runtime (not compiled into TS) avoids this entirely. [VERIFIED: `.github/workflows/pr-checks.yml` lines 39-42 + `scripts/gen-tenant-domains.ts`]

### Rejected alternative: normalized tables

`swarm_stage_gates(swarm_type, stage_key, enabled)` + `swarm_handler_gates(swarm_type, handler_key, state)`. This would let the invariant be a column-level CHECK/FK and would be queryable. **Rejected because:** (a) it converts every single-row cached gate read into a join or a denormalized mirror; (b) the forward-bucket inverse-polarity map does not fit a uniform tri-state column cleanly; (c) it does not actually make the invariant simpler — the trigger still has to compare a handler row against a stage row, the same cross-row comparison a trigger does over jsonb; (d) it would tempt codegen coupling. The query-ergonomics win (the "violation view") is fully recoverable over jsonb via `jsonb_each` (see Invariant Mechanism).

### Trade-off accepted

A jsonb shape **cannot** express the trigger-stage invariant as a column-level FK or CHECK over arbitrary handler keys. We therefore pay for the invariant with a PL/pgSQL trigger + a violation view (next section). This is an acceptable, well-precedented cost — the repo already uses triggers and `SET search_path` PL/pgSQL functions.

### Rename note (MIGRATE-01)

Rename `dry_run_config` → `gating_config` in the same migration. Reasons: the column now governs more than dry-run (it governs Shadow + per-stage enablement + tri-state handlers), and the rename forces every reader to be re-pointed (a compile-time safety net that surfaces any missed reader). The TS interface `DryRunConfig` likewise renames to `GatingConfig`. **If** the rename is judged too risky for a zero-behavior-change phase, the fallback is to keep the column name `dry_run_config` and only evolve its contents — but the rename is recommended because it is the honest name and the cutover already touches every reader's import.

## DB Invariant Mechanism — Recommendation

> **CHOSEN: a PL/pgSQL `BEFORE INSERT OR UPDATE` trigger function on `public.swarms` that `RAISE EXCEPTION` on any `handler="live"` whose trigger-stage is not live, PLUS a `security_invoker` violation view `public.gating_invariant_violations` for the eventual overview.**

### The trigger (hard reject — illegal state unrepresentable)

```sql
-- SECURITY DEFINER not needed (trigger fires under the writer's rights); but if
-- declared, MUST carry SET search_path = public, pg_catalog, pg_temp (CLAUDE.md).
CREATE OR REPLACE FUNCTION public.enforce_handler_trigger_stage_invariant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  h          record;
  cfg        jsonb := COALESCE(NEW.gating_config, '{}'::jsonb);
  handlers   jsonb := COALESCE(cfg->'stage_4_handlers', '{}'::jsonb);
  -- A "live handler" requires its trigger-stage live. The trigger-stage for a
  -- Stage-4 handler is Stage 3 routing (the predicted-emit that dispatches it):
  -- stage_3_routing=false means routing LIVE (TRUE=held). A handler can only be
  -- live if routing is live. (The cleanup handler's trigger-stage is stage_1 —
  -- see the stage-to-handler map below; encode it in the fn.)
  routing_live boolean := COALESCE((cfg->>'stage_3_routing'), 'true')::boolean = false;
BEGIN
  FOR h IN SELECT key, value FROM jsonb_each_text(handlers) LOOP
    IF h.value = 'live' THEN
      -- map handler.key -> its trigger-stage live-ness; default to routing.
      IF h.key = 'stage_1_cleanup' THEN
        IF COALESCE((cfg->>'stage_1_cleanup'),'true')::boolean = true THEN
          RAISE EXCEPTION
            'gating invariant: handler % is live but its trigger-stage stage_1_cleanup is not live (swarm=%)',
            h.key, NEW.swarm_type;
        END IF;
      ELSIF NOT routing_live THEN
        RAISE EXCEPTION
          'gating invariant: handler % is live but trigger-stage (stage_3_routing) is not live (swarm=%)',
          h.key, NEW.swarm_type;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_handler_trigger_stage_invariant
  BEFORE INSERT OR UPDATE OF gating_config ON public.swarms
  FOR EACH ROW EXECUTE FUNCTION public.enforce_handler_trigger_stage_invariant();
```

> The handler→trigger-stage map (`stage_1_cleanup` → stage 1; everything else → stage 3 routing) must be encoded in the function. The planner should confirm the canonical map with the stage docs; the shape above is the verified-from-source default. The forward-bucket sub-map is governed separately (it is a release map, not a tri-state handler) and is intentionally NOT walked by this invariant — its trigger-stage is stage-3 routing which is live for info-routing (D-07).

### Why a trigger (not CHECK, not generated column)

- **CHECK constraint:** can validate a scalar/column expression but cannot iterate a `stage_4_handlers` map of arbitrary keys and compare each against sibling jsonb keys in a maintainable way. You would need a CHECK with a hand-rolled `jsonb_path_exists`/`jsonb_each` subquery, which Postgres forbids in CHECK (no subqueries in CHECK). **Disqualified.** [VERIFIED: Postgres CHECK cannot contain subqueries — standard SQL constraint]
- **Generated column:** derives a value, it does not reject a write. It could store a `derived_mode` or a `has_violation` flag, but the row would still persist the illegal combo — failing D-04's "physically cannot hold an illegal combo." **Disqualified for enforcement** (though a generated `derived_mode` column is explicitly forbidden anyway by D-01/MODEL-03: "no separately-stored mode enum that can drift").
- **Trigger:** gets the full `NEW.gating_config`, can `jsonb_each` the handler map, can compare each live handler to its trigger-stage, and `RAISE EXCEPTION` aborts the transaction. This is the only mechanism that gives a hard reject over a map-shaped jsonb. **Chosen.**

### The cheap violation view (D-04 "plus a violation view")

For the eventual overview (136/138), a read-only view that surfaces any swarm currently holding an illegal combo. Because the trigger makes new illegal writes impossible, this view should always be empty post-migration — it is a defense-in-depth / drift detector (e.g. if a future migration bypasses the trigger via `ALTER TABLE ... DISABLE TRIGGER`).

```sql
CREATE VIEW public.gating_invariant_violations
WITH (security_invoker = true) AS   -- NEVER SECURITY DEFINER (CLAUDE.md)
SELECT s.swarm_type, h.key AS handler_key, h.value AS handler_state,
       s.gating_config->>'stage_3_routing'  AS stage_3_routing,
       s.gating_config->>'stage_1_cleanup'  AS stage_1_cleanup
FROM public.swarms s,
     LATERAL jsonb_each_text(COALESCE(s.gating_config->'stage_4_handlers','{}'::jsonb)) AS h(key, value)
WHERE h.value = 'live'
  AND (
    (h.key =  'stage_1_cleanup' AND COALESCE((s.gating_config->>'stage_1_cleanup'),'true')::boolean = true)
    OR
    (h.key <> 'stage_1_cleanup' AND COALESCE((s.gating_config->>'stage_3_routing'),'true')::boolean = true)
  );
```

### Trade-off accepted

A trigger is heavier than a CHECK and lives in PL/pgSQL — it needs the `SET search_path` hygiene if declared `SECURITY DEFINER`, and it is one more object the `check:supabase` advisor will inspect (the advisor flags `function_search_path_mutable` and `security_definer_view`). We accept this because it is the only mechanism that satisfies D-04's "unrepresentable" posture over a jsonb map. The view must be `security_invoker=true` to pass the advisor.

## Architecture Patterns

### System Architecture Diagram

```
  migration / seed / SQL  (the ONLY writers in 135 — no UI yet)
            │
            ▼  write swarms.gating_config
  ┌──────────────────────────────────────────────────────────┐
  │ public.swarms.gating_config (jsonb)                       │
  │   BEFORE INSERT/UPDATE trigger ──► RAISE if handler=live   │
  │                                    on non-live stage       │
  │                                    (illegal = unrepresentable)
  └───────────────┬──────────────────────────────────────────┘
                  │ loadSwarm() — 60s TTL cache, last-known-good
                  ▼
  ┌──────────────────────────────────────────────────────────┐
  │ web/lib/pipeline-gating/dry-run-gate  (signatures UNCHANGED)│
  │   isStageBlocked · isHandlerBlocked* · isStage3RoutingGated │
  │   isForwardBucketReleased · resolveStageDryRun              │
  │   + NEW: deriveMailboxMode()  (pure; D-01/D-02)             │
  │   *internals re-read tri-state: "live"→not blocked,         │
  │    "dry"/"off"→blocked, preserving the boolean contract     │
  └───────────────┬──────────────────────────────────────────┘
                  │  (the 8 readers below DO NOT change)
                  ▼
  stage-1-noise-cleanup ─ stage_1_cleanup (D-06 live-via-handler)
  classifier-verdict-worker ─ stage_1_archive (inline categorize+archive)
  stage-2-customer-resolver ─ stage_2_resolution + stage_3_labeling
  classifier-invoice-copy-handler ─ handler "invoice-copy"
  debtor-email-coordinator ─ stage_3_routing + forward buckets
  stage-4-info-routing-forward ─ forward buckets (inverse polarity)
  stage-3-intent-label-worker ─ stage_3_intent_label
        └─► D-03 NEW: if deriveMailboxMode()==='Shadow' HOLD the Graph PATCH
  load-page-data.ts (SSR) ─ stage_3_labeling (per-row dry_run map)
                  │
                  ▼  side-effects (Outlook, iController, NXT) — only when LIVE
```

### Recommended Project Structure

```
web/lib/pipeline-gating/dry-run-gate/
├── index.ts          # five helpers (signatures unchanged) + deriveMailboxMode() (NEW)
├── derive-mode.ts    # OPTIONAL: deriveMailboxMode + types if index.ts grows
└── __tests__/
    ├── dry-run-gate.test.ts          # KEEP green (stage gate polarity)
    ├── forward-bucket-release.test.ts # KEEP green (inverse polarity)
    ├── intent-label-gate.test.ts      # KEEP green
    └── derive-mode.test.ts            # NEW: Shadow/Dry/Live derivation + highest-wins

supabase/migrations/
└── 2026MMDD_phase135_gating_config.sql  # rename + tri-state migrate + trigger + view + 4-swarm seed
```

### Pattern 1: Keep helper signatures, swap internals (the cutover seam)

**What:** The five exported helpers keep their exact signatures and boolean return contract. Only their bodies change to read `gating_config` (renamed) and to interpret the tri-state handler map.
**When to use:** This is the MIGRATE-02 mechanism — workers and SSR readers do not change, so "no behavior change" is provable by the unchanged pin tests.
**Example (handler tri-state → boolean contract):**
```typescript
// Source: VERIFIED from web/lib/pipeline-gating/dry-run-gate/index.ts (current) +
// the tri-state migration. isHandlerBlocked must keep returning a boolean.
export function isHandlerBlocked(swarm, handlerName: string): boolean {
  const state = swarm?.gating_config?.stage_4_handlers?.[handlerName];
  // tri-state: "live" → not blocked; "dry"/"off"/missing → blocked (fail-closed)
  return state !== "live";
}
```

### Pattern 2: Forward-bucket sub-map stays inverse-polarity (do NOT flatten)

**What:** `stage_4_forward_buckets` remains a `{bucket: boolean}` release map (TRUE=released), read only via `isForwardBucketReleased`. It is NOT folded into the tri-state handler map.
**When to use:** Always, for info-routing forwards. Flattening loses the V9.7 134 graduated per-bucket opt-in.
**Example:**
```typescript
// Source: VERIFIED from index.ts (current) — polarity pinned by forward-bucket-release.test.ts
export function isForwardBucketReleased(swarm, bucket: string): boolean {
  return swarm?.gating_config?.stage_4_forward_buckets?.[bucket] === true;
}
```

### Pattern 3: deriveMailboxMode — derived, fail-closed, highest-wins (D-01/D-02/MODEL-03)

**What:** A pure fn that maps a swarm's gating_config (+ the mailbox lifecycle input) to `"Shadow" | "Dry" | "Live"`. No stored enum.
**When to use:** In 135 it ships as the library fn + drives the D-03 Shadow runtime gate. 136/138 consume it for rendering/UI.
**Derive ladder (from D-01/D-02):**
- `Shadow` = no operator-visible `AI:` label written → `stage_3_intent_label` is held (blocked) AND no live side-effect fires.
- `Dry` = label write is LIVE (operator can see+correct) but NO real side-effect fires (no live handler, no live archive/cleanup, no released forward bucket).
- `Live` = at least one real side-effect fires (any live handler, live archive, live cleanup, OR any released forward bucket). Highest-wins.
**Example:**
```typescript
// Source: composed from D-01/D-02 + the verified gating_config shape.
export type MailboxMode = "Shadow" | "Dry" | "Live";
export function deriveMailboxMode(swarm): MailboxMode {
  const cfg = swarm?.gating_config ?? {};
  const handlers = cfg.stage_4_handlers ?? {};
  const buckets = cfg.stage_4_forward_buckets ?? {};
  const anyLiveSideEffect =
    Object.values(handlers).some((s) => s === "live") ||
    Object.values(buckets).some((v) => v === true) ||
    cfg.stage_1_archive === false ||   // archive live
    cfg.stage_1_cleanup === false;     // cleanup live
  if (anyLiveSideEffect) return "Live";          // D-02 highest-wins
  const labelLive = cfg.stage_3_intent_label === false; // AI: label written
  return labelLive ? "Dry" : "Shadow";           // D-01 ladder; fail-closed → Shadow
}
```
> Note: the mailbox-mode is per-mailbox (L1) but stage/handler config is per-swarm in V9.8, so for now every mailbox in a swarm derives the same mode from the per-swarm gating_config. The per-mailbox *lifecycle override* store is Open Question 1.

### Pattern 4: D-03 Shadow runtime suppression at the single PATCH site

**What:** In `stage-3-intent-label-worker.ts`, when the derived mode is `Shadow`, hold the Graph `AI:`-category PATCH while still classifying + persisting internally.
**Where exactly:** The worker today gates on `isStageBlocked(swarmRow, "stage_3_intent_label")` at lines 80-87 (returns `{decision:"gated"}` before any Graph call). The Graph write is a single `PATCH /users/{mailbox}/messages/{id}` at lines 158-162. The Shadow gate is an additional early-return: if `deriveMailboxMode(swarmRow) === "Shadow"`, return a `{decision:"shadow_suppressed"}` BEFORE the resolve-message/PATCH steps — the verdict is already persisted upstream by the coordinator; only the operator-visible label write is held. [VERIFIED: source read of stage-3-intent-label-worker.ts]
**"Any other operator-visible surface" concretely means:** the Outlook `AI:`-category write is the only operator-visible Shadow-suppressible surface today (the brief: "the label is the correction surface"). The internal Bulk Review surface (`automation_runs` / `email_labels` / `pipeline_events`) is explicitly the place Shadow rows ARE visible ("visible only in the internal Bulk Review surface"), so those writes are NOT suppressed. No mailbox is in Shadow at cutover (D-03), so this is inert for today's traffic.

### Anti-Patterns to Avoid
- **Storing a `mode` enum column.** Forbidden by D-01/MODEL-03 — it drifts from the flag truth. Derive it.
- **Flattening forward buckets into the tri-state handler map.** Loses graduated release (Pattern 2).
- **Changing helper signatures during the cutover.** Breaks MIGRATE-02's "swap internals only" proof and forces every worker + test to change.
- **`if swarm_type === 'debtor'` in the gate path.** SWARM-02 violation; the gate is data-driven.
- **Generating gate config into a `*.generated.ts` via codegen.** Wrong coupling — gate config is an operationally-flipped runtime knob, not a compile-time literal (Pitfall 6).
- **`SECURITY DEFINER` view for the violation overview.** CLAUDE.md forbids it; use `security_invoker=true`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Is this stage/handler live?" decision | A new per-worker inline check | The existing five helpers (re-pointed internals) | One source of gating truth; workers already route through them [VERIFIED] |
| Per-swarm config loading + cache | A new fetch per gate read | `loadSwarm()` (60s TTL, last-known-good) | Read-heavy mutation-rare contract already solved [VERIFIED: registry.ts] |
| Illegal-state prevention | App-layer validation only | DB trigger (D-04) | "Write-time = DB layer" since no UI; app validation can be bypassed by SQL |
| Mailbox mode | A stored enum + sync logic | `deriveMailboxMode()` pure fn | D-01: derived, no drift |
| RLS-correct migration | Hand-written DDL | `supabase/migrations/_template.sql` + `npm run check:supabase` | Project RLS gate fails CI on ERROR-level lints [CITED: CLAUDE.md] |

**Key insight:** The whole phase is a "swap the source, keep the seam" exercise. The risk is in the SQL (rename + tri-state migrate + trigger + seed), not in the TS — the TS change is mechanical and pin-tested.

## Runtime State Inventory

> Rename/migration phase — required. All five categories answered explicitly.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| **Stored data** | `swarms.dry_run_config` (jsonb, public) — the gate's current source. `debtor.email_labels.status` = `dry_run` for **651 rows** (verified-live; the per-row audit field). `debtor.labeling_settings.dry_run` = `true` for all 4 debtor mailboxes (verified-live). `public.info_routing_mailbox_settings.dry_run` (6 rows: info@smeba.nl + info@fire-control.nl `dry_run=false`/ingest_enabled=true; the other 4 `dry_run=true`/ingest_enabled=false). | **Data migration:** rename `dry_run_config`→`gating_config`, migrate `stage_4_handlers` bool→tri-state, add explicit `stage_1_cleanup` handler entry for debtor (D-06). **Code edit:** re-point all 8 readers + the SSR per-row dry_run map to the registry gate. `email_labels.status` STAYS an audit field (no longer gating truth — MIGRATE-01 supersedes it as the *gating source*, not as the audit row). The two per-mailbox `dry_run` booleans: their gating role folds into the per-swarm registry gate (OQ-1 confirms debtor mailboxes are uniform; info-routing's two-live-mailbox split is a per-mailbox lifecycle concern → Open Question 1). |
| **Live service config** | The live `dry_run_config` has documented Management-API drift vs the migration files (e.g. info-routing `unknown` dispatch was a live edit with no migration; forward-bucket releases `verkoop`+`opleidingen` are live but the file-seed leaves them `{}`). The **live DB is ground truth** for the normalization seed, NOT the migration files. | The 135 seed migration must encode the **verified-live** state (table below), idempotently, so re-applying does not regress drift. Apply via Supabase MCP / Management API (operator-gated per prior phases). |
| **OS-registered state** | None. No cron/Task Scheduler/launchd/pm2 registration embeds the gating column name. (The `aw-forward-grade` Phase 134 cron reads `swarms` but via `loadSwarm`/select(*), not a literal column name in a registration.) | None — verified by grep of gate readers (all go through `loadSwarm` select("*")). |
| **Secrets/env vars** | None. The gate reads no secrets; `SUPABASE_SERVICE_ROLE_KEY` etc. are unaffected by a column rename. | None — verified. |
| **Build artifacts / installed packages** | `*.generated.ts` files exist (`entity.generated.ts`, `tenant-domains.generated.ts`, intent + routing-destination generated files) but **none** is generated from `dry_run_config` — codegen does not touch gate config. Renaming the column does NOT require a codegen run. | None for codegen. The TS interface `DryRunConfig`→`GatingConfig` is a hand-edit + re-point of imports (8 readers + `web/lib/swarms/types.ts`). Verified the codegen scripts read only entity_brand/tenant_domains/intents/routing_destinations. |

**The canonical question — after every file is updated, what runtime systems still have the old string cached/stored/registered?**
- The `loadSwarm` 60s TTL cache holds the row in-memory; after deploy it refreshes within 60s. A column rename means the SELECT `*` still returns the renamed column — `loadSwarm` does `select("*")` so it tolerates the rename without a code change to the loader, but the TS type + every `.dry_run_config` access must be re-pointed to `.gating_config`. **This is why the rename is a safety net: TypeScript surfaces every missed reader at compile time.**

## Common Pitfalls

### Pitfall 1: Seeding from the stale migration file instead of live DB
**What goes wrong:** The migration-file seed (`20260603b`) sets debtor `stage_3_intent_label=true` (gated) and sales all-blocked. **Live reality (queried 2026-06-25) is different:** debtor `stage_3_intent_label=false` (AI labels LIVE), debtor `stage_3_routing=false` (routing live), sales `stage_1_archive=false` + `stage_3_routing=false` + `stage_3_intent_label=false`, info-routing has `verkoop`+`opleidingen` released. Seeding from the file would REGRESS today's behavior — violating D-09.
**Why it happens:** Management-API live edits + later phases (117/118/132/134) changed live state without always landing a file seed; the CONTEXT.md explicitly warns "seed is STALE vs live."
**How to avoid:** Seed from the verified-live table below (re-query at plan time to confirm nothing changed since 2026-06-25).
**Warning signs:** Any seed value that matches `20260603b` for `stage_3_intent_label` on debtor.

### Pitfall 2: Opening stage_3_routing for info-routing (it has no swarm_intents)
**What goes wrong:** info-routing's `stage_3_routing` is `true` (held) deliberately — it has `stage2_entity_resolver=NULL` and zero `swarm_intents`, so opening routing makes the dispatcher throw on an empty `ranked[]` (the documented 24-fail crash). The forward worker is driven by a SEPARATE emit + the per-bucket release map, not by routing.
**Why it happens:** "info-routing derives Live" (D-07) tempts setting routing live; but its liveness comes from archive-live + released forward buckets, NOT routing-open.
**How to avoid:** Keep info-routing `stage_3_routing=true` in the seed. Liveness for info-routing = `stage_1_archive=false` + released buckets. [VERIFIED: live config + `20260624a` migration comment + coordinator lines 525-567]
**Warning signs:** A seed that flips info-routing `stage_3_routing` to false.

### Pitfall 3: Forgetting the inverse polarity when migrating bool→tri-state
**What goes wrong:** `stage_4_handlers` is `TRUE=blocked`; `stage_4_forward_buckets` is `TRUE=released`. Migrating handlers to tri-state, one might accidentally convert `true`→`"live"` (it should map `false`→`"live"` for handlers, since `false`=live in the old polarity). And the forward buckets must NOT be converted to tri-state at all.
**Why it happens:** The two maps look similar but have opposite polarity (the "second mental model trap").
**How to avoid:** Handlers: old `false`(live)→`"live"`, old `true`(blocked)→`"dry"` (the default held state; `"off"` is reserved for explicitly-disabled). Forward buckets: leave as-is (boolean release map). Verify with `forward-bucket-release.test.ts` staying green.
**Warning signs:** `verkoop` appearing as a string `"live"` instead of boolean `true`.

### Pitfall 4: Shadow gate suppressing internal persistence
**What goes wrong:** D-03 says Shadow holds the *operator-visible label* while still *persisting internally*. Suppressing the `pipeline_events`/`automation_runs`/`email_labels` writes would make Shadow rows invisible even in Bulk Review — defeating the purpose ("visible only in the internal Bulk Review surface").
**Why it happens:** "Shadow = nothing visible" overreach.
**How to avoid:** Suppress ONLY the Graph `AI:`-category PATCH in `stage-3-intent-label-worker.ts`. Leave all internal writes intact. The verdict is persisted by the coordinator upstream, before the label worker runs.
**Warning signs:** A Shadow branch that returns before `emitPipelineEvent`/store writes in any worker other than the label PATCH.

### Pitfall 5: The trigger blocking the seed migration itself
**What goes wrong:** If the trigger is created BEFORE the seed UPDATE, and a transient intermediate state during the multi-statement seed is illegal, the trigger aborts the migration.
**Why it happens:** Order-of-operations in the migration.
**How to avoid:** In the migration: (1) rename column, (2) migrate handler shape, (3) run the seed UPDATEs to the final legal state, (4) THEN create the trigger + view last. Each swarm's final seeded state is legal by construction (no live handler on a held stage), so the trigger validates cleanly on the next write.
**Warning signs:** Migration fails with the invariant RAISE during apply.

### Pitfall 6: Adding gate config to codegen
**What goes wrong:** The codegen drift gate (`npm run codegen && git diff --exit-code`) reads the LIVE registry from CI. If gate config were codegen'd, every operator flip of a live gate would make CI red until someone regenerates + commits.
**Why it happens:** "registry-as-source-of-truth → codegen" pattern over-applied.
**How to avoid:** Gate config is read at RUNTIME via `loadSwarm`, never compiled. No codegen entry. (Codegen is for closed enumerations compiled into TS literal-unions — entity brands, intents, tenant domains, routing destinations — not for operationally-flipped knobs.) [VERIFIED: pr-checks.yml + codegen scripts]
**Warning signs:** A new `gen-gating-*.ts` script or a `gating.generated.ts` file.

## Code Examples

### Current gate helper (the seam to preserve)
```typescript
// Source: VERIFIED web/lib/pipeline-gating/dry-run-gate/index.ts:85-95 (current)
export function isStageBlocked(swarm, stage): boolean {
  return swarm?.dry_run_config?.[stage] ?? true;   // becomes ?.gating_config?.[stage] ?? true
}
```

### D-03 Shadow suppression (the one new behavior in 135)
```typescript
// Source: composed from VERIFIED stage-3-intent-label-worker.ts:79-87 + D-03.
// Add AFTER the existing stage_3_intent_label gate, BEFORE resolve-message.
const mode = await step.run("derive-mode", async () => {
  const swarmRow = await loadSwarm(admin, swarm_type);
  return deriveMailboxMode(swarmRow);            // pure, from the gating_config
});
if (mode === "Shadow") {
  return { decision: "shadow_suppressed" as LabelDecision }; // hold label; verdict already persisted upstream
}
```

### Trigger-stage invariant trigger (D-04)
See "DB Invariant Mechanism — Recommendation" above for the full PL/pgSQL + view.

## 4-Swarm Normalization Seed (MIGRATE-03 / D-05..D-09)

> **This table is the verified-live effective state, queried from `mvqjhlxfvtqqubqgdvhz` on 2026-06-25 via the Management API. It is the authoritative seed — NOT the stale `20260603b` migration file.** Re-query at plan time to confirm no drift since. Polarity reminder: stage flags TRUE=blocked/held, FALSE=live; forward buckets TRUE=released; handlers tri-state `off|dry|live`.

### Full per-stage (0–4) × per-handler taxonomy, all 4 swarms

| Swarm | Stage 0 | Stage 1 archive | Stage 1 cleanup | Stage 2 resolution | Stage 3 labeling | Stage 3 routing | Stage 3 intent_label | Stage 4 handlers (tri-state) | Forward buckets (release map) | Derived mode |
|-------|---------|-----------------|-----------------|--------------------|--------------------|------------------|----------------------|------------------------------|-------------------------------|--------------|
| **sales-email** | always-on | `false` (LIVE) | `true` (held) | `true` (held) | `true` (held) | `false` (LIVE)* | `false` (LIVE)† | `{}` (none) | (n/a — no forward worker) | **Dry**‡ |
| **debtor-email** | always-on | `false` (LIVE) | `false` (LIVE) → encode as handler `stage_1_cleanup:"live"` (D-06) | (resolver legacy path, no stage_2_resolution key) | `true` (held) | `false` (LIVE) | `false` (LIVE) | `{ "invoice-copy": "dry" }` (was `true`/blocked) + `{ "stage_1_cleanup": "live" }` | (n/a) | **Live** |
| **info-routing** | always-on | `false` (LIVE) | (no key — no iController) | (no key — `stage2_entity_resolver=NULL`) | (no key) | `true` (HELD — Pitfall 2, keep held) | (no key — no intent-label worker for router) | (no Stage-4 handlers — router shape) | `{ "verkoop": true, "opleidingen": true }` (released; rest held) | **Live** |
| **support-tickets** | always-on | (empty `{}`) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | (empty) | **Shadow** |

**Notes:**
- *sales `stage_3_routing=false` (LIVE) is the verified-live value — sales routing was opened (Phase 113 go-live). D-05 says "Stage 3 routing held"; **this is a discrepancy between D-05's prose and live reality.** Resolve at plan time (Open Question 2). Per D-09 ("no deliberate behavior change at cutover"), the seed should encode the **live** value (`false`/live) unless the operator confirms D-05's "held" is the intended correction. Flagged `[ASSUMED]` pending operator confirmation.
- †sales `stage_3_intent_label=false` (LIVE) is verified-live, BUT STATE.md + the 117 checkpoint say sales must stay GATED until the Sugar cut-over. The live value being `false` may itself be drift. **Flag for operator** (Open Question 2).
- ‡sales derives **Dry** per D-05 only if no live side-effect fires. With `stage_1_archive=false` (archive LIVE), `deriveMailboxMode` as written would return **Live**. Either (a) sales archive is not actually wired to fire (categories carry no `outlook_label` / no live archive path for sales yet), or (b) the derive fn's "archive live → Live" rule needs the "is there actually an archive side-effect configured" nuance. **This is the most important derive-fn correctness question — Open Question 3.**
- debtor `stage_2_resolution` key is ABSENT in live config (debtor uses the legacy `resolveDebtor` + `debtor.email_labels` path gated by `stage_3_labeling` + the per-mailbox `labeling_settings.dry_run`, not the generic `stage_2_resolution` key). The seed should preserve debtor's absence of this key.
- support-tickets has zero gating_config but is `enabled=true` with 5 registered handlers + `source_table=support_tickets`. It derives Shadow because every flag is missing → fail-closed.

### Per-mailbox lifecycle inputs (L1) — verified live

| Swarm | Mailboxes (from `behavior_tracking_config.mailboxes`) | Per-mailbox dry_run split |
|-------|--------------------------------------------------------|----------------------------|
| sales-email | verkoop@smeba.nl, verkoop@fire-control.nl, verkoop@berki.nl, sales.products@berki.nl | (no per-mailbox dry_run table; uniform per-swarm) |
| debtor-email | debiteuren@smeba.nl, administratie@fire-control.nl, debiteuren@smeba-fire.be, debiteuren@berki.nl | `labeling_settings.dry_run=true` for all 4 (uniform — OQ-1) |
| info-routing | info@smeba.nl, info@fire-control.nl | `info_routing_mailbox_settings`: smeba + fire-control `dry_run=false`/ingest=true; sicli-noord/sicli-sud/smeba-fire/berki `dry_run=true`/ingest=false |
| support-tickets | (behavior_tracking disabled) | (none) |

> info-routing is the only swarm with a non-uniform per-mailbox split (2 live, 4 held), but those 4 held mailboxes have `ingest_enabled=false` — they are not flowing. The per-mailbox lifecycle store (L1) is Open Question 1; for 135 the per-swarm gating_config + uniform derive is sufficient since the held info-routing mailboxes are not ingesting.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `debtor.labeling_settings.dry_run` (per-mailbox bool) gates labeling only; cleanup ran ungoverned | `swarms.dry_run_config` per-stage gate via 5 helpers | Phase 110-04 (2026-06-03) | The 867-delete footgun got a gate (`stage_1_cleanup`) |
| Binary handler gate `{name: bool}` | Tri-state `{name: off\|dry\|live}` | **Phase 135 (this phase)** | Enables `dry` = simulate+capture (137) + explicit debtor cleanup-live |
| No named modes; "custom/mixed" was a problem | Derived L1 lifecycle Shadow→Dry→Live | **Phase 135** | Operator regains the overview (the stated pain) |
| Illegal combos possible (no enforcement) | DB trigger makes them unrepresentable | **Phase 135** | Trust-ramp before NXT mutation (V10.5) |

**Deprecated/outdated:**
- The `20260603b_swarms_dry_run_config.sql` SEED values — stale vs live; do not reuse for the 135 seed (Pitfall 1).
- Treating `debtor.email_labels.status` / the two per-mailbox `dry_run` booleans as gating truth — superseded by the registry gate (MIGRATE-01). They remain as audit/per-mailbox-lifecycle inputs, not gating sources.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The handler→trigger-stage map is `stage_1_cleanup`→stage 1, all other handlers→stage 3 routing | Invariant Mechanism | A wrong map could RAISE on a legal combo (blocking a valid seed) or pass an illegal one. Planner must confirm against stage docs + the actual handler dispatch wiring. |
| A2 | sales `stage_3_routing=false` (LIVE) and `stage_3_intent_label=false` (LIVE) live values are the intended seed (D-09), despite D-05 prose saying "held" and STATE saying sales label must stay GATED until Sugar | 4-Swarm Seed notes */† | If live values are themselves drift, seeding them locks in an unintended-live state. **Needs operator confirmation** — this is the highest-stakes assumption. |
| A3 | sales should derive **Dry** (D-05) even though `stage_1_archive=false`, because sales has no actually-firing archive side-effect (categories lack live `outlook_label` or the archive path is inert for sales) | Derive fn / OQ-3 | If sales archive DOES fire live, sales derives Live, contradicting D-05's "clean Dry-run". The derive fn's "archive-live→Live" rule may need a "side-effect actually configured" guard. |
| A4 | Renaming `dry_run_config`→`gating_config` is acceptable in a zero-behavior-change phase | Storage Recommendation | If the operator wants minimal churn, keep the name `dry_run_config` and only evolve contents (the fallback is stated). Low risk — purely a naming/ergonomics call. |
| A5 | The mailbox-mode is per-swarm-uniform in 135 (no per-mailbox lifecycle override store yet) | Pattern 3 / OQ-1 | If 138 needs a per-mailbox store, 135 should at least reserve the shape. info-routing's 2-live/4-held split is masked by ingest_enabled=false, so uniform is safe for now. |

## Open Questions (RESOLVED at plan time — 2026-06-25)

> Resolutions: OQ-1 → defer per-mailbox lifecycle store to Phase 138; 135 derives per-swarm-uniform (A5).
> OQ-2 → **D-05-R** (CONTEXT.md): operator confirmed **Sugar is out of the picture** → sales seed = verified-live → derives **Dry** (intent-label stays LIVE/written for correction monitoring). OQ-3 → **Path A** (below): seed sales `stage_1_archive` to its *effective* state (**held**, because sales has no wired archive side-effect — observe-mode), keeping the simple Pattern-3 derive fn correct (sales → Dry) and behavior unchanged (D-09); the executor VERIFIES inertness at apply and escalates at the 135-05 operator checkpoint if sales actually fires a live archive. OQ-4 → migrated blocked handlers default to `"dry"` (not `"off"`), matching the 137 capture intent.

1. **Where does the per-mailbox L1 lifecycle live, given config stays per-swarm?**
   - What we know: lifecycle is per-mailbox (locked); stage/handler config is per-swarm (locked). Mailbox lists live in `swarms.behavior_tracking_config.mailboxes`. info-routing has a real 2-live/4-held per-mailbox split (in `info_routing_mailbox_settings`), but the 4 held are `ingest_enabled=false` (not flowing).
   - What's unclear: does 135 need a per-mailbox lifecycle store, or is per-swarm-uniform derive sufficient until 138?
   - Recommendation: For 135, derive per-swarm-uniform (every mailbox in a swarm derives the same mode). Reserve a per-mailbox lifecycle store design for 138; do NOT build it in 135 (deferred: "full per-mailbox config"). MODEL-05 ("new mailbox defaults Shadow") is satisfied at the swarm level (a new swarm with `{}` derives Shadow) — confirm the operator accepts swarm-level default for new *mailboxes within an existing swarm* in 135, with true per-mailbox Shadow landing in 138.

2. **sales-email live state vs D-05 prose vs STATE "keep GATED until Sugar".** [ASSUMED — needs operator confirmation]
   - What we know: live sales `stage_3_routing=false` + `stage_3_intent_label=false` (both LIVE). D-05 says routing + intent-label held. STATE/117-checkpoint says sales label must stay GATED.
   - What's unclear: is the live value the truth to preserve (D-09), or is it drift to correct back to held?
   - Recommendation: BLOCKING checkpoint — operator confirms the sales seed before apply. Default to live values (D-09 literal) only if operator confirms; otherwise seed sales routing+intent_label `true` (held) per D-05.

3. **deriveMailboxMode + archive-live for sales.** [ASSUMED]
   - What we know: sales `stage_1_archive=false` (archive flag live) but D-05 says sales derives clean **Dry**.
   - What's unclear: does sales actually fire a live archive (i.e. does any sales category carry a live `outlook_label`)? If not, the flag is live but inert.
   - Recommendation: Confirm sales archive firing. If inert, the derive fn should key "Live" off *actually-firing* side-effects, not merely flag values — or accept that sales derives Live and revise D-05. Plan a test that asserts sales derives the operator-intended mode.

4. **`off` vs `dry` default for migrated handlers.**
   - What we know: old polarity has only blocked(`true`)/live(`false`). Migrating to tri-state needs a default for blocked handlers: `"off"` (skip) or `"dry"` (simulate+capture).
   - Recommendation: map old `true`(blocked)→`"dry"` (the held-but-will-capture state, matching the 137 intent), NOT `"off"`. `"off"` is reserved for explicitly-disabled handlers. Confirm with operator; debtor `invoice-copy` was blocked→should become `"dry"`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase project `mvqjhlxfvtqqubqgdvhz` | migration apply + live state read | ✓ | live | — (operator-gated apply per prior phases) |
| `SUPABASE_ACCESS_TOKEN` | Management API query (used in this research) | ✓ | 44-char token in `/Volumes/Developer/.secrets.env` | — |
| node_modules in `web/` | running Vitest / codegen locally | ✗ | not installed in this worktree | `npm ci` in `web/` before running tests; CI runs them regardless |
| `web/.env.local` (service role key) | local supabase-js scripts | ✗ | absent in this worktree | Use Management API with `SUPABASE_ACCESS_TOKEN` (as this research did) or populate from NordPass |

**Missing dependencies with no fallback:** none (the live DB is reachable via the Management API token).
**Missing dependencies with fallback:** local `web/node_modules` + `web/.env.local` — install/populate before running the Vitest suite locally; CI handles them via secrets.

## Validation Architecture

> nyquist_validation is not set to false (key absent → enabled). Included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) |
| Config file | `web/vitest.config.ts` |
| Quick run command | `cd web && npx vitest run lib/pipeline-gating` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MIGRATE-02 | Stage gate polarity unchanged (TRUE=blocked, MISSING=fail-closed) | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/dry-run-gate.test.ts` | ✅ (keep green; update `dry_run_config`→`gating_config` in fixtures) |
| MIGRATE-02 | Forward-bucket inverse polarity preserved | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/forward-bucket-release.test.ts` | ✅ (keep green) |
| MIGRATE-02 | intent_label gate fail-closed preserved | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/intent-label-gate.test.ts` | ✅ (keep green) |
| MIGRATE-02 | debtor effective gating preserved (cleanup LIVE, labeling/invoice gated) | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/dry-run-gate-preservation.test.ts` | ✅ (keep green; cleanup-live now via handler tri-state) |
| MODEL-02 | Handler tri-state `live`→not blocked, `dry`/`off`/missing→blocked | unit | `cd web && npx vitest run lib/pipeline-gating` | ❌ Wave 0 — new assertions in dry-run-gate.test.ts |
| MODEL-03 | `deriveMailboxMode` returns Shadow/Dry/Live; highest-wins; fail-closed→Shadow | unit | `cd web && npx vitest run lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` | ❌ Wave 0 — new file |
| MODEL-05 | New swarm with `{}` config derives Shadow | unit | (same derive-mode.test.ts) | ❌ Wave 0 |
| D-03 | Shadow mode holds the Graph PATCH but not internal persistence | unit | `cd web && npx vitest run lib/inngest/functions/__tests__/` (extend intent-label worker test) | ❌ Wave 0 — new assertion |
| MODEL-04 | DB trigger RAISEs on `handler=live` + non-live trigger-stage | integration (SQL) | `npm run check:supabase` (advisor) + a SQL smoke that attempts an illegal UPDATE and asserts it fails | ❌ Wave 0 — SQL smoke (manual or scripted via Management API) |
| MIGRATE-03 | Live seed matches verified-2026-06-25 state (no behavior change) | integration | A read-back query asserting each swarm's `gating_config` post-migration equals the seed table | ❌ Wave 0 — read-back smoke |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/pipeline-gating` (the gate seam — the load-bearing surface).
- **Per wave merge:** `cd web && npm test` (full Vitest suite — catches any worker-side regression from the rename).
- **Phase gate:** Full suite green + `npm run codegen && git diff --exit-code` (no drift — should be a no-op since gate config is NOT codegen'd) + `npm run check:supabase` 0 ERROR + the SQL trigger smoke + the seed read-back, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/pipeline-gating/dry-run-gate/__tests__/derive-mode.test.ts` — covers MODEL-03, MODEL-05 (Shadow/Dry/Live, highest-wins, fail-closed).
- [ ] New tri-state assertions in `dry-run-gate.test.ts` — covers MODEL-02 (`live`/`dry`/`off`).
- [ ] Shadow-suppression assertion in the intent-label worker test — covers D-03.
- [ ] SQL trigger smoke (attempt illegal UPDATE → assert RAISE; via Management API or a `scripts/` tsx) — covers MODEL-04.
- [ ] Seed read-back smoke (post-migration `gating_config` per swarm == verified seed) — covers MIGRATE-03/D-09.
- [ ] Framework install: `cd web && npm ci` — `web/node_modules` absent in this worktree.

## Security Domain

> `security_enforcement` absent in config → enabled. Included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface in this phase (DB migration + internal gate). |
| V3 Session Management | no | — |
| V4 Access Control | yes | RLS on `public.swarms` (already enabled; ALTER reuses existing policies). The violation view MUST be `security_invoker=true` so RLS of the calling role applies. No anon/authenticated write to `swarms`. |
| V5 Input Validation | yes | The trigger function validates the gating_config shape at write-time (the invariant). Seed values are operator-controlled SQL, not user input. |
| V6 Cryptography | no | — |

### Known Threat Patterns for {Supabase migration + registry gate}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS disabled / overly-broad policy on the new view | Elevation of Privilege | `security_invoker=true` view (never SECURITY DEFINER); `npm run check:supabase` 0 ERROR gate; no anon policy [CITED: CLAUDE.md Supabase rules] |
| `function_search_path_mutable` on the trigger fn | Tampering | If declared SECURITY DEFINER, add `SET search_path = public, pg_catalog, pg_temp`; trigger fns need no EXECUTE grants [CITED: CLAUDE.md] |
| Gating downgrade via direct SQL bypassing the app | Elevation of Privilege | The trigger enforces the invariant at the DB layer (D-04) — even a raw SQL write cannot persist an illegal live-handler combo |
| Seeding a swarm LIVE that should be held (sales/Sugar) | Tampering / reputational | BLOCKING operator checkpoint before seed apply (Open Question 2); fail-closed default (missing key → blocked) |
| Shadow suppression accidentally hiding internal audit rows | Repudiation | Suppress ONLY the Graph PATCH; preserve all `pipeline_events`/`automation_runs`/`email_labels` writes (Pitfall 4) |

## Sources

### Primary (HIGH confidence)
- Live Supabase Management API queries against `mvqjhlxfvtqqubqgdvhz` (2026-06-25): `swarms.dry_run_config` for all 4 swarms, `debtor.labeling_settings`, `public.info_routing_mailbox_settings`, `debtor.email_labels.status` distribution (651 dry_run rows), `swarm_intents` per swarm, `swarms.side_effects`, `pg_constraint` (no existing CHECK on swarms), full `swarms` column shape.
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — verified helper signatures + polarity conventions.
- The three pin tests + `dry-run-gate-preservation.test.ts` — verified behavior contract.
- All 8 gate readers (verified the usage of each helper + the Shadow-suppression site).
- `docs/agentic-pipeline/README.md` + `stage-4-handler.md` — swarm shapes (Handler/Router/Hybrid), per-stage nullability, SWARM-02.
- `supabase/migrations/_template.sql`, `20260603b_swarms_dry_run_config.sql`, `20260624a/b` (forward bucket activation/revert).
- `web/lib/swarms/registry.ts`, `types.ts`, `side-effects.ts`, `scripts/gen-tenant-domains.ts`, `.github/workflows/pr-checks.yml`.
- CONTEXT.md, REQUIREMENTS.md, ROADMAP.md (lines 811-907), STATE.md, `.planning/briefs/run-mode-gating-redesign.md`.
- `./CLAUDE.md` — Supabase RLS rules, codegen pattern, Inngest replay-safety, migration template requirement.

### Secondary (MEDIUM confidence)
- STATE.md historical notes on Management-API drift (info-routing dispatch, forward bucket releases) — corroborated by the live query.

### Tertiary (LOW confidence)
- The handler→trigger-stage map (A1) — inferred from worker wiring; planner must confirm against the dispatch path.

## Project Constraints (from CLAUDE.md)

- **RLS mandatory** on any new table in a PostgREST-exposed schema + a `service_role FOR ALL` policy (+ `authenticated SELECT` if UI reads it). This phase ALTERs the existing RLS-enabled `public.swarms` (no new table) — existing policies cover the renamed column. The violation VIEW must be `security_invoker=true` (never `SECURITY DEFINER`).
- **SECURITY DEFINER functions** need `SET search_path = public, pg_catalog, pg_temp`. The trigger function, if SECURITY DEFINER, must carry it (trigger fns need no EXECUTE grants).
- **Migration template** `supabase/migrations/_template.sql` — copy for the new migration; filename `YYYYMMDD_phase135_gating_config.sql`.
- **`npm run check:supabase`** must show 0 ERROR (pre-push hook enforces it). New trigger fn + view will be advisor-inspected.
- **Codegen / registry-as-source-of-truth**: gate config is read at runtime, NOT codegen'd (Pitfall 6). The codegen drift gate must remain a no-op for this phase.
- **Inngest replay-safety**: any non-deterministic value used as a DB key must be generated inside `step.run()`; never alias/destructure `inngest.send`. The D-03 Shadow gate only adds a read + early-return (no new keyed writes), so replay-safety is preserved — but the planner should keep the derive read inside a `step.run` (as the existing gate read is).
- **No direct LLM API keys** / use existing patterns — N/A (no LLM in this phase).
- **Conventional commits, branch off main** (already on `workspace/run-mode-unify`).

## Metadata

**Confidence breakdown:**
- Storage shape recommendation: HIGH — grounded in verified reader pattern (single cached row), codegen coupling analysis, and the existing jsonb shape.
- Invariant mechanism: HIGH — CHECK/generated-column disqualification is a Postgres-level fact; trigger+view is the standard pattern for map-shaped jsonb enforcement.
- 4-swarm normalization seed: HIGH for the live values (queried directly); MEDIUM for whether the live sales values are intended-vs-drift (Open Question 2 — needs operator).
- Derive fn correctness: MEDIUM — the Shadow/Dry/Live ladder is clear, but the "archive-live → Live" rule vs sales-derives-Dry (D-05) is an unresolved nuance (Open Question 3).
- MIGRATE-02 cutover: HIGH — "swap internals, keep signatures" is mechanical and pin-tested.

**Research date:** 2026-06-25
**Valid until:** 2026-07-02 (7 days — the live gate state is operationally flipped and may drift; re-query the seed table at plan time).
