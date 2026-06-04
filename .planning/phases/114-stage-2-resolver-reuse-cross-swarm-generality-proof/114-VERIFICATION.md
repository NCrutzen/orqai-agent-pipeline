---
phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof
verified: 2026-06-04T00:00:00Z
status: gaps_found
score: 2/3 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Sales Stage 2 resolves customers via the RESL-03 seam with zero Engine code changes (STAGE2-01)"
    status: partial
    reason: "The seam machinery exists and the no-Engine-diff guard is green, but two of the five seeded precedence steps (sender_match and factuur_match — the highest-confidence steps) are permanently dead at runtime. The worker passes brand_id: null to resolver.resolveEntity for every sales email because it reads brand_id exclusively from debtor.labeling_settings (no row exists for verkoop@smeba.nl). The sales adapter gates sender_match at resolve-customer.ts:131 and factuur_match at :208 on args.brand_id being truthy — both branches are permanently skipped. Sales resolution collapses to offerte/postcode/order only, silently defeating the data-driven precedence ordering the phase was built to prove."
    artifacts:
      - path: "web/lib/inngest/functions/stage-2-customer-resolver.ts"
        issue: "Line 126: brandId = settingsRow?.brand_id ?? null; settingsRow comes from debtor.labeling_settings where no row exists for verkoop@smeba.nl. Line 189: brand_id: brandId passed to resolver.resolveEntity — always null for sales."
      - path: "web/lib/automations/sales-email/resolve-customer.ts"
        issue: "Line 131: sender_match gated on args.brand_id — permanently skipped. Line 208 (approx): factuur_match gated on args.brand_id — permanently skipped."
    missing:
      - "Derive brand_id from resolution_config.scope.brand_scope (or entity_brand) for the generic path in stage-2-customer-resolver.ts, not from debtor.labeling_settings. The fix pattern is documented in REVIEW.md CR-01: read (resolutionConfig as { scope?: { brand_scope?: string[] } })?.scope?.brand_scope?.[0] when usesGenericPath, and pass that as effectiveBrandId to resolveEntity."
      - "Add a worker-level test asserting that for a sales Inngest event a non-null brand_id reaches resolveEntity, so sender_match is exercised."
  - truth: "entity_brand is propagated correctly to the generic audit row and Stage 3 hand-off (implicit in SC-1: 'resolves customers')"
    status: failed
    reason: "stage-2-customer-resolver.ts:144-146 reads entity_brand as [0] as string without checking the registry shape. Per types.ts:63, entity_brand is string[] | Record<string,unknown>[] | null since migration 20260505a_entity_brand_expansion.sql. If the sales row carries the post-migration object shape, entityBrand becomes an object cast to string, inserting '[object Object]' into resolution_audit.entity_brand (a text column) and emitting a malformed brand on coordinator.requested."
    artifacts:
      - path: "web/lib/inngest/functions/stage-2-customer-resolver.ts"
        issue: "Lines 144-146: (swarmGate?.entity_brand as unknown[])[0] as string — blindly assumes legacy string-array shape. If element is a BrandRegister object, the cast produces a stringified object, not a brand code."
    missing:
      - "Normalize entity_brand through the canonical brand-register loader or an explicit type check: typeof firstBrand === 'string' ? firstBrand : (firstBrand as { code?: string })?.code ?? null. See REVIEW.md CR-02 for the exact fix pattern."
      - "Add an assertion test that the emitted entity_brand is a scalar brand code, not an object."
---

# Phase 114: Stage 2 Resolver Reuse — Verification Report

**Phase Goal:** Sales Stage 2 resolves customers by reusing the v8.2 NXT resolver via per-swarm config with zero Engine code changes; the debtor-only self-auth tier degrades to a no-op for sales.
**Verified:** 2026-06-04
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC-1 | Sales Stage 2 resolves customers via the RESL-03 seam with zero Engine code changes (STAGE2-01) | PARTIAL | Seam machinery exists, no-Engine-diff guard exits 0, but brand_id is always null for sales → sender_match and factuur_match permanently dead at runtime (CR-01). Resolution silently collapses to offerte/postcode/order only. |
| SC-2 | Self-auth tier degrades to a no-op for sales (STAGE2-02), verified by designed acceptance test | VERIFIED | self-auth-noop-sales.test.ts exists, passes; auto_safe_kinds:[] confirmed in the sales config. |
| SC-3 | Customer-less prospects fall through to Stage 3 without blocking (STAGE2-02) | VERIFIED | unresolved-fallthrough.test.ts exists, passes; method:"unresolved", customer_account_id:null path works. |

