# Phase 122: Cross-brand-scope customer resolution - Research

**Researched:** 2026-06-18
**Domain:** Stage-2 entity resolution engine (backend resolver logic + per-swarm config + eval gate). NO UI, NO new framework.
**Confidence:** HIGH — every recommendation is grounded in code read this session (file + line cites). The substrate already returns cross-brand candidates; this phase is engine/step + config + outcome-shape work, not new SQL.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Cross-brand = **all `scope_key`s within the mailbox's own `environment_id`**. The `environment_id` hard filter (`'BX'`) is the only boundary and is already enforced by `resolve_candidates`. A mailbox never resolves a customer from another environment.
- **D-02:** **No per-mailbox sibling allowlist.** "All brands in the environment" scales to future UK/IE (separate `environment_id`s) with zero config change. Safety comes from the uniqueness + strong-ID bar (D-03/D-04), not from shrinking the search space.
- **D-03:** Cross-brand **auto-resolve** allowed only when EITHER (a) **one strong, unique** identifier kind matches (the existing `auto_safe_alone_kinds`: `invoice_no`, `customer_no`, `site_no`); OR (b) **≥2 independent signals corroborate** on the same customer via the **existing Phase 120 corroboration mechanism**.
- **D-04:** A **lone weak signal** (sender/`email_domain`, name, postcode) → at most a **suggestie** cross-brand, never auto-resolve.
- **D-05:** Signals that **disagree** → suggestie / unresolved, never auto-resolve.
- **D-06:** Introduce a **"suggestie"** tier. 4-tier confidence: 🟢 zeker (auto) · 🟠 suggestie (likely, operator confirms) · 🔴 heel onzeker (ambiguous) · ⚪ geen match.
- **D-07:** suggestie + candidate set land in the **existing review-queue (Bulk Review)** surface — **no new queue UI**. (Verify the existing surface can render it.)
- **D-08:** Cross-brand resolve requires **exactly one** distinct customer (`root_party_id`) across the cross-brand candidate set (mirrors number-tier `distinctRoots === 1`). ≥2 → suggestie/heel onzeker.
- **D-09:** Cross-brand resolve carries a **"possible wrong mailbox" annotation** ("resolved under brand X, mailbox is brand Y"). Signal only, re-routes nothing.
- **D-10:** All cross-brand behavior **opt-in per swarm via `swarms.resolution_config`** (mirrors Phase 120 corroboration). No per-swarm-name branch. Debtor opts in; sales config-ready.
- **D-11:** Cross-brand runs **only after an in-scope miss** — a fallback, not the default path.

### Claude's Discretion
- Implementation shape of the cross-brand fallback (new precedence step vs. post-pass after in-scope miss) — subject to D-10/D-11.
- Exact JSON shape / field names of the new `resolution_config` cross-scope sub-config (mirror the `corroboration` block).
- Whether sales also opts in this phase vs. a later config-only flip (debtor is the frozen acceptance fixture).
- Exact representation of the "suggestie" tier in confidence/audit types (new enum value vs. flag + candidate list), honoring D-06/D-07.

### Deferred Ideas (OUT OF SCOPE)
- Colored Outlook label by confidence tier (🟢🟠🔴⚪) — its own follow-up phase. 122 produces the taxonomy, not the label.
- Actual mailbox re-routing of mis-routed mail — Routing Swarm milestone (V9.7). 122 only emits the annotation (D-09).
- Sales opt-in to cross-brand — config-only flip once re-validated against a sales baseline.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| XSCOPE-01 | In-scope miss → cross-scope `resolve_candidates` back-search; unique root hit auto-resolves, non-unique → suggestie. | Recommendation 1 (post-pass in the two SUGGEST drop sites), Recommendation 5 (root-uniqueness wiring) |
| XSCOPE-02 | Cross-scope is config-gated per swarm (opt-in), zero per-swarm branch (SWARM-02 holds). | Recommendation 2 (`cross_scope` sub-config), Architecture Pattern 1 (config-data gating) |
| XSCOPE-03 | The 9 eval bucket-C rows resolve to operator-confirmed customer (or correctly demoted to suggestie) in the post-landing re-run. | Recommendation 7 (eval gate mechanics), Validation Architecture |
</phase_requirements>

## Summary

Phase 122 relaxes the **prefix-family brand gate** that today *drops* (returns `null` → SUGGEST/unresolved) any candidate whose `brand_id` is not in the mailbox's in-scope brand set. There are **exactly three drop sites** in the engine, all structurally identical (`!inScopeBrands.has(winner.brand_id) → return null`):
1. `steps/identifier-match.ts:118-124` — legacy invoice path
2. `steps/identifier-match.ts:264-270` — Phase-91 number back-search AUTO pre-pass
3. `steps/self-auth-match.ts:139` — self-auth DIRECT AUTO tier

The substrate already does the hard work: `resolve_candidates` hard-filters ONLY on `environment_id` and returns ALL brands (brand is a tiebreaker, never a filter — `03-resolve-candidates.sql:35-44,168`). So the cross-brand candidates are *already in `res.matches`*; today's code simply discards the out-of-scope ones. Phase 122 adds a **config-gated cross-scope fallback** that, when the in-scope gate would have dropped the row, re-examines the same already-fetched `res.matches` across all brands, applies the **same root-uniqueness rule** (`distinctRoots === 1`), and either auto-resolves (with a misroute annotation) or degrades to **suggestie**.

**Primary recommendation:** Implement the fallback as a **post-pass inside the existing steps** (NOT a new precedence step), gated on `config.cross_scope?.enabled`. Reuse `res.matches` already fetched — no new lookup, no new SQL. Represent "suggestie" as a **new `Confidence` enum value `"suggestie"`** (4-tier: `high | suggestie | low | none`, where `high`=zeker, `suggestie`=🟠, `low`=heel onzeker, `none`=geen match), carried on the existing `ResolveResult` + already-projected to Bulk Review via `numericConfidence`. Add a `cross_scope_misroute` annotation to `ResolveResult` (emit-only). Opt **debtor only** in this phase (it owns the frozen fixture); leave sales a config-only follow-up.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Cross-brand candidate retrieval | Database (SQL `resolve_candidates`) | — | Already returns ALL brands env-filtered; NO change needed (`03-resolve-candidates.sql`) |
| Cross-brand fallback decision (resolve vs suggestie) | API/Backend (resolve engine steps) | — | Pure TS logic over already-fetched `res.matches`; the AUTO/SUGGEST gate lives in TS by contract (`03-resolve-candidates.sql:17-18`) |
| Config gating (opt-in) | Database (`swarms.resolution_config` jsonb) | API (engine reads it) | Registry-as-source-of-truth (SWARM-02); mirror Phase 120 `corroboration` precedent |
| Confidence tier + candidate set + misroute annotation | API/Backend (`ResolveResult` shape) | — | Carried on the existing audit/output payload (`resolution_audit` / `email_labels` / `pipeline_events`) |
| Suggestie display | Frontend (Bulk Review) — READ-ONLY this phase | — | Existing `stage-2-read.tsx` already renders confidence + candidate list; verify no read-side change (D-07) |
| Eval re-scoring | Build/Script (tsx harness) | — | `resolver-correctness-gate.ts` replays the frozen fixture against the live resolver |

