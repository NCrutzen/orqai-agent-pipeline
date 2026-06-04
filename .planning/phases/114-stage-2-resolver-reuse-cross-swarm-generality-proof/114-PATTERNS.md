# Phase 114: Stage 2 Resolver Reuse — Pattern Map

**Mapped:** 2026-06-04
**Files analyzed:** 11 (8 cherry-picked donor + 3 net-new + config/migration changes)
**Analogs found:** 11 / 11 (every file has a concrete donor or in-workspace analog)

> **Critical scoping note (from RESEARCH Pitfall 1):** 8 of these files are NOT "to build" — they are **cherry-picked verbatim** from `origin/workspace/v8.2-resolution-recall`. For those, the "analog" IS the file itself on the donor branch; the planner's action is `git show origin/workspace/v8.2-resolution-recall:<path> > <path>` (or `git cherry-pick`), then run the donor's 28-test suite. Only 3 files are genuinely net-new (sales resolver module + lookups + generic audit table), plus 2 config/migration edits.

---

## File Classification

| New/Modified File | Role | Data Flow | Action | Closest Analog | Match Quality |
|-------------------|------|-----------|--------|----------------|---------------|
| `web/lib/swarms/dynamic.ts` | service (dispatch) | request-response | **cherry-pick** | self (donor `a5fcc921`); cache discipline mirrors `web/lib/swarms/registry.ts` | exact (donor) |
| `web/lib/agentic-pipeline/resolve/engine.ts` | service (engine) | transform | **cherry-pick** | self (donor); locked contract home | exact (donor) |
| `web/lib/agentic-pipeline/resolve/config.ts` | model (config types) | — | **cherry-pick** | self (donor) | exact (donor) |
| `web/lib/agentic-pipeline/resolve/body-source.ts` | utility (pure helper) | transform | **cherry-pick** | self (donor) | exact (donor) |
| `web/lib/agentic-pipeline/resolve/steps/{thread-inheritance,sender-match,identifier-match}.ts` | service (step modules) | CRUD/lookup | **cherry-pick** | self (donor) | exact (donor) |
| `web/lib/automations/debtor-email/resolve-debtor.ts` (refactor) | service (adapter) | transform | **cherry-pick refactor** | self (donor config+adapter) | exact (donor) |
| `web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts` | test | — | **cherry-pick + re-aim** | self (donor); port w/ sales config | exact (donor) |
| `web/lib/automations/sales-email/resolve-customer.ts` | service (adapter) | transform | **NEW** | `web/lib/automations/debtor-email/resolve-debtor.ts` (config+adapter); engine contract | role-match |
| `web/lib/automations/sales-email/lookups/*.ts` | service (lookup) | request-response | **NEW** | `web/lib/automations/nxt-zapier/nxt-client.ts` (`searchCustomers`/`listSites`); `extract-invoices.ts` (extraction) | role-match |
| `supabase/migrations/<ts>_generic_resolution_audit.sql` | migration | CRUD | **NEW** | `supabase/migrations/_template.sql` | exact (template) |
| `supabase/migrations/<ts>_sales_resolution_config.sql` | migration (config seed) | — | **NEW (edit)** | donor `config.ts` `ResolutionConfig` shape + `20260603_sales_swarm_full_funnel_enrichment.sql` placeholder | role-match |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` (D-03 rewire, OPTIONAL) | service (worker) | event-driven | **modify (if rewire)** | self (this workspace) + donor rewire diff | exact |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` (`stage_2_resolution` key) | utility (gate) | — | **modify** | self — extend `DryRunConfig` + `isStageBlocked` union | exact |

---

## Pattern Assignments

### `web/lib/swarms/dynamic.ts` (dispatch service) — CHERRY-PICK

**Analog:** itself on donor `a5fcc921`. Cache discipline mirrors `web/lib/swarms/registry.ts` `loadSwarm` (60s TTL Map, last-known-good).

**The one Phase-114 edit** — add ONE line to the static dispatch map (the sole unavoidable "Engine" touch, see STAGE2-01 Pitfall 2):
```typescript
// web/lib/swarms/dynamic.ts — STAGE2_RESOLVER_MODULES record
const STAGE2_RESOLVER_MODULES: Record<string, () => Promise<Stage2ResolverModule>> = {
  "@/lib/automations/debtor-email/resolve-debtor": () =>
    import("@/lib/automations/debtor-email/resolve-debtor"),
  "@/lib/agentic-pipeline/resolve/engine": () =>
    import("@/lib/agentic-pipeline/resolve/engine"),
  // Phase 114 ADDS exactly this entry — bundler-constrained, NOT a logic change:
  "@/lib/automations/sales-email/resolve-customer": () =>
    import("@/lib/automations/sales-email/resolve-customer"),
};
```

