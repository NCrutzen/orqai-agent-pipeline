# Phase 120: D-06 multi-signal corroboration engine (generic, cross-swarm) - Research

**Researched:** 2026-06-16
**Domain:** Stage-2 entity-resolution engine (`web/lib/agentic-pipeline/resolve/`) — deterministic multi-signal corroboration, config-gated, cross-swarm
**Confidence:** HIGH (all findings verified against the working tree; no external library research needed — this is a pure-internal engine change)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 — Collect-then-decide, GATED on config.** When `corroboration` IS configured for a swarm: run ALL precedence steps, collect every candidate, then decide (vote → boost, or demote on conflict). When NOT configured: byte-identical first-hit short-circuit exactly as today. Voting is an overlay on precedence, not a replacement — non-opted-in swarms behavior-unchanged (protects no-engine-diff for them).
- **D-02 — Precedence coexists with flat voting.** Precedence still orders the steps and is the source of the candidate set; corroboration is a deterministic scoring layer across the collected candidates. Winner-selection in the no-agreement case is governed by D-06/D-07, not a separate below-threshold rule.
- **D-03 — Collection is deterministic only.** The LLM tiebreaker is NOT part of the collect path (tools-first / LLM-last-resort).
- **D-04 — `boost` = promote to `high` (SET, not additive).** On ≥N independent agreement, confidence set to `high` deterministically, no LLM. `boost` is the target tier (default `high`); per-swarm configurable.
- **D-05 — Independence = distinct `identifier_kind`.** Two agreeing signals must be different `identifier_kind` values. Two invoice numbers both → customer X = ONE signal. `min_signals` default = **2** (per-swarm tunable).
- **D-06 — Conflict → demote to suggestie, deterministically, no LLM.** When ≥2 independent signals (distinct `identifier_kind`) resolve to DIFFERENT customers, return the precedence-winner customer but cap confidence below AUTO. Catches the 4 confident-wrong AUTO eval rows.
- **D-07 — Lone-signal handling encodes eval bucket-B.** A lone STRONG signal (invoice_no / customer_no) keeps native `high` → stays AUTO. A lone **sender/domain match** (21% accuracy) is capped below AUTO unless corroborated by a second independent signal. Config-driven — reuse/extend `auto_safe_kinds`.
- **D-08 — Both debtor AND sales opt in** within Phase 120.
- **D-09 — Sales REST→SQL migration pulled into Phase 120.** Replace `nxtRequest` REST calls in `offerte.ts` / `order.ts` / `sites.ts` with a `resolver_index` back-search via `resolve_candidates` (normalize offerte to bare digits, `scope_key='SB'`, prefer `is_unique_in_scope=1`). DO NOT delete NXT REST infra (load-bearing for order-entry writes, order-entry UI lookups, operator manual widget). The `_match.ts` guard stays harmless. Only the three auto-resolution identifier lookups switch transport.
- **D-10 — STAGE2-01 re-finalized by re-baselining the no-engine-diff donor to the post-120 commit.** After corroboration lands, re-point `scripts/no-engine-diff-check.sh`'s donor baseline to the Phase 120 commit and re-run. Record as FINAL STAGE2-01, superseding the PROVISIONAL V9.0 result.

### Claude's Discretion

- Exact `corroboration` sub-shape beyond `{ min_signals, boost }` (how `auto_safe_kinds` interplays, whether `boost` tier string is stored) — finalize against `config.ts`.
- Candidate de-duplication strategy across steps (collapse same `party_id` from multiple kinds vs counting distinct kinds) — must satisfy D-05.
- Correctness-gate harness mechanics (frozen 100-email re-run + scoring) — fixture at `.planning/evals/2026-06-16-resolver-customer-eval/`.
- How sales candidates flow through the collect path given the sales adapter's own loop — reconcile so SWARM-02 holds.

### Deferred Ideas (OUT OF SCOPE)

- **Attachment-borne identifier extraction** → Phase 121 (corroboration *input*; 120 consumes when present, does not block).
- **Cross-brand-scope resolution** → Phase 122 (bucket-C 9 errors).
- **Full sales NXT REST search-contract recovery** — the unresolved-recall half of the sales todo. Out of scope; only the transport switch is in 120.
- **LLM-tiebreak on disagreement** — rejected in favor of deterministic demote (D-06).
</user_constraints>

<phase_requirements>
## Phase Requirements

The ROADMAP carries CORR-01..05 as a *draft shape* (Phase 120 section). Finalized mapping below; the planner should lock these IDs in REQUIREMENTS.md.

| ID | Description (finalized) | Research Support |
|----|-------------------------|------------------|
| **CORR-01** | The engine, when `corroboration` is configured, COLLECTS candidate signals across all precedence steps instead of short-circuiting on the first hit; collection is deterministic (no LLM). | New collect-path in `resolveEntity()` (§Architecture Pattern 1). The substrate already returns the whole candidate set in one call (`lookupResolveCandidates` → `ResolveCandidateMatch[]`). |
| **CORR-02** | When ≥`min_signals` **independent** (distinct `identifier_kind`) signals agree on the same `customer_account_id`, confidence is SET to `boost` tier (`high`) deterministically. When ≥2 independent signals DISAGREE, the precedence-winner is returned with confidence capped below AUTO. | §Confidence Math. Independence = distinct `identifier_kind` (D-05) which is a first-class column on every `ResolveCandidateMatch` row. |
| **CORR-03** | A lone sender/domain signal is capped below AUTO unless corroborated by a second independent signal; lone strong signals keep native `high`. Which kinds are auto-safe-alone is config-driven (extend `auto_safe_kinds`). | §Confidence Math (D-07). The `auto_safe_kinds` mechanism already gates AUTO-eligibility per kind in `self-auth-match.ts` and `identifier-match.ts`. |
| **CORR-04** | Corroboration is swarm-agnostic — zero `if swarm==='…'` branches — and opt-in per swarm via `resolution_config.corroboration`. Non-opted-in swarms are byte-identical to today (no-engine-diff green). | §SWARM-02 reconciliation. The gate is the *presence* of `config.corroboration`. |
| **CORR-05** | Both debtor and sales `resolution_config` opt in; the no-engine-diff donor is re-baselined to the post-120 commit and re-run → FINAL STAGE2-01. The frozen 100-email fixture is re-scored and the 12 sender-ambiguity + 4 confident-wrong rows move the right direction. | §Correctness Gate, §Validation Architecture. |
</phase_requirements>

## Summary