## Standard Stack

No new external packages. This is internal TypeScript + SQL + jsonb config work on the existing stack.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (strict) | repo | engine + step + config types | The codebase is strict TS; `ResolveResult`/`Confidence` are the LOCKED public contract (`engine.ts:62-158`) |
| Vitest | `^4.1.0` | unit tests for the new fallback + suggestie tier | Existing engine test harness lives in `web/lib/agentic-pipeline/resolve/__tests__/` |
| tsx | repo | the eval gate harness (`resolver-correctness-gate.ts`) | Already the established run mode (`npx tsx scripts/eval/...`) |
| Supabase migration (jsonb UPDATE) | repo | opt-in `cross_scope` sub-config on `swarms.resolution_config` | Mirrors `20260616a_debtor_corroboration_optin.sql` exactly |

**Installation:** none.

## Package Legitimacy Audit

Not applicable — Phase 122 installs **zero external packages**. All work is internal TS/SQL on the existing dependency set. (Verified: the standard stack above is all in-repo.)

## Architecture Patterns

### System Architecture Diagram

```
email (post Stage 1) → stage-2-customer-resolver.ts (Inngest worker, inside step.run)
        ↓ reads swarms.resolution_config (registry — SWARM-02 dispatch)
   resolveEntity(args, config)   [engine.ts]
        ↓ iterates config.precedence (no-corroboration OR corroboration path)
   ┌─────────────────────────────────────────────────────────────────────┐
   │ step modules — EACH fetches resolve_candidates (ALL brands, env-hard) │
   │                                                                       │
   │  self_auth / identifier_match (number) / identifier_match (invoice)   │
   │        ↓ in-scope prefix-family gate                                  │
   │   in-scope unique root? ── YES → AUTO (high/zeker) ──────────┐        │
   │        ↓ NO (today: return null → SUGGEST)                   │        │
   │   ┌── PHASE 122 POST-PASS (config.cross_scope.enabled) ──┐   │        │
   │   │ re-examine SAME res.matches across ALL brands         │   │        │
   │   │   distinctRoots(all brands) === 1 AND kind strong? ───┼── │ → AUTO + misroute annotation
   │   │   else (≥2 roots OR weak-only)  ──────────────────────┼── │ → SUGGESTIE + candidate set
   │   └───────────────────────────────────────────────────────┘  │        │
   └─────────────────────────────────────────────────────────────┼────────┘
        ↓ (no step resolves)                                       │
   unresolved (geen match / none) ◄────────────────────────────────┘
        ↓
   ResolveResult { confidence: high|suggestie|low|none, candidates, cross_scope_misroute? }
        ↓ worker writes
   debtor.email_labels (debtor) / email_pipeline.resolution_audit (generic) + pipeline_events
        ↓ hydrate.ts projects → BulkReviewStage2Slot
   Bulk Review stage-2-read.tsx (renders confidence + candidate list — READ-ONLY)
```

### Recommended Project Structure (files this phase touches)

```
web/lib/agentic-pipeline/resolve/
├── engine.ts                       # Confidence type +1 value; ResolveResult +cross_scope_misroute field
├── config.ts                       # +CrossScopeConfig interface; +cross_scope? on ResolutionConfig + EngineConfig Pick
├── corroborate.ts                  # cross-brand corroboration path (D-03b) — score over all-brand collected signals
└── steps/
    ├── identifier-match.ts         # post-pass at the 2 drop sites (lines 118-124, 264-270)
    ├── self-auth-match.ts          # post-pass at the drop site (line 139)
    └── cross-scope.ts (NEW)        # SHARED helper: given res.matches + inScopeBrands + config, decide AUTO/suggestie
supabase/migrations/
└── 2026MMDDx_debtor_cross_scope_optin.sql   # UPDATE swarms.resolution_config, add cross_scope (mirror 20260616a)
web/lib/automations/debtor-email/
└── resolve-debtor.ts               # debtorP0Config += cross_scope (lockstep with the seed, like corroboration)
web/scripts/eval/
└── resolver-correctness-gate.ts    # add BUCKET_C set + per-row acceptance scoring for the 9 rows
```

### Pattern 1: Config-data gating (SWARM-02) — the cross-scope fallback is selected by a config FIELD, never a swarm name

**What:** Add `cross_scope?: CrossScopeConfig` to `ResolutionConfig`. The fallback fires iff `config.cross_scope?.enabled` is true. This is the EXACT pattern Phase 120 used for `corroboration` (`engine.ts:221` `if (!config.corroboration)`) and that the sales adapter uses (`resolve-customer.ts:148,367`).

**When to use:** Always. Verified there are **zero** `swarm_type ===` / `swarm ===` / `=== "debtor"` branches in the resolve engine, steps, config, or `dynamic.ts` (grep returned empty). This invariant MUST hold post-122.

**Example:**
```typescript
// Source: web/lib/agentic-pipeline/resolve/engine.ts:221 (the corroboration precedent)
if (!config.corroboration) { /* byte-identical legacy loop */ }
// Phase 122 mirror — inside each step, at the drop site:
if (winner.brand_id != null && winner.brand_id !== "" && !inScopeBrands.has(winner.brand_id)) {
  if (config?.cross_scope?.enabled) {
    return resolveCrossScope(res.matches, eligible, inScopeBrands, config, args, identifiers);
  }
  return { result: null, matched_identifiers: identifiers }; // today's SUGGEST drop, unchanged when opt-out
}
```

### Pattern 2: Reuse the already-fetched `res.matches` (no second lookup)