**Dispatch + fail-loud contract** (cherry-picked verbatim — do not re-implement):
- `modulePath === null` → return `null` (Router shape; caller skips Stage 2).
- Unknown path → throws `Stage2ResolverLoadError` (fails loud).
- Module without `resolveEntity` → throws `Stage2ResolverLoadError`.
- 60s TTL cache + last-known-good on transient import failure.

**Why static map (NOT `await import(dbString)`):** Vercel Webpack/Turbopack throws `"Cannot find module as expression is too dynamic"`. Onboarding a resolver = INSERT to `swarms.stage2_entity_resolver` **AND** one line here.

---

### `web/lib/agentic-pipeline/resolve/engine.ts` (engine service) — CHERRY-PICK

**Analog:** itself on donor. This is the **LOCKED public contract home** (`ResolveResult`, `ResolveArgs`, `Stage2Inputs`, `ResolveMethod`, `Confidence`, `Candidate`) — re-exported from `resolve-debtor.ts` so existing importers keep working.

**Self-auth no-op (STAGE2-02 — already satisfied AS BUILT):**
```typescript
export async function resolveEntity(args: ResolveArgs, config: EngineConfig): Promise<ResolveResult> {
  // RESL-03 self-auth no-op: empty/absent auto_safe_kinds → zero self-auth candidates, no crash.
  void (config.auto_safe_kinds ?? []);
  // ...
  for (const stepName of config.precedence) {
    if (stepName === "thread_inheritance") { const r = await runThreadInheritance(args); if (r) return r; }
    else if (stepName === "sender_match")  { const r = await runSenderMatch(args, llmTiebreak); if (r) return r; }
    else if (stepName === "identifier_match") { /* short-circuit on first hit */ }
  }
  return { method: "unresolved", customer_account_id: null, /* ... */ };  // zero-hit fall-through (STAGE2-02 part 2)
}
```

**EngineConfig shape** (what the engine actually reads):
```typescript
export type EngineConfig = Pick<ResolutionConfig, "precedence"> &
  Partial<Pick<ResolutionConfig, "auto_safe_kinds" | "llm_tiebreaker">>;
```

**Replay-safety constraint (CLAUDE.md Inngest):** the engine runs INSIDE the worker's `step.run("resolve")`. **NEVER add a nested `step.run`** inside `resolveEntity` or any step module.

**D-06 corroboration warning:** the engine is **precedence-order + single-hit short-circuit** (first step with a `customer_account_id` returns immediately). Multi-match corroboration is NOT expressible in `resolution_config` today. If iteration 1 needs it, that is ENGINE work that MUST land in/right-after the enabler-PR, BEFORE the no-Engine-diff measurement (see Shared Pattern: STAGE2-01 verification).

---

### `web/lib/agentic-pipeline/resolve/config.ts` (config model) — CHERRY-PICK

**Analog:** itself on donor. **FREE-FORM jsonb, NO CODEGEN** (edit the interface by hand; it is NOT generated like `swarms.entity_brand`).

**`ResolutionConfig` shape the sales seed must produce** (the fields sales fills):
```typescript
interface ResolutionConfig {
  version: string;                       // e.g. "2026-06-01.v1"
  source: { kind: string; resolver_tool_id: string; fallback?: string };
  scope: { environment_id: string; brand_mode: "tiebreaker" | "hard_filter"; brand_scope?: string[] | null; brand_scope_by_mailbox?: Record<string,string[]>; };
  precedence: string[];                  // sales = data-driven order (D-04)
  auto_safe_kinds: string[];             // sales = [] → self-auth no-op (STAGE2-02)
  blocklist_ref: { swarm_type: string; include_shared: boolean };
  llm_tiebreaker: boolean;
}
```
Sales seeds `auto_safe_kinds: []`, `scope.environment_id` per NXT (BX/Benelux), `brand_mode: "tiebreaker"`, `entity_brand` context = `smeba`.

---

### `web/lib/agentic-pipeline/resolve/body-source.ts` (pure helper) — CHERRY-PICK

