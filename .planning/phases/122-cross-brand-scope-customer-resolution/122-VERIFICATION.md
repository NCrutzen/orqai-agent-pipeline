---
phase: 122-cross-brand-scope-customer-resolution
verified: 2026-06-18T16:35:00Z
status: passed
score: 14/14 must-haves verified
overrides_applied: 0
requirements:
  XSCOPE-01: SATISFIED
  XSCOPE-02: SATISFIED
  XSCOPE-03: SATISFIED
deferred:
  - truth: "Fixture row #95 resolves confident-wrong (leaf 524156 vs GT 525156)"
    addressed_in: "Follow-up (.planning/todos/pending/2026-06-18-resolver-95-leaf-wrong-confident.md)"
    evidence: "#95 belongs to the ORIGINAL confident-wrong set (#2/#85/#95/#97), a separate invoice→party mapping defect in resolver_index — explicitly NOT in the Phase-122 bucket-C target set (#98/#12/#38 + #96 control). Confident-wrong before AND after the leaf-vs-root fix; pre-existing, not a regression."
---

# Phase 122: Cross-brand-scope Customer Resolution — Verification Report

**Phase Goal:** A mail in the wrong brand mailbox should still resolve to the right customer when the identifier is unambiguous cross-scope — and must NOT manufacture a new false positive (the cross-scope match must itself be unique / degrade to a suggestie). Distinguish "customer under another brand" (resolve it) from "wrong mailbox, needs re-routing" (operator signal). This phase owns the resolution half.
**Verified:** 2026-06-18T16:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cross-scope back-search runs over already-fetched `res.matches` (no new SQL/lookup) | VERIFIED | `cross-scope.ts` is PURE — consumes `matches: ResolveCandidateMatch[]` arg, no `lookupResolveCandidates`/`step.run`/`Date.now`/`crypto` (L19-25, L80-98). Filter relaxes ONLY the brand/prefix-family filter (L95-97). |
| 2 | A single distinct cross-brand root on a strong kind AUTO-resolves at "high" with a misroute annotation | VERIFIED | AUTO branch L115-131: `distinctTargets.length === 1` + `strongWinner` in `autoKinds` → `buildCrossScopeResult(..., "high", ...)` with `...misrouteAnnotation`. Test `cross-scope-leaf-vs-root.test.ts` (a) asserts `confidence==="high"`, `cross_scope_misroute` set. |
| 3 | A lone weak kind corroborated by ≥min_signals may AUTO (D-03b) reusing scoreCorroboration | VERIFIED | Corroboration-auto branch L137-172 reuses `scoreCorroboration` verbatim; gated on `allow_corroboration_auto !== false` + `corroboration` config present. |
| 4 | A non-unique set / lone weak kind / disagreeing signals degrade to `suggestie`, never confident-wrong | VERIFIED | DEGRADE branch L181-204 emits `confidence: "suggestie"` directly (not via capBelowAuto). Tests `cross-scope-suggestie.test.ts` (a/b/c cases) green. Cardinal constraint T-122-01 documented L2-13. |
| 5 | `suggestie` Confidence value added; numericConfidence(suggestie)=0.7 | VERIFIED | `engine.ts:86` `Confidence = ... \| "suggestie"`. `types.ts:126` `if (v === "suggestie") return 0.7`. numericConfidence RED test committed (`fdd5d645`). |
| 6 | `ResolveResult.cross_scope_misroute` optional emit-only field exists | VERIFIED | `misrouteAnnotation` (L275-289) returns `Pick<ResolveResult,"cross_scope_misroute">` or `{}` so opt-out is byte-identical. |
| 7 | `CrossScopeConfig` on ResolutionConfig/EngineConfig (mirror corroboration) | VERIFIED | `config.ts:143` `cross_scope?: CrossScopeConfig`; `config.ts:152` `interface CrossScopeConfig`. |
| 8 | Cross-scope is opt-in, gated ONLY on `config.cross_scope?.enabled` (SWARM-02, no swarm literal) | VERIFIED | 3 gates: `identifier-match.ts:146,317` + `self-auth-match.ts:156` all `config.cross_scope?.enabled && !hasInScope…`. No `if (swarm === …)` branch. |
| 9 | Opt-out (absent / enabled:false) → output byte-identical to today | VERIFIED | `cross-scope-optout.test.ts`: both cases assert `method==="unresolved"`, `confidence==="none"`, `cross_scope_misroute` toBeUndefined. |
| 10 | Wired into the 3 SUGGEST drop sites (invoice / number back-search / self-auth) | VERIFIED | `identifier-match.ts:147,318` (root granularity), `self-auth-match.ts:157` (direct granularity). Imported at `identifier-match.ts:29`, `self-auth-match.ts:37`. |
| 11 | Self-auth keeps DIRECT-party granularity; number/invoice use root (CR-01) | VERIFIED | Call sites pass `"root"` (identifier-match L153, L324) and `"direct"` (self-auth L163). `targetOf` switches on granularity (cross-scope.ts L101-104). |
| 12 | 122-05 fix: AUTO/degrade surface the winning LEAF `party_id`, root used only for distinctness bar (D-08) | VERIFIED | `candidateOf` uses `m.party_id` (L256-263). `buildCrossScopeResult` returns `candidate.id` (leaf, L237), `target` no longer passed. Test (a) asserts `customer_account_id==="524156"` (leaf) not `524011` (root). |
| 13 | Misroute derived from `scope_key` when `brand_id` absent (resolver_index has no brand_id) | VERIFIED | `misrouteAnnotation` L279: `winner.brand_id \|\| winner.scope_key`. Test (b) asserts `resolved_brand==="SF"` (scope_key) with brand_id NULL. |
| 14 | Live debtor `swarms.resolution_config.cross_scope` opt-in applied + debtorP0Config lockstep, no drift | VERIFIED | Live REST query returned `{enabled:true, auto_resolve_kinds:[invoice_no,customer_no,site_no], allow_corroboration_auto:true}`. `resolve-debtor.ts:100-104` matches byte-for-byte. Migration `20260618a` uses `\|\|` add-only merge. Commit `b902cc01` "live apply done". |

