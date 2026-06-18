---
phase: 122-cross-brand-scope-customer-resolution
plan: 03
subsystem: resolver
tags: [resolver, cross-scope, cross-brand, suggestie, misroute, corroboration, engine]

requires:
  - phase: 122-cross-brand-scope-customer-resolution
    plan: 01
    provides: "RED cross-scope tests (auto/suggestie/optout) + numericConfidence guard"
  - phase: 122-cross-brand-scope-customer-resolution
    plan: 02
    provides: "suggestie Confidence value + cross_scope_misroute annotation + CrossScopeConfig"
provides:
  - "Shared resolveCrossScope helper: pure all-brand candidate decide AUTO/suggestie + misroute (D-01..D-11)"
  - "cross_scope post-pass wired into all three SUGGEST drop sites (invoice + number back-search + self-auth DIRECT)"
  - "CR-01 granularity split preserved cross-scope: root tiers dedupe on root_party_id, self-auth on party_id"
affects: [122-04]

tech-stack:
  added: []
  patterns:
    - "Cross-scope as a PURE post-pass over already-fetched res.matches — no second lookupResolveCandidates, no Date.now/crypto (Pitfall 3, mirrors corroborate.ts replay-safety header)"
    - "Relaxation = OMIT the brand prefix-family filter ONLY; the candidate set is the same materialized rows (Stage-2 transport rule: never add a cross-brand REST call)"
    - "Opt-out byte-identity via a single config.cross_scope?.enabled gate at each drop site; the original return-null preserved as fall-through (Pitfall 1)"
    - "suggestie emitted DIRECTLY (RESEARCH Rec 3) — never routed through capBelowAuto (which only maps high→medium)"

key-files:
  created:
    - web/lib/agentic-pipeline/resolve/steps/cross-scope.ts
    - web/lib/agentic-pipeline/resolve/__tests__/self-auth-cross-scope.test.ts
  modified:
    - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
    - web/lib/agentic-pipeline/resolve/steps/self-auth-match.ts

key-decisions:
  - "Drop-site placement: the post-pass fires after computing the in-scope MISS predicate (hasInScopeInvoiceRoot / hasInScopeRoot / hasInScopeParty), NOT only inside the single-root cross-brand block. The RED suggestie cases (>=2 roots, lone weak kind, all-cross-brand with is_unique_in_scope=false) reach the drop via DIFFERENT branches (llmTiebreak escalation / inScope-empty early return), so a single in-scope-miss gate is required to cover all three."
  - "Root-tier eligibleKinds = CROSS_SCOPE_ROOT_KINDS (number back-search kinds + email_domain/email_address). The brand filter is the relaxation, NOT the kind set — the helper must SEE weak sender kinds to corroborate (D-03b) or to surface a lone-weak suggestie (D-04). Strong-vs-weak is decided by auto_resolve_kinds inside the helper."
  - "self-auth cross-scope gate moved BEFORE the inScope.length===0 early return so an all-cross-brand set (is_unique_in_scope=false on every row → inScope empty) still reaches the post-pass over res.matches (Pitfall 2: is_unique_in_scope is NOT consulted for the cross-brand decision)."
  - "AUTO winner selection prefers a strong-kind (auto_resolve_kinds) row within the single-root group so a strong+weak mix on the same customer still AUTOs on the strong kind."

patterns-established:
  - "CrossScopeGranularity 'root' | 'direct' threaded from the caller so the DIRECT vs ROOT rollup split (CR-01) lives in the caller's choice, not a swarm literal"

requirements-completed: [XSCOPE-01, XSCOPE-02]

duration: 18min
completed: 2026-06-18
---

# Phase 122 Plan 03: Cross-Scope Fallback Engine Summary

**Implemented the config-gated cross-scope fallback as a SHARED pure post-pass over the already-fetched all-brand res.matches, wired into all three SUGGEST drop sites — turning the Plan-01 cross-scope RED tests GREEN with zero new SQL, zero second lookup, and zero swarm-name branch.**