**Analog:** itself on donor. Pure, deterministic, replay-safe.

**Per-source body selection (relevant to D-07 quoted-sender + attachment work):**
```typescript
export function selectResolverBody({ source, body_full_text, body_text }: BodySourceInput): string {
  const full = (body_full_text ?? "").trim();
  if (source === FULL_TEXT_SOURCE && full.length > 0) return body_full_text as string;
  return body_text ?? "";
}
// FULL_TEXT_SOURCE = "zapier-debtor-ingest"; outlook/sugarcrm → body_text
```
**D-07 extension point:** sales internal forwards (23%, own-tenant domain) need quoted-sender extraction. This helper's per-source branching is the pattern to extend — extract original sender from quoted body, feed THAT to `sender_match`. Never filter internal forwards (locked principle).

---

### `web/lib/automations/sales-email/resolve-customer.ts` (sales adapter) — NEW

**Analog:** `web/lib/automations/debtor-email/resolve-debtor.ts` (post-refactor: `debtorP0Config` + thin adapter delegating to `resolveEntity`).

**Required shape** — must satisfy `Stage2ResolverModule` (export `resolveEntity`):
```typescript
import { resolveEntity, type ResolveArgs, type ResolveResult, type EngineConfig }
  from "@/lib/agentic-pipeline/resolve/engine";

// RESEARCH Pattern 3 recommendation (b): sales adapter wires the NEW lookups
// (offerte/order/Sites via nxtRequest) then delegates to the generic engine.
export async function resolveEntity(args: ResolveArgs, config: EngineConfig): Promise<ResolveResult> {
  // wire offerte/order/Sites steps, then run the generic precedence engine
}
```
**Decision (RESEARCH Pattern 3):** option (b) for iteration 1 — new lookups need a home; structure new identifier steps as generic `resolve/steps/*` where the lookup is cross-swarm (Sites-postcode is reusable), keeping sales-specific glue in this adapter. This preserves the no-Engine-diff claim for the dispatch layer.

---

### `web/lib/automations/sales-email/lookups/*.ts` (NXT lookups) — NEW

**Analog (transport):** `web/lib/automations/nxt-zapier/nxt-client.ts` — `nxtRequest(env, method, path, body)` + existing helpers `searchCustomers` (line 161), `listSites` (line 173), `searchItems` (line 185). Map directly to D-05 (offerte/order/Sites).

**Analog (identifier extraction):** `web/lib/automations/debtor-email/extract-invoices.ts`:
```typescript
const INVOICE_PATTERN = /\b(17|25|30|32|33)\d{6}\b/g;   // regex-over-subject+body pattern
export function extractInvoiceCandidates(subject, body): InvoiceExtract { /* matchAll subject + body */ }
```
Pattern reference for offerte/order number extraction. **V5 input-validation (Security):** validate identifier format (regex) BEFORE the NXT lookup — email body is untrusted (crafted-identifier injection threat).

**Analog (reused, D-11):** `web/lib/automations/debtor-email/nxt-zap-client.ts` — `lookupSenderToAccount` (line 396), `lookupIdentifierToAccount` (factuur, line 399), `lookupCandidateDetails` (line 402). Reuse as-is for sender_match + factuurnummer (no forced migration of working Zapier-SQL lookups).

**Transport rule (D-10):** NEW lookups (offerte/order/Sites) → `nxtRequest` REST proxy (one auth path, no new Zap per kind). NXT reads via prod = POST + `allowWrite:true` (NXT does reads over POST). Prereq: PR #63 prod-deployed.

---

### `supabase/migrations/<ts>_generic_resolution_audit.sql` (D-12 audit table) — NEW

**Analog:** `supabase/migrations/_template.sql` — copy verbatim, the mandatory RLS pattern:
```sql
CREATE TABLE IF NOT EXISTS <schema>.resolution_audit ( ... swarm_type, email_id, method, customer_account_id, ... );
ALTER TABLE <schema>.resolution_audit ENABLE ROW LEVEL SECURITY;       -- mandatory
DROP POLICY IF EXISTS resolution_audit_service_all ON <schema>.resolution_audit;
CREATE POLICY resolution_audit_service_all ON <schema>.resolution_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);              -- minimum
-- UI-visible? add FOR SELECT TO authenticated USING (...)
```
**Constraints (CLAUDE.md + RESEARCH):**
- Swarm-AGNOSTIC table (NOT a mirror of `debtor.email_labels`). Every future swarm reuses it.
- Schema placement: RESEARCH recommends `email_pipeline` (alongside `emails`, PostgREST-exposed). Planner discretion (D-12).
- NEVER `TO anon`/`TO public` with `USING(true)`.
- Ships migration + RLS + `npm run codegen` **atomically** — but only run codegen IF a closed-enum/literal-union column is added (`resolution_config` itself is free-form, no codegen). `check:supabase` must pass (pre-push hook).

