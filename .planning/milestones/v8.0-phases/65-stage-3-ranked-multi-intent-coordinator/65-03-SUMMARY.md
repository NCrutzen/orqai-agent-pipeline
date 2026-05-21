---
phase: 65-stage-3-ranked-multi-intent-coordinator
plan: 03
subsystem: agentic-pipeline
tags: [agentic-pipeline, debtor-email, coordinator, inngest, stage-3, escalation-gate]

requires:
  - phase: 65
    plan: 01
    provides: coordinator_runs table + intentAgentOutputSchemaV2 + INTENT_VERSION_V2 literal + 8-row INTENT vocabulary seed (swarm_categories.requires_orchestration column)
  - phase: 65
    plan: 02
    provides: live debtor-intent-agent v2 in Orq.ai (orqai_id 01KQECK191GE21CH8D8KEMTM9J) producing ranked output
  - phase: 64
    provides: Stage 0 safety worker emits debtor/email.received with optional run_id / automation_run_id / budget_run_id (D-15)
  - phase: 56.7
    provides: classifier-verdict-worker registry-driven swarm_dispatch idiom mirrored here
provides:
  - debtor-email-triage Inngest function rewritten in-place as Phase 65 coordinator V2 (D-10)
  - evaluateEscalationGate pure tri-state function (CORD-02) at coordinator/escalation-gate.ts
  - invokeIntentAgent V2 transport returning IntentAgentOutputV2 (CORD-01)
  - 9 new typed Inngest events in events.ts (1 orchestrator + 1 synthesis + 8 per-intent dispatch + run_id/automation_run_id/budget_run_id passthrough on debtor/email.received)
  - 18 vitest assertions across 5 files locking the v2 contract
affects: [65-04, 65-05, 66, 71]

tech-stack:
  added: []
  patterns:
    - "Registry-driven single-shot dispatch (D-04): event name read from public.swarm_categories.swarm_dispatch for ranked[0].intent — same idiom as classifier-verdict-worker.ts:149-176. Adding a new intent = INSERT one swarm_categories row, zero coordinator code edits."
    - "Pure tri-state escalation gate (D-09): low_confidence > high_intent_count > requires_orchestration_flag > single_shot. Order is load-bearing (priority test guards regression)."
    - "INTENT_VERSION_V2 literal threaded through 4 sites (zod schema, Orq agent output_schema, idempotency cache lookup, agent_runs.intent_version column) — Pitfall 4 guard."
    - "Inngest concurrency [{key:event.data.entity, limit:4}, {key:event.data.run_id, limit:1}] balances mailbox throughput (4) with replay safety (1)."

key-files:
  created:
    - web/lib/automations/debtor-email/coordinator/escalation-gate.ts
  modified:
    - web/lib/automations/debtor-email/triage/invoke-intent.ts
    - web/lib/inngest/functions/debtor-email-triage.ts
    - web/lib/inngest/events.ts
    - web/lib/swarms/types.ts
    - web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts
    - web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts
    - web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts
    - web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts

key-decisions:
  - "SwarmCategoryRow.requires_orchestration declared OPTIONAL in TS (not required boolean) to keep Phase 56.7 fixtures (registry test, detail-pane.test, verdict-worker-dispatch test) assignable. The escalation gate's `=== true` comparison treats undefined as 'not flagged' — matches the migration's `default false` semantics. Without this, Plan 03 would have to touch ~6 unrelated test fixtures (Rule 3 scope creep)."
  - "v1 zod schema import retained (intentAgentOutputSchema) but routed through `void intentAgentOutputSchema` to silence unused-import lint. Plan 65-05 backfill regression comparator imports it directly; Phase 66 deletes both."
  - "debtor/email.received payload extended with OPTIONAL run_id / automation_run_id / budget_run_id / agent_run_id rather than a new event name. Two reasons: (1) D-10 says the function id survives Phase 65, so the trigger event name should also survive; (2) legacy direct emitters (e.g. existing Outlook ingest paths that haven't been routed through Stage 0 yet) stay backwards-compatible. The coordinator synthesises a UUID for run_id when absent."
  - "step.run('classify-intent') return value cast through `unknown as IntentAgentOutputV2` after Inngest's JsonifyObject wrapper strips the zod literal unions. Sound at runtime: the value is intentAgentOutputSchemaV2.safeParse-validated inside invokeIntentAgent (or pulled from a previously-validated cache row in the same shape)."
  - "Orchestrator path keeps coordinator_runs.expected_handlers=1 (the tentative insert default). Plan 04's orchestrator function is responsible for UPDATE-ing it to N after the planner runs."