**Score:** 2/3 truths verified (SC-1 partial due to CR-01 + CR-02 blocking correctness)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `web/lib/swarms/dynamic.ts` | VERIFIED | STAGE2_RESOLVER_MODULES present; sales entry `@/lib/automations/sales-email/resolve-customer` registered |
| `web/lib/agentic-pipeline/resolve/engine.ts` | VERIFIED | `export async function resolveEntity` present; donor-transplanted verbatim |
| `web/lib/agentic-pipeline/resolve/config.ts` | VERIFIED | `interface ResolutionConfig` present |
| `web/lib/automations/debtor-email/resolve-debtor.ts` | VERIFIED | `debtorP0Config` present; `resolveEntity(args, debtorP0Config)` delegation present |
| `web/lib/automations/sales-email/resolve-customer.ts` | VERIFIED (exists + wired) | `export async function resolveEntity` present; registered in dispatch map |
| `supabase/migrations/20260604_generic_resolution_audit.sql` | VERIFIED | RLS enabled; service_role policy; no anon/public |
| `supabase/migrations/20260604b_sales_resolution_config.sql` | VERIFIED | `auto_safe_kinds` present; `stage_2_resolution=true`; swarm_dispatch event seeded |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` | VERIFIED | `stage_2_resolution` in DryRunConfig + both unions |
| `scripts/no-engine-diff-check.sh` | VERIFIED | exists, executable, references engine.ts |
| `web/lib/automations/sales-email/__tests__/self-auth-noop-sales.test.ts` | VERIFIED | `auto_safe_kinds` present; STAGE2-02 test |
| `web/lib/automations/sales-email/__tests__/unresolved-fallthrough.test.ts` | VERIFIED | exists; STAGE2-02 fall-through test |
| `.planning/todos/pending/2026-06-04-v82-rebase-after-enabler-merge.md` | VERIFIED | D-02 rebase note present |
| `.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md` | VERIFIED | D-06 tripwire present (defer path taken) |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `resolve-debtor.ts` | `engine.ts` | `resolveEntity(args, debtorP0Config)` | VERIFIED | Pattern present at line confirmed by grep |
| `dynamic.ts` | `engine.ts` | imports ResolveArgs/ResolveResult types | VERIFIED | `from "@/lib/agentic-pipeline/resolve/engine"` present |
| `dynamic.ts` | `resolve-customer.ts` | static dispatch-map entry | VERIFIED | `automations/sales-email/resolve-customer` present |
| `resolve-customer.ts` | `nxt-client.ts` | nxtRequest for offerte/order/Sites | VERIFIED | nxtRequest + searchCustomers/listSites present |
| `stage-2-customer-resolver.ts` | `resolution_audit` | generic audit write for non-debtor | VERIFIED | `resolution_audit` grep hit confirmed |
| Worker → `brand_id` for sales | `resolution_config.scope.brand_scope` | should derive brand from config | NOT WIRED | Worker reads `debtor.labeling_settings.brand_id` only; no row for sales mailbox → always null |
| `entity_brand` → audit + Stage 3 | scalar brand code | `[0] as string` cast | PARTIAL | Correct only if legacy string-array shape; object shape (post-migration) produces `"[object Object]"` |

---

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `resolve-customer.ts` (sender_match step) | `args.brand_id` | `stage-2-customer-resolver.ts` → `debtor.labeling_settings` | No — always null for sales mailbox | HOLLOW — wired but data disconnected |
| `resolve-customer.ts` (factuur_match step) | `args.brand_id` | Same | No | HOLLOW — wired but data disconnected |
| `resolve-customer.ts` (offerte/order/postcode steps) | `args.nxt_database` | `settingsRow?.nxt_database ?? null` → falls back to literal `"nxt"` | Possibly — depends on whether `"nxt"` is the correct database handle | UNCERTAIN |
| `resolution_audit.entity_brand` | `entityBrand` | `swarmGate.entity_brand[0] as string` | Depends on registry shape — corrupted for object-shape rows | STATIC/CORRUPTED |

---

## Behavioral Spot-Checks

Step 7b: SKIPPED — sales Stage 2 resolution is fail-closed (`stage_2_resolution=true` dry-run); no live execution path to spot-check without running the Inngest worker against a live event.

---

## Probe Execution

Step 7c: The phase-gate command `./scripts/no-engine-diff-check.sh` was documented as having exited 0 in the Plan 05 summary. Execution context confirms the guard exists and is executable. Per verification context provided: `scripts/no-engine-diff-check.sh exit 0` — PASS.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/no-engine-diff-check.sh` | `bash scripts/no-engine-diff-check.sh` | exit 0 (per Plan 05 summary + context) | PASS |

