# Phase 120: D-06 multi-signal corroboration engine (generic, cross-swarm) - Pattern Map

**Mapped:** 2026-06-16
**Files analyzed:** 10 (1 new module, 1 new test cluster, 5 modified TS, 2 new migrations, 1 script re-baseline)
**Analogs found:** 10 / 10 (every file has a strong in-repo analog — this is a pure-internal change, zero external research)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `web/lib/agentic-pipeline/resolve/corroborate.ts` **(NEW)** | utility (pure scoring helper) | transform (candidate array → scored ResolveResult) | `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` (`runNumberBackSearchAuto` — pure, deterministic, groups candidates, fail-closed) | role-match (pure deterministic candidate scorer; closest existing peer) |
| `web/lib/agentic-pipeline/resolve/engine.ts` **(MOD)** | service (precedence runner) | request-response | itself (the existing `resolveEntity` loop — modify in place; absent-corroboration branch stays byte-identical) | exact (self) |
| `web/lib/agentic-pipeline/resolve/config.ts` **(MOD)** | config (jsonb TS mirror) | — | itself (existing `ResolutionConfig` / sub-interfaces `ResolutionScope`, `ResolutionSource`) | exact (self) |
| `web/lib/automations/sales-email/resolve-customer.ts` **(MOD)** | service (sales adapter, own loop) | request-response | itself + `engine.ts` collect branch (adopts the same `scoreCorroboration` helper) | exact (self) |
| `web/lib/automations/sales-email/lookups/offerte.ts` **(MOD)** | utility (identifier→account lookup) | request-response | `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` (`runNumberBackSearchAuto` — `lookupResolveCandidates` back-search) | role-match (REST→SQL transport switch) |
| `web/lib/automations/sales-email/lookups/order.ts` **(MOD)** | utility (identifier→account lookup) | request-response | same as offerte.ts | role-match |
| `web/lib/automations/sales-email/lookups/sites.ts` **(MOD)** | utility (postcode→Site→account) | request-response | same as offerte.ts | role-match |
| `supabase/migrations/2026XXXX_debtor_corroboration_optin.sql` **(NEW)** | migration (jsonb re-seed) | batch | `supabase/migrations/20260601a_resolution_config_column.sql` (debtor UPDATE seed) | exact |
| `supabase/migrations/2026XXXX_sales_corroboration_and_sql.sql` **(NEW)** | migration (jsonb re-seed + transport) | batch | `supabase/migrations/20260604b_sales_resolution_config.sql` (sales UPDATE seed) | exact |
| `scripts/no-engine-diff-check.sh` **(MOD — re-baseline only)** | config (CI guard) | — | itself (env override `NO_ENGINE_DIFF_BASELINE`, line 34; donor default line 34) | exact (self) |
| `web/lib/automations/debtor-email/resolve-debtor.ts` **(MOD — `debtorP0Config` constant)** | config (kill-switch mirror) | — | itself (the `debtorP0Config` literal, lines 63-80) | exact (self) |
| `web/lib/agentic-pipeline/resolve/__tests__/corroboration-*.test.ts` **(NEW)** | test | — | `web/lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts`, `precedence-inversion.test.ts`, `self-auth-noop.test.ts` | role-match |

## Pattern Assignments

### `web/lib/agentic-pipeline/resolve/corroborate.ts` (NEW — pure scoring helper)

**Analog:** `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` `runNumberBackSearchAuto` (lines 180-287). This is the closest existing peer: a PURE, deterministic function that consumes `ResolveCandidateMatch[]`, groups/dedupes by a rollup id, applies a fail-closed gate, and emits a `ResolveResult`. The new helper does the same shape of work over the *collected* candidate set.

**Type-import + Confidence enum pattern** (from `engine.ts` lines 61-71 and `identifier-match.ts` lines 19-31). Import the LOCKED contract types from `../engine`; never re-declare them:
```typescript
import type { ResolveArgs, ResolveResult, ResolveMethod, Confidence, Candidate } from "./engine";
import type { CorroborationConfig } from "./config";
```

**Grouping + distinct-key pattern to copy** — the analog dedupes by `root_party_id ?? party_id` over a `Set` (identifier-match.ts:238-239):
```typescript
const rootOf = (m: ResolveCandidateMatch) => m.root_party_id ?? m.party_id;
const distinctRoots = Array.from(new Set(inScope.map(rootOf)));
if (distinctRoots.length !== 1) { /* fail closed → SUGGEST */ }
```
The corroboration helper mirrors this but on the **independence axis** = distinct `identifier_kind` per `customer_account_id` group (D-05). Implement `distinctKinds(signals) = new Set(signals.map(s => s.identifier_kind))`.

