---
phase: 71-bulk-review-4-axis-redesign-capability-regression-eval-split
plan: 02
subsystem: debtor-email/override-pipeline
tags: [inngest, override-handler, route, security, replay-safe, zod, auth]
requires: [71-01]
provides:
  - debtor-email/override.submitted Inngest event flow
  - POST /api/automations/debtor-email/override route
  - debtorEmailOverrideHandler Inngest function
affects:
  - web/app/api/inngest/route.ts (function registration)
tech-stack:
  added: []
  patterns:
    - "vi.hoisted() for shared mutable test state across vi.mock factories (vitest v4 hoisting rule)"
    - "Inngest createFunction with cast event-config for ad-hoc events not in events.ts typed map"
    - "submitted_at generated inside step.run (Phase 65 replay-safety)"
    - "(inngest.send as unknown as SendFn) cast — no destructuring (Phase 65 this-binding)"
key-files:
  created:
    - web/app/api/automations/debtor-email/override/route.ts
    - web/app/api/automations/debtor-email/override/__tests__/route.test.ts
    - web/lib/inngest/functions/debtor-email-override-handler.ts
    - web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts
    - web/lib/pipeline-events/__tests__/fixtures/override-events.ts (stub from 71-01 contract)
  modified:
    - web/lib/pipeline-events/types.ts (added OverrideAxis + OverrideJson; tightened PipelineEventInput.override — stub from 71-01 contract)
    - web/app/api/inngest/route.ts (registered debtorEmailOverrideHandler)
decisions:
  - "Stage-3 axis dispatches via swarm_intents.handler_event (D-06) — handler_event name comes from registry, not from a hardcoded literal."
  - "Stage-2 axis customer field source = decision_details.customer_account_id ?? decision (string fallback). Lets clients pass either a structured object or the bare account id."
  - "Stage-1 axis re-dispatches the EXISTING classifier/verdict.recorded event (D-04) rather than introducing a new override-specific event — verdict-worker reroute logic stays the canonical reroute path."
  - "Stage-4 axis is emit-only by design (D-07/D-15) — handler imports zero Browserless / iController modules, mechanically guaranteeing no side effect."
  - "Inngest function registry lives at web/app/api/inngest/route.ts (not web/lib/inngest/functions/index.ts as the plan template suggested) — discovered via grep classifierVerdictWorker."
metrics:
  duration: ~6 minutes
  completed: 2026-05-05
---

# Phase 71 Plan 02: Override write path (route + Inngest handler) Summary

Built the override write-path backend: a Next.js POST route that authenticates, zod-validates and dispatches a `debtor-email/override.submitted` Inngest event, plus the `debtor-email-override-handler` function that emits one canonical override row to `pipeline_events` and fans out per-axis side effects (D-04 through D-07). All replay-safe per Phase 65 lessons.

## What shipped

- **POST /api/automations/debtor-email/override** — auth-gated (D-13), zod-validated (D-03/D-14), dispatches Inngest event with server-stamped `operator_id`. NO direct DB writes — every audit row goes through the handler so `step.run` boundaries protect replay.
- **debtorEmailOverrideHandler** — Inngest function, retries=0, listens on `debtor-email/override.submitted`. One emit step, one per-axis side-effect step. Exhaustive switch with `_exhaustive: never` guard.
- **Function registration** — added to the `serve({ functions: [...] })` array in `web/app/api/inngest/route.ts`.

## Test coverage (19 tests, all green)

**Route (7):** happy path, eval_type=regression default, eval_type=capability, D-13 spoof rejection, D-14 reason >1000 chars rejected, axis enum violation, unauthenticated 401.

**Handler (12):**
- axis-1 capability + axis-1 regression eval_type + classifier/verdict.recorded re-dispatch
- axis-2 no-rerun + axis-2 rerun (coordinator-complete with operator-override-replay) + axis-2 capability stage row
- axis-3 dispatch via registry handler_event + axis-3 audit (no DELETE) + axis-3 capability tag
- axis-4 emit-only (no inngest.send) + axis-4 no-iController-mutation
- replay safety (submitted_at generated each invocation)

## Acceptance criteria — all met

| Criterion | Status |
|---|---|
| File `route.ts` exports POST | ✓ |
| zod schema includes 4 axis literals + eval_type enum + reason max(1000) | ✓ |
| Route uses `createClient` (user session, NOT admin) | ✓ |
| Route uses `(inngest.send as unknown as SendFn)` cast | ✓ |
| `grep "const send = inngest.send" route.ts` returns 0 | ✓ |
| Handler file exports `debtorEmailOverrideHandler` | ✓ |
| Function id `"debtor-email/override-handler"`, trigger `"debtor-email/override.submitted"`, retries=0 | ✓ |
| All emit + side-effect logic wrapped in `step.run(...)` | ✓ |
| `new Date().toISOString()` inside `axis-${stage}-emit` step | ✓ |
| All inngest.send via SendFn cast (0 raw calls in handler) | ✓ |
| Exhaustive switch with `_exhaustive: never` | ✓ |
| Handler registered in `web/app/api/inngest/route.ts` | ✓ |
| `cd web && npx vitest run app/api/automations/debtor-email/override lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts` — 19/19 green | ✓ |
| tsc clean for new files | ✓ (only pre-existing errors in unrelated files: debtor-email-coordinator.test.ts, debtor-email-orchestrator.test.ts) |

