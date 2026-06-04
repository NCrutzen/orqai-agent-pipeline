---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
verified: 2026-06-04T18:33:00Z
status: passed
score: 3/3 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/3
  gaps_closed:
    - "Sales Stage 2 resolves customers via the RESL-03 seam with zero Engine code changes (STAGE2-01) — CR-01 (brand_id always null) and CR-02 (entity_brand object-shape corruption) both closed by plans 114-06 and 114-07"
  gaps_remaining: []
  regressions: []
---

# Phase 114: Stage 2 Resolver Reuse — Verification Report (Re-verification)

**Phase Goal:** Sales Stage 2 resolves customers by reusing the v8.2 NXT resolver via per-swarm config with zero Engine code changes; the debtor-only self-auth tier degrades to a no-op for sales.
**Verified:** 2026-06-04T18:33:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plans 114-06 and 114-07, commits a56cce82, 88bde9f0, d2af4442, 11f71fef)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Sales Stage 2 resolves customers via the RESL-03 seam with zero Engine code changes (STAGE2-01) | VERIFIED | `effectiveBrandId` derived from `resolutionConfig.scope.brand_scope[0]` at worker line 152-155; passed to `resolveEntity` at line 233 — `sender_match` and `factuur_match` are reachable. `entity_brand` type-guarded at lines 178-186 (string passthrough / object→.code / else null). `no-engine-diff-check.sh` exits 0 — engine/config/steps byte-identical to donor. Worker test suite: 23/23 passed (including 3 new gap-closure tests A/B/C). |
| SC-2 | Self-auth tier degrades to a no-op for sales (STAGE2-02), verified by designed acceptance test | VERIFIED | `self-auth-noop-sales.test.ts` passes; `auto_safe_kinds:[]` confirmed in the sales config. |
| SC-3 | Customer-less prospects fall through to Stage 3 without blocking (STAGE2-02) | VERIFIED | `unresolved-fallthrough.test.ts` passes; `method:"unresolved"`, `customer_account_id:null` path works. |

**Score:** 3/3 truths verified

### Deferred Items

