---
phase: 84-stage-1-noise-rules-for-ap-automation-fyi-traffic
plan: 03
subsystem: stage-1-noise-filter
tags: [stage-1, classify, classifier-screen-worker, regex, loopback, noise]
requires:
  - 84-01-SUMMARY.md (RED test specs)
  - 84-02-SUMMARY.md (data layer + tenant_domains column + codegen)
provides:
  - "7 in-classifier regex matchers for Phase 84 D-01 keys"
  - "own_outbound_invoice_loopback worker-side rule with R-02 direction guard"
  - "direction field event-widening across stage-0 → stage-1"
affects:
  - web/lib/debtor-email/classify.ts
  - web/lib/inngest/functions/classifier-screen-worker.ts
  - web/lib/inngest/functions/stage-0-safety-worker.ts
  - web/lib/classifier/corpus-mapping.ts (Rule 2 — AGREEMENT_MAP exhaustiveness)
tech-stack:
  added: []
  patterns:
    - "Specificity-first regex ordering (Pitfall 2): sender+subject AND-anchored matchers placed BEFORE generic SUBJECT_AUTO_REPLY / SENDER_PAYMENT_ROLE branches"
    - "Anchored regex (^/$) with bounded quantifiers (\\d{1,12}) — V5 ASVS / ReDoS guard"
    - "Producer-side event-widening (Pitfall 3 / RESEARCH Open Q #1) — direction threaded through stage-0-safety-worker.ts emit"
    - "Worker-side loopback rule (NOT classify.ts) — direction + tenant_domains in scope only in the worker"
key-files:
  created: []
  modified:
    - web/lib/debtor-email/classify.ts
    - web/lib/inngest/functions/classifier-screen-worker.ts
    - web/lib/inngest/functions/stage-0-safety-worker.ts
    - web/lib/classifier/corpus-mapping.ts
decisions:
  - "Loopback rule lives in classifier-screen-worker.ts (NOT classify.ts) — RESEARCH Pitfall 3 + PATTERNS Option A"
  - "Direction default = 'inbound' when producer omits the field — every ingest path today writes direction='inbound' to email_pipeline.emails (debtor-email/ingest/route.ts:236); outbound forwards would require explicit population"
  - "Coupa-Betaald / Coupa-Goedgekeurd anchored on 'door ISS' only — CBRE variants stay in Stage 3 for dispute visibility (RESEARCH Open Q #2)"
  - "Passed fromFromEvent into classify() (was hardcoded '') so the new sender-anchored matchers can fire; pre-existing matchers were subject+body driven and unaffected"
  - "Coupa subject anchors are subject-only (no sender pin) — the Dutch phrasing 'gemarkeerd als Betaald door ISS' / 'goedgekeurd voor betaling door ISS' is itself the discriminator and the existing payment_admittance corpus has zero cross-matches per CORPUS-SAMPLES.md"
  - "AGREEMENT_MAP filled with empty mappings for the 8 new keys (Rule 2) — promotion path is D-05 corpus-evidence + classifier_rule_telemetry, NOT the 60-08 LLM-judge AGREEMENT_MAP"
metrics:
  duration_minutes: ~25
  completed: 2026-05-20
  commits: 3
  tests_added: 0 (Wave 0 already wrote the RED tests)
  tests_now_green: 79 (28 classify + 23 screen-worker + 28 existing classify)
---

# Phase 84 Plan 03: Stage 1 noise matchers + loopback wiring Summary

Implemented the 7 in-classifier regex matchers + the worker-side own_outbound_invoice_loopback rule + the direction event-widening, turning all 84-01 RED tests GREEN with no regressions on the existing Stage 1 test suites.

## What was built

### Task 1 — `classify.ts` 7 new matchers (commit `0b3a4a07`)

- Extended `Category` union with all 8 D-01 keys (7 in-classifier + own_outbound_invoice_loopback for type-completeness across consumers).
- Added 7 new regex consts placed BEFORE the existing `subjectIsAutoReply` / `SENDER_PAYMENT_ROLE` branches (Pitfall 2 specificity-first):
  - `SUBJECT_COUPA_INVOICE_PAID` — `/^Factuur \d{1,12} gemarkeerd als Betaald door ISS$/i`
  - `SUBJECT_COUPA_INVOICE_APPROVED` — `/^Factuur \d{1,12} is goedgekeurd voor betaling door ISS$/i`
  - `SENDER_ISS_PTP` + `SUBJECT_ISS_PTP_AUTOREPLY` (AND-gated)
  - `SENDER_FRIESLANDCAMPINA` + `SUBJECT_FC_CANDEX` (AND-gated)
  - `SUBJECT_M365_QUARANTINE` (subject-only; cross-tenant discriminator)
  - `SENDER_RSK_PHISHING` + `SUBJECT_PHISHING_NOTICE` (AND-gated, R-03 one-supplier-narrow)
  - `SENDER_FARMPLUS` + `SUBJECT_OR_BODY_BANK_CHANGE` (AND-gated)
