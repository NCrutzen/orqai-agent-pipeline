---
phase: 122-cross-brand-scope-customer-resolution
plan: 05
type: execute
gap_closure: true
status: complete
---

> Task 4 go/no-go resolved 2026-06-18: operator chose **keep-live** (fix is code-only; live opt-in stays enabled, corrected on deploy of PR #117).

# Plan 122-05 Summary — Cross-Scope Leaf-vs-Root Gap-Closure

## Outcome
Tasks 1-3 complete and committed. **Paused at Task 4** (blocking operator go/no-go on the live cross_scope opt-in). The orchestrator finalized this SUMMARY + tracking after the executor hit an API connection error post-Task-3 (work was already committed; verified independently).

## Root cause (found during Plan 04 verification)
The Plan 03 cross-scope fallback AUTO-resolved to the winner's `root_party_id` (parent company) instead of the matched leaf `party_id` (the invoiced debtor). Proven against `zapier.dbo.resolver_index`:

| invoice | scope_key | leaf party_id | root_party_id | ground-truth | pre-fix returned |
| 33050903 (#98) | SF | 524156 | 524011 | 524156 | 524011 (root) ❌ |
| 33050837 (#12) | SF | 527773 | 499559 | 527773 | 499559 (root) ❌ |
| 33051109 (#38) | SF | 530964 | 522781 | 530964 | 522781 (root) ❌ |
| 33050611 (#96) | SF | 510711 | (null)  | 510711 | 510711 (leaf) ✅ |

Secondary: `resolver_index` has no `brand_id` column (brand lives in `scope_key`), so `winner.brand_id` was null and the `cross_scope_misroute` annotation never fired.

## Tasks
- **Task 1 [RED]** (`9c7e2d16`): `cross-scope-leaf-vs-root.test.ts` pinning leaf-not-root + scope_key misroute. Confirmed RED, then GREEN.
- **Task 2 [fix]** (`9c7e2d16`): `cross-scope.ts` returns the winning leaf `party_id` (AUTO + degrade shortlist); `root_party_id` used ONLY for the distinctness/uniqueness bar (D-08); misroute annotation falls back to `scope_key` when `brand_id` is absent.
- **Task 3 [eval]** (`e6ccdff4`): post-fix bucket-C re-run → **PASS, 0 reachable confident-wrong (6/6)**. #98/#12/#38 now resolve to the correct leaf; #96 control stays correct.

## Verification (independent, orchestrator)
- `npx vitest run lib/agentic-pipeline/resolve` → **20 files / 69 passed, 3 skipped, 0 failed**.
- `npx tsc --noEmit` → 0 errors.
- Bucket-C gate (XSCOPE-03): PASS.

## Known caveat (out of scope, logged)
`#95` now resolves to leaf `524156` at high but its ground-truth is `525156` — it belongs to the ORIGINAL confident-wrong set (#2/#85/#95/#97, a Plan-120/corroboration root cause), classified as `confident-wrong` (precedence over bucket-C), NOT in the Phase-122 bucket-C target. The leaf-vs-root fix moved it from root-wrong to leaf-wrong; resolving it is separate follow-up work, not XSCOPE-03.

## Commits
- `9c7e2d16` fix(122-05): cross-scope resolves the LEAF party, not its root; misroute via scope_key
- `e6ccdff4` docs(122-05): post-fix bucket-C eval re-run — 0 confident-wrong (XSCOPE-03)

## Awaiting
Operator go/no-go (Task 4): the fix is **code-only** — the live `swarms.resolution_config` row is unchanged and now produces correct (leaf) resolutions once this code deploys. Keep-live vs follow-up is the operator's call.