None. The D-06 corroboration fast-follow (medium-confidence postcode promotion) is tracked in `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` but is not a phase requirement — it is an intentional deferral noted in the gap-closure plans themselves.

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/lib/swarms/dynamic.ts` | Sales entry in `STAGE2_RESOLVER_MODULES` | VERIFIED | `@/lib/automations/sales-email/resolve-customer` registered |
| `web/lib/agentic-pipeline/resolve/engine.ts` | Byte-identical to donor (STAGE2-01) | VERIFIED | `no-engine-diff-check.sh` exit 0 — IDENTICAL |
| `web/lib/agentic-pipeline/resolve/config.ts` | Byte-identical to donor | VERIFIED | `no-engine-diff-check.sh` exit 0 — IDENTICAL |
| `web/lib/automations/debtor-email/resolve-debtor.ts` | Delegates to `resolveEntity` with `debtorP0Config` | VERIFIED | `resolveEntity(args, debtorP0Config)` delegation present |
| `web/lib/automations/sales-email/resolve-customer.ts` | Sales adapter with hardened sender/postcode/order extraction | VERIFIED | `QUOTED_HEADER_RE` scoped sender at lines 84-111; `seenIdentifiers` pushed at extraction time (lines 214, 221, 228, 238); single merged nxt-zap-client import |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` | Generic-path brand_id + nxt_database from config; entity_brand type-guarded | VERIFIED | `effectiveBrandId` from `brand_scope[0]` (lines 152-155); `effectiveNxtDatabase` config-sourced (lines 163-167); entity_brand guard (lines 178-186); blind `[0] as string` cast removed (count=0 confirmed) |
| `web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts` | 23 tests including 3 gap-closure tests (A/B/C) | VERIFIED | 23/23 passed |
| `web/lib/automations/sales-email/lookups/order.ts` | `ORDER_GENERIC` word-boundary anchored | VERIFIED | `/\border[a-z]*\s*[:#]?\s*(\d{4,8})/gi` at line 19 |
| `web/lib/automations/sales-email/lookups/sites.ts` | Postcode gated to address context; confidence:"medium" | VERIFIED | `hasAddressContext` gate at lines 27-53; `confidence:"medium"` at line 94 |
| `web/lib/automations/sales-email/__tests__/resolve-customer.test.ts` | 14 tests including negative-case, quoted-header, identifier-trail tests | VERIFIED | 14/14 passed |
| `web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts` | STAGE2-02 self-auth no-op acceptance test | VERIFIED | `auto_safe_kinds:[]` present; passes |
| `web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts` | STAGE2-02 fall-through test | VERIFIED | exists; passes |
| `supabase/migrations/20260604_generic_resolution_audit.sql` | RLS enabled; service_role policy | VERIFIED | RLS enabled; no anon/public |
| `supabase/migrations/20260604b_sales_resolution_config.sql` | Sales config with `auto_safe_kinds`, `stage_2_resolution=true` | VERIFIED | `auto_safe_kinds` present; `stage_2_resolution=true`; swarm_dispatch event seeded |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` | `stage_2_resolution` in DryRunConfig | VERIFIED | present in DryRunConfig + both unions |
| `scripts/no-engine-diff-check.sh` | Executable; references engine.ts | VERIFIED | exists, executable, references engine.ts; exit 0 |
| `.planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md` | D-02 rebase note | VERIFIED | present |
| `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` | D-06 tripwire | VERIFIED | present |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `resolve-debtor.ts` | `engine.ts` | `resolveEntity(args, debtorP0Config)` | VERIFIED | Pattern present; debtor path unchanged |
| `dynamic.ts` | `resolve-customer.ts` | `STAGE2_RESOLVER_MODULES` dispatch entry | VERIFIED | `automations/sales-email/resolve-customer` registered |
| `stage-2-customer-resolver.ts` → `effectiveBrandId` | `resolveEntity` | `resolutionConfig.scope.brand_scope[0]` on generic path | VERIFIED | Lines 152-155 + line 233; worker Test A asserts `brand_id === 'SB'` |
| `stage-2-customer-resolver.ts` → `entityBrand` | `resolution_audit.entity_brand` + `coordinator.requested` | type guard: string passthrough, object→.code | VERIFIED | Lines 178-186 → lines 299, 387-388; worker Tests B/C assert scalar 'SB' for both shapes |
| `resolve-customer.ts` → `extractQuotedSender` | `sender_match` | `QUOTED_HEADER_RE` context window | VERIFIED | Lines 84-111; quoted-header test passes; no-header → null |
| `seenIdentifiers` | `unresolved()` fall-through | pushed at extraction time before account lookup | VERIFIED | Lines 214, 221, 228, 238; identifier-trail test passes |
| `resolve-customer.ts` | `nxt-zap-client` | single merged import | VERIFIED | `grep -c` returns 1 |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `resolve-customer.ts` (sender_match step) | `args.brand_id` | `stage-2-customer-resolver.ts` → `resolutionConfig.scope.brand_scope[0]` | Yes — `'SB'` for sales, sourced from the seeded config | FLOWING (CR-01 closed) |
| `resolve-customer.ts` (factuur_match step) | `args.brand_id` | Same as above | Yes — `'SB'` for sales | FLOWING (CR-01 closed) |
| `resolution_audit.entity_brand` | `entityBrand` | Type-guarded normalization: string passthrough / object→`.code` | Yes — scalar brand code, never `"[object Object]"` | FLOWING (CR-02 closed) |
| `resolve-customer.ts` (postcode step) | postcode candidates | `extractPostcodeCandidates` gated by `hasAddressContext` | Yes — address-context-restricted; confidence downgraded to "medium" | FLOWING (WR-02 fixed) |
| `resolve-customer.ts` (unresolved path) | `seenIdentifiers` | Pushed at extraction time before account lookup per step | Yes — non-empty when identifiers were attempted | FLOWING (WR-04 fixed) |
| `stage-2-customer-resolver.ts` → `effectiveNxtDatabase` | `resolutionConfig.source.nxt_database` with `"nxt"` fallback | Config-sourced first; documented single-handle fallback | Config-sourced (data does not yet exercise the path — see WR-A in REVIEW.md) | FLOWING (structurally correct; WR-A is an INFO-level residual, not a blocker) |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — sales Stage 2 resolution is fail-closed (`stage_2_resolution=true` dry-run gate); no live execution path is safe to spot-check without running the Inngest worker against a live event. All behaviors are covered by targeted vitest suites (23/23 worker tests, 14/14 adapter tests, 3/3 acceptance tests).

---

## Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/no-engine-diff-check.sh` | `bash scripts/no-engine-diff-check.sh` | exit 0; engine/config/steps IDENTICAL; dynamic.ts SCOPED-OK | PASS |

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STAGE2-01 | 114-01, 114-02, 114-04, 114-05, 114-06, 114-07 | Sales Stage 2 resolves via RESL-03 seam with zero Engine code changes | SATISFIED | Seam structure correct; `effectiveBrandId` from config makes `sender_match`+`factuur_match` reachable; `entity_brand` type-guarded; `no-engine-diff-check.sh` exit 0; 23/23 worker tests (incl. 3 new gap-closure tests); 14/14 adapter tests |
| STAGE2-02 | 114-01, 114-04, 114-05 | Self-auth tier no-op for sales; customer-less prospects fall through to Stage 3 | SATISFIED | `self-auth-noop-sales.test.ts` passes; `auto_safe_kinds:[]` confirmed; `unresolved-fallthrough.test.ts` passes |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `stage-2-customer-resolver.ts` | 163-168 | `nxt_database` falls to literal `"nxt"` at runtime (seed has no `nxt_database` key) | WARNING | Code is structurally config-sourced (WR-01 fix correct); runtime still uses the literal because the seed omits the key. Two reused debtor lookups are exposed to silent no-matches if `"nxt"` is wrong for SB. REVIEW.md WR-A. Stage is dry-run; no blast radius until go-live. Not a phase requirement gap. |
| `resolve-customer.ts` (postcode step) | 223 | `confidence:"medium"` is cosmetic — medium hit still short-circuits the loop | WARNING | A spurious-but-context-passing postcode resolves to a (possibly wrong) account and skips higher-precision steps. D-06 corroboration is the proper engine-level fix; intentionally deferred. Stage is dry-run. REVIEW.md WR-B. |
| `resolve-customer.ts` | 158, 214-236 | `seenIdentifiers` ordering reflects precedence order, not document order; sender attempt not in `matched_identifiers` | WARNING | Operator triaging the audit row may be misled about which identifier was primary. Secondary surface — `trace.steps` still captures step status. REVIEW.md WR-C. |