---

### `supabase/migrations/<ts>_sales_resolution_config.sql` (config seed) — NEW (edit)

**Analog:** donor `config.ts` `ResolutionConfig` shape + the inert placeholder in `20260603_sales_swarm_full_funnel_enrichment.sql`.

- The `resolution_config` column ALREADY EXISTS live (added `ADD COLUMN IF NOT EXISTS`). Do NOT cherry-pick the donor's `20260601a` column-add migration (superseded).
- UPDATE the sales row's `resolution_config` from `{status:'inert_placeholder', activates_in_phase:114}` to the real `ResolutionConfig` shape. Replace ONCE, correctly (anti-pattern: throwaway schema-binding migration).
- The `stage2_entity_resolver` path value (`@/lib/automations/sales-email/resolve-customer`) is already what the new module registers as — leave it.

---

### `web/lib/inngest/functions/stage-2-customer-resolver.ts` (D-03 — OPTIONAL rewire)

**Analog:** itself (this workspace) + the donor rewire diff (`803eee0d`).

**Current (this workspace):** statically imports `resolveDebtor`, writes `debtor.email_labels`, gates on `stage_3_labeling`, emits `debtor-email/coordinator.requested` for BOTH resolved + unresolved paths (STAGE2-02 fall-through is existing behaviour).

**Donor rewire (the D-03 "full rewire" option):**
```typescript
const swarm = await loadSwarm(admin, swarm_type ?? "debtor-email");
const resolverPath = swarm?.stage2_entity_resolver ?? null;
const resolutionConfig = swarm?.resolution_config ?? null;
if (!nxtDatabase || !resolverPath || !resolutionConfig) {
  result = await runThreadInheritanceOnly({ /* Router shape / no-NXT */ });
} else {
  const resolver = await loadStage2Resolver(resolverPath);
  const args = { /* ... */, body_text: selectResolverBody({ source, body_full_text, body_text }) };
  result = await resolver.resolveEntity(args, resolutionConfig);
}
```
**D-03 default = dormant** (debtor keeps static import; sales is first dispatch consumer). BUT the worker must read the registry path for the SALES swarm regardless, so sales can dispatch at all. The real dormant-vs-rewire choice is "does the DEBTOR row also flip to dispatch in this PR" — default no. **IF full rewire chosen:** the 90-06 equality dry-run harness (`port-equivalence.test.ts`, commit `c2c9d3cf`) + a debtor regression gate are MANDATORY in the same PR.

**Replay-safety reminders (CLAUDE.md):** non-deterministic DB keys inside `step.run`; NEVER destructure `inngest.send` — use the `(inngest.send as unknown as SendFn)({...})` cast pattern already in the worker (line 315).

**Event naming (Pitfall 6):** sales needs its own Stage 2 request event under the Phase 88.1 stage-named convention; classifier-verdict-worker must emit it for `sales-email`. Confirm wildcard-listener vs per-swarm registration (Stage 3 dispatcher uses wildcard `*/predicted` precedent).

---

### `web/lib/pipeline-gating/dry-run-gate/index.ts` (`stage_2_resolution` key) — MODIFY

**Analog:** itself. RESEARCH Pitfall 5 + OQ-4 recommend adding a `stage_2_resolution` key rather than overloading `stage_3_labeling`.

Extend three places in lockstep:
```typescript
export interface DryRunConfig {
  stage_1_archive?: boolean;
  stage_1_cleanup?: boolean;
  stage_2_resolution?: boolean;   // ADD
  stage_3_labeling?: boolean;
  stage_4_handlers?: Record<string, boolean>;
}
// + add "stage_2_resolution" to the isStageBlocked / resolveStageDryRun union literals
// + seed the flag in the sales swarm migration (sales = all-blocked / true = fail-closed)
```
Sales = all-blocked by default, so the audit write stays dry-run until cut-over. **Warning sign:** a live sales audit write with no gate read.

---