- Each branch returns `{ category: "<key>", confidence: 0.99, matchedRule: "<key>" }` — flat naming per RESEARCH Open Q #3.
- All anchored (^/$ where applicable) with bounded `\d{1,12}` quantifiers — ReDoS guard.

### Task 2 — Worker loopback + direction passthrough (commit `b6707bf8`)

- **stage-0-safety-worker.ts**: optional `direction: "inbound" | "outbound" | null` added to the event.data destructure, threaded into BOTH `classifier/screen.requested` emit-sites (operator-override branch + main safe-verdict branch).
- **classifier-screen-worker.ts**:
  - Destructured `directionFromEvent` from event.data.
  - Passed `fromFromEvent ?? ""` into `classify()` (was hardcoded `""`); this unblocks the 4 sender-anchored matchers from Task 1.
  - Loopback evaluation inserted AFTER `step.run("regex")` completes and BEFORE the LLM 2nd-pass entry. Fires only when:
    1. Regex abstained (`category === "unknown"`),
    2. `direction === "inbound"` (R-02 spoofing guard; missing field defaults to inbound),
    3. `fromDomain ∈ swarmRow.tenant_domains` (live registry via `loadSwarm` cache).
  - Mutates `regexOutcome` + `finalCategoryKey` in-memory; no new `inngest.send`; CLAUDE.md `dae6276` SendFn cast pattern preserved (no `const send = inngest.send`).
  - `regexOutcome` declaration changed `const` → `let` to allow the mutation.

### Rule 2 deviation — `corpus-mapping.ts` (commit `1fe541b1`)

Extending `Category` triggered `Record<Category, ...>` exhaustiveness fail in `AGREEMENT_MAP`. Added empty mappings for all 8 new keys — promotion path for these noise keys is the D-05 corpus-evidence flow + `classifier_rule_telemetry` view (aggregates `agent_runs.rule_key` directly), NOT the 60-08 LLM-judge `AGREEMENT_MAP`. Empty arrays force `isAgreement` to return false, which is the correct behavior.

## Verification

### Test evidence

```
classify.test.ts:                  56 passed (28 Phase 84 + 28 existing)
classifier-screen-worker.test.ts:  23 passed (4 Phase 84 D-03 loopback + 19 existing)
                                   ─────────
                                   79 PASS, 0 FAIL on touched surface
```

Phase 84 D-03 loopback group (all 4 GREEN):
- positive: tenant-domain inbound from administratie@fire-control.nl → own_outbound_invoice_loopback
- negative (D-03 direction guard): direction='outbound' MUST NOT trigger
- negative (Pitfall 3 spoofing): external sender claiming tenant domain MUST NOT trigger
- negative (R-05 default): empty tenant_domains MUST NOT trigger

Phase 84 D-01 in-classifier matcher groups (all 28 GREEN across 7 describe-groups):
- coupa_invoice_paid_notification (5: 3 positive + 1 negative + 1 boundary 'betwist')
- coupa_invoice_approved_notification (5: 3 positive + 1 negative + 1 boundary 'door CBRE')
- iss_ptp_autoreply (5: 3 positive + 1 negative + 1 boundary generic 'Automatisch antwoord:')
- frieslandcampina_portal_reject (5)
- m365_quarantine (5, includes [SPAM] boundary win)
- sender_phishing_notice (5, includes R-03 stranger-sender boundary)
- supplier_bank_change_notification (5, includes external-sender IBAN boundary)

### Type-check
`npx tsc --noEmit` → clean (0 errors).

### Codegen drift
`git diff --exit-code web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts` → clean (file matches the Wave 1 commit; codegen runner requires `.env.local` which is not in the worktree, but file content is byte-stable).

