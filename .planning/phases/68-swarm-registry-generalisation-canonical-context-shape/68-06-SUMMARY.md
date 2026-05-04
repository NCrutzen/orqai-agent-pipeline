---
phase: 68
plan: 06
status: complete
date: 2026-05-04
---

# Plan 68-06 — coordinator single-shot dispatch → swarm_intents

## What was built

`debtor-email-coordinator.ts`:
- Imported `loadHandlerEvent` (added to existing `loadSwarmCategories` import).
- Lines 213-243 (single-shot dispatch): replaced `loadSwarmCategories` + `category.swarm_dispatch` lookup with `step.run("resolve-handler-event", () => loadHandlerEvent(supabase, SWARM_TYPE, top.intent))`. Missing intent → throw `"no swarm_intents row for (debtor-email, X) — verify Phase 68 migration applied"`.
- Updated return field `dispatch_event: handler_event` (was `category.swarm_dispatch`).
- `loadSwarmCategories` import preserved — still used by the operator-override category-routing branch (line 196). Both registries coexist by design (RESEARCH § Site 4).

`__tests__/debtor-email-coordinator.test.ts`:
- Added `loadHandlerEventMock` to the `@/lib/swarms/registry` mock (default = pass-through `debtor-email/{intent}.requested`).
- Existing 5 tests pass unchanged (single-shot test still observes the same event name because the default mock matches the prior literal).
- Added 2 new SWRM-02 tests:
  - Custom registry routing: override `loadHandlerEventMock` → `inngest.send` emits the custom event name.
  - Missing intent → structured throw + `mark-failed` + verifies the error message points at "Phase 68 migration".

## Tests

`npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` → **7 / 7 pass**.

## Acceptance criteria

- ✅ `loadHandlerEvent` invoked (2 references)
- ✅ "no swarm_intents row for" error present
- ✅ tests green
- ✅ `loadSwarmCategories` retained for operator-override branch (line 196) — orthogonal route, by design

## Requirement satisfied

**SWRM-02** — V2 single-shot dispatch reads from `swarm_intents`. Both registries coexist (intents = Stage 3 ranked; categories = Stage 1 operator override).