**Score:** 14/14 truths verified

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | #95 confident leaf-wrong (524156 vs GT 525156) | Follow-up todo 2026-06-18-resolver-95-leaf-wrong-confident.md | Original confident-wrong set (#2/#85/#95/#97), separate root cause; NOT in bucket-C target; pre-existing, not a regression (per phase context + deferred-items.md). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/lib/agentic-pipeline/resolve/steps/cross-scope.ts` | Shared post-pass helper | VERIFIED | 289 lines, exports `resolveCrossScope`, AUTO + corroboration-auto + degrade branches, misroute annotation, leaf-not-root. |
| `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` | post-pass at invoice + number drop sites | VERIFIED | `resolveCrossScope` called L147 + L318, both gated, granularity "root". |
| `web/lib/agentic-pipeline/resolve/steps/self-auth-match.ts` | post-pass at DIRECT drop site | VERIFIED | `resolveCrossScope` called L157, granularity "direct". |
| `web/lib/agentic-pipeline/resolve/engine.ts` | Confidence += suggestie; cross_scope_misroute? | VERIFIED | `suggestie` in union L86; EngineConfig carries cross_scope. |
| `web/lib/agentic-pipeline/resolve/config.ts` | CrossScopeConfig interface | VERIFIED | L143 + L152. |
| `web/lib/pipeline-events/types.ts` | numericConfidence(suggestie)=0.7 | VERIFIED | L126. |
| `web/lib/automations/debtor-email/resolve-debtor.ts` | debtorP0Config.cross_scope lockstep | VERIFIED | L100-104 matches live seed. |
| `supabase/migrations/20260618a_debtor_cross_scope_optin.sql` | jsonb \|\| add-only opt-in | VERIFIED | Add-only merge, UPDATE-only on RLS-enabled swarms. |
| `web/scripts/eval/resolver-correctness-gate.ts` | BUCKET_C set + falsifiable PASS line | VERIFIED | BUCKET_C L98; `bucketCResolvedOrDemoted` scoring L285-292; PASS line unreachable when any reachable row is high+wrong. |
| 4 cross-scope test files + leaf-vs-root test | RED-first tests | VERIFIED | auto/suggestie/optout/leaf-vs-root all present, all green. |
| `.planning/.../RERUN-FINDINGS.md` | bucket-C re-run, 0 confident-wrong | VERIFIED | PASS line present: "bucket-C wrong-brand resolved or demoted: 6/6 — 0 confident-wrong". |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| identifier-match.ts | cross-scope.ts | `resolveCrossScope(res.matches, …)` when `config.cross_scope?.enabled` | WIRED | L146-153, L317-324 |
| cross-scope.ts | corroborate.ts | reuses `scoreCorroboration` | WIRED | L150 |
| stage-2-customer-resolver worker | types.ts | `numericConfidence` cast widened for suggestie | WIRED | tsc 0 errors with widened union |
| resolve-debtor.ts | resolver-correctness-gate.ts | harness imports `debtorP0Config` | WIRED | gate L38 import, L225 passes config |
| migration 20260618a | live swarms row | applied to prod before eval | WIRED | Live REST confirms cross_scope present, no drift |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Resolve unit suite green incl. cross-scope | `npx vitest run lib/agentic-pipeline/resolve` | 20 files passed, 69 passed / 3 skipped / 0 failed | PASS |
| Type safety with widened Confidence union | `npx tsc --noEmit` | exit 0, 0 errors | PASS |
| Live cross_scope opt-in present, no drift | REST GET swarms.resolution_config->cross_scope | `{enabled:true, auto_resolve_kinds:[invoice_no,customer_no,site_no], allow_corroboration_auto:true}` | PASS |

