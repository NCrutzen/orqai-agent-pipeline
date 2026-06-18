---
phase: 123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too
plan: 01
subsystem: agentic-pipeline-stage-2-resolver
tags: [stage-2, resolve_candidates, debtor, sender-match, identifier-match, legacy-removal]
requires:
  - lookupResolveCandidates (nxt.resolve_candidates Zap 43uuz1r, resolver_index substrate)
  - resolver_index identifier kinds: email_domain, email_address, invoice_no (all live)
provides:
  - resolve_candidates-backed debtor sender_match (email_domain/email_address back-search)
  - resolve_candidates-backed debtor invoice resolution (invoice_no), legacy fallback removed
  - resolve/__tests__/ + resolve-debtor.test.ts driving the resolve_candidates mock (zero legacy wrapper mocks)
affects:
  - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
  - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
  - web/lib/agentic-pipeline/resolve/engine.ts
tech-stack:
  added: []
  patterns:
    - resolve_candidates single-substrate Stage-2 resolution (mirrors self-auth-match.ts)
    - prefix-family gate + is_unique_in_scope + distinct-party/distinct-root fail-closed
    - root_party_id rollup (D-04) for invoice resolution
key-files:
  created:
    - .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-01-SUMMARY.md
  modified:
    - web/lib/agentic-pipeline/resolve/steps/sender-match.ts
    - web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
    - web/lib/agentic-pipeline/resolve/engine.ts
    - web/tests/labeling/resolve-debtor.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/port-equivalence.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/corroboration-collect.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/precedence-inversion.test.ts
    - web/lib/agentic-pipeline/resolve/__tests__/rollup-divergence.test.ts
decisions:
  - "Task 3 auto_safe_kinds reconciliation — operator selected Option A: direct resolve_candidates(invoice_no) in the NON-AUTO block, independent of auto_safe_kinds; no debtor seed migration (Option B rejected)."
metrics:
  duration: "~1 minute (per-task commits); continuation close same-day"
  completed: 2026-06-17
  tasks: 4
  files: 8
---

# Phase 123 Plan 01: Rewire DEBTOR Stage-2 (sender + invoice) onto resolve_candidates Summary

Debtor `sender_match` and `identifier_match` now resolve the customer over the single
generic `nxt.resolve_candidates` substrate (email_domain/email_address back-search for
the sender path, invoice_no back-search for the invoice path), the two legacy per-kind
wrappers (`lookupSenderToAccount`/`lookupIdentifierToAccount`) are no longer called from
production code or mocked in any resolve test, both engine.ts call sites pass config, and
ambiguity fails closed to SUGGEST — with the auto_safe_kinds reconciliation locked to the
operator-confirmed Option A (direct call, no seed migration).

## What Was Built

- **Task 1 — sender_match → resolve_candidates** (commit `0284340a`): `runSenderMatch`
  rewritten to drop `lookupSenderToAccount`/`lookupCandidateDetails` and call
  `lookupResolveCandidates`, building both the full lowercased address (`email_address`)
  and the bare domain (`email_domain`) as identifiers; address-first precedence; single
  distinct in-scope party (is_unique_in_scope + auto-eligible status + prefix-family) →
  `method:"sender_match"`, `confidence:"high"`; ≥2 distinct → `llmTiebreak`; lookup
  error/missing scope → null (fail-closed). engine.ts both `runSenderMatch` call sites
  (no-corroboration loop + corroboration-collect loop) updated to pass config;
  `synthKindFor("sender_match")="sender_domain"` unchanged.
- **Task 2 — invoice path → resolve_candidates** (commit `c3871383`): the legacy
  `identifier_lookup` NON-AUTO block replaced by an `invoice_no` back-search over
  `resolve_candidates` that works **regardless of auto_safe_kinds**; root_party_id
  rollup (D-04); single distinct root (prefix-family + auto-eligible status) → high; ≥2
  distinct roots → `llmTiebreak`; prefix-mismatch/error → SUGGEST.
  `runNumberBackSearchAuto` AUTO pre-pass byte-unchanged.
- **Task 3 — auto_safe_kinds reconciliation decision** (no new commit — see Deviations):
  operator-confirmed Option A. The implementation already realizes Option A and the
  in-code markers documenting it already exist (`identifier-match.ts` header comment +
  the `option A, Plan 01 Task 3` inline note at the NON-AUTO block). No empty commit
  created.
- **Task 4 — test rewire** (commit `371a93f8`): the debtor behavior test plus all four
  `resolve/__tests__/` files (port-equivalence, corroboration-collect,
  precedence-inversion, rollup-divergence) rewired to drive the `lookupResolveCandidates`
  mock; every legacy wrapper mock declaration removed; corroboration-collect's C2 sender
  signal now injected via a `resolve_candidates` email_domain row while preserving the
  C1-vs-C2 disagreement assertion (confidence "medium").

