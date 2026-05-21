---
phase: 65-stage-3-ranked-multi-intent-coordinator
plan: 04
subsystem: agentic-pipeline
tags: [agentic-pipeline, debtor-email, orchestrator, synthesis, inngest, stage-3.5, fan-out, fan-in, supabase-migration]

requires:
  - phase: 65
    plan: 01
    provides: coordinator_runs table + synthesis_dispatched_at race-guard column + coordinator_complete_handler RPC + canonical HandlerOutput type
  - phase: 65
    plan: 02
    provides: live debtor-orchestrator-agent (01KQPA63RJ726GA6399K3NDGTK) + synthesis-agent (01KQPA6TQ5Z2JXQW8WGM3XKATC) in Orq with strict json_schema
  - phase: 65
    plan: 03
    provides: debtor-email-triage emits debtor-email/orchestrator.requested on escalation; coordinator_runs row pre-written with ranked_intents + escalation_decision
provides:
  - coordinator-orchestrator Inngest fn (Stage 3.5 planner: ranked → orchestrator-planner LLM → fan-out via Inngest events)
  - coordinator-synthesis Inngest fn (cross-cutting fan-in synthesis after RPC claims dispatch)
  - HandlerOutput-canonical adapter wrapping existing copy-document-body-agent (web/lib/automations/debtor-email/handlers/output-adapter.ts)
  - notifyCoordinatorComplete RPC fan-in helper (web/lib/automations/debtor-email/coordinator/coordinator-complete.ts)
  - classifier-invoice-copy-handler wired into the new RPC fan-in path (idempotent)
  - migration 20260501e — agent_runs.coordinator_run_id FK + index for synthesis-time HandlerOutput[] gathering
  - orchestrator-types.ts + synthesis-types.ts (zod schemas for orchestrator-planner output + synthesis input)
affects: [65-05, 66, 70, 71, 73]

key-decisions:
  - "Synthesis dispatch claim happens INSIDE coordinator_complete_handler (Pitfall 2 race-guard) — only the caller whose RPC returns claim_synthesis=true emits debtor-email/synthesis.requested. Verified live in Plan 01's RPC."
  - "agent_runs.coordinator_run_id FK is the authoritative join for synthesis-time HandlerOutput[] gathering — synthesis reads via loadHandlerOutputsForRun(coordinator_run_id), no separate side table."
  - "HandlerOutput adapter is a v1 bridge: only copy-document-body-agent needs adaptation (its native output is body_html + detected_tone). Future Stage 4 handlers (Phase 73 sales-email) emit HandlerOutput natively."
  - "Partial synthesis (D-05) marks coordinator_runs.partial_synthesis=true and appends a footer noting unaddressed intents — never silently drops secondary intents, never fails the run on a single child failure."
  - "Budget propagation (D-07) — orchestrator passes shared (run_id, remaining_tokens, remaining_cost_cents) into each child event; handlers UPDATE coordinator_runs.cost_cents_total/tokens_total before each Stage 4 LLM call; breach emits Phase 64 pipeline.budget_breached."

patterns-established:
  - "Inngest fan-out via inngest.send([...]) (not step.invoke — Vercel Pro 60s timeout makes durable event emission the safer choice)"
  - "RPC-driven fan-in: each handler calls coordinator_complete_handler at completion; only one caller wins the synthesis claim atomically"
  - "Output-adapter pattern: thin wrapper from native handler shape → canonical HandlerOutput; lets new handlers conform natively without code change in synthesis"

requirements-completed: []  # CORD-03 (orchestrator/synthesis) requires Plan 05 smoke verify against representative sample to fully close

duration: ~14min agent execution (Tasks 1-3); operator-applied SQL via Supabase SQL editor for Task 3.5 (verified 2026-05-04)
completed: 2026-05-04 (all 4 tasks)
---

# Phase 65 Plan 04: Orchestrator + synthesis fan-out — Summary

