---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
plan: 04
subsystem: database
tags: [supabase, migration, zapier_tools, nxt_lookup_requests, resolve_candidates, correctness-eval, corroboration, stage-2]

# Dependency graph
requires:
  - phase: 123-03
    provides: "Legacy tool defs/types/zapier_tools-row code removed (nxt.contact_lookup / nxt.identifier_lookup deleted from nxt-zap-client.ts); NxtToolId = candidate_details | resolve_candidates"
  - phase: 120-d-06-multi-signal-corroboration-engine-generic-cross-swarm
    provides: "D-06 corroboration engine (min_signals 2, boost high) — the carried-over debtor correctness gate this plan re-runs"
provides:
  - "PROD: 2 public.zapier_tools rows (nxt.contact_lookup, nxt.identifier_lookup) DELETED from live mvqjhlxfvtqqubqgdvhz — legacy tools gone from code AND database"
  - "Migration 20260617_retire_legacy_lookup_tools.sql (DELETE + CHECK widen-back), additive to history"
  - "Live evidence that the unified Phase-123 resolve_candidates path works: 163 requests / 163 complete-with-result over the eval window"
  - "RERUN-FINDINGS.md — the frozen 100-email correctness eval re-run + operator-reviewed root cause"
affects: [stage-2-resolver, debtor-correctness-gate, candidate-details-callback, clean-eval-rerun]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-flight-gated destructive migration: count legacy rows BEFORE the constraint re-add; apply DELETE-only + keep WIDE constraint when count > 0 (T-123-10 mitigation)"
    - "Eval root-cause via live DB evidence: cross-reference debtor.nxt_lookup_requests request/result counts per tool_id to distinguish a resolver regression from a transport artifact"

key-files:
  created:
    - supabase/migrations/20260617_retire_legacy_lookup_tools.sql
    - .planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md
    - .planning/todos/pending/2026-06-17-widen-back-nxt-lookup-requests-checks.md
    - .planning/todos/pending/2026-06-17-candidate-details-callback-and-clean-eval-rerun.md
  modified: []

key-decisions:
  - "Task 2 DEVIATION (operator-approved): DELETE-only apply. Pre-flight count = 1171 legacy nxt_lookup_requests rows (> 0) → applied only DELETE FROM public.zapier_tools (via apply_migration name retire_legacy_lookup_tools_delete_only_p123); the 2 CHECK constraints stay WIDE, widen-back deferred to a follow-up todo (T-123-10 mitigation: no failed migration, no outage)."
  - "Task 3: correctness eval RAN + committed; operator reviewed and APPROVED-TO-CLOSE with the absolute-% re-run DEFERRED. Overall 18% (14/79) is a candidate_details callback-transport artifact, NOT a resolve_candidates regression — demotion-direction + bucket-B targets all PASSED and resolve_candidates is 163/163 live."
  - "Absolute-% acceptance number deferred to follow-up (fix candidate_details async callback, then clean re-run) — closes the deferred Phase-120 / 123 debtor gate."

patterns-established:
  - "Capability-before-removal completed end-to-end: code (Plan 03) → DB rows (Plan 04 prod apply) — legacy tools retired from both surfaces, surviving tool path proven live."

requirements-completed: [RESL-UNIFY-05, RESL-UNIFY-06]

# Metrics
duration: ~15min
completed: 2026-06-17
---

# Phase 123 Plan 04: Database Half of Legacy-Tool Retirement + Carried-Over Correctness Gate Summary

**Deleted the 2 legacy `nxt.*_lookup` zapier_tools rows from the live database (DELETE-only, constraint widen-back deferred per pre-flight) and re-ran the frozen 100-email debtor correctness gate — operator-approved-to-close with the absolute-% re-run deferred to a candidate_details-callback follow-up; resolve_candidates proven 163/163 live.**

## Performance

- **Duration:** ~15 min (continuation/closing pass; underlying tasks executed across prior checkpoints)
- **Completed:** 2026-06-17
- **Tasks:** 3 (all complete)
- **Files modified/created:** 4 (1 migration, 1 eval report, 2 follow-up todos)

## Accomplishments

