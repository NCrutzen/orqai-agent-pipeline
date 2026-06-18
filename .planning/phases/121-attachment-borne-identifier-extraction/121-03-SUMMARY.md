---
phase: 121-attachment-borne-identifier-extraction
plan: 03
subsystem: attachment-extraction-acceptance
tags: [attachments, xlsx, stage-2, fold, acceptance, eval, corroboration]
requires:
  - "121-02 .xlsx/.csv extraction branches + 358-root many-customer demotion proof"
  - "116-05 attachment text → Stage 2 body_text fold (extracted-status branch)"
provides:
  - "Fold test: an extracted .xlsx lands in body_text under the UNTRUSTED label (ATID-01 end-to-end, mocked)"
  - "extract.test.ts contract assertion: invoice-like token survives into joined xlsx row text"
  - "121-03-ACCEPTANCE.md — verifiable-now vs deferred-to-123 acceptance split"
affects:
  - "web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts"
  - "web/lib/automations/attachments/__tests__/extract.test.ts"
tech-stack:
  added: []
  patterns:
    - "mirror the 116-05 fold-test harness (admin/supabase mock + step.run replay) for a swarm-agnostic xlsx fold proof"
    - "extend makeAdminMock attachmentRows override with optional filename (fold prepends filename-first)"
key-files:
  created:
    - .planning/phases/121-attachment-borne-identifier-extraction/121-03-ACCEPTANCE.md
  modified:
    - web/lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts
    - web/lib/automations/attachments/__tests__/extract.test.ts
decisions:
  - "test-only plan — no engine/config/steps/resolver edit (ATID-02 / STAGE2-01 holds, gate exit 0)"
  - "live debtor correctness-gate re-run DEFERRED to Phase 123 (blocked on debtor → resolve_candidates + DEBTOR_FETCH_WEBHOOK_SECRET) — recorded, not silently skipped"
metrics:
  duration: ~9m
  completed: 2026-06-18
---

# Phase 121 Plan 03: Eval-Grounded Build Acceptance Summary

Establishes Phase 121 build acceptance, cleanly split into what is verifiable NOW
(without the live debtor fixture or any outward NXT/Zapier call) and what is
DEFERRED to Phase 123. Adds the ATID-01 end-to-end fold proof — an extracted
`.xlsx` attachment lands in the Stage 2 resolver's `body_text` under the UNTRUSTED
label via the existing 116-05 fold, with NO engine edit — and authors
`121-03-ACCEPTANCE.md` recording the verifiable-now suite (green) and the blocked
live re-run as an explicit Phase-123 acceptance item.

## What was built

- **Fold test (Task 1, ATID-01)** in `stage-2-customer-resolver.test.ts`: a new
  `Phase 121-03` describe block mirrors the 116-05 fold-test harness (same
  admin/supabase mock + `step.run` replay shape). It mocks ONE `email_attachments`
  row with `extraction_status='extracted'`, `filename='statement.xlsx'`, and
  Plan-02-shaped xlsx `extracted_text` (per-row CSV joined with `\n`, carrying the
  `17008876` invoice token). It asserts the resolver's `body_text` after
  `load-email` contains the filename, the invoice token, the
  `17008877,4200` row text, AND the `--- ATTACHMENTS (UNTRUSTED DATA` label — and
  that the filename is prepended BEFORE the row text (filename-first). Proves
  xlsx-borne identifiers reach the engine body extraction via the existing fold,
  no engine/resolver edit.
- **Contract assertion (Task 1)** in `extract.test.ts`: a `121-03 contract` test
  pins that a multi-digit invoice token (`17008876`) survives intact into the
  joined xlsx row text (`17008876,9000`, on its own row) — the exact contract the
  fold relies on.
- **`makeAdminMock` extension:** the `attachmentRows` override type gained an
  optional `filename` so the fold's filename-first prepend is exercised.
- **`121-03-ACCEPTANCE.md` (Task 2):** the verifiable-now vs deferred-to-123 split.

## Verifiable-now vs deferred-to-123 split (restated)

**(A) VERIFIABLE NOW** — green without the live fixture or any outward call:
- `.xlsx`/`.csv` extraction unit tests (Plan 02)
- the Task-1 fold test (ATID-01)
- the 358-root many-customer demotion proof (Plan 02)
- the no-engine-diff gate (`./scripts/no-engine-diff-check.sh` exit 0, ATID-02)

One-command suite (recorded in ACCEPTANCE.md section A):
`cd web && npx vitest run lib/automations/attachments/__tests__/extract.test.ts lib/inngest/functions/__tests__/stage-2-customer-resolver.test.ts lib/agentic-pipeline/resolve/__tests__/corroborate-many-customer.test.ts`
→ **3 files, 58 tests passed**. Acceptance: #24's extraction-gap is closed and its
many-customer guard holds (no confident-single AUTO), proven without the live fixture.

**(B) DEFERRED TO PHASE 123** — blocked manual acceptance item:
- the LIVE debtor correctness-gate re-run over the frozen 100
- exact command: `cd web && npx tsx scripts/eval/resolver-correctness-gate.ts --report`
- precondition: debtor migrated to `resolve_candidates` + `DEBTOR_FETCH_WEBHOOK_SECRET`
  in `web/.env.local`
- targets: `goldRegressed === 0` over #16/#19/#28/#29/#86; #24 resolves-or-demotes;
  #83 precedence verify-only (factuur-in-subject outranks sender — a Phase-120
  property, NOT a 121 change)
- blocked NOW because debtor uses the legacy lookup transport and this workspace
  has no `DEBTOR_FETCH_WEBHOOK_SECRET` (RESEARCH Pitfall 6); NO outward NXT/Zapier
  call is made in this phase. ATID-04 confirmation rides Phase 123.

## Carried Phase-123 dependency

The live debtor fixture re-run (gold-signal non-regression + #24 resolve-or-demote
+ #83 precedence verify) is the V9.5 acceptance baseline re-run; it is explicitly
deferred to Phase 123 and recorded in `121-03-ACCEPTANCE.md` section B as a blocked
item — not a silent gap.

## Verification results

- `npx vitest run` (Task-1 two-file suite) → 55 passed.
- `npx vitest run` (verifiable-now three-file suite) → 58 passed (3 files).
- `./scripts/no-engine-diff-check.sh` → PASS, exit 0 (engine/config/steps
  byte-identical to donor `b816c627`; ATID-02 / STAGE2-01 holds).
- `git diff HEAD` on engine/config/steps/resolver source → empty (test-only plan).
- `grep "ATTACHMENTS (UNTRUSTED DATA" …test.ts` → matches (fold label asserted).
- `grep "DEFERRED TO PHASE 123" …ACCEPTANCE.md` → matches.
- `grep "resolver-correctness-gate" …ACCEPTANCE.md` → matches (deferred command recorded).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The fold test exercises the live 116-05 fold over a Plan-02-shaped xlsx
extraction; no placeholder data.

## Open Checkpoint

Task 3 is a `checkpoint:human-verify` (gate=blocking, `autonomous: false`) — Phase
121 build acceptance. Both auto tasks are complete and committed; the checkpoint
awaits operator sign-off ("accepted") to close Phase 121 build acceptance. The live
fixture re-run remains a tracked Phase-123 acceptance item.

## Commits

- 5d0d842a — test(121-03): fold test — extracted .xlsx lands in body_text under UNTRUSTED label (ATID-01)
- 6681d8fa — docs(121-03): build acceptance — verifiable-now vs deferred-to-123 live re-run

## Self-Check: PASSED

- All created/modified files exist on disk.
- Both commits (5d0d842a, 6681d8fa) present in git history.
