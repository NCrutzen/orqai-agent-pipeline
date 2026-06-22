---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
verified: 2026-06-17T00:00:00Z
status: passed  # 2026-06-18: CR-01 (D-03) FIXED in engine.ts (noopTiebreak @352/360); eval reframed (harness-limited); constraint-narrowing = accepted tech debt. See V9.5-MILESTONE-AUDIT.md.
score: 6/7 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Re-run frozen 100-email correctness fixture once candidate_details async callback is fixed"
    expected: "Overall correct >= 64% baseline; confident-wrong 4/4 remain demoted; gold-signal non-regression 0"
    why_human: "The eval harness hits a live Zapier callback (nxt.candidate_details) that currently fails to return results — the absolute-% number cannot be confirmed without fixing the callback first. The demotion-direction targets (4/4) and bucket-B (12/12) already passed in the RERUN-FINDINGS.md run."
  - test: "Apply deferred CHECK widen-back migration after pruning 1171 inert nxt_lookup_requests rows"
    expected: "debtor.nxt_lookup_requests tool_id CHECK = IN ('nxt.candidate_details','nxt.resolve_candidates'); lookup_kind CHECK = IN ('candidate_details','resolve_candidates'); check:supabase = 0 ERROR"
    why_human: "The constraint tightening part of the migration was intentionally skipped because 1171 historical rows carry retired values. The zapier_tools DELETE was applied live. The constraint narrowing requires a prior row-prune that must be operator-executed."
  - test: "Confirm CR-01 handling is an accepted deviation or fix engine.ts corroboration collect loop to use a no-op tiebreaker"
    expected: "Either a noop tiebreaker replaces llmTiebreak at engine.ts lines 308 and 316 in the corroboration collect loop, OR operator documents that the live min_signals=2 cap makes this acceptable and records it as a known gap"
    why_human: "The code review (123-REVIEW.md CR-01) identified that the corroboration collect loop passes the real llmTiebreak to runSenderMatch — confirmed in the actual engine.ts code (line 308). This violates D-03 ('NO LLM call, score deterministically'). The debtorP0Config has corroboration enabled and sender_match in its precedence list. Whether this is fixed or accepted with rationale is an operator decision."
gaps: []
deferred:
  - truth: "The frozen 100-email correctness fixture re-runs over the unified resolve_candidates path with no regression and corroboration firing — operator-reviewed (RESL-UNIFY-06 absolute-% acceptance)"
    addressed_in: "Follow-up todo 2026-06-17-candidate-details-callback-and-clean-eval-rerun.md"
    evidence: "Plan 04 key-decisions: 'Absolute-% acceptance number deferred; phase code/DB/transport deliverables stand as complete + proven'; demotion-direction targets (4/4) and bucket-B (12/12) PASSED in the current RERUN-FINDINGS.md run"
  - truth: "debtor.nxt_lookup_requests tool_id + lookup_kind CHECK constraints narrowed to 2-value set (RESL-UNIFY-05 constraint half)"
    addressed_in: "Follow-up todo 2026-06-17-widen-back-nxt-lookup-requests-checks.md"
    evidence: "Plan 04 Task 2 deviation: pre-flight found 1171 legacy rows; DELETE-only applied; constraint widen-back explicitly tracked in pending todo as T-123-10 mitigation"
---

# Phase 123: Unify Stage-2 on resolve_candidates + Retire Legacy Lookup Tools — Verification Report