- **PROD legacy-tool retirement complete:** `nxt.contact_lookup` + `nxt.identifier_lookup` are gone from `public.zapier_tools` on live `mvqjhlxfvtqqubqgdvhz`. With Plan 03's code removal, the legacy tools no longer exist in code OR database.
- **Unified path proven live:** over the eval window, `debtor.nxt_lookup_requests` shows `nxt.resolve_candidates` = 163 requests / 163 complete-with-result — the unified Phase-123 generic path works end-to-end against the live substrate.
- **Carried-over Phase-120 debtor correctness gate exercised:** the frozen 100-email fixture re-ran over the corroboration-bearing resolve_candidates path; root cause of the low absolute % identified with live DB evidence and operator-reviewed.
- **Demotion-direction targets all PASSED:** confident-wrong AUTO #2/#85/#95/#97 = 4/4 demoted; bucket-B = 12/12 resolved-or-demoted — corroboration is firing correctly over the generic path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the row-deletion + CHECK-widen-back migration** — `a161ccb1` (feat)
2. **Task 2: [BLOCKING] Apply the retirement migration to the live database** — applied via Supabase MCP `apply_migration` (name `retire_legacy_lookup_tools_delete_only_p123`), DELETE-only deviation (no repo commit; the migration file from Task 1 is the durable artifact)
3. **Task 3: [BLOCKING] Re-run the frozen 100-email correctness gate + operator review** — `dcfd0409` (test)

**Plan metadata:** this SUMMARY + STATE/ROADMAP commit (docs).

## Files Created/Modified