**Status gate to KEEP respecting** (identifier-match.ts:230-232 — D-07/CORR-03 AUTO must still honor it):
```typescript
import { isAutoEligibleStatus } from "./steps/auto-gate";
const inScope = res.matches.filter(
  (m) => eligible.has(m.identifier_kind) && isAutoEligibleStatus(m.status),
);
```

**Fail-closed determinism (D-03 — NO LLM in collect path):** every ambiguity branch in the analog returns a null/SUGGEST result, never escalates. Copy that discipline — `scoreCorroboration` returns a demoted `ResolveResult` (confidence `medium`/`low`), never calls `llmTiebreak`.

**`capBelowAuto` helper (D-06/D-07):** confidence is the enum (`engine.ts:71`), not numeric. `capBelowAuto(c) = c === "high" ? "medium" : c`. Demote = emit `medium`, never mutate a threshold.

**Replay-safety (CLAUDE.md Inngest rule, restated in engine.ts:22-24):** pure function, no nested `step.run`, no `Date.now()`/`crypto.randomUUID()`. The helper takes already-fetched candidates as an argument.

---

### `web/lib/agentic-pipeline/resolve/engine.ts` (MOD — config-gated collect branch)

**Analog:** itself. The existing `resolveEntity` loop (lines 191-223) is the absent-corroboration path and MUST stay byte-reachable so the D-10 donor re-baseline diff is auditable.

**Existing short-circuit loop (lines 191-223) — the no-corr path, keep verbatim:**
```typescript
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

**Pattern to add — early config-presence guard (CORR-04 gate is config DATA, not swarm name):**
```typescript
if (!config.corroboration) {
  // ── BYTE-IDENTICAL to today (no-engine-diff for non-opted-in swarms) ──
  for (const stepName of config.precedence) { /* …unchanged loop above… */ }
  return { method: "unresolved", /* …unchanged unresolved fallback (lines 227-237)… */ };
}
// ── Corroboration path: collect every step's hit (NO short-circuit), then score ──
```

**`EngineConfig` widening (lines 40-57)** — add `corroboration` to the optional Pick, mirroring how `scope`/`auto_safe_kinds`/`llm_tiebreaker` are threaded optionally:
```typescript
export type EngineConfig = Pick<ResolutionConfig, "precedence"> &
  Partial<Pick<ResolutionConfig, "auto_safe_kinds" | "llm_tiebreaker" | "corroboration">> & { scope?: { … } };