This is a **pure-internal TypeScript engine change** plus two migration re-seeds and a sales transport migration. There is no external library to research — the entire surface lives in `web/lib/agentic-pipeline/resolve/` and `web/lib/automations/{debtor,sales}-email/`. The substrate that makes corroboration cheap already exists and is live for debtor: `lookupResolveCandidates()` issues ONE async-callback Zap and returns the **whole candidate set** as `ResolveCandidateMatch[]`, where each row carries `identifier_kind`, `party_id`, `root_party_id`, `is_unique_in_scope`, `scope_key`, `brand_id`, `status`, and `precedence`. D-05's "independence = distinct `identifier_kind`" is therefore directly computable from one lookup — no schema change is needed for the engine math.

The central architectural fork (CORR-04 / D-01) is that `resolveEntity()` today is a `for…of config.precedence` loop that `return`s on the first non-null step result (`engine.ts:191-223`). The phase makes that loop **config-gated**: when `config.corroboration` is absent (the default — debtor-today, sales-today, every Router swarm), the loop is byte-for-byte unchanged so the no-engine-diff guard stays green for them. When `config.corroboration` is present, the engine runs all steps, accumulates each step's resolved candidate(s), then applies a deterministic scoring layer (boost on ≥N-distinct-kind agreement, demote on distinct-kind disagreement).

The two landmines that can sink the phase are **(1) no-engine-diff** — the guard (`scripts/no-engine-diff-check.sh`) asserts `engine.ts` / `config.ts` / `steps/*` are **byte-identical** to a donor branch; since this phase *legitimately* changes `engine.ts` and `config.ts`, the donor MUST be re-baselined to the post-120 commit (D-10), and the guard must be re-run AFTER the change lands — and **(2) SWARM-02** — the sales adapter (`resolve-customer.ts`) runs its OWN precedence loop and does NOT call the engine's step modules, so making sales corroboration flow through the SAME generic collect/score code without a per-swarm branch is the trickiest constraint. The recommended resolution (below) factors the collect→score logic into a shared, swarm-agnostic helper both the engine loop and the sales adapter call.

**Primary recommendation:** Add an optional `corroboration?: CorroborationConfig` field to `ResolutionConfig` and `EngineConfig`. Branch in `resolveEntity()` on `config.corroboration` presence: absent → today's short-circuit verbatim; present → collect-then-decide via a new pure, swarm-agnostic `scoreCorroboration(candidates, config)` helper in a NEW file `resolve/corroborate.ts`. Sales adopts the same helper by accumulating its per-step hits into the same candidate shape and calling `scoreCorroboration` after its loop. Re-baseline the no-engine-diff donor (D-10) as the FINAL plan task, after all engine/steps edits are committed.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Candidate collection across precedence steps | Engine (`engine.ts`) | Sales adapter (`resolve-customer.ts`) | Both run a precedence loop; the collect overlay must live where the loop lives. Factor the *scoring* into a shared helper so neither owns the math. |
| Corroboration scoring (boost/demote, independence) | New `resolve/corroborate.ts` (pure helper) | — | Pure deterministic function over a candidate array; called by BOTH loops → no per-swarm branch (SWARM-02). |
| Config shape (`corroboration` field) | `resolve/config.ts` (`ResolutionConfig`) + `engine.ts` (`EngineConfig`) | Migrations (jsonb seed) | Config is data; the TS interface mirrors the jsonb column by hand (no codegen — free-form per-swarm). |
| Per-email candidate read (the substrate) | `nxt.resolve_candidates` Zapier tool + `resolver_index` SQL | `lookupResolveCandidates()` client | Already live for debtor; sales reuses the SAME tool (env=BX, brand_scope=[SB]). No REST. |
| Sales identifier→customer (offerte/order/postcode) | `resolver_index` back-search (D-09) | — | Replaces `nxtRequest` REST. SQL back-search is the LOCKED transport rule (2026-06-15). |
| AUTO vs SUGGEST disposition (downstream of confidence) | Stage-2 worker (`stage-2-customer-resolver.ts`) | — | The worker writes `confidence` verbatim into `email_labels` / `resolution_audit`; demote = a lower confidence value, no worker change needed. UNTOUCHED by this phase. |
| No-engine-diff donor baseline | `scripts/no-engine-diff-check.sh` | CI / verify-work gate | Must be re-pointed to the post-120 commit (D-10); the guard is otherwise correct as-written. |

## Standard Stack

No new external packages. This phase is internal TypeScript + SQL migrations only.

### Core (existing, in-repo — verified present in working tree)

| Module | Path | Purpose | Role in Phase 120 |
|--------|------|---------|-------------------|
| `resolveEntity()` | `web/lib/agentic-pipeline/resolve/engine.ts:172-238` | Config-ordered precedence runner; first-hit short-circuit | Becomes config-gated collect-then-decide |
| `ResolutionConfig` / `EngineConfig` | `resolve/config.ts:80-120` / `engine.ts:40-57` | Per-swarm resolver config (jsonb mirror) | Gains optional `corroboration` field |
| `lookupResolveCandidates()` | `debtor-email/nxt-zap-client.ts:514-515` | One async-callback Zap → whole candidate set | The corroboration data source (already returns `identifier_kind` + `is_unique_in_scope` + `party_id` rows) |
| `ResolveCandidateMatch` (Zod) | `nxt-zap-client.ts:179-209` | Candidate row schema | The corroboration row shape — needs no change |
| `runSelfAuthMatch` / `runIdentifierMatch` | `resolve/steps/self-auth-match.ts` / `identifier-match.ts` | AUTO pre-pass steps already reading the substrate | Already collect candidate sets internally; can surface them for corroboration |
| `isAutoEligibleStatus()` | `resolve/steps/auto-gate.ts:41-46` | Status denylist (stopped/inactive → not AUTO) | Corroboration AUTO must keep respecting it |
| Sales adapter `resolveEntity` | `sales-email/resolve-customer.ts:139-298` | Sales own precedence loop (NOT engine steps) | Adopts the shared `scoreCorroboration` helper |
| Sales lookups | `sales-email/lookups/{offerte,order,sites}.ts` | `nxtRequest` REST identifier→customer | Migrated to `resolver_index` back-search (D-09) |
| `pickMatchingCustomer` | `sales-email/lookups/_match.ts` | Fail-closed REST response guard | Stays harmless after SQL switch (SQL is exact) |
| `vitest` 4.1.0 | `web/package.json` | Test runner (`vitest run`) | All new tests written here |

**Installation:** none. `npm install` unchanged.

## Package Legitimacy Audit

Not applicable — Phase 120 installs **zero external packages**. All code is internal to the existing `web/` workspace. No registry verification needed.

## Architecture Patterns

### System Architecture Diagram