**Stage 3.5 orchestrator-worker now spawns N parallel Stage 4 handlers and synthesises their outputs into one iController draft. RPC race-guard verified live; partial-synthesis path implemented; HandlerOutput canonicalised for cross-swarm reuse.**

## Performance

- **Duration:** ~14 min agent execution + operator-applied SQL for Task 3.5
- **Tasks:** 4 (3 fully automated + 1 [BLOCKING] checkpoint)
- **Files created:** 11 (3 Inngest fns + 2 type modules + 1 RPC helper + 1 output-adapter + 1 migration + 3 test files)
- **Files modified:** 4 (route.ts adds new fns, classifier-invoice-copy-handler wires RPC, rpc-fanin/orchestrator/synthesis tests expanded)

## Accomplishments

- **Output adapter (Task 1):** HandlerOutput v1 bridge — wraps existing copy-document-body-agent output (`{body_html, detected_tone}`) into canonical `{handler_key, intent, content_kind:'draft_body', content, language, tone, references, confidence}`. Future handlers emit HandlerOutput natively — adapter is a v1-only bridge.
- **RPC fan-in helper (Task 1):** `notifyCoordinatorComplete(admin, runId, opts={p_failed})` calls `coordinator_complete_handler` RPC and returns `{completed_handlers, expected_handlers, claim_synthesis}`. Only the winning caller emits `debtor-email/synthesis.requested` (Pitfall 2 race-guard verified at the SQL layer).
- **Orchestrator + synthesis Inngest fns (Task 2):**
  - `coordinator-orchestrator` listens on `debtor-email/orchestrator.requested`, calls `invokeOrqAgent('debtor-orchestrator-agent', ...)` to produce per-handler context payloads, UPDATEs `coordinator_runs.expected_handlers = handlers.length`, fans out via `inngest.send([{name: 'debtor-email/<intent>.requested', data: {run_id, intent, context_payload, budget_run_id, ...}}, ...])`.
  - `coordinator-synthesis` listens on `debtor-email/synthesis.requested`, reads HandlerOutput[] via `loadHandlerOutputsForRun(coordinator_run_id)` (the new FK join), calls `invokeOrqAgent('synthesis-agent', ...)`, writes single iController draft via existing copy-document-body draft path, sets `coordinator_runs.completed_at`, applies partial-synthesis footer when `failed_handlers > 0`.
- **classifier-invoice-copy-handler RPC wiring (Task 3):** existing handler now calls `notifyCoordinatorComplete` at the end of its happy-path AND on caught failures (`p_failed=true`). Idempotent via Inngest step-id memoisation.
- **Migration 20260501e (Task 3):** `agent_runs.coordinator_run_id uuid REFERENCES coordinator_runs(run_id)` + `agent_runs_coordinator_run_idx` btree index. Authoritative join for synthesis-time HandlerOutput[] gathering.
- **24 vitest tests green:** orchestrator dispatch (parallel/sequential, expected_handlers UPDATE, fan-out emit), synthesis fan-in (RPC-driven trigger, partial synthesis path, draft write), output adapter (3 content_kinds), RPC fan-in helper (race-guard simulation, p_failed=true increment), invoice-copy-handler RPC wiring (success + failure paths).

## Task Commits

1. **Task 1: Output adapter + RPC fan-in helper** — `e3a57bb` (feat)
2. **Task 2: coordinator-orchestrator + coordinator-synthesis Inngest fns** — `a949e03` (feat)
3. **Task 3: classifier-invoice-copy-handler RPC wiring + migration 20260501e** — `dbee987` (feat)
4. **Task 3.5: [BLOCKING] supabase db push for 20260501e** — operator applied 2026-05-04 via Supabase SQL editor; FK + index verified live (`agent_runs_coordinator_run_id_fkey` references `coordinator_runs(run_id)`).

## Files Created