## Performance

- **Duration:** ~18 min
- **Tasks:** 2 (Task 1 helper + invoice wiring; Task 2 number + self-auth wiring + self-auth test)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- **`steps/cross-scope.ts` (new):** `resolveCrossScope(matches, eligibleKinds, config, args, matchedIdentifiers, granularity)` — PURE over already-fetched rows. Filters to eligible kinds + auto-eligible status across ALL brands (the brand filter omission IS the relaxation, D-01), computes distinctness by granularity (root vs direct, CR-01), and decides:
  - **AUTO (D-08 + D-03a):** exactly ONE distinct target AND a winning match on a strong kind in `auto_resolve_kinds` → `high` + `cross_scope_misroute`.
  - **Corroboration-auto (D-03b):** else, when `allow_corroboration_auto !== false` AND a corroboration config is present, reuse `scoreCorroboration` VERBATIM; if it returns `high`, AUTO with the misroute annotation.
  - **Degrade (D-04/D-05/D-08):** otherwise emit `suggestie` directly (never via `capBelowAuto`) with the full shortlist on `inputs.candidates` and the misroute annotation when a cross-brand winner exists. Never emits `high` here.
- **Three drop sites wired**, each gated strictly on `config.cross_scope?.enabled`:
  - **Invoice path** (identifier-match.ts): granularity `root`, eligibleKinds `CROSS_SCOPE_ROOT_KINDS`.
  - **Number back-search** (identifier-match.ts `runNumberBackSearchAuto`): granularity `root`, same kinds.
  - **Self-auth DIRECT** (self-auth-match.ts): granularity `direct`, eligibleKinds the self-auth `auto_safe_kinds` — dedupes on `party_id` so two parties under the same root still suggestie (CR-01).
- **`self-auth-cross-scope.test.ts` (new):** single forwarded cross-brand DIRECT party → high + misroute; two distinct parties under the SAME root → suggestie (proves DIRECT not ROOT dedupe); opt-out → null.

## Task Commits

1. **Task 1: shared resolveCrossScope helper + invoice drop-site post-pass** — `dabcca71` (feat)
2. **Task 2: wire cross-scope into number + self-auth drop sites + self-auth test** — `7e2fcddc` (feat)

All committed with hooks (no `--no-verify`).

## Verification

- `cd web && npx vitest run lib/agentic-pipeline/resolve` → **65 passed, 3 skipped, 0 failed**. Includes cross-scope-auto (2), cross-scope-suggestie (3), cross-scope-optout (2), self-auth-cross-scope (3), self-auth-match, port-equivalence, precedence-inversion — all GREEN.
- `npx vitest run lib/pipeline-events/__tests__/numeric-confidence-suggestie.test.ts` → **GREEN** (suggestie===0.7, medium stays 0.7 — no regression, D-06).
- `! grep -rn "swarm_type ===\|swarm ===" lib/agentic-pipeline/resolve/` → **OK-no-swarm-branch** (XSCOPE-02 / SWARM-02 / T-122-05).
- `grep -c "lookupResolveCandidates(" lib/agentic-pipeline/resolve/steps/cross-scope.ts` → **0** (no second lookup, Pitfall 3 / T-122-03). The only `lookupResolveCandidates` / `crypto` mentions in the file are comment-only.
- `npx tsc --noEmit -p tsconfig.json` → **0 errors**.

## Drop-site adapter shapes (per the plan's output requirement)

| Drop site | Step contract | Adapter |
|---|---|---|
| Invoice (identifier-match.ts) | `{ result: ResolveResult \| null; matched_identifiers }` | `return { result: crossScope, matched_identifiers: invoices.candidates }` |
| Number back-search (identifier-match.ts) | same outcome shape | `return { result: crossScope, matched_identifiers: identifiers }` |
| Self-auth (self-auth-match.ts) | `ResolveResult \| null` directly | `return crossScope` |