patterns-established:
  - "Registry-driven dispatch with explicit Pitfall-1 guard throw — copy the throw + 'verify Plan 01 seed migration applied' message into any future swarm coordinator."
  - "Inngest event payload fields documented inline next to the type literal (run_id, automation_run_id, budget_run_id, agent_run_id all annotated with the Phase that introduced them)."
  - "Mock-step shell (`stepStub = { run: async (_, fn) => fn() }`) for testing Inngest function bodies without spinning up the durable executor. Mirrors stage-0-safety-worker.test.ts and is now the third use of this pattern in the codebase."

requirements-completed: [CORD-01, CORD-02, CORD-04]

duration: ~8min agent execution (482s)
completed: 2026-05-03
---

# Phase 65 Plan 03: Coordinator V2 — Ranked Classify, Escalation Gate, Single-Shot Dispatch Summary

**Rewrote debtor-email-triage Inngest function in-place per D-10: parses v2 ranked-intent output through invokeIntentAgent, runs the pure tri-state escalation gate (low_confidence → high_intent_count → requires_orchestration_flag), and dispatches via either the registry-driven single-shot path (CORD-04, ~80% fast path) or the orchestrator escalation path (CORD-02, plan 04 listens). 18 vitest assertions across 5 files, tsc clean, all acceptance greps green.**

## Performance

- **Duration:** ~8 min agent execution (Tasks 1-2)
- **Started:** 2026-05-03T07:29:38Z
- **Completed:** 2026-05-03T07:37:40Z
- **Tasks:** 2 (both auto, both TDD)
- **Files changed:** 9 (1 created, 8 modified)
- **Lines added/removed:** +1,075 / -396 (net +679)
- **Tests added:** 14 real `it()` assertions (replacing `it.todo` scaffolds from Plan 01)
- **Test count change:** Plan 01 left 4 assertions in types-v2.test.ts + 8 it.todo scaffolds across 4 files; Plan 03 adds 14 real assertions = 18 green tests across 5 files

## Accomplishments

### Production code

- **`web/lib/automations/debtor-email/coordinator/escalation-gate.ts`** (NEW, 53 lines)
  - Pure function `evaluateEscalationGate(output, categories) → EscalationDecision`. No DB, no LLM, no I/O.
  - Tri-state in canonical order per D-09: low_confidence → high_intent_count → requires_orchestration_flag → single_shot.
  - Tested in isolation (5 assertions including the priority test that guards "low_confidence wins over high_intent_count").

- **`web/lib/automations/debtor-email/triage/invoke-intent.ts`** (MODIFIED)
  - Validator switched from `intentAgentOutputSchema` (v1) to `intentAgentOutputSchemaV2`.
  - `InvokeIntentResult.output` retyped to `IntentAgentOutputV2` (ranked array).
  - Schema-mismatch error message now contains literal `"v2 output schema mismatch"` plus the full zod issues blob, simplifying triage when the upstream Orq agent drifts.
  - v1 schema import kept alive (`void intentAgentOutputSchema`) for Plan 65-05 backfill comparator.

- **`web/lib/inngest/functions/debtor-email-triage.ts`** (REWRITTEN IN-PLACE per D-10, 290 lines)
  - Function id `automations/debtor-email-triage` preserved (Phase 66 will rename it).
  - `retries: 3` → `retries: 0` (verdict-worker / label-resolver convention; Bulk Review retry button is the recovery path).
  - `concurrency: [{key: "event.data.entity", limit: 2}]` → `[{key: "event.data.entity", limit: 4}, {key: "event.data.run_id", limit: 1}]` per RESEARCH OQ3.
  - Steps: create-agent-run → create-coordinator-run → classify-intent (cached on `INTENT_VERSION_V2`) → persist-ranked → evaluate-escalation-gate → write-escalation → dispatch-single-shot OR dispatch-orchestrator → mark-coordinator-complete OR mark-failed.
  - Old Phase-1 flow (fetch-document, detect-emotion, generate-body, circuit-breaker, create-draft) removed — those steps move to Plan 65-04 (orchestrator) + the existing per-intent copy-document handler.
  - Single-shot dispatch reads `swarm_categories.swarm_dispatch` for `ranked[0].intent` (registry-driven; same idiom as classifier-verdict-worker.ts:149-176). Throws an explicit Pitfall-1 error if no row is registered.
  - Failure path writes `automation_runs.status='failed'` + closes coordinator_runs.completed_at + emits `emitAutomationRunStale("debtor-email-review")`.