**Phase Goal:** Move the debtor + sales Stage-2 resolver (sender + invoice/factuur paths) onto the single generic `nxt.resolve_candidates` SQL resolver, and REMOVE `nxt.contact_lookup` + `nxt.identifier_lookup` entirely — from code (wrappers/types/schemas/steps/sales adapter/tests) AND the database (`zapier_tools` rows + `nxt_lookup_requests` CHECK constraints). One generic look-up, no dual-tool confusion (SWARM-02).
**Verified:** 2026-06-17
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (Requirement) | Status | Evidence |
|---|---------------------|--------|----------|
| 1 | Debtor sender_match resolves via resolve_candidates (email_domain/email_address), not contact_lookup (RESL-UNIFY-01) | VERIFIED | `sender-match.ts` imports `lookupResolveCandidates`, builds both `email_address` + `email_domain` seeds, has `SENDER_KINDS = new Set(["email_address","email_domain"])`, applies `is_unique_in_scope + isAutoEligibleStatus` filter, `inPrefixFamily` gate; no `lookupSenderToAccount` or `lookupCandidateDetails` reference anywhere in file |
| 2 | Debtor invoice resolution goes through resolve_candidates (invoice_no), legacy identifier_lookup fallback removed (RESL-UNIFY-02) | VERIFIED | `identifier-match.ts` imports `lookupResolveCandidates`, passes `invoice_no` identifiers, applies `isAutoEligibleStatus` + `root_party_id` rollup + distinct-root fail-closed; no `lookupIdentifierToAccount` anywhere in file |
| 3 | Sales sender_match + factuur_match resolve via resolve_candidates; corroboration signal shape preserved (RESL-UNIFY-03) | VERIFIED | `resolve-customer.ts` imports `lookupResolveCandidates`, builds `email_address`/`email_domain` seeds for sender, `invoice_no` for factuur; emits `identifier_kind: "sender_domain"` and `identifier_kind: "invoice_no"` for corroboration axis; no `lookupSenderToAccount` / `lookupIdentifierToAccount` |
| 4 | Legacy tools removed from nxt-zap-client.ts + repo-wide; build + full vitest suite green (RESL-UNIFY-04) | VERIFIED | `nxt-zap-client.ts`: `NxtToolId = "nxt.candidate_details" \| "nxt.resolve_candidates"` only; repo-wide grep for `lookupSenderToAccount\|lookupIdentifierToAccount\|nxt\.contact_lookup\|nxt\.identifier_lookup` across `web/*.ts` = 0 functional references (11 hits are all comments referencing retired tools, not import/call sites); tsc 0 + vitest 2732 passing per known_execution_state |
| 5 | 2 public.zapier_tools rows deleted live; check:supabase 0 ERROR (RESL-UNIFY-05 — rows half) | VERIFIED | Migration `20260617_retire_legacy_lookup_tools.sql` exists; Plan 04 SUMMARY confirms `apply_migration` ran on live `mvqjhlxfvtqqubqgdvhz`; post-apply SELECT confirmed `contact_lookup` + `identifier_lookup` absent, `candidate_details` + `invoice_fetch` + `resolve_candidates` present; `check:supabase` = 0 ERROR. CHECK constraint widen-back deferred — see Deferred Items. |
| 6 | Step modules + sales adapter are swarm-agnostic — zero if(swarm==='...') runtime branch (RESL-UNIFY-07) | VERIFIED | grep for `swarm_type\|=== 'debtor'\|=== 'sales'` across `sender-match.ts`, `identifier-match.ts`, `resolve-customer.ts` = 0 functional branches; comments acknowledge the rule explicitly in file headers |
| 7 | Acceptance eval: frozen 100-email fixture re-run, no regression below 64% baseline, corroboration firing (RESL-UNIFY-06) | DEFERRED (human needed) | Demotion-direction targets PASSED (4/4 confident-wrong demoted; 12/12 bucket-B); resolve_candidates proven 163/163 live. Absolute-% = 18% (14/79) due to pre-existing `candidate_details` async-callback transport failure (unrelated to Phase 123), not a resolver regression. Operator approved-to-close with clean re-run deferred. |

**Score:** 6/7 truths verified (1 deferred to human re-run)

### Deferred Items