Note: the no-Engine-diff guard passes because engine.ts/config.ts/steps/* are byte-identical to the donor baseline. This is a necessary but not sufficient condition for SC-1 — the "resolves customers" part fails due to the brand_id wiring gap (CR-01), which is a worker-layer defect outside the scope of the engine-diff check.

---

## Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| STAGE2-01 | 114-01, 114-02, 114-04, 114-05 | Sales Stage 2 resolves via RESL-03 seam with zero Engine code changes | PARTIAL | Seam structure correct; no-Engine-diff guard green; but sender_match + factuur_match permanently dead due to brand_id always null (CR-01) |
| STAGE2-02 | 114-01, 114-04, 114-05 | Self-auth tier no-op for sales; customer-less prospects fall through to Stage 3 | SATISFIED | Acceptance tests green; auto_safe_kinds:[] confirmed; unresolved fall-through tested |

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` | 88-90 | `debtor.labeling_settings` queried for sales swarm — produces null settingsRow | BLOCKER | brand_id always null for sales → sender_match + factuur_match permanently dead (CR-01) |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` | 144-146 | `(entity_brand[0] as string)` — ignores post-migration object shape | BLOCKER | audit row and Stage 3 hand-off receive `"[object Object]"` or a wrong type for non-string entity_brand shapes (CR-02) |
| `web/lib/inngest/functions/stage-2-customer-resolver.ts` | 188 | `nxtDatabase ?? "nxt"` — hardcoded fallback for generic path | WARNING | NXT database handle for sales lookups sourced from a magic string, not config (CR-01 fix should also address this) |
| `web/lib/automations/sales-email/lookups/sites.ts` | 18 | `POSTCODE = /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/g` — matches any 4-digit+2-letter token | WARNING | False-positive postcode hits can resolve wrong customer with confidence:"high"; postcode is 55% by volume (WR-02) |
| `web/lib/automations/sales-email/lookups/order.ts` | 16 | `ORDER_GENERIC` missing leading `\b` — matches mid-word | WARNING | Spurious order matches; wrong-account risk (WR-03) |

No unresolved `TBD`/`FIXME`/`XXX` debt markers were found in phase-modified files (per available grep evidence and REVIEW.md scope note that engine/steps files were excluded from review as byte-identical donor content).

---

## Human Verification Required

None. The gaps identified above are all programmatically observable in the codebase. No visual, real-time, or external-service checks are needed to confirm the blockers.

---

## Gaps Summary

**Two blockers prevent SC-1 from being achieved.** Both were identified by the code reviewer (REVIEW.md CR-01 and CR-02) prior to this verification; this report confirms they are present in the live codebase.

**Blocker 1 — brand_id always null for sales (CR-01):**
The Stage 2 worker reads `brand_id` from `debtor.labeling_settings` keyed by `source_mailbox`. For `verkoop@smeba.nl` there is no such row, so `brandId === null` at line 126 of `stage-2-customer-resolver.ts`. This null propagates to `resolver.resolveEntity({ ..., brand_id: null })` at line 189. The sales adapter then guards `sender_match` (line 131 of `resolve-customer.ts`) and `factuur_match` on `args.brand_id` — both are permanently unreachable. The phase explicitly seeds `sender_match` first in precedence as the highest-confidence signal. The resolution loop only ever reaches `offerte_match`, `postcode_site_match`, and `order_match`.

The fix is one targeted change in the worker: when `usesGenericPath` is true, derive `brand_id` from `resolutionConfig.scope.brand_scope?.[0]` (already present in the seeded config as `['SB']`) rather than from the debtor settings row. The REVIEW.md CR-01 section contains the exact suggested fix pattern.

**Blocker 2 — entity_brand object shape not handled (CR-02):**
`stage-2-customer-resolver.ts` lines 144-146 cast `entity_brand[0] as string` without checking the element type. Per `web/lib/swarms/types.ts:63`, the column is `string[] | Record<string,unknown>[] | null` since migration `20260505a_entity_brand_expansion.sql`. If the sales swarm row carries the post-migration object shape (BrandRegister metadata objects), `entityBrand` becomes a stringified object, which is written to `email_pipeline.resolution_audit.entity_brand` (a text column) as `"[object Object]"` and emitted on `coordinator.requested` in the Stage 2→3 context hand-off. The fix is to read through the canonical brand-register loader or apply an explicit type guard (see REVIEW.md CR-02 fix pattern).

**SC-2 and SC-3 are clean.** The designed acceptance tests for the self-auth no-op and the unresolved fall-through are present, correct, and green. The debtor path is behaviour-neutral (confirmed by the port-equivalence test and the no-Engine-diff guard). The seam structure — engine, config, steps, dispatch map, audit table, dry-run gate — is all correctly in place. The two blockers are both in the worker's input-preparation layer, not in the engine itself, and are targeted fixes.

---

_Verified: 2026-06-04_
_Verifier: Claude (gsd-verifier)_