- **`web/lib/inngest/events.ts`** (MODIFIED — taxonomy extended)
  - 9 new event types: `debtor-email/orchestrator.requested`, `debtor-email/synthesis.requested`, and one event per intent (`copy_document_request`, `payment_dispute`, `address_change`, `peppol_request`, `credit_request`, `contract_inquiry`, `general_inquiry`, `other`).
  - `debtor/email.received` payload extended with optional `run_id`, `automation_run_id`, `budget_run_id`, `agent_run_id` for Phase 65 coordinator + Stage 0 budget envelope passthrough. Existing emitters stay backwards-compatible.

- **`web/lib/swarms/types.ts`** (MODIFIED)
  - `SwarmCategoryRow.requires_orchestration?: boolean` added (optional). Mirrors migration `20260501b_swarm_categories_requires_orchestration.sql` `default false`. Optional in TS so legacy fixtures pulled before the migration applied stay assignable; the gate's `=== true` comparison treats undefined as not-flagged.

### Test code

- **`__tests__/escalation-gate.test.ts`** — 5 assertions: low_confidence, high_intent_count, requires_orchestration_flag, single_shot baseline, and the order-priority test (low ranks above high count).
- **`__tests__/invoke-intent-v2.test.ts`** — 2 assertions with `global.fetch` mock: v2 happy path returns `IntentAgentOutputV2`; v1 single-label shape rejected with `"v2 output schema mismatch"` literal.
- **`__tests__/idempotency-cache-v2.test.ts`** — 2 assertions with chainable supabase mock: v2 cache row returns intent_first_pass; v1-only row produces null cache miss.
- **`__tests__/debtor-email-triage.test.ts`** — 5 assertions with mock-step shell: CORD-04 single-shot dispatch, CORD-02 escalation by flag, CORD-02 escalation by low confidence, CORD-04 cache hit (no Orq call), failure path mark-failed.

## Task Commits

1. **Task 1: v2 ranked-intent transport + pure escalation-gate** — `d838860` (feat)
2. **Task 2: rewrite debtor-email-triage in-place as coordinator V2** — `7b66749` (feat)

## Files Created/Modified

| File | Status | Lines |
|------|--------|-------|
| `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` | NEW | +53 |
| `web/lib/automations/debtor-email/triage/invoke-intent.ts` | MODIFIED | net +14 |
| `web/lib/inngest/functions/debtor-email-triage.ts` | REWRITTEN | net -100 (full body replaced) |
| `web/lib/inngest/events.ts` | MODIFIED | +124 (new events + payload fields) |
| `web/lib/swarms/types.ts` | MODIFIED | +6 (requires_orchestration?) |
| `web/lib/automations/debtor-email/triage/__tests__/invoke-intent-v2.test.ts` | FILLED | +90 |
| `web/lib/automations/debtor-email/triage/__tests__/idempotency-cache-v2.test.ts` | FILLED | +110 |
| `web/lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` | FILLED | +90 |
| `web/lib/inngest/functions/__tests__/debtor-email-triage.test.ts` | FILLED | +260 |

## Decisions Made

- **`requires_orchestration` is optional in the TS type, required in DB.** Six unrelated test fixtures (`lib/swarms/__tests__/registry.test.ts`, `tests/queue/detail-pane.test.tsx` x4, `tests/swarm-registry/verdict-worker-dispatch.test.ts`) fail to compile if the field is required. Optional + DB default `false` + gate's `=== true` comparison → semantically equivalent, zero scope creep.
- **v1 schema kept alive via `void intentAgentOutputSchema`.** Plan 65-05 backfill comparator needs to parse historical v1 rows; deleting the import here would force Plan 05 to ship its own copy.
- **`debtor/email.received` payload extended, not replaced.** D-10 says the function id survives Phase 65; the trigger event name survives too. New optional fields are additive and back-compat with legacy emitters.
- **Cast `step.run` result to `IntentAgentOutputV2` after the await.** Inngest's `JsonifyObject` wrapper strips zod literal unions. The cast is sound at runtime (value is zod-validated inside `invokeIntentAgent` or pulled from a cache row of the same shape).
- **Orchestrator path keeps `expected_handlers=1`.** The tentative insert default. Plan 04's orchestrator UPDATEs it to N after the planner agent decides which intents to run.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 3 — Blocking adjacent] node_modules missing in worktree**
- **Found during:** Task 1 verify (vitest startup error: `Cannot find module 'vitest/config'`)
- **Issue:** This worktree was initialised without `npm install`; vitest config could not load.
- **Fix:** Symlinked `web/node_modules` → main repo's `web/node_modules` (same monorepo, identical lockfile). Verified `./node_modules/.bin/vitest` resolves.
- **Files modified:** none (symlink only, not committed — node_modules is gitignored).

