---
phase: 68
plan: 07
status: complete
date: 2026-05-04
---

# Plan 68-07 — sales-email-stub integration test (SWRM-03 proof)

## What was built

`web/lib/swarms/__tests__/sales-email-stub.test.ts` — new integration test that:
- `beforeAll`: seeds `swarm_type = "sales-email-stub"` row with all 5 new Phase 68 columns populated + 3 `swarm_intents` rows (`lead_qualify`, `demo_request`, `pricing_query`).
- Idempotent pre-clean (in case a prior run left rows behind).
- 5 assertions exercising every Phase 68 helper:
  1. `loadSwarm` returns the stub with all 5 new columns populated.
  2. `loadSwarmIntents` returns exactly 3 stub intents.
  3. `loadHandlerEvent` maps `demo_request` → `sales-email/demo_request.requested` and `missing_intent` → null.
  4. `evaluateSideEffects` filters by trigger + gate (matches when `foo: true`, empty when `foo: false`).
  5. `loadCanonicalContextShape` returns the stored `stub.v1` shape.
- `afterAll`: `delete from swarms where swarm_type = STUB_SWARM` — `ON DELETE CASCADE` drops the 3 intent children.
- Skipped automatically when `SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_SUPABASE_URL` are absent (`describe.skipIf`).

## Tests

`npx vitest run lib/swarms/__tests__/sales-email-stub.test.ts` against the live Supabase project (`mvqjhlxfvtqqubqgdvhz`) → **5 / 5 pass** in 1.28s.

## Acceptance criteria

- ✅ `sales-email-stub` literal present
- ✅ `loadHandlerEvent.*demo_request` present
- ✅ `evaluateSideEffects` present
- ✅ `loadCanonicalContextShape` present
- ✅ `afterAll` cleanup present
- ✅ vitest exits 0 with service-role available

## Requirement satisfied

**SWRM-03** — onboarding a new swarm requires only SQL inserts. Zero source files were edited to add `sales-email-stub`; every Phase 68 helper transparently picks up the new swarm_type via the registry.