| Path | Purpose |
|---|---|
| `supabase/migrations/20260501e_agent_runs_coordinator_run_id.sql` | FK column + index for HandlerOutput[] gathering at synthesis time |
| `web/lib/automations/debtor-email/coordinator/coordinator-complete.ts` | `notifyCoordinatorComplete` — RPC fan-in helper |
| `web/lib/automations/debtor-email/coordinator/orchestrator-types.ts` | zod schema for `debtor-orchestrator-agent` output |
| `web/lib/automations/debtor-email/coordinator/synthesis-types.ts` | zod schema for `synthesis-agent` output |
| `web/lib/automations/debtor-email/handlers/output-adapter.ts` | HandlerOutput canonical adapter + `loadHandlerOutputsForRun` |
| `web/lib/inngest/functions/coordinator-orchestrator.ts` | Stage 3.5 orchestrator-planner Inngest fn |
| `web/lib/inngest/functions/coordinator-synthesis.ts` | Cross-cutting synthesis Inngest fn |
| `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` | 250 lines — success + failure RPC wiring |
| `web/lib/automations/debtor-email/handlers/__tests__/output-adapter.test.ts` | 151 lines — adapter contract |

## Files Modified

| Path | Change |
|---|---|
| `web/app/api/inngest/route.ts` | Register coordinator-orchestrator + coordinator-synthesis in fns array |
| `web/lib/inngest/functions/classifier-invoice-copy-handler.ts` | Wire `notifyCoordinatorComplete` on success + failure |
| `web/lib/automations/debtor-email/coordinator/__tests__/rpc-fanin.test.ts` | Real assertions (race-guard simulation + p_failed increment) |
| `web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts` | Real assertions (parallel/sequential, fan-out emit, expected_handlers UPDATE) |
| `web/lib/inngest/functions/__tests__/debtor-email-synthesis.test.ts` | Real assertions (RPC-driven trigger, partial synthesis path) |

## Decisions Made

- **Inngest fan-out via `inngest.send([...])`, not `step.invoke`.** Vercel Pro's 60s function timeout makes durable event emission the safer choice; `step.invoke` blocks the orchestrator on each child. Repo had zero `step.invoke` calls — this stays consistent.
- **`agent_runs.coordinator_run_id` is the canonical synthesis-time join** rather than a separate side table. Synthesis queries `agent_runs WHERE coordinator_run_id = $1` to gather all HandlerOutput[]s for the run. One column add, no schema sprawl.
- **HandlerOutput adapter is v1-only.** Phase 73 sales-email handler (and any future handler) emits HandlerOutput natively — no adapter needed. The adapter exists only because copy-document-body-agent shipped before the canonical shape was ratified.
- **Partial-synthesis footer (D-05) gets the run_id + version, mirroring the body-agent's idempotent footer pattern.** Operator sees the partial badge in Bulk Review with a stable identifier.
- **Budget propagation (D-07) updates `coordinator_runs` BEFORE each Stage 4 LLM call**, not after. This is Pitfall 5 mitigation — handlers can fail post-LLM-call, and we don't want budget cost lost.

## Deviations from Plan

### Process deviations

**1. Task 3.5 [BLOCKING] supabase db push — operator-applied via SQL editor**

- **Why:** Same flow as Plan 01 Task 4 / Plan 02 Task 6 — agent shell does not have `SUPABASE_ACCESS_TOKEN`. Migration file is committed; operator pasted into Supabase SQL editor.
- **Verification (operator-confirmed 2026-05-04):** FK `agent_runs_coordinator_run_id_fkey` exists pointing at `coordinator_runs(run_id)`; index `agent_runs_coordinator_run_idx` exists.

### Worktree merge

**2. Plan 04 worktree branched off pre-Plan-03 main; merge required.**

- **Why:** Plan 04 ran in parallel with Plan 03 in a separate worktree, branched from `0457804` (before Plan 03 merged). When Plan 04 finished, main HEAD was `9dae2eb` (Plan 03 merge). Git "ort" merge strategy auto-resolved cleanly — Plan 04's NEW files (orchestrator/synthesis Inngest fns, types, adapter, helper, migration) didn't conflict with Plan 03's modifications to `debtor-email-triage.ts` + `escalation-gate.ts` + `invoke-intent.ts`. Test files merged additively (Plan 03 added scaffolds + some real assertions for its own scope; Plan 04 expanded the orchestrator/synthesis test scaffolds to real assertions).
- **Post-merge verification:** `npx tsc --noEmit` clean; `npx vitest run lib/automations/debtor-email lib/inngest/functions` → 13 test files / 54 tests passing in 2.5s.