Items not yet met but explicitly tracked in follow-up todos rather than blocking the code/DB deliverable.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Absolute-% correctness ≥ 64% baseline (RESL-UNIFY-06 acceptance number) | Follow-up: `2026-06-17-candidate-details-callback-and-clean-eval-rerun.md` | Blocked by pre-existing candidate_details callback transport issue, not Phase 123 code. Demotion-direction + bucket-B targets all passed. |
| 2 | debtor.nxt_lookup_requests CHECK constraints narrowed to 2-value sets (RESL-UNIFY-05 constraint half) | Follow-up: `2026-06-17-widen-back-nxt-lookup-requests-checks.md` | 1171 inert historical rows prevented constraint re-add; DELETE-only applied live per T-123-10 pre-flight deviation. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `web/lib/agentic-pipeline/resolve/steps/sender-match.ts` | resolve_candidates-backed sender_match (email_domain/email_address) | VERIFIED | Imports `lookupResolveCandidates`; builds both seed kinds; address-first precedence; is_unique_in_scope + isAutoEligibleStatus + inPrefixFamily gates; fail-closed |
| `web/lib/agentic-pipeline/resolve/steps/identifier-match.ts` | resolve_candidates-backed invoice resolution, legacy fallback removed | VERIFIED | Imports `lookupResolveCandidates`; invoice_no kind; root_party_id rollup; isAutoEligibleStatus filter; no lookupIdentifierToAccount |
| `web/lib/automations/sales-email/resolve-customer.ts` | Sales sender + factuur resolution over resolve_candidates | VERIFIED | Imports `lookupResolveCandidates`; sender uses email_address/email_domain; factuur uses invoice_no; corroboration signal shape (sender_domain, invoice_no) preserved |
| `web/lib/automations/debtor-email/nxt-zap-client.ts` | Registry client carrying only nxt.candidate_details + nxt.resolve_candidates | VERIFIED | NxtToolId union = exactly 2 members; all legacy wrappers/types/schemas/branches gone; ResponseSchemaByTool has 2 entries |
| `supabase/migrations/20260617_retire_legacy_lookup_tools.sql` | DELETE 2 zapier_tools rows + widen-back 2 nxt_lookup_requests CHECK constraints | VERIFIED (partial — DELETE applied live; constraint widen-back deferred per pre-flight) | DELETE statement present and applied live; constraint narrowing blocked by 1171 legacy rows; deferred to follow-up todo |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `sender-match.ts` | `lookupResolveCandidates` | email_domain/email_address back-search | WIRED | Line 35 import; line 94 call with both address + domain seeds |
| `identifier-match.ts` | `lookupResolveCandidates` | invoice_no back-search | WIRED | Line 22 import; line 86 call (runNumberBackSearchAuto AUTO path) + line 204 call (NON-AUTO path) |
| `resolve-customer.ts` | `lookupResolveCandidates` | email_domain/email_address + invoice_no back-search | WIRED | Line 46 import; line 192 call (sender); line 292 call (factuur) |
| `20260617_retire_legacy_lookup_tools.sql` | `public.zapier_tools` | DELETE WHERE tool_id IN (nxt.contact_lookup, nxt.identifier_lookup) | WIRED | Line 55-56 of migration; applied live (Plan 04 SUMMARY confirms) |

### Data-Flow Trace (Level 4)

Not applicable for this phase — the deliverable is resolution logic (data-routing, not UI rendering). The live-path evidence is provided by the `resolve_candidates = 163 requests / 163 complete-with-result` count from `debtor.nxt_lookup_requests` during the eval run (Plan 04 SUMMARY).

### Behavioral Spot-Checks

Step 7b: SKIPPED for the live eval path (requires live Zapier callback that does not land from this workstation, per known_execution_state). Unit test verification was confirmed via tsc 0 + vitest 2732 passing.

### Probe Execution