## Shared Patterns

### STAGE2-01 no-Engine-diff verification (the precise definition — Pitfall 2)
**Source:** donor `dynamic.ts` header.
**Apply to:** the CI/verification guard.
The no-Engine-diff check MUST assert **zero changes to `engine.ts` + `config.ts` + `resolve/steps/*`** (the resolution *logic*), explicitly **allowing the single `STAGE2_RESOLVER_MODULES` registration line** in `dynamic.ts`. A naive `git diff` grep over all of `web/lib/swarms/` or `web/lib/agentic-pipeline/` would wrongly FAIL on the mandatory dispatch-map line.
```
# Verification scope (correct):
git diff --exit-code -- web/lib/agentic-pipeline/resolve/engine.ts web/lib/agentic-pipeline/resolve/config.ts web/lib/agentic-pipeline/resolve/steps/
# dynamic.ts: assert ONLY the dispatch-map line added (review, not blanket grep)
```

### RLS-mandatory on every new table
**Source:** `supabase/migrations/_template.sql` + CLAUDE.md.
**Apply to:** the generic resolution audit table (D-12). ENABLE RLS + service_role policy minimum; never `TO anon USING(true)`. `npm run check:supabase` (pre-push hook) fails on `rls_disabled_in_public`.

### Registry-as-source-of-truth + no per-swarm branches
**Source:** `docs/agentic-pipeline/README.md` "designing a new swarm" + SWARM-02 static guard (since 110-01).
**Apply to:** the worker + adapter. NO `if swarm === 'sales-email'` in any shared worker. All sales behaviour is registry data (`stage2_entity_resolver`, `resolution_config`, `dry_run_config`).

### Inngest replay-safety
**Source:** CLAUDE.md Inngest rules.
**Apply to:** the worker + engine + all step modules. Side effects + non-deterministic keys inside `step.run`; NEVER nested `step.run` in `resolveEntity`; NEVER destructure `inngest.send`.

### Resolution-rate denominator correction (Pitfall 4)
**Source:** folded todo `2026-06-04-sales-ingest-sender-email-gap.md`.
**Apply to:** the corpus-mining task + any metric. 28% of rows have `sender_email = null` — report `resolved / rows_with_sender_email` with the excluded count stated. A null-sender miss is "no input," not "no NXT match."

### Stage 2 → Stage 3 context contract
**Source:** `docs/agentic-pipeline/context-shape-contract.md`.
**Apply to:** the worker's `coordinator.requested` emit. `PipelineStageContext` with `customer_id: string | null` (null is LEGAL = resolved-but-no-match), `entity_brand: 'smeba'`, `context_version: 1`. Both resolved + unresolved paths flow through (STAGE2-02 part 2 = existing behaviour).

---

## No Analog Found

None. Every file maps to a donor file (cherry-pick), an in-workspace analog, or the migration template. The only genuinely net-new *logic* is the offerte/order/Sites lookups — and even those have transport (`nxt-client.ts` `searchCustomers`/`listSites`) and extraction (`extract-invoices.ts`) analogs.

The one capability with **no existing analog and a possible engine gap** is **multi-match corroboration (D-06)** — not a "file without analog" but a design decision: ship iteration 1 precedence-only (cleanest STAGE2-01) and defer corroboration to a fast-follow that lands before the no-Engine-diff measurement, OR add a generic corroboration capability inside the enabler-PR. This is the #1 open design decision (RESEARCH OQ-1).

---

## Metadata

**Analog search scope:**
- Donor branch (read-only via `git show origin/workspace/v8.2-resolution-recall:<path>`): `web/lib/swarms/dynamic.ts`, `web/lib/agentic-pipeline/resolve/{engine,config,body-source}.ts`, `resolve/__tests__/self-auth-noop.test.ts`, `resolve/steps/*`
- This workspace: `web/lib/inngest/functions/stage-2-customer-resolver.ts`, `web/lib/automations/nxt-zapier/nxt-client.ts`, `web/lib/automations/debtor-email/{nxt-zap-client,extract-invoices}.ts`, `web/lib/pipeline-gating/dry-run-gate/index.ts`, `web/lib/swarms/registry.ts`, `supabase/migrations/_template.sql`
- Architecture: `docs/agentic-pipeline/README.md`, `context-shape-contract.md` (cited via RESEARCH)

**Files scanned:** ~14
**Pattern extraction date:** 2026-06-04
