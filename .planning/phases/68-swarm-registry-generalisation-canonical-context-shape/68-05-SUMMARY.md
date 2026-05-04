---
phase: 68
plan: 05
status: complete
date: 2026-05-04
---

# Plan 68-05 — orchestrator fan-out → registry handler-event lookup

## What was built

`coordinator-orchestrator.ts`:
- Imported `loadHandlerEvent` from `@/lib/swarms/registry`.
- Hoisted `SWARM_TYPE = "debtor-email"` constant.
- Replaced single `step.run("fan-out", ...)` with per-intent loop:
  - `step.run("resolve-handler-{intent}", ...)` looks up `loadHandlerEvent(admin, SWARM_TYPE, h.intent)` → throws `Error("no handler for intent \"X\" in swarm \"Y\"")` when null (D-12, no fallback).
  - `step.run("fan-out-{intent}", ...)` emits via `inngest.send` using `handler_event` from the registry.
- Both lookups + emits are inside `step.run` (Inngest memoises across replays).
- Payload preserved verbatim (run_id, email_id, automation_run_id, intent, handler_key, context_payload, budget_run_id, swarm_type, from_orchestrator).
- `inngest.send` cast pattern preserved (no destructuring).

`__tests__/debtor-email-orchestrator.test.ts`:
- Mocked `loadHandlerEvent` (default = pass-through `debtor-email/{intent}.requested`).
- Updated test 2 (`plan.handlers.length=2`) to assert per-intent step names (`resolve-handler-{intent}`, `fan-out-{intent}`) instead of the old single `fan-out` step.
- New describe block "Phase 68 — registry-driven handler-event resolution":
  - Test: descriptor's event name flows through (override `loadHandlerEvent` to return a custom event → `inngest.send` emits the custom name).
  - Test: missing intent → structured throw + `mark-failed` + no `inngest.send`.
  - Test: replay-safety — `resolve-handler-{intent}` step precedes `fan-out-{intent}` (lookup wrapped in step.run).

## Tests

`npx vitest run lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` → **7 / 7 pass**.

## Acceptance criteria

- ✅ `loadHandlerEvent` invoked (3 references in source)
- ✅ template-literal handler-event: 0 matches
- ✅ structured "no handler for intent" error present
- ✅ tests green

## Requirement satisfied

**SWRM-02** — orchestrator fan-out is registry-driven; new intents onboarded via `swarm_intents` INSERT only.