### Probe Execution

No conventional `scripts/*/tests/probe-*.sh` probes declared for this phase. XSCOPE-03 acceptance verified via committed RERUN-FINDINGS.md + unit tests per phase-context instruction (live eval harness intentionally NOT re-run — slow/timeout-prone against live Zapier substrate).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| XSCOPE-01 | 122-01, 122-03 | In-scope-miss cross-scope back-search over res.matches; single distinct root on strong/corroborated kind AUTOs with misroute; non-unique/weak/disagreeing degrade to suggestie | SATISFIED | Truths 1-4, 12-13; cross-scope.ts AUTO + corroboration + degrade branches; auto/suggestie/leaf-vs-root tests green |
| XSCOPE-02 | 122-02, 122-03, 122-04 | Opt-in per swarm via swarms.resolution_config.cross_scope, gated on enabled only (SWARM-02); absent/false → byte-identical | SATISFIED | Truths 7-9; 3 enabled-gates, no swarm literal; optout test green; live opt-in applied |
| XSCOPE-03 | 122-01, 122-04 (+122-05 gap-closure) | 9 bucket-C rows resolve to operator customer OR demote below AUTO; reachable rows pass, unreachable reported separately | SATISFIED | RERUN-FINDINGS PASS line 6/6 reachable, 0 confident-wrong; #98/#12/#38 → correct leaf, #96 control correct; falsifiable PASS line in harness L285-292 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| engine.ts | 283 | "not yet implemented" (P0 step kinds) | ℹ️ Info | Pre-existing context comment about P0 scope, unrelated to phase 122; no debt marker (no TBD/FIXME/XXX). Not a gap. |

No blocker debt markers (TBD/FIXME/XXX) in any phase-122 modified source file.

### Human Verification Required

None. All must-haves verified programmatically via unit tests, tsc, live DB query, and committed eval findings. The D-07 Bulk Review render check (suggestie + candidate set reaching the existing surface, no new queue UI) was confirmed in 122-04 Task 3 and reuses the existing Bulk Review surface — no new UI to visually inspect.

### Gaps Summary

No gaps. The phase goal — cross-scope fallback that resolves the right customer cross-brand without manufacturing a confident false positive — is achieved and live:

- The engine runs a config-gated PURE post-pass over already-fetched `res.matches` at all 3 SUGGEST drop sites, with zero swarm literal (SWARM-02).
- AUTO fires only on a single distinct root + strong/corroborated kind; everything else degrades to the new `suggestie` tier — never a confident wrong-scope pick.
- The 122-05 gap-closure fixed the confident-wrong defect (root → leaf party_id; misroute via scope_key), proven by `cross-scope-leaf-vs-root.test.ts` and the bucket-C re-run (#98/#12/#38 now resolve to the correct leaf, #96 control correct, 0 reachable confident-wrong).
- The live debtor opt-in is applied with no drift (verified via direct REST query), and debtorP0Config is in byte-exact lockstep.
- 69 unit tests green, tsc clean.

The single known leaf-wrong row (#95) is explicitly out of the XSCOPE-03 bucket-C target set, is a pre-existing defect in the original confident-wrong set with a different root cause, and is tracked as a follow-up todo — correctly classified as deferred, not a gap.

---

_Verified: 2026-06-18T16:35:00Z_
_Verifier: Claude (gsd-verifier)_