**What:** Each step already calls `lookupResolveCandidates(...)` once and gets ALL brands back (`identifier-match.ts:86-100`, `:204-218`; `self-auth-match.ts:97`). The cross-scope fallback re-examines that SAME array — it does NOT issue another Zap call. This is replay-safe (no new non-determinism) and free (one network call total).

**When to use:** Always. The drop sites already have `res.matches` / `inScope` in scope.

### Pattern 3: Root-uniqueness over ALL brands (D-08) mirrors the in-scope number tier

**What:** Today the in-scope decision is `distinctRoots.length === 1` over `inScope.filter(brand in scope)` (`identifier-match.ts:105-111`). The cross-scope fallback computes `distinctRoots` over the WHOLE candidate set (all brands, env-filtered, auto-eligible-status). `=== 1` → cross-brand AUTO; `>= 2` → suggestie. Self-auth uses DIRECT `party_id` distinctness (`self-auth-match.ts:128`), so its cross-scope variant uses `distinctParties` not roots — preserve that granularity split (CR-01).

### Anti-Patterns to Avoid
- **New precedence step for cross-scope.** Rejected: a precedence step runs BEFORE in-scope steps in the loop unless ordered last, violating D-11 (fallback only after in-scope miss). The drop site is exactly "in-scope already missed" — a post-pass there is structurally correct and needs no precedence reordering. Also avoids a second `resolve_candidates` fetch.
- **A new SQL query / new `resolve_candidates` param.** Rejected by the Resolution Transport Rule (LOCKED) AND by Code Insights — the substrate already returns all brands. Adding `@cross_scope` SQL is wasted work.
- **`if (swarm_type === 'debtor-email')` to scope the fallback.** Violates SWARM-02 / D-10. Gate on `config.cross_scope` data only.
- **A boolean `is_suggestie` flag alongside `confidence`.** Rejected in favor of a `Confidence` enum value — the Bulk Review read path already projects `confidence` through `numericConfidence` (4 cases). A new orthogonal boolean would need new read-side wiring; an enum value rides the existing projection (see Recommendation 3).
- **Hard-coding `customer_no`/`site_no`/`invoice_no` strong-kind list in the step.** Reuse `config.corroboration.auto_safe_alone_kinds` (already names them, `20260616a:46`) OR a `cross_scope.auto_resolve_kinds` field — config, not literal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-brand candidate fetch | A new SQL proc / new Zap | `resolve_candidates` `res.matches` already in hand | Substrate returns ALL brands env-filtered (`03-resolve-candidates.sql:35-44`) |
| Multi-signal cross-brand scoring (D-03b) | A new scoring system | `scoreCorroboration()` (`corroborate.ts`) | Phase 120's pure deterministic scorer is reused wholesale per Code Insights; feed it all-brand collected signals |
| Strong-kind roster (D-03a) | A new constant in the step | `config.corroboration.auto_safe_alone_kinds` (`["customer_no","site_no","invoice_no"]`) | Already the named strong-unique list (`20260616a:46`); config, not code |
| Root rollup | Re-walking the parent chain | `root_party_id` on each match (materialized, D-04) | The seed/refresh already materialized the true root (`03-resolve-candidates.sql:31-33`) |
| Status/active gate | A new status check | `isAutoEligibleStatus(m.status)` (`steps/auto-gate.ts`) | Already excludes stopped/closed/blocked NL+EN (WR-03) |
| Confidence → numeric for UI | A new mapper | `numericConfidence()` (`pipeline-events/types.ts:120`) | Already projects high/medium/low/none → 0.9/0.7/0.4/null |

**Key insight:** This phase is ~90% *removing a guard* (the in-scope brand drop) and adding a config-gated branch over data you already have. The expensive parts (cross-brand retrieval, root rollup, corroboration scoring, status gating) are all pre-built.

## Detailed Recommendations (Claude's Discretion items)

### 1. Implementation shape — POST-PASS inside the steps, not a new precedence step

**Where it hooks (exact drop sites — all return `null`/SUGGEST today on cross-brand):**
- `steps/identifier-match.ts:118-124` (legacy invoice path): `if (winner.brand_id ... && !inScopeBrands.has(winner.brand_id)) { return { result: null, ... } }` ← cross-scope post-pass goes here.
- `steps/identifier-match.ts:264-270` (number back-search AUTO pre-pass): same shape.
- `steps/self-auth-match.ts:139`: `if (!inPrefixFamily(winner.brand_id, inScopeBrands)) return null;` ← here.

**How it stays SWARM-02-pure:** Each step already receives `config` (typed `SelfAuthConfig`/`IdentifierMatchConfig`). Add `cross_scope?: CrossScopeConfig` to that config slice; the post-pass guards on `config.cross_scope?.enabled`. No swarm name anywhere.

**How it honors D-11 (fallback only after in-scope miss):** The drop site is reached ONLY after the in-scope `distinctRoots === 1 && in-prefix-family` AUTO path failed — by construction, in-scope already missed. No precedence change.

**How it honors D-10 (opt-in):** When `config.cross_scope` is absent/`enabled:false`, every drop site behaves byte-identically to today (return null → SUGGEST). Confirmed-safe for any non-opted-in swarm.

**Recommended factoring:** Extract a SHARED `resolveCrossScope(matches, eligibleKinds, inScopeBrands, config, args, matchedIdentifiers)` helper in a new `steps/cross-scope.ts` so all three drop sites call one tested function. It (a) filters `matches` to auto-eligible status across ALL brands, (b) computes `distinctRoots` (or `distinctParties` for self-auth granularity), (c) on `=== 1` + strong/corroborated → AUTO `high` with misroute annotation, (d) else builds a suggestie `ResolveResult` carrying the candidate set. `[VERIFIED: codebase grep — engine/steps/config/dynamic carry zero swarm-name branches]`

### 2. The `cross_scope` sub-config JSON shape (mirror the `corroboration` block)