```
                    inbound email (Stage 1 → category=unknown)
                                   │
                                   ▼
            ┌──────────────────────────────────────────────┐
            │ stage-2-customer-resolver.ts (Inngest worker) │
            │  loads swarm.resolution_config from registry   │
            │  dispatches via loadStage2Resolver(path)       │
            └───────────────┬─────────────────┬──────────────┘
                            │                 │
          debtor path ──────┘                 └────── sales path
                            │                 │
                            ▼                 ▼
        resolve-debtor.resolveEntity     sales/resolve-customer.resolveEntity
        = engine.resolveEntity(args,     = OWN loop over config.precedence
            debtorP0Config)                  (calls sales lookups, NOT engine steps)
                            │                 │
                            ▼                 ▼
        ┌─────────────────────────────────────────────────────────┐
        │           config.corroboration present?                  │
        │   NO  → today's first-hit short-circuit (BYTE-IDENTICAL)  │
        │   YES → collect every step's resolved candidate(s),      │
        │         then scoreCorroboration(candidates, config):     │
        │           • group by customer_account_id                 │
        │           • count DISTINCT identifier_kind per group     │
        │           • ≥min_signals agree → SET confidence=boost    │
        │           • ≥2 distinct kinds disagree → demote winner   │
        │           • lone non-auto-safe kind → cap below AUTO     │
        └───────────────────────────┬─────────────────────────────┘
                                    │  (deterministic, NO LLM — D-03)
                                    ▼
                      ResolveResult { customer_account_id, confidence, … }
                                    │
                                    ▼
        worker writes confidence verbatim → email_labels / resolution_audit
        (numericConfidence(high|medium|low|none) → pipeline_events; AUTO vs
         SUGGEST is a downstream read of confidence — UNCHANGED this phase)
```

The shared candidate substrate (`resolver_index` via the `nxt.resolve_candidates` Zap) feeds BOTH the engine steps (debtor, live) and the migrated sales lookups (D-09). One call returns the full candidate set, so corroboration is a free byproduct of an already-issued lookup.

### Pattern 1: Config-gated collect-then-decide (CORR-01 / CORR-04 / D-01)

**What:** `resolveEntity()` branches on `config.corroboration` presence at the top of the function. The absent branch is the existing loop verbatim. The present branch accumulates results.

**When to use:** Always — this is the engine fork.

**Critical no-engine-diff note:** The existing `for…of` loop body (engine.ts:191-223) must remain reachable and byte-identical *as the absent-corroboration path* so the donor re-baseline diff is minimal and the *intent* is auditable. Prefer an early guard:

```typescript
// Source: proposed — engine.ts resolveEntity()
export async function resolveEntity(
  args: ResolveArgs,
  config: EngineConfig,
): Promise<ResolveResult> {
  const llmTiebreak: LlmTiebreak = (ids, a, c) => runLlmTiebreak(ids, a, c, config);
  let lastMatchedIdentifiers: string[] = [];

  if (!config.corroboration) {
    // ── BYTE-IDENTICAL to today (no-engine-diff for non-opted-in swarms) ──
    for (const stepName of config.precedence) { /* …unchanged… */ }
    return { method: "unresolved", /* …unchanged unresolved fallback… */ };
  }

  // ── Corroboration path: collect every step's hit, then score ──
  const collected: CorroborationSignal[] = [];
  for (const stepName of config.precedence) {
    const r = await runStep(stepName, args, config, llmTiebreak); // wraps the same dispatch
    if (r?.result?.customer_account_id) {
      collected.push(toSignal(r.result, stepName));
    }
    lastMatchedIdentifiers = r?.matched_identifiers ?? lastMatchedIdentifiers;
    // NOTE: do NOT short-circuit — collect all steps.
  }
  return scoreCorroboration(collected, args, config, lastMatchedIdentifiers);
}
```

**Anti-pattern (REJECTED in discussion):** "Always collect" — breaks no-engine-diff for everyone and risks STAGE2-01. The gate MUST be config-presence.

### Pattern 2: Independence via distinct `identifier_kind` (CORR-02 / D-05)

**What:** Group collected signals by resolved `customer_account_id`; within each group, count the number of **distinct** `identifier_kind` values. Two `invoice_no` rows = one kind = ONE signal. `invoice_no` + `customer_no` = two kinds = TWO signals.

**Source for the kind:** Each `ResolveCandidateMatch` row carries `identifier_kind` (`nxt-zap-client.ts:180`). The engine steps that produce AUTO results from the substrate (self_auth, number-back-search) know which kind won; the legacy sender/invoice steps map to synthetic kinds (`sender_domain`, `invoice_no`). The `CorroborationSignal` shape should carry `{ customer_account_id, identifier_kind, confidence, method, source_step }`.

```typescript
// Source: proposed — resolve/corroborate.ts
export interface CorroborationSignal {
  customer_account_id: string;
  identifier_kind: string;       // D-05 independence axis
  confidence: Confidence;        // native confidence from the step
  method: ResolveMethod;
  precedence_index: number;      // for winner-selection on no-agreement
}

function distinctKinds(signals: CorroborationSignal[]): Set<string> {
  return new Set(signals.map((s) => s.identifier_kind));
}
```

### Pattern 3: Boost / demote / lone-signal scoring (CORR-02 / CORR-03 / D-04 / D-06 / D-07)

```typescript
// Source: proposed — resolve/corroborate.ts scoreCorroboration()
// Group signals by resolved customer.
const byCustomer = groupBy(signals, (s) => s.customer_account_id);
const customers = Object.keys(byCustomer);

// 1. AGREEMENT (D-04): a single customer with ≥min_signals distinct kinds → boost.
const agreeing = customers.filter(
  (c) => distinctKinds(byCustomer[c]).size >= config.corroboration.min_signals,
);
if (agreeing.length === 1) {
  return buildResult(agreeing[0], config.corroboration.boost /* "high" */);
}

// 2. DISAGREEMENT (D-06): ≥2 distinct kinds across the WHOLE set resolve to
//    ≥2 different customers → return the precedence winner, capped below AUTO.
if (customers.length >= 2 && distinctKinds(signals).size >= 2) {
  const winner = lowestPrecedenceIndex(signals); // precedence still picks the winner
  return buildResult(winner.customer_account_id, capBelowAuto(winner.confidence));
}

// 3. LONE SIGNAL (D-07): exactly one customer, <min_signals kinds.
//    Lone auto-safe kind keeps native confidence; lone non-auto-safe (sender/domain)
//    caps below AUTO. auto_safe_kinds is the config-driven gate (reused/extended).
const only = byCustomer[customers[0]][0];
const autoSafeAlone = new Set(config.corroboration.auto_safe_alone_kinds
  ?? config.auto_safe_kinds ?? []);
return buildResult(
  only.customer_account_id,
  autoSafeAlone.has(only.identifier_kind) ? only.confidence : capBelowAuto(only.confidence),
);
```

