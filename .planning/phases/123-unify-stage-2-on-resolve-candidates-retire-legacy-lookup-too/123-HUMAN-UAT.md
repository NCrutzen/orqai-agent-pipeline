---
status: partial
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
source: [123-VERIFICATION.md, 123-REVIEW.md]
started: 2026-06-17
updated: 2026-06-17
---

## Current Test

[awaiting human testing / disposition]

## Tests

### 1. CR-01 — LLM tiebreaker fires inside the corroboration "no-LLM" collect path (D-03)
expected: The corroboration collect loop in `engine.ts` (lines ~300-316) must NOT invoke a real
LLM tiebreaker. It currently passes the live `llmTiebreak` closure into `runSenderMatch` /
`runIdentifierMatch`; with `debtorP0Config` having corroboration enabled, an ambiguous sender
(≥2 distinct in-scope parties) fires a real, non-deterministic, billable LLM call on a path the
loop's own comment promises is deterministic. Confirmed by both 123-REVIEW.md and the verifier
reading the actual code. Disposition required: FIX (pass a no-op tiebreaker into the step calls
inside the corroboration loop, per 123-REVIEW.md) or formally ACCEPT the deviation.
result: resolved — fixed 2026-06-17. engine.ts now injects a no-op tiebreaker into runSenderMatch/runIdentifierMatch on the corroboration collect path (real llmTiebreak retained on the no-corroboration path). Regression test in corroboration-collect.test.ts asserts lookupCandidateDetails is never called on the collect path. tsc 0, vitest green. Commit: fix(123) CR-01.

### 2. RESL-UNIFY-06 — clean absolute-% correctness eval re-run
expected: After the `nxt.candidate_details` async-callback transport issue is fixed (follow-up
todo 2026-06-17-candidate-details-callback-and-clean-eval-rerun.md), re-run
`cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` and confirm overall
correct ≥ 64% baseline + gold non-regression (0). The 18% in this phase's run was a pre-existing
candidate_details callback artifact, not a resolve_candidates regression (which completed 163/163
live; demotion-direction 4/4 + 12/12 passed).
result: [pending]

### 3. nxt_lookup_requests CHECK constraint widen-back
expected: After pruning the 1171 inert historical `debtor.nxt_lookup_requests` rows (follow-up
todo 2026-06-17-widen-back-nxt-lookup-requests-checks.md), apply the deferred constraint
widen-back from 20260617_retire_legacy_lookup_tools.sql and reconcile repo↔remote migration
history. `check:supabase` 0 ERROR.
result: [pending]

## Summary

total: 3
passed: 1
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