No probe scripts declared. The correctness harness (`scripts/eval/resolver-correctness-gate.ts`) is classified as requiring human execution per its external Zapier dependency.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RESL-UNIFY-01 | 123-01 | Debtor sender_match → resolve_candidates (email_domain/email_address), fail-closed | SATISFIED | sender-match.ts verified; legacy wrapper absent |
| RESL-UNIFY-02 | 123-01 | Debtor invoice → resolve_candidates (invoice_no); identifier_lookup removed; auto_safe_kinds reconciled via Option A | SATISFIED | identifier-match.ts verified; Option A locked by operator in 123-01 Task 3 |
| RESL-UNIFY-03 | 123-02 | Sales sender + factuur → resolve_candidates; corroboration signal shape preserved | SATISFIED | resolve-customer.ts verified; identifier_kind "sender_domain" + "invoice_no" present |
| RESL-UNIFY-04 | 123-03 | Legacy tools removed from nxt-zap-client.ts + all code; atomic (tsc 0 + full vitest green) | SATISFIED | Repo-wide grep = 0 functional references; nxt-zap-client.ts has 2-member NxtToolId |
| RESL-UNIFY-05 | 123-04 | 2 zapier_tools rows deleted + 2 CHECK constraints widened back; check:supabase 0 ERROR | PARTIAL — DELETE satisfied; constraint widen-back DEFERRED (tracked) | zapier_tools DELETE live-confirmed; CHECK constraint deferral documented in follow-up todo per T-123-10 pre-flight; check:supabase 0 ERROR confirmed |
| RESL-UNIFY-06 | 123-04 | 100-email eval: no regression below 64%, corroboration firing, operator-reviewed | PARTIAL — demotion-direction targets PASSED; absolute-% DEFERRED | 4/4 confident-wrong demoted; 12/12 bucket-B; absolute-% blocked by candidate_details callback issue; operator approved-to-close |
| RESL-UNIFY-07 | 123-01, 123-02 | Step modules + sales adapter: zero swarm-name runtime branch | SATISFIED | grep confirms zero swarm literals in production step files and sales adapter |

### Anti-Patterns Found

The code review (123-REVIEW.md) identified two critical and three warning findings. The critical findings are surfaced below. The warnings are advisory and do not block the code/DB unification goal.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `engine.ts` | 308, 316 | `llmTiebreak` passed to `runSenderMatch`/`runIdentifierMatch` in the corroboration collect loop | WARNING (advisory CR-01) | D-03 protocol: the corroboration path promises "NO LLM call, score deterministically" (comment at line 258). With `debtorP0Config` having `corroboration` enabled + `sender_match` in precedence, an ambiguous sender triggers a real LLM call on this path. The min_signals=2 cap limits impact (sole llm_tiebreaker signal caps below AUTO), but the LLM call is still non-deterministic and billable. Fix: pass a noop tiebreaker in the corroboration collect loop. |
| `engine.ts` | 287 | `status: null` hardcoded in `pushSignal` | INFO (WR-01) | Stopped-account customers bypass the auto-eligible status gate in the boost tier. `isAutoEligibleStatus(null)` returns true, so a stopped-account sender signal could contribute to a corroboration boost. The sales adapter carries status correctly; the generic engine does not. |
| `resolve-customer.ts` | 214, 315 | `isAutoEligibleStatus` absent from sender_match + factuur_match filters | INFO (WR-02) | Sales path accepts stopped/inactive customers as `confidence: "high"` signals. Inconsistent with debtor step modules (which apply the filter). |
| `resolver-correctness-gate.ts` | 19 | Stale doc string references `contact_lookup` as still-live | INFO (WR-03) | Misleads operators; no runtime impact. |
| `replay-invoice-33050836.ts` | 4 | Stale doc string references `identifier_lookup` | INFO (WR-03) | Misleads operators; no runtime impact. |

**CR-01 classification:** This is a code review BLOCKER finding (design protocol violation), but it is advisory to this verification. The phase goal — code removal + DB unification — is achieved. CR-01 is a correctness/design gap introduced in the Phase 123 implementation that should be fixed before the debtor corroboration path is relied on in production. Surfaced here as a human verification item.

### Human Verification Required

#### 1. Confirm CR-01 disposition: corroboration collect loop LLM tiebreaker

