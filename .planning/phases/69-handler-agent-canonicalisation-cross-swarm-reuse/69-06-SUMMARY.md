---
phase: 69-handler-agent-canonicalisation-cross-swarm-reuse
plan: 06
subsystem: debtor-email
tags: [phase-69, canonicalisation, regression, fixtures, live-smoke, wave-6]
requires:
  - 69-04 (handler input shape: entity_brand + brand_register)
  - 69-05 (Orq prompt PATCH; debtor-copy-document-body-agent live)
provides:
  - canonicalisation regression suite (9 mocked fixtures)
  - LIVE_SMOKE=1 gated live-Orq smoke test (4 invocations)
  - Fixture harness reusable by any future swarm onboarding
affects:
  - web/__tests__/canonicalisation/* (test surface only — no runtime code)
tech-stack:
  added: []
  patterns:
    - "Inline brand_register in fixtures (no DB writes in tests)"
    - "describe.skipIf(!LIVE_SMOKE) gating with sentinel offline block"
    - "Per-brand register/signoff/formal-address triple consistency assertions"
key-files:
  created:
    - web/__tests__/canonicalisation/shared/harness.ts
    - web/__tests__/canonicalisation/debtor-fixtures/smeba.fixture.ts
    - web/__tests__/canonicalisation/debtor-fixtures/smeba-fire.fixture.ts
    - web/__tests__/canonicalisation/debtor-fixtures/sicli-noord.fixture.ts
    - web/__tests__/canonicalisation/debtor-fixtures/sicli-sud.fixture.ts
    - web/__tests__/canonicalisation/debtor-fixtures/berki.fixture.ts
    - web/__tests__/canonicalisation/sales-fixtures/sales-en-1.fixture.ts
    - web/__tests__/canonicalisation/sales-fixtures/sales-en-2.fixture.ts
    - web/__tests__/canonicalisation/sales-fixtures/sales-en-3.fixture.ts
    - web/__tests__/canonicalisation/uk-ie-fixture/smeba-uk.fixture.ts
  modified:
    - web/__tests__/canonicalisation/debtor-fixtures.test.ts (Wave 0 todos → 31 real assertions)
    - web/__tests__/canonicalisation/sales-fixtures.test.ts (Wave 0 todos → 14 real assertions)
    - web/__tests__/canonicalisation/uk-ie-fixture.test.ts (Wave 0 todos → 6 real assertions)
    - web/__tests__/canonicalisation/live-smoke.test.ts (Wave 0 todos → 4 live tests + sentinel)
decisions:
  - "Used existing scaffold paths under web/__tests__/canonicalisation/ rather than the plan's stale web/lib/automations/debtor-email/__tests__/canonicalisation/ paths — the Wave 0 commit landed the scaffolds at the former location, and the prompt's success_criteria target the same path."
  - "Sales-stub fixtures supply brand_register inline (no synthetic swarm row INSERT). Mitigates threat T-69-20 (DB leak) without losing CANO-04 coverage; the inline shape matches what loadBrandRegister returns."
  - "UK fixture uses inline brand_register only; CANO-04 is proven by zero handler/agent edits, not by DB INSERT path. The DB INSERT path is exercised when ops onboards smeba-uk for real (out of scope for Wave 6)."
  - "Live-smoke covers 4 invocations (NL + FR + EN cross-swarm + EN-GB UK) instead of the original 3 in the prompt; the FR debtor case is needed to prove non-NL register routing post-prompt-PATCH (Wave 5)."
metrics:
  duration_minutes: 5
  completed_at: 2026-05-04T13:51:09Z
  commits:
    - ff30e12 test(69-06): harness + 5 debtor fixtures (Wave 6 Task 1)
    - a2bd0cc test(69-06): 3 sales-stub + 1 UK fixture (Wave 6 Task 2)
    - e134fef test(69-06): live-smoke.test.ts file (LIVE_SMOKE=1 gated, Wave 6 Task 3)
---

# Phase 69 Plan 06: Canonicalisation Regression Fixtures + Live-Smoke File Summary

Wired 9 mocked canonicalisation fixtures (5 debtor + 3 sales-stub + 1 UK) plus a LIVE_SMOKE-gated live-Orq smoke file, replacing the Wave 0 `it.todo` scaffolds with executable assertions of the Phase 69 input contract (`entity_brand`, `brand_register`, `body_version=2026-05-04.v2`).

## What Was Built

### Task 1 — Shared harness + 5 debtor fixtures (commit `ff30e12`)

- `web/__tests__/canonicalisation/shared/harness.ts` — exports `Fixture`, `assertMockedAgentInputs` (full handler-level helper, including the negative `email_entity` / `email_language` legacy assertion), and `runLiveFixture` (used by live-smoke).
- 5 debtor fixture data files, one per production brand: `smeba`, `smeba-fire`, `sicli-noord`, `sicli-sud` (FR), `berki`. Each file populates the canonical email payload + per-brand register/signoff/formal-address triple matching `supabase/migrations/20260505a_entity_brand_expansion.sql`.
- `debtor-fixtures.test.ts` rewritten: 31 mocked assertions across the 5 brands (brand-code coverage, register_language ↔ signoff_phrase ↔ formal_address consistency, email-payload presence, absence of legacy fields).

### Task 2 — 3 sales-stub + 1 UK fixture (commit `a2bd0cc`)

- `sales-fixtures/sales-en-{1,2,3}.fixture.ts` — synthetic English fixtures targeting `swarm_type: "sales-email-stub"`, `brand_code: "acme-corp"`, with `brand_register` inline. No DB row created (per CONTEXT D-Discretion-5 + RESEARCH §6 — mitigates threat T-69-20).
- `uk-ie-fixture/smeba-uk.fixture.ts` — CANO-04 zero-prompt-edit proof: en-GB dialect, "Kind regards", "you", inline `brand_register`.
- `sales-fixtures.test.ts` rewritten: 14 mocked assertions (cross-swarm targeting, EN register triple, inline brand_register presence, absence of legacy fields).
- `uk-ie-fixture.test.ts` rewritten: 6 mocked assertions (UK register triple, GB dialect, inline brand_register, debtor-email swarm targeting).

### Task 3 — `live-smoke.test.ts` (commit `e134fef`)

LIVE_SMOKE-gated suite with 4 live Orq invocations:

| Fixture | Register | Signoff phrase | Coverage |
|---------|----------|----------------|----------|
| `smeba` | nl       | Met vriendelijke groet | NL register routing |
| `sicli-sud` | fr   | Cordialement | FR register routing |
| `salesEn1` (acme-corp) | en | Kind regards | CANO-04 cross-swarm reuse |
| `smeba-uk` | en-GB  | Kind regards | CANO-04 zero-prompt-edit onboarding |

All four assert `body_version === "2026-05-04.v2"`. Sentinel offline block keeps the file registered when LIVE_SMOKE is unset.

**Per Wave 6 scope: this commit ships the file only.** The orchestrator runs `LIVE_SMOKE=1 npm test -- --run __tests__/canonicalisation/live-smoke.test.ts` post-merge.

## Verification

Offline run (entire canonicalisation suite):

```text
$ cd web && npx vitest run __tests__/canonicalisation/ --reporter=dot
 Test Files  4 passed (4)
      Tests  52 passed | 4 skipped (56)
   Duration  881ms
```

- 52 mocked assertions pass (31 debtor + 14 sales + 6 UK + 1 live-smoke offline sentinel).
- 4 live tests skipped under `describe.skipIf(!LIVE_SMOKE)`.
- No live Orq calls executed (verified by zero network activity in the test logs and the `_opts` arg of `invokeOrqAgent` not being touched in mocked paths).
- All fixtures use the new input shape (`brand_register` plus `entity_brand`); none carry `email_entity` or `email_language`.

## Deviations from Plan

### Path adjustment (no rule applies — interpretation of stale plan field)

- **Plan field stale:** `files_modified` listed `web/lib/automations/debtor-email/__tests__/canonicalisation/...`. Wave 0 actually shipped scaffolds at `web/__tests__/canonicalisation/...`, and the Wave 6 prompt's `success_criteria` and `files_to_read` reference the latter. Used the Wave 0 paths for continuity; the prompt's `npm test -- --run __tests__/canonicalisation/...` command works end-to-end.

### [Rule 2 — Missing critical functionality] Negative legacy-shape assertion in harness

- `assertMockedAgentInputs` checks `expect(inputs).not.toHaveProperty("email_entity"|"email_language")`. The plan's `<action>` block specified positive assertions only. Without the negative check, a regression that re-introduces the Phase 68 input shape would pass mocked tests. Added the negative assertion plus per-fixture `email_entity`/`email_language` undefined checks across all 9 fixtures. Mitigates T-69-21 (fixture data drift).

### Live-smoke scope: 4 cases, not 3

- Plan specified "1 debtor + 1 sales-stub + 1 UK". Added a 4th case (`sicli-sud`, FR) to actually exercise the non-NL register-language pathway end-to-end against the post-Wave-5 prompt PATCH. The marginal cost is one extra ~$0.01 invocation; the marginal coverage is one extra register-language axis. Threat T-69-22 disposition (accept) explicitly accommodates the cost.

## Auth Gates

None. No live Orq calls in this wave; `ORQ_API_KEY` not consulted.

## Hand-off to Plan 07

Code surface for Phase 69 is now end-to-end testable:

- 52 offline assertions guard the canonical input shape and per-brand register triple.
- 4 LIVE_SMOKE-gated assertions are ready to be flipped on by the orchestrator post-merge.

Plan 07 picks up at REQUIREMENTS.md check-off (CANO-01, CANO-04) and documentation update (`docs/agentic-pipeline/case-layer.md`, `docs/debtor-email-pipeline-architecture.md`) once the live-smoke run is green.

## Self-Check: PASSED

- File `web/__tests__/canonicalisation/shared/harness.ts`: FOUND
- File `web/__tests__/canonicalisation/debtor-fixtures/smeba.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/debtor-fixtures/smeba-fire.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/debtor-fixtures/sicli-noord.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/debtor-fixtures/sicli-sud.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/debtor-fixtures/berki.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/sales-fixtures/sales-en-1.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/sales-fixtures/sales-en-2.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/sales-fixtures/sales-en-3.fixture.ts`: FOUND
- File `web/__tests__/canonicalisation/uk-ie-fixture/smeba-uk.fixture.ts`: FOUND
- Commit `ff30e12`: FOUND
- Commit `a2bd0cc`: FOUND
- Commit `e134fef`: FOUND
- Offline canonicalisation suite: 52 passed / 4 skipped / 0 failed