No `TBD`, `FIXME`, or `XXX` markers were found in phase-modified files. The three warnings above are residual robustness gaps acknowledged in the phase gap-closure plans as D-06 fast-follow territory; none block the phase goal.

---

## Human Verification Required

None. All must-haves are programmatically verifiable and confirmed by the test suites and probe. No visual, real-time, or external-service checks are required to confirm phase goal achievement.

---

## Gaps Summary

No gaps. Both prior blockers (CR-01 dead brand_id, CR-02 entity_brand corruption) are confirmed closed in the live codebase:

- **CR-01 closed:** `effectiveBrandId` is derived from `resolutionConfig.scope.brand_scope[0]` (`'SB'`) on the generic path (worker lines 152-155) and passed to `resolveEntity` (line 233). Worker Test A (`stage-2-customer-resolver.test.ts:1207-1217`) asserts `args.brand_id === 'SB'`. `sender_match` and `factuur_match` are reachable.

- **CR-02 closed:** The blind `[0] as string` cast is gone (count=0 confirmed). Lines 178-186 normalize the first element: `string` passthrough, object → `.code`, else `null`. Worker Tests B/C assert scalar `'SB'` for both shapes and would catch a regression to `"[object Object]"`.

Three residual WARNINGs from the re-review (WR-A / WR-B / WR-C) are robustness improvements intentionally deferred to D-06 and do not affect the phase goal. The stage is dry-run (`stage_2_resolution=true`), containing all blast radius until cut-over.

SC-1, SC-2, and SC-3 are all VERIFIED. Phase goal achieved.

---

_Verified: 2026-06-04T18:33:00Z_
_Verifier: Claude (gsd-verifier)_
_Re-verification: Yes — after gap closure plans 114-06 and 114-07_