**TS additions in `config.ts`** (mirror `CorroborationConfig`, `config.ts:137-159`):
```typescript
/**
 * Phase 122 (D-10) — cross-brand-scope fallback policy. OPTIONAL — absent or
 * enabled:false ⇒ the engine's in-scope brand gate behaves byte-identically to
 * today (cross-brand candidate → SUGGEST drop). Free-form jsonb (no codegen),
 * like the rest of resolution_config. Swarm-agnostic (SWARM-02): gated on this
 * field's presence, never on swarm_type.
 */
export interface CrossScopeConfig {
  /** Master opt-in. false/absent ⇒ no cross-brand fallback (D-10). */
  enabled: boolean;
  /**
   * D-03(a) — identifier_kinds strong enough to AUTO-resolve cross-brand ALONE
   * on a single distinct root (e.g. ["invoice_no","customer_no","site_no"]).
   * A kind NOT in this set can only produce a suggestie cross-brand (D-04).
   * Defaults to corroboration.auto_safe_alone_kinds when absent (DRY).
   */
  auto_resolve_kinds?: string[];
  /**
   * D-03(b) — when true, a cross-brand candidate corroborated by ≥min_signals
   * (the existing corroboration gate) may AUTO-resolve even on a weak lone kind.
   * When false, only auto_resolve_kinds may AUTO cross-brand. Default true.
   */
  allow_corroboration_auto?: boolean;
}
```
Add `cross_scope?: CrossScopeConfig;` to `ResolutionConfig` (after `corroboration`, `config.ts:130`) AND to the `EngineConfig` Pick in `engine.ts:43` (`Pick<ResolutionConfig, "auto_safe_kinds" | "llm_tiebreaker" | "corroboration" | "cross_scope">`).

**Migration shape** (mirror `20260616a_debtor_corroboration_optin.sql` — UPDATE-only, no new table/policy, RLS already covers the column):
```sql
-- 2026MMDDx_debtor_cross_scope_optin.sql
BEGIN;
UPDATE public.swarms
   SET resolution_config = resolution_config || '{
         "cross_scope": {
           "enabled": true,
           "auto_resolve_kinds": ["invoice_no", "customer_no", "site_no"],
           "allow_corroboration_auto": true
         }
       }'::jsonb,
       updated_at = now()
 WHERE swarm_type = 'debtor-email';
COMMIT;
```
Use `||` (jsonb concat) to ADD the key without re-stating the whole row (the live row is the source of truth per W1 in `20260616a:7-15` — re-stating risks drift). `[CITED: supabase/migrations/20260616a_debtor_corroboration_optin.sql]`

Also add `cross_scope` to the in-code `debtorP0Config` (`resolve-debtor.ts:63-91`) in lockstep, exactly like `corroboration` was added (`:80-90`) — the eval harness imports `debtorP0Config` directly, so the gate only exercises cross-scope if the constant carries it.

### 3. "suggestie" tier — NEW enum value on `Confidence`, riding the existing read projection

**Current type** (`engine.ts:74`): `export type Confidence = "high" | "medium" | "low" | "none";`