## Decision Record — Task 3 (auto_safe_kinds reconciliation)

**Decision (operator):** Option A — keep the direct `resolve_candidates(invoice_no)` call
in the NON-AUTO block, independent of `auto_safe_kinds`.

**Rationale:** Live debtor is P0 with `auto_safe_kinds:[]`, which gates OFF the Phase-91
`runNumberBackSearchAuto` AUTO root-rollup tier. Option A makes the invoice path resolve
over `resolve_candidates` directly so live debtor still resolves invoices, **without**
turning on a new AUTO tier. This preserves the live AUTO/SUGGEST risk posture exactly
(auto_safe_kinds stays `[]`), keeps the ≥2 → `llmTiebreak` escalation (fail-closed), and
lets Plan 04's frozen 100-email eval score precisely the sender behavior change rather than
a new invoice AUTO posture.

**Option B rejected:** populating the debtor seed `auto_safe_kinds` with `invoice_no` would
turn on the root-rollup AUTO tier (no llmTiebreaker) — a live-posture change not covered by
the frozen eval. No debtor seed migration was added.

**Out of scope (unchanged):** the Phase-120 corroboration engine and the Phase-122
brand_id-combined invoice search remain out of scope for this plan.

## Deviations from Plan

### Task 3 — decision-only, no code change (per operator resume directive)

- **What:** Task 3 is a `checkpoint:decision`. The operator selected Option A, which Tasks
  1, 2, and 4 already implement. The resume directive specified: apply an in-code
  marker/comment only if absent, otherwise do not create an empty commit.
- **Outcome:** The Option-A markers already exist in `identifier-match.ts` (header comment
  lines 3-11 and the inline `option A, Plan 01 Task 3` note at the NON-AUTO block). No code
  change was required and no empty commit was created. Decision recorded here and in
  STATE.md.

Otherwise: plan executed exactly as written (Tasks 1, 2, 4 by the prior executor; Task 3
closed by decision in this continuation).

## Verification

- `cd web && npx tsc --noEmit` → 0 errors.
- `cd web && npx vitest run lib/agentic-pipeline/resolve lib/automations/sales-email tests/labeling`
  → 176 passed, 4 skipped, 14 todo (34 files passed, 6 skipped).
- `grep -rn "lookupSenderToAccount\|lookupIdentifierToAccount\|lookupCandidateDetails"
  web/lib/agentic-pipeline/resolve/steps/ web/lib/agentic-pipeline/resolve/__tests__/
  web/tests/labeling/resolve-debtor.test.ts` → nothing (legacy wrappers gone from steps +
  tests).
- `grep -nE "swarm_type|=== 'debtor'|=== 'sales'" sender-match.ts identifier-match.ts`
  → nothing (SWARM-02 swarm-agnostic gate green).

## Threat Model Compliance

- **T-123-01 (Spoofing, sender email_domain):** mitigated — prefix-family gate +
  is_unique_in_scope + distinct-party != 1 → null (SUGGEST). Eval-gated in Plan 04.
- **T-123-02 (Tampering, invoice AUTO):** mitigated — root-rollup distinct-root != 1 →
  SUGGEST; `isAutoEligibleStatus` filter; ≥2 → llmTiebreak (never silent confident pick).
- **T-123-03 (Info disclosure, intent allowlist):** accepted — reuses the existing
  `nxt.resolve_candidates` allowlist (intent "unknown" for debtor); no new tool/secret.
- **T-123-04 (Elevation, swarm-branch creep):** mitigated — grep asserts zero swarm
  literals in the shared step modules.

## Note for Plan 03

This is the capability-before-removal step: production code no longer **calls** the two
legacy wrappers, but the wrapper definitions, types, schemas, `NxtToolId` literals,
`callNxtTool` branches in `nxt-zap-client.ts`, the 2 `zapier_tools` rows, and the
`nxt_lookup_requests` CHECK constraints are still present — Plan 03 deletes them.

## Self-Check: PASSED

- FOUND: web/lib/agentic-pipeline/resolve/steps/sender-match.ts
- FOUND: web/lib/agentic-pipeline/resolve/steps/identifier-match.ts
- FOUND: .planning/phases/123-unify-stage-2-on-resolve-candidates-retire-legacy-lookup-too/123-01-SUMMARY.md
- FOUND commit 0284340a (feat sender_match)
- FOUND commit c3871383 (feat invoice path)
- FOUND commit 371a93f8 (test rewire)