**2. [Rule 2 — Missing critical functionality] SwarmCategoryRow.requires_orchestration not declared in TS interface**
- **Found during:** Task 1 verify (tsc errors: 6 unrelated fixtures + the gate's own `requires_orchestration` access)
- **Issue:** Plan 65-01 added the column to `swarm_categories` (migration 20260501b) but did NOT update `web/lib/swarms/types.ts`. The escalation gate cannot compile-typecheck without it.
- **Fix:** Added `requires_orchestration?: boolean` (optional, mirrors DB default false) to `SwarmCategoryRow`. Documented the optional-not-required choice in key-decisions above.
- **Files modified:** `web/lib/swarms/types.ts` (+6 lines)
- **Commit:** rolled into `d838860` (Task 1).

### Architectural adjustments

**3. [Rule 3 — adapt-to-existing] event payload extension instead of new event name**
- **Found during:** Task 2 read of existing `debtor/email.received` shape
- **Issue:** Plan called for `event.data.run_id`, `event.data.automation_run_id`, `event.data.budget_run_id`, and `event.data.agent_run_id` to be present. Existing event payload didn't have them.
- **Fix:** Extended the existing payload with all four as OPTIONAL fields. Coordinator synthesises a UUID for run_id when absent (legacy direct emit). All other fields nullable in the coordinator_runs row insert.
- **Reasoning:** D-10 says function id survives Phase 65 → trigger event name should survive too. New event name would force every legacy emitter to update.

## Verification Results

### Acceptance criteria — all green

| Criterion | Status |
|-----------|--------|
| `grep "intentAgentOutputSchemaV2.safeParse"` in invoke-intent.ts | ✅ 1 match (line 134 area) |
| `grep "v2 output schema mismatch"` in invoke-intent.ts | ✅ 1 match |
| `grep "evaluateEscalationGate"` in escalation-gate.ts (export) | ✅ exported |
| 4 task-1 test files green with ≥9 real `it()` assertions, no `it.todo` for in-scope cases | ✅ 13 assertions across 4 files |
| `tsc --noEmit` clean | ✅ no errors |
| `evaluate-escalation-gate` literal step name in triage.ts | ✅ line 176 |
| `INTENT_VERSION_V2` imported in triage.ts (not v1) | ✅ line 29, 115, 158 |
| `retries: 0` in triage.ts | ✅ line 51 |
| `concurrency` block with both entity-key and run_id-key | ✅ lines 52-55 |
| `"debtor-email/orchestrator.requested"` literal in triage.ts | ✅ line 254 |
| 5 real `it()` blocks in triage.test.ts; vitest exits 0 | ✅ 5 passing |
| `id: "automations/debtor-email-triage"` survives | ✅ line 49 |
| `events.ts` contains `debtor-email/orchestrator.requested` + `debtor-email/synthesis.requested` | ✅ lines 345, 370 |

### Test totals

```
Test Files  5 passed (5)
     Tests  18 passed (18)
```

## Threat Mitigations

- **T-65-12 (vocabulary mismatch silent no-op):** dispatch-single-shot throws explicit `Error("no swarm_dispatch registered for intent=...")` when category.swarm_dispatch is missing. Mitigated.
- **T-65-13 (LLM-reflected content in JSONB):** ranked_intents persisted as-is to coordinator_runs; consumer is the operator-only authenticated Bulk Review surface. Phase 71 will add escaping when override UI lands. Mitigated for Phase 65.
- **T-65-14 (DoS via Inngest auto-retry on LLM cost):** retries: 0 enforced. Mitigated.
- **T-65-15 (intent_version literal drift):** `INTENT_VERSION_V2` imported from `triage/types.ts` and used in 3 sites within the coordinator (cache lookup, agent_runs.intent_version write, and indirectly through invokeIntentAgent's zod schema). Plan 02 wired the same literal into the Orq agent's output_schema. Mitigated.
- **T-65-16 (unauthorized direct call bypasses Stage 0):** accept disposition unchanged — Inngest event auth + Phase 64 D-15 budget envelope cross-cut handle this.

## Self-Check: PASSED

- ✅ `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` exists
- ✅ `web/lib/automations/debtor-email/triage/invoke-intent.ts` modified (v2 validator)
- ✅ `web/lib/inngest/functions/debtor-email-triage.ts` rewritten (290 lines)
- ✅ `web/lib/inngest/events.ts` extended (9 new events)
- ✅ `web/lib/swarms/types.ts` extended (requires_orchestration?)
- ✅ Commit `d838860` exists (Task 1)
- ✅ Commit `7b66749` exists (Task 2)
- ✅ All 5 test files green (18 assertions total)
- ✅ tsc --noEmit clean
- ✅ All acceptance grep checks pass