---

**Total deviations:** 2 (1 process — checkpoint pattern; 1 merge mechanics — auto-resolved). No deviations from plan content.

## Issues Encountered

- `SUPABASE_ACCESS_TOKEN` not exported in agent shell → Task 3.5 deferred to operator (same pattern as Plans 01 + 02).
- Plan 04 worktree branched from a pre-Plan-03 main — addressed cleanly via git's ort merge strategy (no manual conflict resolution needed).

## must_haves verification

| Truth | Status |
|-------|--------|
| coordinator-orchestrator listens on `debtor-email/orchestrator.requested` and calls invokeOrqAgent('debtor-orchestrator-agent') | Verified — coordinator-orchestrator.ts:invokeOrqAgent call wired to live agent |
| coordinator-synthesis listens on `debtor-email/synthesis.requested` and calls invokeOrqAgent('synthesis-agent') | Verified — coordinator-synthesis.ts call wired to live agent |
| HandlerOutput adapter wraps copy-document-body-agent native output | Verified — output-adapter.ts:adaptCopyDocumentOutput + 3 content_kind branches |
| Synthesis dispatch claim is atomic via coordinator_complete_handler RPC (Pitfall 2) | Verified — RPC live in production from Plan 01; rpc-fanin.test.ts simulates race + asserts single winner |
| Partial-synthesis path (D-05) marks partial_synthesis=true + footer | Verified — coordinator-synthesis.ts:applyPartialSynthesisFooter; debtor-email-synthesis.test.ts asserts |
| Budget propagation (D-07) — handlers UPDATE coordinator_runs before LLM call | Verified — classifier-invoice-copy-handler.ts:incrementBudgetCounters before invokeOrqAgent |
| Migration 20260501e applied — agent_runs.coordinator_run_id FK + index live | Verified live by operator 2026-05-04 |

## Verification Results

- `npx tsc --noEmit` (web/) → 0 errors
- `npx vitest run lib/automations/debtor-email lib/inngest/functions` → 13 test files / 54 tests / 0 fails / 0 skipped
- Migration applied + FK confirmed via `information_schema.table_constraints`

## Threat Flags

None — STRIDE register from PLAN.md addressed:
- T-65-12 (orchestrator-planner LLM injection): synthesis-agent treats HandlerOutput[] as STRUCTURED DATA per Plan 02 prompt; Stage 0 filters injection-suspected emails upstream
- T-65-13 (RPC race duplicate dispatch): Pitfall 2 race-guard live at SQL layer (synthesis_dispatched_at IS NULL claim)
- T-65-14 (PII leakage in logs): handler_outputs never logged in plain text — only run_id + status
- T-65-15 (budget bypass via spoofed events): event payloads include shared `budget_run_id` + Inngest events are server-emitted only

## Requirements Addressed

- **CORD-03** (Orchestrator-worker spawns multiple Stage 4 handlers in parallel and synthesises their outputs into a single iController draft visible in Bulk Review) — **all moving parts in place**: orchestrator fans out, RPC fan-in claims synthesis atomically, synthesis-agent produces single body, draft writes via existing copy-document-body path, partial-synthesis badge surfaces in Bulk Review. Plan 05 smoke verifies on representative sample.

## Next Phase Readiness

- **Plan 05** (regression backfill + Bulk Review badge + smoke verify) is unblocked. Wave 2 complete.
- **Phase 66** (rename `debtor-email-triage` → canonical name + delete v1 scaffolds) can land cleanly — D-10 pre-staging means it's a rename + delete, not a cutover.

---
*Phase: 65-stage-3-ranked-multi-intent-coordinator*
*Plan: 04*
*Completed: 2026-05-04*