## Deviations from Plan

### Forced by upstream-Plan-71-01 not yet merged

**Per the dependency_note in the executor prompt** (Plan 71-01 runs in parallel), the OverrideAxis literal-union and the `web/lib/pipeline-events/__tests__/fixtures/override-events.ts` fixtures are produced by 71-01. They were not present in this worktree's git base.

**Action taken (option 2 in dependency_note):**
- Added `OverrideAxis` + `OverrideJson` exports to `web/lib/pipeline-events/types.ts` and tightened `PipelineEventInput.override` to `OverrideJson | null` (matches 71-01 PLAN spec exactly — same names, same union members, same field shapes including `reason: string | null`).
- Created `web/lib/pipeline-events/__tests__/fixtures/override-events.ts` with the 8 canonical fixtures from 71-01 PLAN spec verbatim.

**Both stubs carry header comments documenting that 71-01 is the authoritative producer.** Orchestrator should reconcile on merge — both copies are byte-equivalent by design.

### Plan template inaccuracies (Rule 3 auto-fix — adapted to reality)

1. **`emitPipelineEvent` return type:** plan said `Promise<{ id: string }>` but actual implementation returns `Promise<void>` (verified via Read of `web/lib/pipeline-events/emit.ts`). Code in handler simply awaits the call without consuming the return — works correctly.
2. **Inngest function registry location:** plan said "find via grep `classifierVerdictWorker`" — that lookup pointed to `web/app/api/inngest/route.ts` (single-file `serve({...})`), not `web/lib/inngest/functions/index.ts`. Registered there.
3. **vi.mock hoisting in vitest v4:** template scaffold used a top-level `const inngestSend` referenced inside `vi.mock(...)`. Vitest v4 hoists `vi.mock` calls above all top-level statements, so the const is uninitialized at mock-factory-eval time. Wrapped shared mutable mock state in `vi.hoisted(() => {...})` per vitest docs.
4. **zod v4 record signature:** template used `z.record(z.unknown())` which is invalid in zod 4 (requires key + value schemas). Switched to `z.record(z.string(), z.unknown())`. Matches actual zod version `^4.3.6` from `web/package.json`.
5. **Inngest createFunction event-name typing:** the trigger `"debtor-email/override.submitted"` is not (yet) registered in `web/lib/inngest/events.ts` Events map. To avoid mutating events.ts (out-of-scope contract change), the trigger config is cast through `unknown as Parameters<typeof inngest.createFunction>[1]`. The runtime payload is independently typed inside the handler body.

None of these are scope creep — each was strictly required to compile + test on the actual codebase.

## Threat-model coverage

All 9 threats from the plan's STRIDE register are mitigated or accepted as designed. Specifically tested:

| Threat | Test |
|---|---|
| T-71-02-01 (operator_id spoof) | `D-13: client-supplied operator_id is IGNORED` |
| T-71-02-02 (reason length) | `D-14: reason >1000 chars rejected with 400` |
| T-71-02-03 (axis vocabulary) | `axis enum violation → 400` |
| T-71-02-07 (replay-unsafe id) | `submitted_at generated inside step.run — both invocations produce timestamps` |
| T-71-02-08 (auth bypass) | `unauthenticated → 401, no Inngest event` |
| T-71-02-09 (this-binding) | grep gate `0 raw inngest.send( calls in handler` |

T-71-02-04 (override storm) and T-71-02-05 (re_run_downstream cost) are documented as accepted risks bounded by the existing Phase 64 budget machinery + the UI submit-bar (Plan 04).

## Commits

- `9d18b3f` feat(71-02): stub OverrideAxis types + override-event fixtures from 71-01 contract
- `47e2acf` feat(71-02): POST /api/automations/debtor-email/override route
- `0d321c9` feat(71-02): debtor-email-override-handler Inngest fan-out

## Self-Check: PASSED

Verified:
- web/app/api/automations/debtor-email/override/route.ts — FOUND
- web/app/api/automations/debtor-email/override/__tests__/route.test.ts — FOUND
- web/lib/inngest/functions/debtor-email-override-handler.ts — FOUND
- web/lib/inngest/functions/__tests__/debtor-email-override-handler.test.ts — FOUND
- web/lib/pipeline-events/__tests__/fixtures/override-events.ts — FOUND
- Commit 9d18b3f — FOUND
- Commit 47e2acf — FOUND
- Commit 0d321c9 — FOUND
- 19/19 tests pass
