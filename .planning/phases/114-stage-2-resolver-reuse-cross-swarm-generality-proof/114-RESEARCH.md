# Phase 114: Stage 2 Resolver Reuse — cross-swarm generality proof - Research

**Researched:** 2026-06-04
**Domain:** Cross-swarm entity-resolution seam reuse (registry-driven dispatch); NXT customer resolution; Inngest Stage 2 worker; corpus-driven identifier discovery
**Confidence:** HIGH (donor code + live registry state inspected directly via git + migrations; corpus gaps cited from folded todos)

## Summary

Phase 114 proves the v8.2 NXT resolver is swarm-agnostic by onboarding sales-email Stage 2 through **config only** — `swarms.stage2_entity_resolver` (a module-path dispatch pointer) + `swarms.resolution_config` (a per-swarm jsonb config the generic engine reads). The entire seam (`loadStage2Resolver` dispatch, generic `resolveEntity` engine, config+adapter refactor of `resolve-debtor.ts`, per-source body selection, blocklists) is **already fully built and 28/28-test-green on `origin/workspace/v8.2-resolution-recall`** (Phase 90, 5/6 — only the SQL-substrate cutover is HELD). It is **NOT present in this workspace** (`web/lib/swarms/dynamic.ts` and `web/lib/agentic-pipeline/resolve/` do not exist here) and **NOT on `main`** (verified: `git ls-tree main` shows neither file; no seam commits in recent `main`). This workspace's `HEAD` is **234 commits behind `main`** and the v8.2 branch is 39 ahead / 233 behind `main`.

The locked CONTEXT decision (D-01) is **Enabler-PR to main**: cherry-pick the behaviour-neutral seam subset from the v8.2 branch (`dynamic.ts` + `resolve/engine.ts` + `resolve/config.ts` + the `resolve-debtor.ts` config+adapter refactor + step modules + `body-source.ts`) — explicitly **excluding** the HELD SQL-substrate cutover (`zapier.dbo` procs, `20260601f` cutover migration). The self-auth no-op (STAGE2-02) is **already satisfied by the engine as built**: `auto_safe_kinds: []` is the exact no-op trigger and there is a ready-made `self-auth-noop.test.ts` to port. Customer-less prospects → `unresolved` is the engine's natural fall-through (STAGE2-02 part 2).

