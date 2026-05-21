---
phase: 68
plan: 04
status: complete
date: 2026-05-04
---

# Plan 68-04 — label-resolver stage-2 emit → registry dispatch

## What was built

`classifier-label-resolver.ts`:
- Imported `evaluateSideEffects`.
- Replaced inline `if (result.customer_account_id !== null && !dryRun && (settingsRow?.icontroller_company ?? null) !== null && isKnownMailbox(...))` block (lines 246-280) with: call-site `isKnownMailbox` guard (function call — not a registry-gate equality), then `evaluateSideEffects(admin, "debtor-email", "stage2_match_live", { dry_run, customer_account_id_present, icontroller_company_present })`. For each `inngest_event` descriptor, fan out via `inngest.send` using `dispatch.event` (event name now sourced from registry, not literal).
- Full Phase 67 payload preserved verbatim (10 fields including `mailboxListUrl`, `icontroller_mailbox_id`, `entity`, `received_at`).
- `inngest.send` cast pattern via `SendFn` (no destructuring).

`__tests__/classifier-label-resolver.test.ts`:
- Added `evaluateSideEffectsMock` that mirrors the production-backfill descriptor and gate filter (so existing 5 Phase 67 tests pass without modification — their dry-run / unconfigured / unresolved cases still observe an empty dispatch list, identical to the old literal AND-chain).
- New describe block "Phase 68 — registry-driven Stage-2 dispatch":
  - Test 1: live + matched + configured → `evaluateSideEffectsMock` called with correct trigger + ctx; `inngest.send` invoked with the descriptor's event name.
  - Test 2: unknown mailbox → `evaluateSideEffectsMock` NOT called (call-site guard short-circuits); `inngest.send` not called.

## Tests

`npx vitest run lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` → **7 / 7 pass** (5 Phase 67 + 2 Phase 68).

## Acceptance criteria

- ✅ `evaluateSideEffects` invoked
- ✅ `stage2_match_live` literal present
- ✅ `debtor-email/icontroller-tag.requested` literal: 0 matches in source (now in registry)
- ✅ `isKnownMailbox` call-site guard preserved
- ✅ tests green

## Requirement satisfied

**SWRM-04** acceptance bullet 2 — Phase 67 icontroller-tag side-effect lives in `swarms.side_effects[]`, dispatched via `evaluateSideEffects`.