**Test:** Inspect `engine.ts` lines 301-320 (the corroboration collect loop). Confirm that `llmTiebreak` is the actual closure passed to `runSenderMatch` and `runIdentifierMatch` on lines 308 and 316. Decide: (a) fix by replacing with a noop tiebreaker, or (b) formally accept the deviation with documented rationale that the min_signals=2 cap is sufficient mitigation.

**Expected:** Either the fix is applied (noop closure as described in 123-REVIEW.md CR-01), or a documented acceptance record is added to this VERIFICATION.md frontmatter under `overrides:`.

**Why human:** This is a design-protocol question (D-03 "no LLM in the corroboration collect path") that requires an operator decision on whether the existing min_signals=2 cap is sufficient mitigation or whether the protocol must be strictly honored.

#### 2. Re-run frozen 100-email correctness gate (RESL-UNIFY-06 absolute-% acceptance)

**Test:** Fix the `candidate_details` async-callback transport issue (tracked in `.planning/todos/pending/2026-06-17-candidate-details-callback-and-clean-eval-rerun.md`), then run: `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report` and inspect the updated RERUN-FINDINGS.md.

**Expected:** Overall correct (reachable, GT known) >= 64% baseline; confident-wrong AUTO rows #2/#85/#95/#97 remain demoted (confidence != high); gold-signal non-regression = 0 rows; bucket-B = 12/12 resolved-or-demoted.

**Why human:** Requires a live Zapier callback round-trip (candidate_details Zap) that is currently stuck pending. Cannot be verified from this workstation without fixing the callback transport first.

#### 3. Apply deferred CHECK constraint widen-back (RESL-UNIFY-05 constraint half)

**Test:** Run `SELECT count(*) FROM debtor.nxt_lookup_requests WHERE tool_id IN ('nxt.contact_lookup','nxt.identifier_lookup') OR lookup_kind IN ('sender_to_account','identifier_to_account')`. If count = 0 (after pruning inert rows), apply the constraint-widen-back portion of `20260617_retire_legacy_lookup_tools.sql` (the ALTER TABLE sections). Confirm CHECK constraints list only `nxt.candidate_details` + `nxt.resolve_candidates` (tool_id) and `candidate_details` + `resolve_candidates` (lookup_kind). Run `npm run check:supabase` → 0 ERROR.

**Expected:** Both CHECK constraints narrowed; check:supabase 0 ERROR; migration state matches the written migration file.

**Why human:** Requires live database access (Supabase MCP) and a prior row-prune of 1171 inert historical rows. Tracked in `.planning/todos/pending/2026-06-17-widen-back-nxt-lookup-requests-checks.md`.

### Gaps Summary

No blocking code or DB-removal gaps. The phase goal — unifying both debtor and sales Stage-2 resolver paths onto `nxt.resolve_candidates` and removing `nxt.contact_lookup` + `nxt.identifier_lookup` from code and from the live `zapier_tools` table — is achieved in the codebase and in the database.

Three items remain open for human action:

1. **CR-01 (D-03 protocol):** The corroboration collect loop passes a real `llmTiebreak` closure to the sender and invoice steps. This was introduced during Phase 123 implementation and is an active protocol violation (though operationally limited by min_signals=2). Requires an operator decision to either fix or formally accept.

2. **Absolute-% eval acceptance (RESL-UNIFY-06):** The 64%-baseline gate cannot be cleared until the pre-existing `candidate_details` async callback issue is resolved. Demotion-direction and bucket-B targets passed in the current run. This is tracked and deferred per operator approval.

3. **CHECK constraint widen-back (RESL-UNIFY-05 partial):** 1171 inert historical rows prevented constraint narrowing at migration time. The rows are audit data; the constraint stays wide until they are pruned. This is tracked and deferred per T-123-10 pre-flight deviation.

---

_Verified: 2026-06-17_
_Verifier: Claude (gsd-verifier)_