**Primary recommendation:** Land the v8.2 seam subset to main as a behaviour-neutral enabler-PR (cherry-pick, do not rebuild), seed a real `sales-email` `resolution_config` replacing the inert placeholder, build a sales `resolveEntity`-shaped module wired through `nxtRequest` for the new identifier lookups (offerte/order/Sites), register it in the static `STAGE2_RESOLVER_MODULES` dispatch map, and port the `self-auth-noop` test for STAGE2-02. The **one open engine-work question** is multi-match corroboration (D-06): the engine as built is precedence-order + single-hit short-circuit — corroboration is NOT expressible in `resolution_config` today and needs an explicit decision (see Open Questions + STAGE2-01 risk).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seam-landing strategy:**
- **D-01: Enabler-PR to main.** Cherry-pick the RESL-03 subset from `origin/workspace/v8.2-resolution-recall` (Phase 90, commits `a5fcc921` + supporting): `web/lib/swarms/dynamic.ts` (loadStage2Resolver, static dispatch map, 60s TTL cache, kill-switch via registry column), `web/lib/agentic-pipeline/resolve/engine.ts` + `config.ts` (generic engine), and the `resolve-debtor.ts` config+adapter refactor (behaviour-neutral, 28/28 tests green on that branch). The v8.2 SQL-substrate cutover (zapier.dbo procs, cutover migration — HELD on that branch) stays in the debtor track and is NOT part of the enabler-PR.
- **D-02:** Coordination: operator self-coordinates (author of both tracks). The enabler-PR MUST leave a note/todo in the v8.2 workspace STATE that `workspace/v8.2-resolution-recall` (39 ahead / 233 behind main) must rebase after the enabler merge — the cherry-picked subset becomes a no-op on rebase.
- **D-03 (Claude's discretion):** Whether the seam lands dormant (debtor worker keeps its static import; sales = first dispatch consumer) or the debtor Stage 2 worker rewire (commit `803eee0d`) comes along. Default recommendation: dormant — lowest risk to the live debtor path. IF planning chooses the full rewire: the 90-06 equality dry-run harness + a debtor regression gate are MANDATORY in the same PR.

**Sales resolution layers:**
- **D-04:** Identifier set is **data-driven, not hand-curated**. Research/first plan includes a corpus-mining task over the 1,273 mails: which identifier kinds actually occur, at what frequency, and which NXT lookups exist per kind.
- **D-05:** Confirmed starting identifier kinds: **offertenummer** (quote → account), **ordernummer** (order → account), **factuurnummer** (invoice → paying customer — lookup already exists in debtor layer 3, reusable), **postcode/adres → NXT Sites** (installation addresses are "Sites" in NXT; CTO-confirmed). Candidates for mining: klant-/debiteurnummer, customer PO number, project/werkbon.
- **D-06: Multi-match corroboration** (CTO requirement): multiple independent signals corroborate to raise confidence. ⚠️ The current engine is precedence-order + single-hit short-circuit. RESEARCH QUESTION: can `resolution_config` express corroboration, or does the engine need a generic corroboration capability? If engine work is needed, it MUST land in/right-after the enabler-PR — BEFORE the no-Engine-diff measurement starts, so STAGE2-01 stays intact.
- **D-07: Internal forwards (23%): quoted-sender extraction.** When the sender is an own-tenant domain, extract the original sender address from the quoted body and feed THAT to sender_match. Never filter internal forwards.
- **D-08 (Claude's discretion):** thread_inheritance for sales — generically reusable once prior sales resolutions exist; planner decides whether it's in iteration 1.
- **D-09:** Prospects with no NXT match → `unresolved`, fall through to Stage 3 without blocking (roadmap-locked, STAGE2-02).

**NXT lookup transport:**
- **D-10:** New sales lookups (offerte, order, Sites) go through the **`nxtRequest` REST proxy** — no new Zap per lookup kind. **Prereq: PR #63 (feat/nxt-rest-proxy-mcp) merged + prod-deployed** (open as of 2026-06-04).
- **D-11:** Existing debtor lookups (sender_match, factuurnummer via nxt-zap-client/Zapier SQL) are reused as-is where the engine config points at them — no forced migration of working lookups.

**Audit target & review surface:**
- **D-12:** Sales Stage 2 resolutions land in a **new generic, swarm-agnostic resolution table** (NOT a mirror of debtor.email_labels). Schema choice (sales vs email_pipeline vs other) at planner discretion. Ships as migration + RLS + `npm run codegen` atomically. Every subsequent swarm reuses this table.
- **D-13 (Claude's discretion):** Bulk Review Stage 2-tab wiring for sales rows.

**Prereq fixes (folded todos):**
- **D-14:** Ingest gaps are in-phase prereq work, fix-forward minimum; backfill per todo acceptance criteria:
  - `has_attachments` never captured (false on all 1,273; raw_json null) — attachment presence/metadata must be ingested for new mail.
  - 28% of rows missing `sender_email` (354/1,273) — root cause + fix forward; resolution-denominator metrics MUST correct for this gap while it exists.

### Claude's Discretion
- D-03 (dormant seam vs full rewire), D-08 (thread_inheritance in iteration 1), D-13 (Stage 2-tab wiring), generic-table schema placement (D-12).

### Deferred Ideas (OUT OF SCOPE)
- **Sales Stage 4 Handler: concept-draft in Outlook** — sales-equivalent of createIcontrollerDraft; carry the idempotency lesson. Belongs in V11.0 (Stage 4 handlers explicitly out of V9.0 scope).
- `2026-04-23-create-draft-idempotency-and-cleanup.md` — debtor/iController territory; reviewed not folded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STAGE2-01 | Sales Stage 2 resolves customers via `swarms.stage2_entity_resolver` + `resolution_config` (the RESL-03 dynamic-dispatch seam) with **zero Engine code changes** — config-only onboarding, verified by a no-Engine-diff check | The seam exists fully built on the v8.2 branch (`dynamic.ts` + `engine.ts` + `config.ts`). Onboarding = INSERT a module-path into `STAGE2_RESOLVER_MODULES` (static dispatch map, bundler constraint) + seed `resolution_config` + UPDATE `stage2_entity_resolver`. **The static-dispatch-map line is the one unavoidable Engine touch** — see STAGE2-01 risk below. The corroboration question (D-06) is the other potential Engine touch. |
| STAGE2-02 | The debtor-only self-auth tier degrades to a no-op for sales (designed acceptance test); customer-less prospects fall through to Stage 3 without blocking | Engine satisfies this AS BUILT: `auto_safe_kinds: []` is the exact no-op trigger (`engine.ts` reads it, runs precedence steps, never emits a `self_auth` method, no crash). `self-auth-noop.test.ts` is a ready-made acceptance test to port. Unresolved fall-through is the engine's natural zero-hit terminal (`method: "unresolved"`, `customer_account_id: null`) and the worker already emits the Stage 2→3 coordinator event regardless of resolution outcome. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stage 2 customer resolution (sales) | API / Backend (Inngest worker `step.run`) | Registry (Supabase `swarms`) | Resolution is a durable backend step; the registry is the source-of-truth for which resolver + config to run. |
| Resolver dispatch (path → module) | API / Backend (`web/lib/swarms/dynamic.ts`) | — | Static dispatch map is a bundler-constrained backend concern; never a client one. |
| NXT identifier lookups (offerte/order/Sites) | API / Backend (`nxtRequest` REST proxy) | External (NXT `/api/*`) | New lookups route via the hosted proxy + token-harvest; NXT is an external service boundary. |
| NXT sender/factuur lookups (reused) | API / Backend (`nxt-zap-client` → Zapier SQL) | External (Zapier whitelisted IP) | D-11: working debtor lookups reused as-is; Zapier SQL stays the whitelisted-IP path. |
| Resolution audit persistence | Database / Storage (new generic table) | — | D-12: swarm-agnostic resolution audit table, RLS-mandatory. |
| Stage 2 → Stage 3 hand-off | API / Backend (Inngest event) | — | `PipelineStageContext` flows via the coordinator.requested event. |
| Bulk Review Stage 2 tab (sales) | Frontend Server (RSC) | Database (generic table) | D-13: registry-driven shell renders the tab; reads the generic table. |
| Identifier-kind discovery | Offline / analysis (corpus mining) | Database (`email_pipeline.emails`) | D-04: vocabulary emerges from data; a mining task, not runtime code. |

## Standard Stack

This phase reuses an existing internal stack — no new external packages. The "stack" is the donor seam code plus the project's locked infra.

### Core (donor code to cherry-pick from `origin/workspace/v8.2-resolution-recall`)
| Module | Commit | Purpose | Why Standard |
|--------|--------|---------|--------------|
| `web/lib/swarms/dynamic.ts` | `a5fcc921` | `loadStage2Resolver(modulePath)` — registry-driven dispatch via STATIC map, 60s TTL cache, last-known-good, `Stage2ResolverLoadError` (fails loud) | The RESL-03 seam STAGE2-01 is measured against. `[VERIFIED: git show a5fcc921]` |
| `web/lib/agentic-pipeline/resolve/engine.ts` | `5a33cc5e`/`a5fcc921` | Generic `resolveEntity(args, config)` — config-ordered precedence runner; short-circuits on first hit; `auto_safe_kinds: []` = self-auth no-op | The LOCKED public contract (`ResolveResult`, `ResolveArgs`, `Stage2Inputs`) lives here. `[VERIFIED: git show]` |
| `web/lib/agentic-pipeline/resolve/config.ts` | `5ac02610`/`a5fcc921` | `ResolutionConfig` TS mirror of `swarms.resolution_config` jsonb — `source`, `scope`, `precedence`, `auto_safe_kinds`, `blocklist_ref`, `llm_tiebreaker`. Free-form, NO codegen | The per-swarm config sales seeds. `[VERIFIED: git show]` |
| `web/lib/agentic-pipeline/resolve/steps/{thread-inheritance,sender-match,identifier-match}.ts` | `5a33cc5e` | The ported 4-layer step modules | Reused by both swarms. `[VERIFIED: git ls-tree]` |
| `web/lib/agentic-pipeline/resolve/body-source.ts` | `ee1911b5`/`a5fcc921` | `selectResolverBody({source, body_full_text, body_text})` — per-source body selection (RESL-16). Relevant to D-07 quoted-sender + attachment work | Pure helper, replay-safe. `[VERIFIED: git show]` |
| `web/lib/automations/debtor-email/resolve-debtor.ts` (refactored) | `a5fcc921` | Becomes config (`debtorP0Config`) + thin adapter delegating to `resolveEntity`; re-exports the LOCKED contract + `resolveEntity` | D-07 kill-switch revert target; preserves all existing importers. `[VERIFIED: git diff main..donor]` |

### Supporting (already in this workspace — reuse as-is)
| Module | Purpose | When to Use |
|--------|---------|-------------|
| `web/lib/automations/nxt-zapier/nxt-client.ts` | `nxtRequest(env, method, path, body)` + typed helpers `searchCustomers`, `listSites`, `searchItems`, `searchCustomers` | D-10 transport for NEW sales lookups (offerte/order/Sites). `searchCustomers` + `listSites` already exist and map to D-05 directly. `[VERIFIED: Read]` |
| `web/lib/automations/debtor-email/nxt-zap-client.ts` | `lookupSenderToAccount`, `lookupIdentifierToAccount` (factuur), `lookupCandidateDetails` | D-11 reuse for sender_match + factuurnummer. `[VERIFIED: grep exports]` |
| `web/lib/pipeline-gating/dry-run-gate` | `isStageBlocked(swarm, stage)` — per-stage gate; sales = all blocked (fail-closed) | Stage 2 gate-key decision (see Pitfalls). `[VERIFIED: Read]` |
| `web/lib/swarms/registry.ts` | `loadSwarm(admin, swarm_type)` — 60s cache the dispatch mirrors | Worker loads the swarm row to read `stage2_entity_resolver` + `resolution_config`. `[VERIFIED: referenced in worker]` |
| `web/lib/automations/debtor-email/extract-invoices.ts` | identifier extraction seed (regex over subject/body) | Pattern reference for sales offerte/order extraction. `[VERIFIED: find]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Enabler-PR cherry-pick (D-01) | Wait for v8.2 merge | Zero duplication, but timeline unknown (gated on debiteuren validation) — rejected, blocks critical path |
| Enabler-PR cherry-pick (D-01) | Interim sales-only static resolver | Throwaway, undermines STAGE2-01's no-Engine-diff claim — rejected |
| `nxtRequest` REST (D-10) | Zapier SQL per lookup kind | Proven but every identifier kind = new Zap/proc; slower iteration — rejected for NEW lookups, kept for existing (D-11) |
| Generic resolution table (D-12) | Mirror `debtor.email_labels` | Third swarm = third table; defeats the registry/generality thesis — rejected |

**Installation:** No `npm install`. This phase is a cherry-pick + new-module + migration + codegen, not a dependency change.

## Package Legitimacy Audit

> Not applicable — this phase installs **zero external packages**. All code is internal (cherry-picked donor modules + new sales resolver). The only "dependency" is the v8.2 git branch already in the repo's remote. slopcheck/registry verification steps are moot.

## Architecture Patterns

### System Architecture Diagram

```
                         Stage 1 verdict approved (categorize/dispatch)
                                        │
                                        ▼
                    classifier-verdict-worker emits
                    "<swarm>/stage-2.customer-resolve.requested"
                                        │
                                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Stage 2 worker (Inngest)  stage-2-customer-resolver.ts     │
        │                                                             │
        │  step.run("load-swarm-gate") → loadSwarm(swarm_type)        │
        │     reads: stage2_entity_resolver (path) +                  │
        │            resolution_config (jsonb) + dry_run_config        │
        │                                                             │
        │  step.run("resolve") ───────────────────────────────────┐  │
        │    path === null  → Router shape: skip Stage 2           │  │
        │    path !== null  → loadStage2Resolver(path)             │  │
        │                       │ (static dispatch map, 60s cache) │  │
        │                       ▼                                  │  │
        │              resolver.resolveEntity(args, config)        │  │
        │                       │                                  │  │
        │   ┌───────────────────┼──────────────────────────────┐  │  │
        │   │ config.precedence loop (short-circuit on 1st hit) │  │  │
        │   │  thread_inheritance → sender_match → identifier   │  │  │
        │   │  auto_safe_kinds:[] → NO self-auth tier (no-op)   │  │  │
        │   │  zero-hit → method:"unresolved", account_id:null  │  │  │
        │   └───────────────────┬──────────────────────────────┘  │  │
        │                       │  NXT lookups:                    │  │
        │   sales: offerte/order/Sites → nxtRequest REST (D-10)    │  │
        │   reused: sender/factuur     → nxt-zap-client (D-11)     │  │
        │   ◄──────────────────────────────────────────────────────┘ │
        │                                                             │
        │  write audit → GENERIC resolution table (D-12, new)        │
        │  emit pipeline_event (stage=2, context_version:1)          │
        │  emit "<swarm>/coordinator.requested" (Stage 2→3 hand-off) │
        └───────────────────────────────────┬─────────────────────────┘
                                             ▼
                          Stage 3 coordinator (intent) — Phase 113
              (resolved customer OR null prospect both flow through)
```

### Recommended Project Structure (new + cherry-picked)
```
web/lib/agentic-pipeline/resolve/   # ← cherry-picked from v8.2 branch
├── engine.ts                       # generic resolveEntity (LOCKED contract home)
├── config.ts                       # ResolutionConfig TS mirror
├── body-source.ts                  # per-source body selection
└── steps/                          # thread-inheritance, sender-match, identifier-match

web/lib/swarms/
└── dynamic.ts                      # ← cherry-picked: loadStage2Resolver + STAGE2_RESOLVER_MODULES

web/lib/automations/sales-email/
└── resolve-customer.ts             # ← NEW: { resolveEntity } module for sales
                                    #   (or a salesConfig + adapter; must expose resolveEntity)
└── lookups/                        # ← NEW: offerte/order/Sites lookups via nxtRequest

supabase/migrations/
├── <ts>_sales_resolution_config.sql   # ← NEW: replace inert placeholder w/ real config
└── <ts>_generic_resolution_audit.sql  # ← NEW: D-12 swarm-agnostic table + RLS
```

### Pattern 1: Registry-driven dispatch via STATIC map (bundler constraint)
**What:** `swarms.stage2_entity_resolver` holds a module-path string; `loadStage2Resolver` maps it through a hand-maintained `STAGE2_RESOLVER_MODULES` record of static `import()` thunks.
**When to use:** Every new resolver onboarding.
**Why a static map (not fully-dynamic import):** A fully-dynamic `await import(dbString)` throws `"Cannot find module as expression is too dynamic"` on Vercel (Webpack/Turbopack). Only Vite resolves that. So onboarding a new resolver requires **two edits**: an INSERT to `swarms.stage2_entity_resolver` AND a line in `STAGE2_RESOLVER_MODULES`.
```typescript
// Source: web/lib/swarms/dynamic.ts @ a5fcc921 [VERIFIED: git show]
const STAGE2_RESOLVER_MODULES: Record<string, () => Promise<Stage2ResolverModule>> = {
  "@/lib/automations/debtor-email/resolve-debtor": () =>
    import("@/lib/automations/debtor-email/resolve-debtor"),
  "@/lib/agentic-pipeline/resolve/engine": () =>
    import("@/lib/agentic-pipeline/resolve/engine"),
  // Phase 114 ADDS this line — the one unavoidable "Engine" touch (see STAGE2-01 risk):
  "@/lib/automations/sales-email/resolve-customer": () =>
    import("@/lib/automations/sales-email/resolve-customer"),
};
```

### Pattern 2: Self-auth no-op via empty `auto_safe_kinds` (STAGE2-02 — already built)
**What:** The generic engine reads `config.auto_safe_kinds`. An empty/absent array synthesizes zero self-auth candidates and runs the precedence steps unchanged — no crash, never emits a `self_auth` method.
```typescript
// Source: web/lib/agentic-pipeline/resolve/engine.ts @ donor [VERIFIED: git show]
export async function resolveEntity(args, config): Promise<ResolveResult> {
  void (config.auto_safe_kinds ?? []);   // [] → no self-auth candidate, no crash
  for (const stepName of config.precedence) { /* … short-circuit on first hit … */ }
  return { method: "unresolved", customer_account_id: null, /* … */ };  // zero-hit fall-through
}
```
The donor `self-auth-noop.test.ts` is the STAGE2-02 acceptance test — port it with a sales config.

### Pattern 3: Sales resolver module shape
**What:** The sales module must export `resolveEntity(args, config)` to satisfy `Stage2ResolverModule`. Two viable shapes:
- (a) **Reuse the generic engine directly** — point `stage2_entity_resolver` at `@/lib/agentic-pipeline/resolve/engine` and let `resolution_config.precedence` drive sales steps. Cleanest STAGE2-01 story (literally zero new resolver code), but only works if every sales step is already a generic step module.
- (b) **A sales adapter** (`@/lib/automations/sales-email/resolve-customer`) exposing `resolveEntity` that wires the NEW lookups (offerte/order/Sites via `nxtRequest`) before delegating to the engine. Required because the offerte/order/Sites steps do NOT exist as generic step modules yet.
**Recommendation:** (b) for iteration 1 (new lookups need a home), structured so the *new identifier steps* become generic `resolve/steps/*` modules where possible — preserving the no-Engine-diff claim for the dispatch layer.

### Anti-Patterns to Avoid
- **Rebuilding the seam:** It exists, 28/28 green on the donor branch. Cherry-pick; do not reimplement (CONTEXT D-01).
- **`if swarm === 'sales-email'` in a shared worker:** Violates SWARM-02 (static guard since 110-01). All sales behavior is registry data.
- **Fully-dynamic `import(dbPath)`:** Breaks on Vercel. Always go through the static dispatch map.
- **Nested `step.run` inside `resolveEntity`:** The engine runs INSIDE the worker's `step.run("resolve")`. Adding a nested step.run breaks replay (CLAUDE.md Inngest rule). The engine generates no non-deterministic DB keys itself.
- **Hand-editing `*.generated.ts`:** `resolution_config` is free-form jsonb with NO codegen (per `config.ts` header). The generic audit table (D-12), if it adds a literal-union column, DOES need codegen.
- **Binding a `resolution_config` schema in a throwaway migration:** The current sales row holds an `inert_placeholder` precisely because Phase 114 owns the real shape. Replace it once, correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolver dispatch | A switch on swarm_type | `loadStage2Resolver` + static map (cherry-pick) | Bundler-safe, cached, fail-loud — already built |
| Config-ordered precedence engine | A new sales resolver from scratch | `resolveEntity` (cherry-pick) | LOCKED contract + 28 tests; STAGE2-01 is measured against it |
| Self-auth degradation | A sales-specific guard | `auto_safe_kinds: []` in config | The engine already no-ops on empty; test exists |
| NXT customer/Site lookup | New Zaps + procs | `searchCustomers` / `listSites` in `nxt-client.ts` (D-10) | Helpers already exist against NXT `/api/*` |
| Factuurnummer → account | New lookup | `lookupIdentifierToAccount` (D-11) | Debtor layer 3 already does this |
| Quoted-sender extraction | A new parser | Reuse `body-source.ts` pattern + the locked "internal forwards carry context" principle (D-07) | Per-source body selection already exists |
| Resolution audit | A sales-specific table | New generic swarm-agnostic table (D-12) | Every future swarm reuses it |

**Key insight:** The hard engineering (bundler-safe dispatch, config-ordered engine, locked discriminated-union contract, equality-dry-run harness, self-auth no-op) is DONE on the v8.2 branch. Phase 114's net-new code is: a sales resolver module wiring 3-4 NXT lookups, a `resolution_config` seed, a generic audit table, the ingest prereq fixes, and a corpus-mining task. Treating any of the cherry-picked pieces as "to build" is the single biggest scoping error available here.

## Runtime State Inventory

> This phase is a seam-landing + new-config phase, not a rename. But the **cross-workspace git/registry state** is the critical runtime inventory.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `swarms` row `sales-email`: `resolution_config = {status:'inert_placeholder', activates_in_phase:114}`, `stage2_entity_resolver = '@/lib/automations/sales-email/resolve-customer'` (inert), `entity_brand=['smeba']`, `dry_run_config` all blocked. Verified live 2026-06-03 (STATE.md Blockers note). The `resolution_config` placeholder MUST be replaced with a real config; the `stage2_entity_resolver` path is already what the new module will register as. | Migration: UPDATE `resolution_config` to real shape; the path value can stay. |
| Live service config / cross-branch | Seam code lives ONLY on `origin/workspace/v8.2-resolution-recall` (39 ahead / 233 behind main). NOT on `main`, NOT in this workspace. This workspace HEAD is 234 behind main. `[VERIFIED: git ls-tree main, git rev-list]` | Enabler-PR to main (D-01); leave rebase note in v8.2 STATE (D-02). |
| OS-registered state | None — no Task Scheduler / pm2 / cron names embed Stage 2 resolver identifiers. The Stage 2 worker is an Inngest function (`id: "stage-2-customer-resolver"`), event-driven, no OS registration. Verified by inspecting the worker. | None. |
| Secrets/env vars | `nxtRequest` needs `AUTOMATION_WEBHOOK_SECRET` (acc) / `NXT_PROD_WEBHOOK_SECRET` (prod). Both already provisioned for PR #63 (STATE.md). No NEW secret for Phase 114. | None — confirm PR #63 prod-deploy (D-10 prereq). |
| Build artifacts | If the generic audit table (D-12) adds a literal-union column, `npm run codegen` must run + commit atomically. `resolution_config` itself is NO-codegen (free-form jsonb). | Run codegen only if a closed-enum column is introduced. |

**Migrations needed in THIS workspace that the donor branch has but main does not:** the donor's `20260601a_resolution_config_column.sql` is **already superseded** — the `resolution_config` column EXISTS live (added defensively by `20260603_sales_swarm_full_funnel_enrichment.sql`, `ADD COLUMN IF NOT EXISTS`). So the cherry-pick does NOT need the column-add migration; it needs only the seam *code* plus a new sales `resolution_config` UPDATE. The donor's `resolution_blocklists` table (`20260601b`) is debtor-scoped (`swarm_type='debtor-email'` rows) — sales does not strictly need it for iteration 1 unless the planner wants own-domain strip lists for sales (recommended for the D-07 own-tenant forward case).

## Common Pitfalls

### Pitfall 1: Treating the seam as "to build" rather than "to cherry-pick"
**What goes wrong:** Reimplementing `loadStage2Resolver` / `resolveEntity`, drifting from the LOCKED contract, breaking the no-Engine-diff claim.
**Why it happens:** The seam is absent from this workspace and main, so it *looks* greenfield.
**How to avoid:** `git cherry-pick` / `git show … > file` from `origin/workspace/v8.2-resolution-recall`. Run the donor's 28-test suite to confirm behaviour-neutrality after the cherry-pick.
**Warning signs:** A plan task titled "implement the resolution engine" — that's a red flag.

### Pitfall 2: The static-dispatch-map line vs the "zero Engine code changes" claim (STAGE2-01)
**What goes wrong:** STAGE2-01 says "zero Engine code changes, verified by a no-Engine-diff check," but onboarding a new resolver REQUIRES adding a line to `STAGE2_RESOLVER_MODULES` in `dynamic.ts` (the bundler constraint). A naive no-Engine-diff check would FAIL on that one line.
**Why it happens:** The bundler forces the static map; a fully-config-only onboarding is impossible on Vercel.
**How to avoid:** Define "Engine" precisely for the no-Engine-diff check. The honest framing (already in the donor `dynamic.ts` header): onboarding = "INSERT to `swarms.stage2_entity_resolver` AND a line to `STAGE2_RESOLVER_MODULES`." The no-Engine-diff check should assert **zero changes to `engine.ts` + `config.ts` + the step modules** (the resolution *logic*), explicitly allowing the one dispatch-map registration line. Surface this to the planner so the acceptance criterion is written correctly — otherwise STAGE2-01 is unverifiable-as-worded.
**Warning signs:** A verification step that greps for ANY diff under `web/lib/swarms/` or `web/lib/agentic-pipeline/`.

### Pitfall 3: Multi-match corroboration (D-06) is not expressible in `resolution_config` today
**What goes wrong:** The CTO requirement (multiple independent signals corroborate to raise confidence) cannot be configured — the engine is precedence-order + single-hit short-circuit (first step that yields a `customer_account_id` returns immediately). Adding corroboration is ENGINE work, which threatens STAGE2-01's no-Engine-diff measurement.
**Why it happens:** The P0 engine was a faithful 1:1 port of the debtor single-hit pipeline; corroboration was never in scope for P0.
**How to avoid:** Decide corroboration scope at planning. Options: (a) ship iteration 1 WITHOUT corroboration (precedence-order only) and defer corroboration to a follow-up — keeps STAGE2-01 clean; (b) add a generic corroboration capability to the engine AS PART OF the enabler-PR, BEFORE the no-Engine-diff measurement starts (CONTEXT D-06 explicitly allows this sequencing). Either is valid; (a) is lower-risk for iteration 1. This is the #1 open design decision — see Open Questions OQ-1.
**Warning signs:** A `resolution_config` with a `corroborate: true` field but no engine support — silently ignored.

### Pitfall 4: Resolution-rate metrics distorted by the sender_email gap
**What goes wrong:** 28% of sales rows have `sender_email = null` (354/1,273). sender_match is the resolver's entry layer; a miss on a null-sender row is "no input," not "no NXT match" — conflating them poisons any resolution-rate number and the later Wilson-CI promotion gates.
**How to avoid:** Fix the ingest gap forward (D-14) AND explicitly correct the resolution denominator for null-sender rows while the gap exists. Report resolution rate as `resolved / (rows_with_sender_email)` with the excluded count stated.
**Warning signs:** A "resolution rate = X%" claim with no denominator caveat.

### Pitfall 5: Dry-run gate key for Stage 2 sales
**What goes wrong:** The current `dry-run-gate` knows `stage_1_archive`, `stage_1_cleanup`, `stage_3_labeling`, `stage_4_handlers` — there is **no `stage_2` key**. Sales Stage 2 writes (the new generic audit table) need a gate decision: reuse `stage_3_labeling`, or add a `stage_2_resolution` key.
**Why it happens:** Stage 2 resolution for debtor was governed under `stage_3_labeling` (the `email_labels` write). Sales' audit table is a different write.
**How to avoid:** Decide the gate key at planning. Sales = all-blocked by default (fail-closed), so the audit write is dry-run until explicitly flipped. If adding a `stage_2_resolution` key, extend `DryRunConfig` + the `isStageBlocked` union + the seed migration.
**Warning signs:** A live sales audit write with no gate read — sales is supposed to be dry-run until cut-over.

### Pitfall 6: Event naming for the sales Stage 2 request
**What goes wrong:** The debtor worker listens on `debtor-email/stage-2.customer-resolve.requested`. Sales needs its own event name under the Phase 88.1 stage-named convention, and the classifier-verdict-worker must emit it for sales. A single shared worker listening on a wildcard vs per-swarm functions is an architecture decision.
**How to avoid:** Confirm whether the Stage 2 worker is made swarm-generic (listens on a pattern) or sales gets its own registration. Check how Stage 3 dispatcher did it (wildcard `*/predicted` per STATE.md Phase 80-03) for the established pattern.
**Warning signs:** Sales rows never reaching Stage 2 because no event is emitted for `sales-email`.

## Code Examples

### The locked Stage 2 → Stage 3 context contract (what must flow regardless of resolution)
```typescript
// Source: docs/agentic-pipeline/context-shape-contract.md [CITED]
export interface PipelineStageContext {
  customer_id: string | null;        // null is LEGAL + meaningful: resolved-but-no-match
  customer_name: string | null;
  language: 'nl' | 'fr' | 'en' | 'de';
  entity_brand: string;              // 'smeba' for sales (registry-driven)
  recent_documents: DocumentRef[];   // may be []
  context_version: 1;
}
```
The worker already emits `coordinator.requested` with `customer_account_id`/`customer_name` for BOTH resolved and unresolved paths — STAGE2-02's "fall through to Stage 3 without blocking" is the existing behaviour, not new work.

### The donor's behaviour-neutral worker rewire (the D-03 "full rewire" option)
```typescript
// Source: git diff main..donor web/lib/inngest/functions/stage-2-customer-resolver.ts [VERIFIED]
const swarm = await loadSwarm(admin, swarm_type ?? "debtor-email");
const resolverPath = swarm?.stage2_entity_resolver ?? null;
const resolutionConfig = swarm?.resolution_config ?? null;
if (!nxtDatabase || !resolverPath || !resolutionConfig) {
  result = await runThreadInheritanceOnly({ /* … */ });  // Router shape / no-NXT
} else {
  const resolver = await loadStage2Resolver(resolverPath);
  const args = { nxt_database, brand_id, conversation_id, from_email, subject,
                 body_text: selectResolverBody({ source, body_full_text, body_text }) };
  result = await resolver.resolveEntity(args, resolutionConfig);
}
```
This rewire is behaviour-neutral for debtor (the debtor adapter's `resolveEntity` IS the engine). D-03 default is **dormant** (debtor keeps static import; only sales dispatches) — but the rewire is what lets sales dispatch at all, so the worker must read the registry path for the sales swarm regardless. The dormant-vs-rewire choice is really "does the *debtor* row also flip to dispatch in this PR" — default no, to keep the live debtor path untouched.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stage 2 worker statically imports `resolveDebtor` | Registry-driven `loadStage2Resolver` dispatch | Phase 90 (v8.2 branch, `803eee0d`) | Sales onboards by config; the generality proof |
| `resolveDebtor` = inline 4-layer pipeline | `resolveDebtor` = `debtorP0Config` + thin adapter → `resolveEntity` | Phase 90 (`a5fcc921`) | Logic lives once in the generic engine |
| SugarCRM "Emails" trigger for sales | Outlook ingest (same path as debtor) | 2026-05-06 cutover | Sales Stage 2 reuses NXT resolver, no Sugar adapter |
| New NXT lookup = new Zap/proc | `nxtRequest` REST proxy against NXT `/api/*` | 2026-06-04 (PR #63) | Faster identifier-kind iteration |

**Deprecated/outdated:**
- The donor's `20260601a_resolution_config_column.sql` (column-add) — superseded; the column already exists live via the Phase 110 enrichment migration. Cherry-pick the seam *code*, not this migration.
- The inert `resolution_config` placeholder on the sales row — Phase 114 replaces it.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The v8.2 branch's 28/28-test-green claim (from CONTEXT) holds after a clean cherry-pick into this 234-behind workspace | Standard Stack | Cherry-pick may hit merge conflicts against this workspace's older `resolve-debtor.ts` / worker; budget a conflict-resolution + test-rerun task. Mitigated: the donor diff is against `main`, and this workspace is a `main` descendant lineage, so conflicts are likely mechanical. |
| A2 | `searchCustomers` / `listSites` in `nxt-client.ts` return enough to resolve offerte/order → account (the NXT data model exposes quote→customer and order→customer) | Supporting stack | Offerte/order → account may need a different NXT `/api/*` endpoint than the existing helpers; the corpus-mining task (D-04) must confirm which lookups exist per kind. `[ASSUMED]` — verify against NXT API during planning. |
| A3 | PR #63 (`nxtRequest` REST proxy) is merged + prod-deployed before the sales lookups go live | D-10 prereq | If not deployed, new lookups have no transport. Gate: confirm PR #63 status at plan time. STATE.md lists it as "Open: merge + prod-deploy needed." |
| A4 | The Stage 2 worker can be made swarm-generic (event pattern or sales registration) without a per-swarm branch | Pitfall 6 | If the worker hard-codes the debtor event name, sales needs either a wildcard listener or a new function — an architecture decision, not a config one. |
| A5 | `resolution_config` free-form jsonb can express the sales precedence + scope without engine changes (excluding corroboration) | STAGE2-01 | If sales needs a step kind the engine doesn't have (e.g. Sites-postcode match), that's a new generic step module — additive to `resolve/steps/`, arguably not an "Engine" change but needs the no-Engine-diff definition (Pitfall 2). |

## Open Questions (RESOLVED)

> All four questions were resolved during planning (iteration 2, 2026-06-04). Inline `RESOLVED:` annotations below.

1. **Multi-match corroboration (D-06) — config or engine work?** (HIGHEST PRIORITY)
   - **RESOLVED:** iteration 1 ships precedence-only; D-06 deferral decided at the Plan 04 Task 3 checkpoint, with a mandatory tripwire todo (`.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md`) on the defer path, asserted by Plan 05 Task 3.
   - What we know: The engine is precedence-order + single-hit short-circuit; `resolution_config` has no corroboration field. CONTEXT D-06 explicitly permits engine work IF it lands in/right-after the enabler-PR, before the no-Engine-diff measurement.
   - What's unclear: Whether iteration 1 needs corroboration or can ship precedence-only.
   - Recommendation: Ship iteration 1 **precedence-only** (cleanest STAGE2-01); spec corroboration as a generic engine capability for a fast follow that lands BEFORE the no-Engine-diff measurement is taken as the acceptance gate. Raise to the user in discuss-phase if not already settled.

2. **Definition of "Engine" for the no-Engine-diff check (STAGE2-01).**
   - What we know: Onboarding requires one line in `STAGE2_RESOLVER_MODULES` (bundler constraint).
   - Recommendation: Acceptance criterion = "zero diff to `engine.ts`, `config.ts`, and `resolve/steps/*`; the only `web/lib/swarms/dynamic.ts` change is the single dispatch-map registration line." Make this explicit so the criterion is verifiable.
   - **RESOLVED:** exactly this precise scope adopted — Plan 05 Task 2 (`scripts/no-engine-diff-check.sh`: byte-equality on `engine.ts`/`config.ts`/`steps/*`, single `STAGE2_RESOLVER_MODULES` line allowed).

3. **New sales step kinds (offerte/order/Sites) — generic step modules or sales-adapter-internal?**
   - Recommendation: Build them as generic `resolve/steps/*` where the lookup is reusable (Sites-postcode is cross-swarm), keeping sales-specific glue in the sales adapter. Confirm during planning which lookups are genuinely cross-swarm.
   - **RESOLVED:** sales-adapter-internal lookups (`lib/automations/sales-email/lookups/*`) with sales glue in `resolve-customer.ts` — Plan 04 Task 1 (option b); generic step promotion deferred until a second swarm needs them.

4. **Generic resolution audit table (D-12) schema placement + Stage 2 gate key.**
   - Recommendation: `email_pipeline` schema (alongside `emails`) keeps it pipeline-scoped and PostgREST-exposed; add a `stage_2_resolution` key to `DryRunConfig` (fail-closed, sales blocked by default) rather than overloading `stage_3_labeling`.
   - **RESOLVED:** as recommended — Plan 02 (`email_pipeline.resolution_audit` with RLS + `stage_2_resolution` fail-closed gate key).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `origin/workspace/v8.2-resolution-recall` branch | Cherry-pick (D-01) | ✓ | 39 ahead / 233 behind main | — (no fallback; this IS the donor) |
| `nxtRequest` REST proxy (PR #63) | New sales lookups (D-10) | ⚠ code present, prod-deploy open | branch `feat/nxt-rest-proxy-mcp` | Zapier SQL (D-11 path) for any lookup, slower |
| `swarms.resolution_config` column | Config seed | ✓ exists live (Phase 110 migration) | — | — |
| `nxt-client.ts` helpers (`searchCustomers`, `listSites`) | Offerte/order/Sites | ✓ | — | New `nxtRequest` calls |
| `dry-run-gate` | Stage 2 gating | ✓ (no `stage_2` key yet) | — | reuse `stage_3_labeling` |
| Supabase MCP / service-role | Migrations | ✓ (re-linked to Agent-Workforce org 2026-06-03) | — | Management API |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** PR #63 prod-deploy (fallback: Zapier SQL transport — defeats D-10's iteration-speed goal but unblocks).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | (project root — existing; `web/lib/**/__tests__/*.test.ts` convention) |
| Quick run command | `npm test -- web/lib/agentic-pipeline/resolve` (donor seam suite) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STAGE2-02 | Self-auth tier no-ops on empty `auto_safe_kinds` | unit | `npm test -- self-auth-noop` | ✅ on donor branch — port + re-aim at sales config |
| STAGE2-02 | Customer-less prospect → `method:"unresolved"`, falls through to Stage 3 | unit | `npm test -- <new sales resolver test>` | ❌ Wave 0 — new test |
| STAGE2-01 | Seam behaviour-neutral after cherry-pick (no logic drift) | unit | `npm test -- port-equivalence` | ✅ on donor branch — run after cherry-pick |
| STAGE2-01 | No-Engine-diff: zero changes to engine.ts/config.ts/steps; one dispatch-map line allowed | CI guard | `git diff` scoped grep (see Pitfall 2) | ❌ Wave 0 — new CI/verification step |
| STAGE2-01 | Sales dispatch resolves via registry path | unit | `npm test -- dispatch` (donor) + new sales case | ✅ donor `dispatch.test.ts` — extend |
| (D-14) | Ingest captures `sender_email` + `has_attachments` for new mail | integration | `npm test -- <ingest test>` | ❌ Wave 0 |
| (D-04) | Corpus mining: identifier-kind frequencies | analysis | offline script (not a unit test) | ❌ new mining task |

### Sampling Rate
- **Per task commit:** `npm test -- web/lib/agentic-pipeline/resolve` (the seam suite, ~28 tests)
- **Per wave merge:** `npm test` (full) + `npm run codegen && git diff --exit-code` (if audit table adds an enum column) + `npm run check:supabase` (new table RLS)
- **Phase gate:** Full suite green + no-Engine-diff CI guard green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Cherry-pick the donor seam (8 files) — then run the donor suite to confirm GREEN in this workspace
- [ ] New sales resolver test (`unresolved` fall-through + dispatch)
- [ ] No-Engine-diff CI guard (scoped `git diff` assertion, per the precise definition)
- [ ] Ingest test for `sender_email` + `has_attachments` capture
- [ ] Corpus-mining script (offline, not a unit test) for identifier-kind discovery
- [ ] `check:supabase` must pass for the new generic resolution audit table (RLS-mandatory)

## Security Domain

> `security_enforcement` config not located; treating as enabled. Sales Stage 2 touches NXT (external system) + a new audit table.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NXT token-harvest via Browserless (server-side, `token-store.ts`); `nxtRequest` env-split secrets (acc/prod). Skill never touches token directly. |
| V3 Session Management | no | No user sessions in this backend path. |
| V4 Access Control | yes | RLS-mandatory on the new generic resolution table (CLAUDE.md: ENABLE RLS + service_role policy minimum; never `TO anon USING(true)`). |
| V5 Input Validation | yes | Zod on all NXT/LLM output (CLAUDE.md). Identifier extraction (offerte/order numbers) from untrusted email body — validate format before NXT lookup. |
| V6 Cryptography | no | No new crypto; secrets in env vars (infra), credentials in `credentials` table. |

### Known Threat Patterns for {NXT resolution + email-derived identifiers}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Confident wrong-customer resolution (drift during cherry-pick) | Tampering / Spoofing | `port-equivalence.test.ts` byte-equality gate (donor) — run after cherry-pick |
| Email-body identifier injection (crafted offertenummer → wrong account) | Tampering | Validate identifier format (regex) before lookup; single-hit short-circuit limits blast radius; corroboration (D-06) raises confidence |
| NXT prod write via read path | Elevation | `nxtRequest` read-only prod (non-GET needs `allowWrite:true`); Stage 2 is read-only resolution |
| Internal-forward sender spoofing (own-tenant domain) | Spoofing | D-07 quoted-sender extraction feeds the ORIGINAL sender to sender_match, not the forwarder — but must not let a crafted quoted body resolve to an attacker-chosen account; treat extracted sender as a candidate, corroborate |
| Anon write to new audit table | Elevation | RLS service_role-only; `check:supabase` CI gate fails on `rls_disabled_in_public` |

## Sources

### Primary (HIGH confidence — inspected directly)
- `git show origin/workspace/v8.2-resolution-recall:web/lib/swarms/dynamic.ts` (@ a5fcc921) — dispatch seam
- `git show …:web/lib/agentic-pipeline/resolve/{engine,config,body-source}.ts` — generic engine + config + body source
- `git show …:web/lib/agentic-pipeline/resolve/__tests__/{self-auth-noop,port-equivalence}.test.ts` — STAGE2-02 + behaviour-neutrality tests
- `git diff main origin/workspace/v8.2-resolution-recall -- resolve-debtor.ts / stage-2-customer-resolver.ts` — config+adapter refactor + worker rewire
- `git ls-tree main` / `git rev-list --left-right --count` — seam NOT on main; 234-behind / 39-ahead/233-behind
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` (this workspace) — current debtor-coupled worker
- `web/lib/automations/nxt-zapier/nxt-client.ts` — `nxtRequest` + `searchCustomers`/`listSites` helpers
- `web/lib/pipeline-gating/dry-run-gate/index.ts` — gate keys (no stage_2 key)
- `supabase/migrations/20260603_sales_swarm_full_funnel_enrichment.sql` — inert `resolution_config` placeholder + live state
- `docs/agentic-pipeline/context-shape-contract.md` — Stage 2→3 contract
- `.planning/todos/pending/2026-06-04-sales-ingest-{sender-email,attachments}-gap.md` — corpus gaps
- CONTEXT.md, REQUIREMENTS.md, STATE.md, DISCUSSION-LOG.md

### Secondary (MEDIUM)
- STATE.md Blockers note (live registry verification 2026-06-03) — relied on for live `swarms` values (anon REST is restricted to `learnings`, could not re-confirm directly)

### Tertiary (LOW)
- None. (No WebSearch needed — this is an internal-code phase.)

## Metadata

**Confidence breakdown:**
- Standard stack (donor seam): HIGH — every file inspected via git
- Architecture (dispatch + engine): HIGH — code + contract docs read directly
- STAGE2-02 satisfaction: HIGH — engine + test inspected
- STAGE2-01 corroboration risk (D-06): MEDIUM — the gap is confirmed; the resolution path is a planning decision
- NXT offerte/order→account lookups (A2): MEDIUM — helpers exist but exact endpoints per identifier kind need the D-04 mining task to confirm
- Live registry values: MEDIUM — verified via migration + STATE note, not re-confirmed via authenticated query this session

**Research date:** 2026-06-04
**Valid until:** 2026-06-18 (fast-moving: depends on PR #63 deploy + v8.2 branch state; re-verify branch tip + PR #63 status at plan time)