### Static checks
- Hard-separation invariant intact: this wave only touches `swarm_noise_categories` consumers (matchers, worker rule, type union) — zero edits to `swarm_intents` or any Stage 3 path. Per CLAUDE.md / docs/agentic-pipeline/README.md hard-separation rule, the invariant holds.
- REQ-6 zero `swarm_type === 'X'` branches in classifier-screen-worker.ts — existing static check at classifier-screen-worker.test.ts:655 still GREEN.
- ReDoS guard: all 7 new regex consts use `^`/`$` anchors and bounded `\d{1,12}` quantifiers; no nested `(...)+` patterns introduced.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Type exhaustiveness] AGREEMENT_MAP missing 8 new Category keys**
- **Found during:** Task 3 (`npx tsc --noEmit` after Task 1 + 2 commits).
- **Issue:** Extending `Category` union broke `Record<Category, ...>` in `web/lib/classifier/corpus-mapping.ts` line 16.
- **Fix:** Added empty `{ categories: [], intents: [] }` mappings for all 8 new keys; rationale documented inline (Phase 84 noise keys promote via D-05 corpus-evidence + `classifier_rule_telemetry`, not via this 60-08 LLM-judge map).
- **Files modified:** web/lib/classifier/corpus-mapping.ts
- **Commit:** `1fe541b1`

**2. [Rule 3 - Producer wiring] classify() was called with `from: ""` hardcoded**
- **Found during:** Task 2 design (line 199-204 of classifier-screen-worker.ts).
- **Issue:** Pre-existing `from: ""` worked for the pre-Phase-84 matchers (all subject+body driven) but blocks the 4 sender-anchored Phase 84 matchers from firing.
- **Fix:** Pass `fromFromEvent ?? ""` (already destructured for the Plan 06 dispatch block) into classify().
- **Files modified:** web/lib/inngest/functions/classifier-screen-worker.ts (same commit as loopback wiring).
- **Commit:** `b6707bf8`

**3. [Rule 3 - Const→let mutation] regexOutcome needed mutation for loopback skip-LLM**
- **Found during:** Task 2 implementation.
- **Issue:** `const regexOutcome = await step.run(...)` blocks the loopback rule from updating `regexOutcome.category` (needed so `if (regexOutcome.category === "unknown")` skips LLM 2nd-pass).
- **Fix:** Changed `const` → `let`. Documented inline that the mutation is intentional.
- **Commit:** `b6707bf8`

## Deferred Issues (out of scope)

55 pre-existing test failures across the full vitest suite (16 test files). Verified identical fail-count on `c6269900` baseline (Wave 1 commit) via `git stash` round-trip — Phase 84 introduces ZERO regressions. Notable pre-existing failure on touched surface:
- `tests/classifier/corpus-mapping.test.ts` 'AGREEMENT_MAP exposes all 5 Category values' — assertion lists 5 keys but the file had 6 pre-Phase-84 (missing `spam`). Pre-existing; not Phase 84 work.

These are logged for a future maintenance pass — they do NOT block Wave 2 acceptance because:
1. The 84-01 RED tests are GREEN (the spec for this wave).
2. The Phase 84 surface (classify + screen-worker) is GREEN.
3. tsc is clean.
4. No new regressions introduced.

## Open follow-ups (not blocking)

- `npm run codegen && git diff --exit-code` requires `.env.local` in the worktree to fully exercise; the generated file is byte-stable vs. Wave 1, so drift gate is implicitly satisfied. The orchestrator's pre-merge sweep should run codegen in the parent repo (which has .env.local) to confirm.
- Production ingest routes (`web/app/api/automations/debtor-email/ingest/route.ts`, `sales-email/ingest/route.ts`) do NOT explicitly send `direction` on the `stage-0/email.received` event today; the Stage 1 worker defaults missing `direction` to `"inbound"` so production behavior is unchanged. A future wave can wire the explicit `direction: "inbound"` field on the producer emit to make the contract explicit (the field IS already written to `email_pipeline.emails` at debtor-email/ingest/route.ts:236).

## Self-Check: PASSED

- web/lib/debtor-email/classify.ts: MODIFIED (verified via `git log -1 --name-only HEAD~2`)
- web/lib/inngest/functions/classifier-screen-worker.ts: MODIFIED
- web/lib/inngest/functions/stage-0-safety-worker.ts: MODIFIED
- web/lib/classifier/corpus-mapping.ts: MODIFIED (Rule 2 deviation)
- Commits 0b3a4a07, b6707bf8, 1fe541b1: all present in `git log c6269900..HEAD`
- 79/79 Phase 84-touched tests GREEN
- tsc clean
- Hard-separation invariant intact