```

**Unresolved fallback to reuse (lines 227-237)** — the canonical zero-hit `ResolveResult`; both paths return it on no signal.

---

### `web/lib/agentic-pipeline/resolve/config.ts` (MOD — add `CorroborationConfig`)

**Analog:** itself — the existing sub-interface pattern (`ResolutionSource` :19-30, `ResolutionScope` :37-61, `ResolutionBlocklistRef` :67-72) each documented with the D-ref and "free-form jsonb, no codegen" discipline (header lines 8-11).

**Field-doc + free-form-jsonb pattern to copy** (note the explicit "edit by hand, NOT generated" header, lines 8-11):
```typescript
/** Phase 120 (D-06) — opt-in corroboration. ABSENT = today's short-circuit. */
export interface CorroborationConfig {
  /** D-05: distinct identifier_kind count required to BOOST. Default 2. */
  min_signals: number;
  /** D-04: target tier set on agreement. Default "high". */
  boost: "high" | "medium";
  /** D-07: kinds that may stay native when LONE. Absent → fall back to auto_safe_kinds. */
  auto_safe_alone_kinds?: string[];
}
```
Append `corroboration?: CorroborationConfig;` to `ResolutionConfig` (after line 119, mirroring the optional-field convention). No `*.generated.ts` — this jsonb is explicitly NOT codegen'd (config.ts:8-11).

---

### `web/lib/automations/sales-email/resolve-customer.ts` (MOD — collect-then-score when corroboration present)

**Analog:** itself + the engine collect branch. The SWARM-02 constraint (CORR-04): the sales adapter runs its OWN `for (const step of config.precedence) switch {…}` loop (lines 160-286) and does NOT call engine steps. Resolution = accumulate per-`case` hits into the SAME swarm-agnostic `CorroborationSignal[]` and call the SAME `scoreCorroboration` helper — no `if swarm==='sales'` branch; the gate is `if (config.corroboration)`.

**Existing per-case short-circuit (the no-corr path — lines 210-218 offerte case):**
```typescript
case "offerte_match": {
  seenIdentifiers.push(...extractOfferteCandidates(subject, body));
  const hit = await lookupOfferteToAccount(NXT_ENV, subject, body);
  if (hit) return identifierResult(hit, dedupe(seenIdentifiers));  // ← short-circuit
  break;
}
```

**Pattern to add:** when `config.corroboration` present, replace `if (hit) return …` with `if (hit) collected.push(toSignal(hit, "offerte_match"))` (no return), then after the loop `return scoreCorroboration(collected, args, config, dedupe(seenIdentifiers))`. The `identifierResult` mapper (lines 306-337) and `unresolved` builder (lines 113-129) stay the no-corr-path result builders.

**Per-lookup `confidence` already present** (lines 311-322 `identifierResult`, `confidence?: "high"|"medium"|"low"`) — feed it into the `CorroborationSignal.confidence` so D-07 lone-signal capping reads the native tier (postcode→Site already self-downgrades to `medium`).

---

### `web/lib/automations/sales-email/lookups/{offerte,order,sites}.ts` (MOD — REST→SQL back-search, D-09)

**Analog:** `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` `runNumberBackSearchAuto` (lines 180-263) — the `lookupResolveCandidates` back-search. This is the LOCKED transport (`docs/agentic-pipeline/stage-2-entity.md` §Resolution Transport Rule, 2026-06-15): resolve identifiers via the SQL `resolver_index` substrate, NEVER REST.

**Current REST call to REPLACE (offerte.ts lines 72-84) — DELETE this transport:**
```typescript
const res = await nxtRequest(env, "POST", "/api/quotes/search", { searchTerm: offerteNumber });
const match = pickMatchingCustomer(res?.data, offerteNumber);   // ← REST; spike-011 512887 false-positive
```

**Back-search pattern to copy (identifier-match.ts lines 191-205) — the one-call substrate that returns the WHOLE candidate set with `identifier_kind` + `is_unique_in_scope` + `party_id`:**
```typescript
import { lookupResolveCandidates, type ResolveCandidateMatch } from "@/lib/automations/debtor-email/nxt-zap-client";
const res = await lookupResolveCandidates(
  { nxt_database: …, brand_id: …, environment_id: "BX", identifiers, brand_scope: ["SB"] },
  "unknown",
).catch((err) => { console.warn(…); return { matches: [] as ResolveCandidateMatch[] }; });
```

**Normalization (D-09):** normalize offerte `SB014098` → bare digits `14098`, `scope_key='SB'`, prefer `is_unique_in_scope === true` (verified example: `SB014098`→`14098`→`BX228895` Bever B.V.). The existing `extractOfferteCandidates` regex normalize (offerte.ts:44-47, `.replace(/\s+/g,"").toUpperCase()`) is the extraction half; add the bare-digit strip before the lookup.

**Output shape** — keep returning `SalesCustomerMatch` (offerte.ts:22-33) so the adapter's `identifierResult` mapper is unchanged; the SQL row's `party_id`/`party_name`/`identifier_kind` map onto `customer_account_id`/`customer_name`/(new) signal kind.

**Do NOT delete NXT REST infra (D-09):** `nxtRequest` stays (order-entry writes, UI lookups, operator manual widget). Only these three auto-resolution lookups switch. `_match.ts` `pickMatchingCustomer` becomes dead for these three paths but stays harmless (no delete — it's a fail-closed guard, may serve other callers).

---

### `supabase/migrations/2026XXXX_debtor_corroboration_optin.sql` (NEW)

**Analog:** `supabase/migrations/20260601a_resolution_config_column.sql` (lines 41-50 — the debtor UPDATE seed). The column already exists; this is an `UPDATE public.swarms … WHERE swarm_type='debtor-email'` only (no new table, no RLS policy — `public.swarms` is RLS-enabled, existing policies cover all columns; header lines 8-10 state this verbatim).

**UPDATE-seed pattern to copy (20260601a lines 41-50):**
```sql
UPDATE public.swarms SET resolution_config = '{ …existing P0 config… }'::jsonb
WHERE swarm_type = 'debtor-email';
```
Add the `"corroboration": {"min_signals":2,"boost":"high"}` key into the existing debtor jsonb. **Lockstep requirement (Runtime State Inventory):** the same key must be added to the in-code `debtorP0Config` constant (`resolve-debtor.ts:63-80`) in the SAME plan task — the constant is the kill-switch mirror and must not diverge from the live row.

**RLS / advisor note:** UPDATE-only on existing RLS table → `npm run check:supabase` stays green (no new table). Use `BEGIN;…COMMIT;` transaction wrapper (both seed analogs do).

---

### `supabase/migrations/2026XXXX_sales_corroboration_and_sql.sql` (NEW)

**Analog:** `supabase/migrations/20260604b_sales_resolution_config.sql` (lines 42-97 — `jsonb_build_object` UPDATE + the multi-statement `BEGIN…COMMIT`). This seed both adds `corroboration` AND switches the transport seam.

**`jsonb_build_object` UPDATE pattern to copy (20260604b lines 45-77):**
```sql
UPDATE public.swarms SET resolution_config = jsonb_build_object(
  'version', '2026-06-XX.v1',
  'source', jsonb_build_object('kind','nxt','resolver_tool_id', …, 'fallback','live_nxt_views'),
  …
  'corroboration', jsonb_build_object('min_signals', 2, 'boost', 'high'),
  'llm_tiebreaker', false
), updated_at = now() WHERE swarm_type = 'sales-email';
```

**Transport switch (D-09, obsoletes the 20260604b comment):** change `source.resolver_tool_id` from `'nxt.rest_proxy'` (20260604b:51) to `'nxt.resolve_candidates'` (the SQL substrate tool). Verify the `nxt.resolve_candidates` `zapier_tools` row's `allowed_for_intents` admits sales (env=BX, brand_scope=['SB']) — may be a one-row registry UPDATE, NOT a new Zap (research A2).

**Keep the dry-run gate + dispatch-event statements** (20260604b lines 79-95) untouched unless cut-over flips them.

---

### `scripts/no-engine-diff-check.sh` (MOD — D-10 donor re-baseline only)

**Analog:** itself. The script is correct as-written; only the donor baseline changes. The env override seam already exists (line 34):
```bash
DONOR="${NO_ENGINE_DIFF_BASELINE:-origin/workspace/v8.2-resolution-recall}"
```

**Re-baseline pattern (D-10):** this is the LAST plan task. Sequence (Pitfall 1): land ALL engine/config/sales edits → commit → re-point `DONOR` default (line 34) to the post-120 commit → re-run. The new `corroborate.ts` is a `resolve/` SIBLING (not under `steps/`), so the `LOGIC_FILES` glob (lines 41-49: `engine.ts`, `config.ts`, `steps/*`) does NOT auto-match it — the re-baseline commit simply must CONTAIN it so the guard compares like-for-like. Running the guard mid-phase against the OLD donor WILL (correctly) fail — that is expected, not a regression.

---

### `web/lib/agentic-pipeline/resolve/__tests__/corroboration-*.test.ts` (NEW)

**Analog:** existing tests in the same dir — `port-equivalence.test.ts` (asserts no-corr swarm unchanged — MUST stay green, CORR-04), `precedence-inversion.test.ts` (the live inverted precedence — MUST stay green, Pitfall 4), `self-auth-noop.test.ts` (config-presence-gated step no-op — the direct shape analog for "corroboration absent → behavior unchanged").

**Required new tests (RESEARCH §Test Map / Wave 0):**
- `corroboration-collect.test.ts` (CORR-01 — collects ALL steps, no short-circuit)
- `corroboration-boost.test.ts` (CORR-02 — ≥2 distinct kinds agree → `high`)
- `corroboration-demote.test.ts` (CORR-02 — ≥2 distinct kinds disagree → precedence winner, capped `medium`; the 4 confident-wrong rows)
- `corroboration-lone-signal.test.ts` (CORR-03 — lone sender/domain caps; lone `invoice_no` STAYS `high` — Pitfall 5 non-regression)
- `web/lib/automations/sales-email/__tests__/corroboration-sales.test.ts` (CORR-04 SWARM-02 — sales uses the SAME helper)
- `web/lib/automations/sales-email/lookups/__tests__/{offerte,order,sites}-backsearch.test.ts` (D-09 — assert NO `nxtRequest` import; assert `lookupResolveCandidates` used). Existing `match.test.ts` stays.

**Mock pattern:** the resolve tests mock `@/lib/supabase/admin` + `@/lib/automations/debtor-email/nxt-zap-client` (per identifier-match's import surface). Run: `cd web && npx vitest run lib/agentic-pipeline/resolve lib/automations/sales-email`.

## Shared Patterns

### Confidence enum (NOT numeric) — boost/demote semantics
**Source:** `web/lib/agentic-pipeline/resolve/engine.ts:71`
**Apply to:** `corroborate.ts`, both adapter collect paths, all corroboration tests.
```typescript
export type Confidence = "high" | "medium" | "low" | "none";
```
Boost (D-04) = SET to `boost` tier (`high`). Demote (D-06/D-07) = `capBelowAuto(c) = c === "high" ? "medium" : c`. NEVER mutate a numeric threshold (Anti-pattern, RESEARCH §Anti-Patterns).

### One-call candidate substrate (the corroboration data source)
**Source:** `web/lib/automations/debtor-email/nxt-zap-client.ts:514` (`lookupResolveCandidates`) + `:179-197` (`ResolveCandidateMatchSchema`).
**Apply to:** sales lookups (D-09 back-search) and the engine collect path.
The schema row carries the independence axis (`identifier_kind`), the rollup target (`root_party_id`), the uniqueness verdict (`is_unique_in_scope`), `scope_key`, `status`, `party_id`, `party_name`. ONE async-callback Zap returns the WHOLE set — no schema change needed for corroboration math.

### AUTO-eligibility status gate (must keep respecting)
**Source:** `web/lib/agentic-pipeline/resolve/steps/auto-gate.ts` `isAutoEligibleStatus()`, used at `identifier-match.ts:230-232`.
**Apply to:** `corroborate.ts` boost path — a boosted/agreeing candidate on a stopped/inactive status must NOT reach AUTO.

### Config-presence gate (NOT swarm-name) — SWARM-02 generality
**Source:** the existing `config.scope ? … : null` pattern (engine.ts:198-200) and `self-auth-noop.test.ts`.
**Apply to:** engine collect branch and sales adapter collect branch — the gate is `if (config.corroboration)`, a data check. ZERO `if swarm==='…'` branches (CORR-04).

### Migration UPDATE-seed + lockstep mirror
**Source:** `20260601a_resolution_config_column.sql:41-50` (debtor) / `20260604b_sales_resolution_config.sql:45-77` (sales).
**Apply to:** both new seeds. `BEGIN;…COMMIT;`, `UPDATE public.swarms … WHERE swarm_type=…`, no new table/policy. The debtor seed MUST move in lockstep with the `debtorP0Config` constant (`resolve-debtor.ts:63-80`).

### Fail-closed determinism (D-03 — tools-first, LLM-last-resort)
**Source:** `identifier-match.ts:180-263` (`runNumberBackSearchAuto` returns `{result:null}` on every ambiguity, never escalates) + sales `_match.ts` `pickMatchingCustomer` ("never wrong beats resolves something").
**Apply to:** `corroborate.ts` — every disagreement/lone-non-auto-safe branch demotes deterministically; NO `llmTiebreak` call in the collect path.

### Replay-safety (CLAUDE.md Inngest)
**Source:** `engine.ts:22-24` header.
**Apply to:** `corroborate.ts` and the modified adapters — pure functions, no nested `step.run`, no non-deterministic DB keys. `lookupResolveCandidates` generates its requestId internally.

## No Analog Found

None. Every file has a strong in-repo analog. The correctness-gate harness (the frozen 100-email re-run, Claude's-discretion) has a *precedent* rather than a direct analog — the `precision-dry-run`-style instrument referenced via `NXT_LOOKUP_WAIT_MS` in `nxt-zap-client.ts`; the fixture lives at `.planning/evals/2026-06-16-resolver-customer-eval/`. The planner designs the harness; it is the one build-from-precedent (not copy-from-analog) artifact.

## Metadata

**Analog search scope:** `web/lib/agentic-pipeline/resolve/` (+ `steps/`, `__tests__/`), `web/lib/automations/{debtor,sales}-email/` (+ `lookups/`, `__tests__/`), `supabase/migrations/`, `scripts/`.
**Files scanned (read in full or targeted):** engine.ts, config.ts, identifier-match.ts, resolve-customer.ts, offerte.ts, _match.ts, resolve-debtor.ts (debtorP0Config), nxt-zap-client.ts (schema + lookup sig), 20260601a + 20260604b migrations, no-engine-diff-check.sh, test directory listings.
**Pattern extraction date:** 2026-06-16