**`capBelowAuto`:** confidence is the enum `high | medium | low | none` (no numeric). "Below AUTO" = `medium` (the eval shows `midden`=50%, `hoog`=93% — AUTO reads `high`). Recommend `capBelowAuto(c) = c === "high" ? "medium" : c`. The exact AUTO threshold lives downstream (the worker writes confidence verbatim; AUTO vs SUGGEST is a read of `high`), so demote = emit `medium`.

### Pattern 4: SWARM-02 sales reconciliation (CORR-04 / D-08, the trickiest constraint)

**The problem:** `sales-email/resolve-customer.ts` runs its OWN `for (const step of config.precedence)` loop (`:160-286`) with a `switch` over sales-specific step kinds (`offerte_match`, `postcode_site_match`, `order_match`, `factuur_match`). It does NOT call the engine's step modules (it explains why at `:16-22` — the engine steps are bound to debtor lookups). It already short-circuits on the first hit and builds `ResolveResult` via `identifierResult()`.

**The resolution (no per-swarm branch):** Factor the collect→score math into the pure helper `scoreCorroboration(signals, args, config, identifiers)` in `resolve/corroborate.ts`. The helper takes a swarm-agnostic `CorroborationSignal[]` array and is identical for both swarms. Then:
- **Engine side:** the corroboration branch (Pattern 1) accumulates engine-step results into `CorroborationSignal[]` and calls the helper.
- **Sales side:** the sales adapter's loop, when `config.corroboration` is present, accumulates its per-`case` hits into the SAME `CorroborationSignal[]` (instead of `return`ing on first hit) and calls the SAME helper.