**Recommended 4-tier mapping** (honors D-06 🟢🟠🔴⚪ + the operator's tier→color intent):
| Operator tier | Confidence value | UI numeric (`numericConfidence`) |
|---|---|---|
| 🟢 zeker (auto) | `high` | 0.9 |
| 🟠 suggestie | **`suggestie`** (NEW) | add case → 0.7 (reuse the medium slot) |
| 🔴 heel onzeker | `low` | 0.4 |
| ⚪ geen match | `none` | null |

Recommendation: **add `"suggestie"` as a new `Confidence` value** rather than reusing `"medium"`. Rationale: (a) the eval gate's acceptance is "demoted below AUTO" = `confidence !== "high"` (`resolver-correctness-gate.ts:262,269`) — both `medium` and `suggestie` satisfy it, so no gate breakage; (b) a distinct value lets the future Outlook-label phase map tier→color 1:1 without re-deriving from `medium`; (c) `medium` already has live semantics (corroboration cap, `corroborate.ts:54`). A 5th value is additive and safe IF every `Confidence` switch is updated.

**Types that change:**
- `engine.ts:74` — add `"suggestie"` to `Confidence`.
- `pipeline-events/types.ts:120-126` `numericConfidence(v: "high"|"medium"|"low"|"none"...)` — widen the param union + add `if (v === "suggestie") return 0.7;`. **Also** the call sites in the worker that cast `result.confidence as "high"|"medium"|"low"|"none"` (`stage-2-customer-resolver.ts:425-431,582-588`) — widen those casts.
- `corroborate.ts:53` `capBelowAuto` — confirm `suggestie` is NOT `high` so it stays put (it does — only `high→medium`). The cross-scope helper should emit `suggestie` directly, not route through `capBelowAuto`.
- Bulk Review: `BulkReviewStage1Slot.llm_confidence` and `ResolverStep.confidence` are UNAFFECTED (Stage 1 / step trace use their own unions). The Stage 2 slot carries `confidence: number | null` (`hydrate.ts:114,541`) — already numeric, so `suggestie`→0.7 flows through with NO read-side type change.

**Candidate-set field that carries best-candidate + list:** the existing `ResolveResult.inputs` discriminated union — `inputs.kind === "identifier_match"` carries `candidates: Candidate[]` (`engine.ts:120-124`). The suggestie result reuses this: `candidates[0]` = best candidate, the full array = the shortlist. No new field needed for the candidate set. `[VERIFIED: codebase — engine.ts Stage2Inputs + hydrate.ts:529-547]`

### 4. Bulk Review read path — VERIFIED it can render suggestie + candidate list with NO read-side change

**Files that read the outcome:**
- `web/lib/bulk-review/hydrate.ts` — projects `pipeline_events.decision_details` / `debtor.email_labels` → `BulkReviewStage2Slot`. `confidence` is read as `stage2Event.confidence ?? asNumber(d.confidence)` (`:541`) — already numeric, so `suggestie`→0.7 lands with no change. `inputs` is projected verbatim (`:529-535`) — the candidate list arrives as-is.
- `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-2-read.tsx` — renders the resolved customer + candidate evidence. It already renders a candidate LIST: the `TiebreakerAnalysis` block (`:64-179`) iterates `inputs.candidates` for `kind === "llm_tiebreaker"`. **A suggestie carries `inputs.kind === "identifier_match"` with `candidates`**, which `stage-2-read.tsx` currently routes to `ResolverChain` (`:419-425`). The single-candidate suggestie renders fine (customer line + chain). A MULTI-candidate suggestie shortlist would render only `candidates[0]` via the customer line unless the renderer is taught to show the `identifier_match` candidate array like it shows the tiebreaker array.

**Read-side change needed?** Per D-07 "no new queue UI" — for the **debtor acceptance fixture**, bucket-C rows resolve to a SINGLE cross-brand customer (unique root) or demote to suggestie/heel-onzeker; the data (confidence + best candidate + brand) reaches the surface with **zero read-side change**. The confidence number (0.7) + customer + brand badge all render today. **MINOR optional read enhancement** (still no new UI surface, just a render branch in the existing `stage-2-read.tsx`): when `inputs.kind === "identifier_match"` and `candidates.length > 1`, render the array like `TiebreakerAnalysis` does. Flag this to the planner as **discretionary** — the locked requirement (data reaches the surface) is met without it. `[VERIFIED: codebase — hydrate.ts:529-547, stage-2-read.tsx:64-179,406-425]`

### 5. Uniqueness rule wiring (D-08)

**Today (in-scope number tier):** `rootOf = m => m.root_party_id ?? m.party_id; distinctRoots = Array.from(new Set(inScope.map(rootOf)));` then `if (distinctRoots.length === 1)` AUTO (`identifier-match.ts:108-111`). The proc's per-DIRECT-party `is_unique_in_scope` is deliberately NOT used at the number tier (granularity mismatch, CR-01 — `03-resolve-candidates.sql:20-29`); root-distinctness is the gate.

**Phase 122 (cross-brand set):** apply the SAME `distinctRoots === 1` rule but over the candidate set across ALL brands (not `inScope.filter(brand in scope)`). The cross-scope helper computes `distinctRoots` over `matches.filter(eligible kind && isAutoEligibleStatus)` with NO brand filter. `=== 1` → cross-brand AUTO; `>= 2` → suggestie (D-08). For **self-auth** (DIRECT tier), use `distinctParties` over `party_id` not `root_party_id` (`self-auth-match.ts:128` granularity) — keep the split.

**Important:** the in-scope path uses `is_unique_in_scope` ONLY at the self-auth DIRECT tier (`self-auth-match.ts:121`). The cross-scope variant must NOT rely on `is_unique_in_scope` for the cross-brand decision — that flag is computed WITHIN the requested brand tiebreaker tier (`03-resolve-candidates.sql:126-163`), so it does not assert cross-brand uniqueness. Compute distinctness directly over the all-brand set. `[VERIFIED: codebase — identifier-match.ts:227-256 CR-01 comment + self-auth-match.ts:120-129]`

### 6. Misroute annotation (D-09) — cheapest place + emit-only

**Cheapest attach point:** a new OPTIONAL field on `ResolveResult` (`engine.ts:142-158`), mirroring how `environment_id?` was added there (`:149-155`):
```typescript
// Phase 122 (D-09) — emit-only misroute signal. Set ONLY when a cross-brand
// fallback resolved/suggested under a brand outside the mailbox's in-scope set.
// Re-routes nothing this phase; the future Routing Swarm (V9.7) consumes it.
cross_scope_misroute?: {
  resolved_brand: string;     // the winner's scope_key (the brand the customer lives under)
  mailbox_brand: string | null; // args.brand_id (the mailbox's in-scope brand)
};
```
It then flows for free into the audit payloads the worker already writes: `resolution_audit.trace` (free-form jsonb, `stage-2-customer-resolver.ts:402-409`), `pipeline_events.decision_details` (`:433-443`), and `debtor.email_labels` via the `reason`/trace path. **No consumer wiring this phase** — confirmed: there is NO existing reader of a misroute field anywhere (grep for `misroute`/`wrong_mailbox`/`cross_scope` found only doc references and unrelated `suggestie` strings). The README notes the source-swarm-learning consumer is V9.0+ — not this phase. `[VERIFIED: codebase grep — no cross-brand/misroute consumer exists]`

### 7. Eval gate mechanics (XSCOPE-03 acceptance)

**How `resolver-correctness-gate.ts` works:** A read-only tsx harness (`web/scripts/eval/resolver-correctness-gate.ts`). It reads the frozen `resolver-eval.xlsx` `Validatie` tab (100 rows), maps each row's mailbox → `{source_mailbox, brand_id}` via `MAILBOX_MAP` (`:80-85`), derives `brand_scope` from `debtorP0Config.scope.brand_scope_by_mailbox` (`:184-187`), then calls the LIVE `resolveEntity(args, debtorP0Config)` per row (`:205-216`) and scores `result.customer_account_id === groundTruth(row)` (`:220`). It hits the LIVE `resolve_candidates` Zap substrate and WRITES NOTHING.

**How bucket-C rows are identified:** TODAY the harness has `CONFIDENT_WRONG` (#2,#85,#95,#97) and `BUCKET_B` sets (`:89-92`) but **NO `BUCKET_C` set**. The 9 bucket-C rows are named in `FINDINGS.md:64-66`: `#37, #85, #95, #96, #97, #98, #67, #69, #70` (smeba-fire↔smeba-BB #37/#85; berki #95/#96/#97/#98; CBRE under Smeba BB #67/#69/#70). Note overlap: #85 is C∩D, #67/#69/#70 are B∩C. **Planner must add a `BUCKET_C` set** mirroring `BUCKET_B` (`:90-92`) and a `targetClass` branch (`:166-178`) returning `"bucket-C"`.

**Acceptance wiring the planner must add** (mirror the bucket-B scoring at `:267-270`):
```typescript
const bucketC = results.filter(r => r.target === "bucket-C");
const bucketCResolvedOrDemoted = bucketC.filter(
  r => r.correct === true || r.afterConfidence !== "high"  // resolved-correct OR demoted to suggestie/below
);
// gate: bucketCResolvedOrDemoted.length === bucketC.length (all 9)
```
This makes XSCOPE-03 objective: each of the 9 rows must EITHER resolve to the operator-confirmed customer (`correct === true`) OR sit below AUTO (`confidence !== "high"`, i.e. suggestie/heel-onzeker/none). A cross-brand confident-wrong (high + wrong) FAILS the gate. Add a "Bucket-C wrong-brand" section to the generated `RERUN-FINDINGS.md` like the existing bucket-B table (`:333-342`).

**Run commands:**
- Targeted (the 9 rows): `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --rows 37,85,95,96,97,98,67,69,70`
- Full re-run + report: `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report`
- Requires `web/.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` + NXT tool webhook secrets (the Zap posts back) (`:28-31`).

**Caveat (LOW-confidence on row-level outcomes):** the harness hits the LIVE substrate; a row whose cross-brand customer is missing/stale in `resolver_index` returns `reachable:false` and is NOT counted (`:257-259`). The planner should treat "all reachable bucket-C rows pass" as the gate and surface not-reachable rows explicitly (the harness already does, `:344`). Whether all 9 are reachable against the live index is unknown until first run. `[VERIFIED: codebase — resolver-correctness-gate.ts full read; FINDINGS.md:64-66]`

## Runtime State Inventory

> Phase 122 is primarily a code/config change, but the cross-brand fallback depends on the materialized `resolver_index` and a live opt-in row. This inventory covers what must exist at runtime for the fallback to fire.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `swarms.resolution_config` jsonb on the LIVE debtor-email row (project `mvqjhlxfvtqqubqgdvhz`) must receive the `cross_scope` key. The live row is the source of truth (W1, `20260616a:7-15`) — an in-tree migration alone does NOT change live behavior until applied. | **Data migration** (jsonb `||` UPDATE) — apply to live, mirror in `debtorP0Config`. Both required. |
| Stored data | `zapier.dbo.resolver_index` (SQL Server estate, NOT supabase) must already carry the bucket-C customers' identifier rows under their TRUE brand `scope_key`. The fallback finds them only if the seed/refresh indexed them. | **None (verify)** — Code Insights says the substrate already returns cross-brand candidates; first eval run confirms coverage. No new SQL/index this phase (Resolution Transport Rule + D-01). |
| Live service config | The `nxt.resolve_candidates` Zap (registry `public.zapier_tools`) is already live and already returns all brands env-filtered. | **None** — unchanged; no new tool, no new param. |
| OS-registered state | None — no cron/Task Scheduler/pm2 entity embeds a brand scope. | None — verified: this is an in-process engine change inside the existing Stage-2 worker. |
| Secrets/env vars | None new. The eval harness reuses existing `web/.env.local` NXT webhook secrets. | None. |
| Build artifacts | No codegen artifact: `resolution_config` is free-form jsonb, NOT registry-codegen'd (`config.ts:7-11`). `Confidence` is hand-edited TS. | **None** — but run `npm run codegen && git diff --exit-code` if any `*.generated.ts` is touched (it should not be). |

**The canonical question — after every repo file is updated, what runtime systems still need a change?** Exactly ONE: the **live `swarms.resolution_config` row** must receive the `cross_scope` key (the migration applied to production). Everything else is code. `resolver_index` coverage is a verify-not-change item.

## Common Pitfalls

### Pitfall 1: Engine no-corroboration path is byte-identical-guarded
**What goes wrong:** The `port-equivalence.test.ts` and the no-engine-diff posture assert that a config WITHOUT the new field behaves byte-identically. Adding `cross_scope` handling that fires even when `enabled:false`/absent breaks this.
**How to avoid:** Gate STRICTLY on `config.cross_scope?.enabled === true`. The drop-site `return null` path must be untouched for opt-out configs.
**Warning signs:** `port-equivalence.test.ts` / `precedence-inversion.test.ts` failures; sales (no `cross_scope`) behavior changes.

### Pitfall 2: `is_unique_in_scope` does NOT assert cross-brand uniqueness
**What goes wrong:** Reusing `m.is_unique_in_scope` to gate the cross-brand decision. That flag is computed within the requested brand tiebreaker tier (`03-resolve-candidates.sql:126-163`), so a cross-brand candidate can be "unique in scope" within ITS brand yet collide with another brand's root.
**How to avoid:** Compute `distinctRoots`/`distinctParties` directly over the all-brand candidate set (D-08), per Recommendation 5.
**Warning signs:** A cross-brand AUTO that should have been suggestie (two brands, two roots, but each unique-in-its-scope).

### Pitfall 3: Replay-safety in the Inngest worker
**What goes wrong:** Adding a nested `step.run` or non-deterministic value inside the engine/step (the engine runs INSIDE `step.run("resolve-debtor")`, `stage-2-customer-resolver.ts:275`).
**How to avoid:** The cross-scope helper is PURE over already-fetched `res.matches` (no new fetch, no `Date.now`/`crypto.randomUUID`). Mirror the `corroborate.ts:13-16` replay-safety header. The misroute annotation is derived from `winner.brand_id` + `args.brand_id` (deterministic).
**Warning signs:** UPDATE-no-op on replay (CLAUDE.md Phase 65 learning) — N/A here since we generate no DB keys.

### Pitfall 4: Confidence enum widening misses a switch
**What goes wrong:** Adding `"suggestie"` to `Confidence` but not updating every exhaustive switch / cast (`numericConfidence`, the worker's `as "high"|"medium"|"low"|"none"` casts at `stage-2-customer-resolver.ts:425-431,582-588`).
**How to avoid:** Grep `"high" | "medium" | "low" | "none"` and `numericConfidence` across the repo; widen each. TS strict will flag missing switch cases if they're typed exhaustively.
**Warning signs:** TS build error on the worker casts; a `suggestie` row rendering as `null` confidence in Bulk Review.

### Pitfall 5: Live row vs in-tree migration drift
**What goes wrong:** Writing the migration but not applying it to the live project (or restating the whole jsonb and re-introducing the Phase-91 inversion the live row never had — W1 `20260616a`).
**How to avoid:** Use jsonb `||` to ADD `cross_scope` only; apply to live `mvqjhlxfvtqqubqgdvhz`; mirror in `debtorP0Config`. Do NOT re-state precedence/auto_safe_kinds.
**Warning signs:** Eval gate passes locally (constant has the key) but live behavior unchanged (row lacks it), or live row's precedence silently flips.

### Pitfall 6: RLS on the migration
**What goes wrong:** N/A risk but worth confirming — adding a column or table would need RLS per CLAUDE.md.
**How to avoid:** This is an UPDATE to an EXISTING column on the RLS-enabled `public.swarms` (existing policies cover all columns, `20260616a:20-21`). No new table, no new column, no new policy. `npm run check:supabase` stays 0 ERROR.

## Code Examples

### Cross-scope post-pass at the invoice drop site (identifier-match.ts:118-124)
```typescript
// Source: web/lib/agentic-pipeline/resolve/steps/identifier-match.ts:111-124 (the drop site to relax)
if (distinctRoots.length === 1) {
  const inScopeBrands = new Set<string>([args.brand_id, ...(args.brand_scope ?? [])]);
  const winner = inScope.find((m) => rootOf(m) === distinctRoots[0])!;
  if (winner.brand_id != null && winner.brand_id !== "" && !inScopeBrands.has(winner.brand_id)) {
    // PHASE 122 — cross-brand: instead of dropping to SUGGEST, run the gated fallback.
    if (config?.cross_scope?.enabled) {
      return resolveCrossScope({
        matches: res.matches, eligibleKinds: new Set(["invoice_no"]),
        inScopeBrands, config, args, matchedIdentifiers: invoices.candidates,
        granularity: "root",
      });
    }
    return { result: null, matched_identifiers: invoices.candidates }; // opt-out: unchanged
  }
  // ... existing in-scope AUTO path ...
}
```

### scoreCorroboration reuse for D-03(b) (no new scorer)
```typescript
// Source: web/lib/agentic-pipeline/resolve/corroborate.ts:61 (PURE deterministic, reused as-is)
// The cross-scope helper, when allow_corroboration_auto && lone-kind-is-weak, builds
// CorroborationSignal[] from the all-brand matches and calls the SAME scorer:
return scoreCorroboration(crossBrandSignals, args, config.corroboration!, matchedIdentifiers);
// ≥min_signals agreeing distinct kinds → boost to high (auto cross-brand); else suggestie.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-swarm REST search to "fill a gap" | `resolver_index` + `resolve_candidates` SQL back-search ONLY | LOCKED 2026-06-15 (spike 011) | Phase 122 MUST NOT add a cross-brand REST call; relax the TS gate over existing candidates |
| Hardcoded confidence `high\|medium\|low\|none` | Same, +`suggestie` (Phase 122) for the 4-tier operator scale | Phase 122 (this) | Additive enum value; rides `numericConfidence` projection |
| In-scope-only brand gate (drop cross-brand) | Config-gated cross-brand fallback (opt-in) | Phase 122 (this) | The three SUGGEST drop sites gain a post-pass |
| Corroboration was sales-spike-only | Validated on debtor 100-email eval (bucket B) | Phase 120 | Reused wholesale for D-03(b) cross-brand corroboration |

**Deprecated/outdated:** none relevant. The legacy per-kind `identifier_lookup` wrappers were removed in Phase 123 (`identifier-match.ts:1-19`) — do not reintroduce them.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | All 9 bucket-C customers are present in the live `resolver_index` under their true-brand `scope_key`, so the fallback can find them. | Recommendation 7 / Runtime State | If a row's customer isn't indexed, it's `reachable:false`, not counted — gate measures "all reachable pass". First eval run confirms coverage; if a row is genuinely un-indexed, that's a substrate-seed gap (out of 122 scope, flag to operator). |
| A2 | Adding `"suggestie"` as a 5th `Confidence` value (vs reusing `medium`) is the right call. | Recommendation 3 | If the team prefers reusing `medium`, the enum change is unnecessary; either passes the eval gate (`!== "high"`). Planner/discuss should confirm — affects the future Outlook-label phase's tier→color mapping. |
| A3 | The multi-candidate suggestie shortlist render is OPTIONAL (single best-candidate already reaches the surface). | Recommendation 4 | If the operator expects to SEE the full shortlist in Bulk Review this phase, a small `stage-2-read.tsx` render branch is needed (still no new surface). D-07 says data-must-reach, which is met; shortlist-display is a judgment call. |
| A4 | Sales should stay a config-only follow-up (debtor is the frozen fixture). | Recommendation 2 / Deferred | If sales opts in this phase, there's no sales acceptance fixture to validate it against — risk of unvalidated cross-brand behavior on sales. Safe default: debtor-only. |

**If a downstream agent treats any A# as fact without operator confirmation, surface it in discuss-phase.**

## Open Questions (RESOLVED)

1. **Strong-kind list for cross-brand auto-resolve (D-03a).**
   - What we know: `auto_safe_alone_kinds = ["customer_no","site_no","invoice_no"]` (`20260616a:46`) is the named strong list.
   - What's unclear: whether ALL three should auto-resolve cross-brand, or whether cross-brand should be stricter (e.g. `invoice_no` only — a forwarded invoice number is the canonical cross-brand case).
   - RESOLVED — default `cross_scope.auto_resolve_kinds` to the same three; let the eval gate confirm. If a bucket-C row over-resolves wrong on a non-invoice kind, tighten the list (config-only, no code change). Implemented by Plan 122-03 Task 1 + Plan 122-04 Task 1.

2. **Self-auth cross-brand granularity.**
   - What we know: self-auth gates on DIRECT `party_id` distinctness (`self-auth-match.ts:128`), the number tier on `root_party_id`.
   - What's unclear: whether a cross-brand self-auth (customer_no forwarded across brands) should roll up to root or stay direct.
   - RESOLVED — keep self-auth DIRECT (preserve CR-01 split); the cross-scope helper takes a `granularity: "root" | "direct"` param. Implemented by Plan 122-03 Task 2.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + tsx | eval gate harness | ✓ (repo) | repo | — |
| Vitest | engine/step unit tests | ✓ | `^4.1.0` | — |
| Live `resolve_candidates` Zap + `web/.env.local` secrets | eval gate (live substrate) | assumed ✓ | — | Unit tests with mocked `lookupResolveCandidates` cover logic; live gate confirms acceptance |
| Supabase access to `mvqjhlxfvtqqubqgdvhz` | apply the `cross_scope` migration to live | ✓ (MR scope) | — | — |

**Missing dependencies with no fallback:** none identified.
**Missing dependencies with fallback:** live-substrate eval is gated by `.env.local` secrets; unit tests cover the decision logic deterministically if the live run is deferred.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.0` (`web/package.json:11` `"test": "vitest run"`) |
| Config file | repo vitest config (engine tests live in `web/lib/agentic-pipeline/resolve/__tests__/`) |
| Quick run command | `cd web && npx vitest run lib/agentic-pipeline/resolve` |
| Full suite command | `cd web && npm test` |
| Eval gate (live, NOT in suite) | `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| XSCOPE-01 | cross-brand unique root → AUTO; ≥2 roots → suggestie | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/cross-scope-*.test.ts` | ❌ Wave 0 |
| XSCOPE-01 | weak lone kind cross-brand → suggestie not AUTO (D-04) | unit | same | ❌ Wave 0 |
| XSCOPE-01 | disagreeing signals → suggestie/unresolved (D-05) | unit | same | ❌ Wave 0 (corroboration tests exist as template: `corroboration-demote.test.ts`) |
| XSCOPE-02 | `cross_scope` absent/`enabled:false` → byte-identical (opt-out) | unit | `cd web && npx vitest run lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts` | ✅ (extend) |
| XSCOPE-02 | no `swarm_type ===` branch introduced | static/grep | `! grep -rn "swarm_type ===\|swarm ===" web/lib/agentic-pipeline/resolve/` | ✅ (CI grep) |
| XSCOPE-03 | 9 bucket-C rows resolve-correct or demote to suggestie | integration (live) | `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --rows 37,85,95,96,97,98,67,69,70` | ❌ Wave 0 (add BUCKET_C) |
| D-09 | misroute annotation present on cross-brand resolve | unit | cross-scope test asserts `result.cross_scope_misroute` | ❌ Wave 0 |
| D-06 | `suggestie` confidence → 0.7 via numericConfidence | unit | `cd web && npx vitest run lib/pipeline-events` | ❌ Wave 0 (extend) |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/agentic-pipeline/resolve` (the engine/step unit set)
- **Per wave merge:** `cd web && npm test` (full suite) + `npm run check:supabase` (RLS gate, pre-push hook)
- **Phase gate:** `resolver-correctness-gate.ts --rows 37,85,95,96,97,98,67,69,70` green (all reachable bucket-C pass) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-auto.test.ts` — XSCOPE-01 unique-root AUTO + misroute (D-09)
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-suggestie.test.ts` — XSCOPE-01 ≥2 roots / weak-lone → suggestie (D-04/D-08)
- [ ] `web/lib/agentic-pipeline/resolve/__tests__/cross-scope-optout.test.ts` — XSCOPE-02 byte-identical when disabled (or extend `port-equivalence.test.ts`)
- [ ] Extend `resolver-correctness-gate.ts` with `BUCKET_C` set + scoring + RERUN-FINDINGS section (XSCOPE-03)
- [ ] Extend `numericConfidence` test for the `suggestie` case
- [ ] Test fixtures: mocked `lookupResolveCandidates` returning multi-brand matches (template: existing `corroboration-*.test.ts` mocking pattern)

## Security Domain

> `security_enforcement` not found explicitly false in config — treated as enabled. This phase touches LLM-free deterministic resolution + a jsonb config UPDATE; the attack surface is minimal.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth change |
| V3 Session Management | no | — |
| V4 Access Control | yes | RLS on `swarms` (UPDATE only, existing policies) + `resolution_audit` (`20260604`); no new policy needed |
| V5 Input Validation | yes | Identifiers parsed by OPENJSON as DATA in `resolve_candidates`, never string-concatenated (`03-resolve-candidates.sql:45-47`); the cross-scope path adds NO new SQL/input. Zod validates `resolve_candidates` matches (`nxt-zap-client.ts:142-159`). |
| V6 Cryptography | no | No crypto; no new secrets |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via identifier | Tampering | Parameterized OPENJSON (LOCKED, `03-resolve-candidates.sql:45-47`) — no change this phase |
| Confident WRONG customer cross-brand (the cardinal failure) | Spoofing/Repudiation | Root-uniqueness (D-08) + strong-kind/corroboration bar (D-03/D-04) + status gate (`auto-gate.ts`); suggestie tier degrades instead of guessing |
| Anon write to `resolution_config` | Elevation | `swarms` RLS revokes anon; migration is service-role only (`20260616a:20`) |

## Sources

### Primary (HIGH confidence) — code read this session
- `web/lib/agentic-pipeline/resolve/engine.ts` — Confidence/ResolveResult contract, corroboration vs no-corroboration path, EngineConfig Pick.
- `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` — the two cross-brand drop sites (`:118-124`, `:264-270`), root-uniqueness rule.
- `web/lib/agentic-pipeline/resolve/steps/self-auth-match.ts` — the third drop site (`:139`), DIRECT-party granularity.
- `web/lib/agentic-pipeline/resolve/corroborate.ts` — reusable pure scorer for D-03(b).
- `web/lib/agentic-pipeline/resolve/config.ts` — ResolutionConfig/CorroborationConfig shapes to mirror.
- `web/lib/agentic-pipeline/resolve/steps/auto-gate.ts` — `isAutoEligibleStatus`.
- `db/zapier-resolver/03-resolve-candidates.sql` — substrate returns ALL brands env-filtered; `is_unique_in_scope` granularity (CR-01).
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — registry dispatch (SWARM-02), audit writes, replay-safety, confidence casts.
- `supabase/migrations/20260616a_debtor_corroboration_optin.sql` + `20260601a_resolution_config_column.sql` — migration precedent.
- `web/lib/automations/debtor-email/resolve-debtor.ts` — `debtorP0Config` lockstep pattern.
- `web/lib/automations/sales-email/resolve-customer.ts` — SWARM-02 adapter; sales is config-ready.
- `web/scripts/eval/resolver-correctness-gate.ts` — eval gate mechanics; missing BUCKET_C.
- `web/lib/bulk-review/hydrate.ts` + `types.ts` + `_shell/components/stage-2-read.tsx` / `stage-2-decide.tsx` — read path (confidence numeric, inputs/candidates projection).
- `web/lib/pipeline-events/types.ts` — `numericConfidence`.
- `.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md` — bucket-C row IDs (`:64-66`).
- `docs/agentic-pipeline/stage-2-entity.md` / `context-shape-contract.md` — LOCKED transport rule + output contract.

### Secondary (MEDIUM)
- grep verifications: zero swarm-name branches in engine/steps/config/dynamic; no existing misroute/cross_scope consumer.

### Tertiary (LOW)
- A1 (live `resolver_index` bucket-C coverage) — unverifiable without a live eval run.

## Metadata

**Confidence breakdown:**
- Implementation shape (drop sites, post-pass, config gating): HIGH — exact line cites, SWARM-02 invariant grep-verified.
- Config sub-config shape: HIGH — mirrors a verified live precedent (`20260616a`).
- Suggestie tier representation: MEDIUM — enum-vs-flag is a judgment call (A2); both pass the gate.
- Read-path (no UI change needed): HIGH — verified hydrate.ts projects confidence numerically + inputs verbatim; MEDIUM on whether multi-candidate shortlist display is wanted (A3).
- Uniqueness wiring (D-08): HIGH — direct cite of the in-scope rule + CR-01 granularity caveat.
- Misroute annotation: HIGH — emit-only, no consumer (grep-verified).
- Eval gate: HIGH on mechanics; MEDIUM on row-level pass (live-substrate dependent, A1).

**Research date:** 2026-06-18
**Valid until:** 2026-07-18 (stable internal domain; revalidate if the resolve engine or `resolution_config` shape changes before planning)