**Opt-out byte-identity (Pitfall 1) held:** every cross-scope branch is gated on `config.cross_scope?.enabled`; when absent/false the new code is skipped entirely and the original `return null` / `return { result: null }` runs unchanged. The `cross-scope-optout.test.ts` (no config + `enabled:false`) and `precedence-inversion` / `port-equivalence` tests stay GREEN.

## Deviations from Plan

### [Rule 1 - Correctness] Drop-site gate placement broadened beyond the literal "inside the not-in-scope-brand block"

- **Found during:** Task 2 (wiring), confirmed against the Plan-01 RED suggestie cases.
- **Issue:** The plan's interfaces note pointed at the single-root cross-brand block (`identifier-match.ts:118-124`) as the post-pass site. But the RED suggestie test case (a) reaches the drop via the `distinctRoots.length >= 2` → `llmTiebreak` branch (NOT the single-root block), and case (b)/(c) (lone/disagreeing weak `email_domain`) never produce an in-scope `invoice_no` row at all. A post-pass placed only inside the single-root cross-brand block would miss both, leaving them at `none`/`llm_tiebreaker` instead of `suggestie`.
- **Fix:** Placed the gated post-pass after an explicit in-scope-MISS predicate (`hasInScopeInvoiceRoot` / `hasInScopeRoot` / `hasInScopeParty`) so it fires for every cross-brand miss class while leaving the in-scope AUTO path and the opt-out path byte-identical. For self-auth this also required moving the gate BEFORE the `inScope.length === 0` early return so an all-cross-brand set (every row `is_unique_in_scope=false`) still reaches the post-pass over `res.matches`.
- **Files modified:** identifier-match.ts, self-auth-match.ts
- **Commits:** `dabcca71`, `7e2fcddc`

### [Rule 2 - Correctness] Root-tier eligibleKinds widened to include sender kinds

- **Found during:** Task 1 (helper) / Task 2 (wiring).
- **Issue:** The plan said the invoice site passes "the set with invoice_no". But the corroboration-auto path (D-03b) and the lone-weak-kind suggestie path (D-04) require the helper to SEE `email_domain`/`email_address` rows — which an `{invoice_no}`-only eligible set excludes, so suggestie case (b) and the corroboration auto case would never fire.
- **Fix:** Defined `CROSS_SCOPE_ROOT_KINDS` (number back-search kinds + sender kinds) as the root-tier eligible set. The brand filter is the relaxation, NOT the kind set; strong-vs-weak is still decided by `auto_resolve_kinds` inside the helper. This matches the objective's "re-examine the SAME all-brand candidate set".
- **Files modified:** cross-scope.ts (added the exported set), identifier-match.ts (uses it at both root sites)
- **Commit:** `dabcca71`, `7e2fcddc`

## Known Stubs

None. The `cross_scope_misroute` annotation is intentionally emit-only this phase (no reader) — that is forward-plumbing documented in Plan 02 (D-09), not a stub.

## Issues Encountered

- None beyond the two correctness deviations above. tdd-guard remained disabled by the orchestrator throughout (per the execution handoff); not touched.

## Next Phase Readiness

- The cross-scope engine is live behind `config.cross_scope.enabled`. Plan 04 (XSCOPE-03) can now seed the debtor `cross_scope` config and re-run the BUCKET_C eval gate (the Plan-01 scaffold) over the live candidate set to confirm zero high+wrong cross-brand resolutions.

## Self-Check: PASSED

- FOUND: web/lib/agentic-pipeline/resolve/steps/cross-scope.ts
- FOUND: web/lib/agentic-pipeline/resolve/__tests__/self-auth-cross-scope.test.ts
- FOUND commit: dabcca71 (Task 1)
- FOUND commit: 7e2fcddc (Task 2)

---
*Phase: 122-cross-brand-scope-customer-resolution*
*Completed: 2026-06-18*