The `if (config.corroboration)` check is **config-data-driven, not swarm-name-driven** — it is the presence of a field, satisfying CORR-04 ("zero `if swarm==='…'` branches"). `corroborate.ts` is NOT under `resolve/steps/` and is NOT in the no-engine-diff `LOGIC_FILES` list — but it IS under `web/lib/agentic-pipeline/resolve/`. **LANDMINE:** the no-engine-diff guard globs `engine.ts`, `config.ts`, and `steps/*`. A new `resolve/corroborate.ts` is NOT matched by `steps/*` (it's a sibling, not a child of `steps/`), so it does not auto-trip the guard — but the planner must confirm the donor re-baseline (D-10) includes it, or the guard will be measuring against a tree that lacks the file. Cleanest: the re-baseline is the post-120 commit, which contains `corroborate.ts`, so the guard compares like-for-like.

### Recommended Project Structure

```
web/lib/agentic-pipeline/resolve/
├── engine.ts                 # MODIFIED — config-gated collect branch
├── config.ts                 # MODIFIED — add CorroborationConfig + field
├── corroborate.ts            # NEW — pure scoreCorroboration() + CorroborationSignal
├── steps/
│   ├── self-auth-match.ts     # likely UNCHANGED (already returns AUTO result)
│   ├── identifier-match.ts    # likely UNCHANGED
│   ├── sender-match.ts        # likely UNCHANGED
│   ├── thread-inheritance.ts  # likely UNCHANGED
│   └── auto-gate.ts           # UNCHANGED — corroboration AUTO keeps using it
└── __tests__/
    ├── corroboration-boost.test.ts        # NEW
    ├── corroboration-demote.test.ts       # NEW
    ├── corroboration-lone-signal.test.ts  # NEW
    └── port-equivalence.test.ts           # EXISTING — must still pass (no-corr swarms unchanged)

web/lib/automations/sales-email/
├── resolve-customer.ts        # MODIFIED — collect-then-score when config.corroboration present
└── lookups/
    ├── offerte.ts             # MODIFIED — resolver_index back-search (D-09)
    ├── order.ts               # MODIFIED — resolver_index back-search (D-09)
    ├── sites.ts               # MODIFIED — resolver_index back-search (D-09)
    └── _match.ts              # UNCHANGED (stays harmless)

supabase/migrations/
├── 2026XXXX_debtor_corroboration_optin.sql  # NEW — add corroboration to debtor config
└── 2026XXXX_sales_corroboration_and_sql.sql # NEW — sales corroboration + transport
```

### Anti-Patterns to Avoid

- **Adding a `corroborate` field the engine silently ignores (Pitfall 3, the original deferral reason).** Phase 114-04 deliberately did NOT add a config field because the engine would ignore it. Phase 120 MUST make the engine *read* it before any seed sets it. Order the plan: engine capability FIRST, then re-seed.
- **Editing `engine.ts`/`config.ts` then running the OLD donor's no-engine-diff check.** It will fail (correctly — the files changed). The check is only meaningful AFTER the donor re-baseline (D-10). Sequence: land all engine edits → commit → re-point donor → re-run.
- **A per-swarm branch in the scoring helper.** The helper must be pure over `CorroborationSignal[]` with config passed in — no `swarm_type` parameter.
- **Reaching for `nxtRequest` to "fill a sales gap" (D-09).** LOCKED transport rule — extend `resolver_index`, never add REST.
- **Demoting by mutating numeric thresholds.** Confidence is an enum; demote = emit `medium`/`low`, not a magic number.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-email candidate set across all identifier kinds | A new multi-query fan-out | `lookupResolveCandidates()` (one async-callback Zap) | Already returns the whole set with `identifier_kind` + `is_unique_in_scope` + `party_id` in ONE call — the corroboration substrate already exists and is live for debtor. |
| Sales offerte/order/postcode → customer | `nxtRequest` REST calls | `resolver_index` back-search via `resolve_candidates` | LOCKED transport rule (2026-06-15); REST `/api/quotes/search` ignores `searchTerm` → the `512887` false positive. SQL back-search is exact (`SB014098`→`14098`→`BX228895`). |
| AUTO-eligibility status filter | A new stopped/inactive check | `isAutoEligibleStatus()` (`auto-gate.ts`) | Shared denylist already used by self_auth + number-back-search; corroboration AUTO must keep respecting it. |
| AUTO vs SUGGEST disposition | New disposition logic in the engine | Emit the right `confidence` enum; the worker reads it | The worker (`stage-2-customer-resolver.ts`) already maps confidence → `email_labels`/`resolution_audit` + `numericConfidence` → pipeline_events. Demote = lower confidence, zero worker change. |
| Sales `resolve_candidates` Zap registration | A brand-new Zapier tool | Reuse `nxt.resolve_candidates` (`zapier_tools` row) | The existing tool's `input_schema` is `environment_id` enum `['BX']` + `brand_scope` tiebreaker. Sales is env=BX, brand_scope=['SB'] → the SAME tool resolves it. (Verify the `['BX']` enum admits sales; if a sales `scope_key='SB'` requires a separate `allowed_for_intents` entry, that is a one-row registry UPDATE, not a new tool.) |

**Key insight:** The hard work (the materialized back-search index + the single-call transport) was done in Phase 90/91 for debtor. Phase 120 is mostly *wiring*: a config field, a scoring function, a sales loop that stops short-circuiting, and a sales transport switch onto the index that already exists.

## Runtime State Inventory

This phase is rename-free but DOES change data (config seeds) and a live transport. Audited:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `public.swarms.resolution_config` jsonb for `debtor-email` AND `sales-email` rows store the precedence config the engine reads at dispatch. Adding `corroboration` = an UPDATE to both rows (two migrations). The in-code `debtorP0Config` constant (`resolve-debtor.ts:63-80`) MIRRORS the debtor seed and is the kill-switch revert target — it must be updated in lockstep or the kill-switch path diverges from the live row. | Two `UPDATE public.swarms` migrations (debtor + sales) + edit `debtorP0Config` constant. |
| Live service config | `nxt.resolve_candidates` Zapier tool (`public.zapier_tools`) — its `target_url` was a `PENDING_OPERATOR_ZAP_URL` placeholder at registration (`20260601c`). **VERIFY the operator has landed the real catch-hook URL** (debtor self_auth is live in Phase 91, so it presumably has — confirm). Sales reusing this tool depends on it being live. If sales needs a `scope_key='SB'`-aware Zap variant, that is an operator task. | Confirm the resolve_candidates Zap URL is live (not placeholder) before sales corroboration can fire. Possible `zapier_tools` UPDATE for sales `allowed_for_intents`. |
| OS-registered state | None — no cron/task/launchd changes. | None — verified: no Inngest cron edits in scope. |
| Secrets/env vars | Reuses `DEBTOR_FETCH_WEBHOOK_SECRET` (the shared NXT-Zap secret) and `NXT_LOOKUP_WAIT_MS`. No new secrets. | None. |
| Build artifacts | `resolution_config` is free-form jsonb — explicitly **NOT codegen'd** (`config.ts:5-11`). No `*.generated.ts` to regenerate. | None — edit `config.ts` interface by hand (documented pattern). |

**The canonical question — after every file is updated, what still has the old behaviour cached?** The two `swarms.resolution_config` rows (live registry, read at dispatch) and the `debtorP0Config` constant (in-code kill-switch mirror). All three must move together. The `resolution_audit` / `email_labels` historic rows are immutable audit — no migration of past rows.

## Common Pitfalls

### Pitfall 1: No-engine-diff measured against the wrong baseline
**What goes wrong:** Engineer edits `engine.ts`/`config.ts`, runs `./scripts/no-engine-diff-check.sh`, it FAILS ("resolution-logic file DIFFERS from donor"), engineer assumes they broke STAGE2-01.
**Why it happens:** The donor is still `origin/workspace/v8.2-resolution-recall` (pre-120). Phase 120 *legitimately* changes those files.
**How to avoid:** D-10 — the donor MUST be re-baselined to the post-120 commit as the LAST plan task. The guard reads `NO_ENGINE_DIFF_BASELINE` env override (`no-engine-diff-check.sh:34`), so the re-baseline can be staged via env first, then the default updated. Re-run AFTER all engine edits commit. Until then the result is provisional (exactly what the fast-follow todo warns).
**Warning signs:** Running the guard mid-phase and treating a fail as a regression.

### Pitfall 2: A `corroboration` seed lands before the engine reads it
**What goes wrong:** Migration sets `resolution_config.corroboration` but the engine still short-circuits → the field is silently ignored, no corroboration fires, tests pass for the wrong reason.
**Why it happens:** This is the EXACT Pitfall 3 the deferral todo named. Config can't express capability the engine lacks.
**How to avoid:** Plan order is engine capability FIRST (and a test proving the field changes behaviour), THEN the seeds. Never merge a seed-only change.
**Warning signs:** A green test suite where no test asserts a boost/demote actually changed confidence.

### Pitfall 3: Sales corroboration can't fire over REST (transport mismatch)
**What goes wrong:** Sales opts into corroboration but its lookups are still `nxtRequest` REST → each lookup returns at most one customer with no `identifier_kind`/`is_unique_in_scope` metadata → independence is uncomputable → corroboration is inert for sales.
**Why it happens:** D-08 (both opt in) forces D-09 (sales transport migration) — they are inseparable. The fast-follow todo and CONTEXT both call this out.
**How to avoid:** Migrate offerte/order/sites onto the `resolver_index` back-search FIRST so each sales lookup returns rows carrying `identifier_kind` + `is_unique_in_scope` + `party_id` — the same shape the engine corroboration consumes.
**Warning signs:** Sales lookups still importing `nxtRequest` after the phase.

### Pitfall 4: Precedence inversion (§0.10-A5) accidentally flattened
**What goes wrong:** Treating corroboration as pure flat voting that overrides precedence ordering, stranding `thread_inheritance` or breaking the self_auth-outranks-inheritance inversion.
**Why it happens:** The collega's mental model is FLAT (collect-all-vote); the live model is precedence-ORDERED with the deliberate Phase-91 inversion (`["self_auth","identifier_match","sender_match","thread_inheritance"]`).
**How to avoid:** D-02 — precedence still ORDERS the steps and is the source of the candidate set AND the winner-selector on no-agreement. Corroboration is a scoring overlay, not a replacement. The existing `precedence-inversion.test.ts` MUST still pass.
**Warning signs:** `precedence-inversion.test.ts` or `port-equivalence.test.ts` going red.

### Pitfall 5: Demote breaks calibration the eval depends on
**What goes wrong:** Demoting a true positive (a correct lone strong signal) below AUTO, regressing the 51 gold-signal rows to chase the 12 ambiguity rows.
**Why it happens:** Over-broad demote rules; capping `invoice_no`/`customer_no` lone signals.
**How to avoid:** D-07 — lone STRONG (auto-safe) signals KEEP native `high`. Only lone sender/domain (non-auto-safe) caps. The eval's factuur=97% / klantnummer=92% rows must NOT move down. Add a regression test asserting a lone `invoice_no` stays `high`.
**Warning signs:** Re-scored fixture shows the gold-signal Ja% dropping.

## Code Examples

### The candidate row the corroboration math consumes (already live)
```typescript
// Source: web/lib/automations/debtor-email/nxt-zap-client.ts:179-197
const ResolveCandidateMatchSchema = z.object({
  identifier_kind: z.string(),            // D-05 independence axis
  identifier_value_norm: /* string */,
  party_id: /* string — composite "BX228895" */,
  party_name: z.string(),
  scope_key: /* "SB" — sales scope */,
  brand_id: /* string|null */,
  parent_party_id: /* string|null */,
  root_party_id: /* string|null — D-04 rollup target */,
  is_unique_in_scope: z.boolean(),        // single-vs-ambiguous verdict
  precedence: /* string|null */,
  status: /* string|null — feeds isAutoEligibleStatus */,
});
```

### Today's short-circuit loop (the no-corr path — must stay byte-identical)
```typescript
// Source: web/lib/agentic-pipeline/resolve/engine.ts:191-223
for (const stepName of config.precedence) {
  if (stepName === "self_auth") {
    const result = config.scope ? await runSelfAuthMatch(args, config as SelfAuthConfig) : null;
    if (result) return result;                  // ← first-hit short-circuit
  } else if (stepName === "thread_inheritance") {
    const result = await runThreadInheritance(args);
    if (result) return result;
  } else if (stepName === "sender_match") {
    const result = await runSenderMatch(args, llmTiebreak);
    if (result) return result;
  } else if (stepName === "identifier_match") {
    const outcome = await runIdentifierMatch(args, llmTiebreak, config.scope ? (config as SelfAuthConfig) : undefined);
    lastMatchedIdentifiers = outcome.matched_identifiers;
    if (outcome.result) return outcome.result;
  }
}
```

### Proposed config shape (CORR-02/03 fields, finalized against config.ts)
```typescript
// Source: proposed — resolve/config.ts (append to ResolutionConfig)
export interface CorroborationConfig {
  /** D-05: distinct identifier_kind count required to BOOST. Default 2. */
  min_signals: number;
  /** D-04: target tier set on agreement. Default "high". */
  boost: "high" | "medium";
  /**
   * D-07: kinds that may stay at native confidence when LONE (uncorroborated).
   * Absent → fall back to the swarm's existing auto_safe_kinds. Sender/domain
   * kinds are intentionally NOT listed → they cap below AUTO when alone.
   */
  auto_safe_alone_kinds?: string[];
}
export interface ResolutionConfig {
  /* …existing fields… */
  /** Phase 120 (D-06) — opt-in corroboration. ABSENT = today's short-circuit. */
  corroboration?: CorroborationConfig;
}
```
And mirror as optional on `EngineConfig` (engine.ts:40-57): `Partial<Pick<ResolutionConfig, "auto_safe_kinds" | "llm_tiebreaker" | "corroboration">>`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sales identifier→customer via `nxtRequest` REST | `resolver_index` SQL back-search via `resolve_candidates` | LOCKED 2026-06-15 (spike 011) | Eliminates the `512887` false positive; unlocks single-call corroboration for sales (D-09). |
| Per-step LLM tiebreaker on ambiguous candidate sets | Deterministic corroboration voting REPLACES the LLM for the agreeing-signals case | Phase 120 (this) | Tools-first / LLM-last-resort; agreement→high needs no LLM (D-03/D-04). |
| Engine = precedence + first-hit short-circuit only | Config-gated collect-then-decide overlay | Phase 120 (this) | Corroboration becomes config-expressible; non-opted swarms unchanged (D-01). |

**Deprecated/outdated:**
- The migration `20260604b_sales_resolution_config.sql` comment "no corroboration field (the engine would silently ignore one — Pitfall 3)" becomes obsolete this phase — the new sales seed adds the field once the engine reads it.
- `source.resolver_tool_id: "nxt.rest_proxy"` in the sales seed → switches to `nxt.resolve_candidates` (the SQL substrate tool) under D-09.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `nxt.resolve_candidates` Zap's live `target_url` is no longer the `PENDING_OPERATOR_ZAP_URL` placeholder (debtor self_auth is live → it must be). | Runtime State | If still placeholder, BOTH debtor self_auth and sales corroboration fail closed — but debtor is live, so this is low risk. Planner should add a verify step. |
| A2 | The existing `nxt.resolve_candidates` `input_schema` (env enum `['BX']`, brand_scope tiebreaker) admits sales (env=BX, scope_key=SB, brand_scope=[SB]) without a new Zap. | Don't Hand-Roll | If sales needs a distinct scope-aware Zap or a registry `allowed_for_intents` row, that is a one-row UPDATE / operator task — not a new tool. Verify against the live `resolver_index` for `scope_key='SB'` rows (the todo already verified `SB014098`→`14098`→`BX228895` exists). |
| A3 | **(RESOLVED 2026-06-16 — trace done)** "Below AUTO" = the `medium` enum value. The resolver-declared AUTO tier IS `confidence: "high"` — the engine step modules emit `high` ONLY for an AUTO-eligible single-party hit and `return null` ("fail CLOSED to SUGGEST") on EVERY ambiguity (`self-auth-match.ts:159` emits high; lines 123/127/136 return null). The eval scores exactly this surface: `AUTO=86% / hoog=93%`, and the 4 confident-wrong rows are `AUTO`+`hoog` (`FINDINGS.md:35,53-55`). The earlier contradiction is reconciled: `email_labels.status` (`pending`/`skipped`, driven by `customer_account_id` presence) is the **resolved-vs-unresolved** axis — a DIFFERENT axis from the **AUTO-vs-SUGGESTIE confidence-tier** axis the eval + Bulk Review read. Demote high->medium moves a row out of the `hoog`/AUTO tier (NOT a no-op). The iController auto-tag side effect (`stage2_match_live`) gates on `dry_run`/`customer_account_id_present`/`icontroller_company_present` — NO confidence — and debtor is universally `dry_run=true` today (`20260603b` OQ-1; `20260423:56` default true), so no live auto-apply consumer reads confidence; `medium` is treated as AUTO by NO consumer. | Confidence Math | RESOLVED — `confidence==='high'` is the AUTO marker; demote-to-`medium` is the correct catch. Proving refs: `self-auth-match.ts:159`, `FINDINGS.md:35,53-55`, `side-effects.ts:22` + seed `20260504b:63`. |
| A4 | Independence axis maps cleanly for the legacy sender/invoice engine steps (which don't read `resolve_candidates`) to synthetic `identifier_kind` values (`sender_domain`, `invoice_no`). | Pattern 2 | If a step can't be assigned a stable kind, its signal can't participate in independence counting. Low risk — sender_match→`sender_domain`, identifier_match→`invoice_no` are natural. |
| A5 | The frozen 100-email fixture (`resolver-eval.xlsx`) can be replayed mechanically through the resolver (the harness is build-able; Claude's-discretion item). | Correctness Gate | If the 100 rows aren't reconstructable as `ResolveArgs` (subject/body/sender/conversation), the correctness gate becomes manual. The eval sheet has the per-row inputs; a `precision-dry-run`-style script (referenced in nxt-zap-client `NXT_LOOKUP_WAIT_MS`) is the precedent. |

## Open Questions (RESOLVED)

1. **(RESOLVED 2026-06-16) Where exactly does a consumer read confidence==`high` as "AUTO"? -> branch (a): `confidence==='high'` IS the AUTO marker.**
   - **Trace result:** The engine step modules ARE the AUTO/SUGGEST gate. `self-auth-match.ts` and `identifier-match.ts` emit `confidence: "high"` ONLY when a single distinct auto-eligible party is found (`self-auth-match.ts:159`, `identifier-match.ts:128`); EVERY ambiguity "fails CLOSED to SUGGEST" by `return null` (`self-auth-match.ts:123,127,136`) -> the row never reaches `high`. So `high` is precisely the resolver-declared AUTO tier.
   - **Eval confirmation:** `FINDINGS.md:35` — "By resolver-declared type: AUTO (1 candidate) = 86%"; `:36` — "By resolver-declared confidence: hoog=93%"; `:53-55` — the 4 confident-wrong rows are "`AUTO` + confidence `hoog`". AUTO and `hoog`/high are the same surface the eval scores.
   - **Reconciling the A3 contradiction:** `email_labels.status` (`pending`/`skipped`, set from `customer_account_id` presence in `stage-2-customer-resolver.ts:504-508`) is the **resolved-vs-unresolved** axis, NOT the AUTO-vs-SUGGESTIE axis. The two are orthogonal. The 4 confident-wrong rows are `customer_account_id`-present (status=`pending`) AND `high` — demoting to `medium` moves them out of the AUTO/`hoog` tier the eval + Bulk Review read, WITHOUT changing `status`. Not a no-op.
   - **Live auto-apply check:** the only confidence-independent auto-apply path is the iController tagger, gated by side-effect `stage2_match_live` on `{ dry_run, customer_account_id_present, icontroller_company_present }` (`side-effects.ts:22`, seed `20260504b:63`) — confidence is NOT in that gate, AND debtor is universally `dry_run=true` (`20260603b` OQ-1; `20260423:56` default), so the tagger never fires for debtor today. No consumer treats `medium` as AUTO. `stage-2-icontroller-label-applier.ts` reads `label_status`, never `confidence`.
   - **Conclusion (branch a):** the existing `confidence !== 'high'` acceptance proxy in Plan 01/Plan 04 is VALID. Plan 01's demote (`capBelowAuto(c) = c==='high' ? 'medium' : c`) and Plan 04 Task 1's "4 confident-wrong rows now `confidence !== "high"`" assertion are the correct observables. Cited file:line added to Plan 01 demote task `<read_first>` and Plan 04 Task 1 `<read_first>`.

2. **(RESOLVED — addressed by Plan 02 Task 0 checkpoint) Does the sales `resolve_candidates` path need a scope_key='SB' parameter the debtor path doesn't send?**
   - The live-substrate scoping uncertainty (whether `brand_scope=['SB']` on the existing tool produces the same scoping as an explicit `scope_key='SB'` filter, and whether `allowed_for_intents` admits sales) is resolved operationally by **Plan 02 Task 0** (the `checkpoint:human-verify` confirming the live `resolve_candidates` Zap URL + scope admission against the verified `SB014098`->`14098`->`BX228895` example BEFORE the sales transport switch fires). The verified back-search example in the sales todo already proves `scope_key='SB'` + `is_unique_in_scope=1` returns the correct customer. No new Zap; at most a one-row `allowed_for_intents` UPDATE, surfaced at that checkpoint.

3. **(RESOLVED) Min diff for the engine: helper file vs inline.** Decision: helper file `corroborate.ts` (cleaner SWARM-02 sharing with sales; smaller `engine.ts` diff). The D-10 re-baseline (Plan 04 Task 2) re-points the donor to the post-120 commit, which CONTAINS `corroborate.ts`, so the no-engine-diff guard compares like-for-like — confirmed in Plan 04 Task 2 acceptance ("corroborate.ts exists at the re-baselined commit").

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `resolver_index` / `resolve_candidates` substrate | Corroboration data source (both swarms) | ✓ (live for debtor, Phase 91) | — | None — hard dependency; sales D-09 requires it |
| `nxt.resolve_candidates` Zap (live URL) | Per-email candidate read | ✓ (assumed live — A1) | — | Fails closed if placeholder |
| `vitest` | All new tests | ✓ | 4.1.0 | — |
| `git` donor ref `workspace/v8.2-resolution-recall` | no-engine-diff guard (pre-rebaseline) | ✓ | — | Re-baselined to post-120 commit (D-10) |

**Missing dependencies with no fallback:** none confirmed missing. **A1 (live Zap URL)** is the one to verify before sales corroboration can fire.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` 4.1.0 (`vitest run`) |
| Config file | `web/vitest.config.ts` (include `**/__tests__/**/*.test.ts`, `**/*.test.ts`) |
| Quick run command | `cd web && npx vitest run lib/agentic-pipeline/resolve` |
| Full suite command | `cd web && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORR-01 | Corroboration path collects ALL steps (no short-circuit) | unit | `npx vitest run lib/agentic-pipeline/resolve/__tests__/corroboration-collect.test.ts` | ❌ Wave 0 |
| CORR-02 | ≥2 distinct-kind agreement → confidence SET to `high` | unit | `…/corroboration-boost.test.ts` | ❌ Wave 0 |
| CORR-02 | ≥2 distinct-kind DISAGREEMENT → precedence winner, capped `medium` | unit | `…/corroboration-demote.test.ts` | ❌ Wave 0 |
| CORR-03 | Lone sender/domain → capped below AUTO; lone `invoice_no` → stays `high` | unit | `…/corroboration-lone-signal.test.ts` | ❌ Wave 0 |
| CORR-04 | Swarm WITHOUT `corroboration` config → byte-identical to today | unit | `…/port-equivalence.test.ts` (EXISTING — must stay green) | ✅ |
| CORR-04 | Precedence inversion preserved under corroboration | unit | `…/precedence-inversion.test.ts` (EXISTING — must stay green) | ✅ |
| CORR-04 | Sales adapter corroboration uses the SAME helper (no per-swarm branch) | unit | `web/lib/automations/sales-email/__tests__/corroboration-sales.test.ts` | ❌ Wave 0 |
| CORR-05 | no-engine-diff PASSES against the re-baselined donor | script | `NO_ENGINE_DIFF_BASELINE=<post-120-commit> ./scripts/no-engine-diff-check.sh` | ✅ (script exists; donor re-pointed) |
| CORR-05 | Frozen 100-email fixture re-scored: 12 ambiguity + 4 confident-wrong move right direction | integration | correctness-gate harness (build per A5) over `resolver-eval.xlsx` | ❌ Wave 0 |
| D-09 | Sales offerte/order/sites use `resolver_index` back-search, NOT `nxtRequest` | unit | `web/lib/automations/sales-email/lookups/__tests__/*.test.ts` (UPDATE existing `match.test.ts`) | ⚠️ partial — `match.test.ts` exists; new back-search tests needed |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/agentic-pipeline/resolve lib/automations/sales-email`
- **Per wave merge:** `cd web && npm test` + `./scripts/no-engine-diff-check.sh` (post-rebaseline)
- **Phase gate:** Full suite green + no-engine-diff PASS against re-baselined donor + correctness-gate harness shows the targeted rows improved, BEFORE `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `resolve/__tests__/corroboration-collect.test.ts` — covers CORR-01
- [ ] `resolve/__tests__/corroboration-boost.test.ts` — covers CORR-02 (agreement)
- [ ] `resolve/__tests__/corroboration-demote.test.ts` — covers CORR-02 (disagreement, the 4 confident-wrong)
- [ ] `resolve/__tests__/corroboration-lone-signal.test.ts` — covers CORR-03 (the 12 sender-ambiguity + gold-signal non-regression)
- [ ] `sales-email/__tests__/corroboration-sales.test.ts` — covers CORR-04 SWARM-02 on the sales adapter
- [ ] `sales-email/lookups/__tests__/{offerte,order,sites}-backsearch.test.ts` — covers D-09 transport switch
- [ ] Correctness-gate harness (script) — replays the frozen 100-email fixture and scores against operator ground-truth (A5; precedent: the `precision-dry-run` instrument referenced in `nxt-zap-client.ts`)
- [ ] (No framework install needed — vitest present)

## Security Domain

`security_enforcement` is not set in `.planning/config.json` → treat as enabled.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface changed (reuses `DEBTOR_FETCH_WEBHOOK_SECRET`). |
| V3 Session Management | no | — |
| V4 Access Control | yes | `zapier_tools` default-deny `allowed_for_intents` allowlist (`nxt-zap-client.ts:256-259`); sales reuse must be in the allowlist or fail closed (correct posture). |
| V5 Input Validation | yes | Identifiers extracted from untrusted email body are format-validated BEFORE any NXT call (the sales lookups already do this; `_match.ts` fail-closed guard). Corroboration consumes already-validated identifiers — no new untrusted-input path. |
| V6 Cryptography | no | No crypto; webhook secret reuse only. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted identifier in email body targets a wrong account | Spoofing/Tampering | Format-validate before lookup (existing); corroboration REDUCES this — a single crafted signal can't reach AUTO alone for sender/domain (D-07), and a conflicting real signal demotes (D-06). |
| Confident false positive (the `512887` class) | Tampering (data integrity) | D-06 deterministic demote on disagreement; D-09 SQL back-search replaces the REST endpoint that ignored `searchTerm`. |
| Replay non-determinism in the Inngest worker | (reliability) | Engine + steps + the new `corroborate.ts` are PURE; invoked inside `step.run` — NO nested `step.run`, NO `Date.now()`/`crypto.randomUUID()` as DB keys (CLAUDE.md Inngest rule). `lookupResolveCandidates` already generates requestId internally. |
| RLS bypass on new migration | Info disclosure | The two seeds are `UPDATE public.swarms` (existing RLS-enabled table, existing policies cover all columns) — no new table, no new policy needed. `npm run check:supabase` must stay green. |

## Sources

### Primary (HIGH confidence — read from working tree this session)
- `web/lib/agentic-pipeline/resolve/engine.ts` (resolveEntity loop :172-238, llmTiebreak :242-380)
- `web/lib/agentic-pipeline/resolve/config.ts` (ResolutionConfig :80-120)
- `web/lib/agentic-pipeline/resolve/steps/{self-auth-match,identifier-match,sender-match,auto-gate}.ts`
- `web/lib/automations/debtor-email/nxt-zap-client.ts` (ResolveCandidateMatchSchema :179-209, lookupResolveCandidates :514)
- `web/lib/automations/debtor-email/resolve-debtor.ts` (debtorP0Config :63-80)
- `web/lib/automations/sales-email/resolve-customer.ts` (own loop :139-298) + `lookups/{offerte,order,sites,_match}.ts`
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` (confidence→audit, generic path :360-500)
- `scripts/no-engine-diff-check.sh` (LOGIC_FILES, donor, env override :34)
- `supabase/migrations/{20260601a,20260604b,20260601c}*.sql`
- `docs/agentic-pipeline/stage-2-entity.md` (§Resolution Transport Rule LOCKED 2026-06-15)
- `.planning/evals/2026-06-16-resolver-customer-eval/FINDINGS.md` (the 100-email fixture, buckets)
- `.planning/todos/pending/{2026-06-04-d06-corroboration-fast-follow,2026-06-15-sales-offerte-lookup-false-positive}.md`
- `web/lib/agentic-pipeline/resolve/__tests__/precedence-inversion.test.ts` (live inverted precedence)
- `.planning/ROADMAP.md` Phase 120 section + 120-CONTEXT.md / 120-DISCUSSION-LOG.md

### Secondary (MEDIUM)
- `web/vitest.config.ts` + `web/package.json` (test framework)

### Tertiary (LOW)
- None — no external/web sources; this is a closed internal change.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all modules read directly; no external deps.
- Architecture (collect-then-decide + SWARM-02 helper): HIGH — fork point and sales-loop divergence both confirmed in source.
- Confidence math (boost/demote/lone): HIGH on mechanism, MEDIUM on the exact AUTO-confidence consumer (OQ-1 / A3 — planner must trace it).
- Sales transport (D-09): HIGH — the verified `SB014098`→`BX228895` example + LOCKED transport rule.
- No-engine-diff (D-10): HIGH — guard read in full; env override + donor re-baseline path confirmed.
- Correctness gate (A5): MEDIUM — harness is Claude's-discretion to build; fixture inputs present.

**Research date:** 2026-06-16
**Valid until:** 2026-07-16 (stable internal surface; re-verify only if the resolve_candidates Zap URL or `resolution_config` schema changes)