- `supabase/migrations/20260617_retire_legacy_lookup_tools.sql` — DELETE the 2 legacy `zapier_tools` rows + widen-back the 2 `debtor.nxt_lookup_requests` CHECK constraints (`tool_id` + `lookup_kind`) to the 2-value sets. Additive to history (supersedes the `20260610a` widening; does NOT edit `20260610a` or any historical migration). Header documents the supersede-not-edit rule + the legacy-row pre-flight caveat.
- `.planning/evals/2026-06-16-resolver-customer-eval/RERUN-FINDINGS.md` — the eval re-run report (post-120 corroboration).
- `.planning/todos/pending/2026-06-17-widen-back-nxt-lookup-requests-checks.md` — deferred CHECK constraint widen-back (the part of Task 1's migration NOT applied because legacy rows exist).
- `.planning/todos/pending/2026-06-17-candidate-details-callback-and-clean-eval-rerun.md` — fix the stuck candidate_details async callback, then re-run the clean absolute-% eval; closes the deferred Phase-120 / 123 debtor gate.

## Decisions Made

- **DELETE-only prod apply (operator-approved).** See Deviations.
- **Eval deferred-with-evidence (operator-approved-to-close).** The low overall % is a transport artifact in a pre-existing, untouched tool (`candidate_details`), not a resolver regression. Acceptance number deferred; phase code/DB/transport deliverables stand as complete + proven.

## Deviations from Plan

### Operator-approved deviations

**1. [Task 2 — pre-flight gate, T-123-10] DELETE-only prod apply; CHECK widen-back deferred**
- **Found during:** Task 2 (live migration apply).
- **Issue:** The Task 1 pre-flight `SELECT count(*) FROM debtor.nxt_lookup_requests WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup') OR lookup_kind IN ('sender_to_account','identifier_to_account')` returned **1171** (> 0). Re-adding the narrowed CHECK constraints would FAIL against these existing (inert, historical audit) request rows.
- **Fix (per T-123-10 mitigation + Task 2 step 1 instruction):** Applied ONLY `DELETE FROM public.zapier_tools WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup')` to live `mvqjhlxfvtqqubqgdvhz` via Supabase MCP `apply_migration` name `retire_legacy_lookup_tools_delete_only_p123`. The 2 CHECK constraints remain WIDE (deferred). No failed migration, no outage.
- **Verification (post-apply):**
  - `SELECT tool_id FROM public.zapier_tools WHERE tool_id LIKE 'nxt.%'` → only `candidate_details`, `invoice_fetch`, `resolve_candidates` remain (contact_lookup + identifier_lookup ABSENT, surviving tool path PRESENT — T-123-11 confirmation).
  - `npm run check:supabase` → 0 ERROR.
- **Deferred:** constraint widen-back captured in follow-up todo `.planning/todos/pending/2026-06-17-widen-back-nxt-lookup-requests-checks.md` (a cleanup can prune the inert historical rows, then re-add the narrowed constraints).

**2. [Task 3 — eval acceptance] Absolute-% re-run deferred with evidence**
- **Found during:** Task 3 (correctness gate re-run + operator review).
- **Issue:** Overall correct = **18% (14/79)** vs 64% baseline — RED against the "MUST NOT regress below baseline" target. Gold-signal rows showed 35/46 "regressions".
- **Root cause (live DB evidence, `debtor.nxt_lookup_requests` eval window):** `nxt.resolve_candidates` = 163 requests / 163 complete-with-result (the unified path works live). `nxt.candidate_details` = 26 requests / **0 results / all `pending`** — the LLM-tiebreaker enrichment Zap fires (visible in Zapier) but its async callback never lands, so tiebreaker rows degrade to unresolved. `candidate_details` is a separate, pre-existing tool NOT touched by Phase 123; operator confirmed this is the SAME callback-transport issue as Monday's Sales eval. The low overall % and the gold-signal "regressions" (the `null` After-customer rows) are caused by the stuck `candidate_details` callback, NOT by `resolve_candidates`.
- **What PASSED (corroboration firing correctly over the generic path):**
  - Confident-wrong AUTO #2 / #85 / #95 / #97 → demoted below AUTO (conf ≠ high): **4/4**.
  - Bucket-B sender/name-ambiguity → resolved-or-demoted: **12/12**.
- **Operator decision:** APPROVED-TO-CLOSE with the clean absolute-% re-run DEFERRED to follow-up todo `.planning/todos/pending/2026-06-17-candidate-details-callback-and-clean-eval-rerun.md` (fix candidate_details callback, then re-run; that closes the deferred Phase-120 / 123 debtor gate).
- **Committed in:** `dcfd0409` (RERUN-FINDINGS.md).

---

**Total deviations:** 2 operator-approved (1 destructive-apply pre-flight gate, 1 eval-acceptance deferral-with-evidence).
**Impact on plan:** Both deviations were anticipated by the plan (T-123-10 pre-flight branch; Task 3 BLOCKING operator review). No scope creep. Code + DB + transport deliverables are complete and proven live; the absolute-% acceptance number is the only deferred item, blocked by a pre-existing `candidate_details` callback issue outside Phase 123's scope.

## Issues Encountered

- **Stuck `candidate_details` async callback** (pre-existing, not introduced by Phase 123). Its enrichment Zap fires but the callback never lands → rows stay `pending`, dragging the absolute correctness % down. Tracked for fix-then-re-run in the follow-up todo; same root cause as Monday's Sales eval per operator.

## Human Re-Run Required (deferred acceptance)

The absolute-% correctness number is **deferred, not waived**. To finalize the carried-over Phase-120 / 123 debtor correctness gate, a human (or follow-up phase) must:
1. Fix the `candidate_details` async callback (callback never lands → rows stuck `pending`). See todo `2026-06-17-candidate-details-callback-and-clean-eval-rerun.md`.
2. Re-run `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` and confirm overall correct ≥ 64% baseline once the tiebreaker rows resolve.
3. (Separately) prune the 1171 inert `nxt_lookup_requests` legacy rows, then apply the deferred CHECK widen-back. See todo `2026-06-17-widen-back-nxt-lookup-requests-checks.md`.

## Next Phase Readiness

- **Phase 123 code + DB + transport deliverables COMPLETE and proven live:** resolve_candidates 163/163; legacy tools gone from code AND database; tsc 0, full vitest green (Plan 03), `check:supabase` 0 ERROR.
- **Open (deferred, tracked):** (1) CHECK widen-back after pruning inert rows; (2) candidate_details callback fix + clean absolute-% eval re-run.
- Phase verification + whole-phase completion are handled by the orchestrator (this plan does not mark the phase complete).

## Self-Check: PASSED

- FOUND: `123-04-SUMMARY.md`
- FOUND: `supabase/migrations/20260617_retire_legacy_lookup_tools.sql`
- FOUND: commit `a161ccb1` (Task 1 migration)
- FOUND: commit `dcfd0409` (Task 3 eval re-run)

---
*Phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too*
*Completed: 2026-06-17*
