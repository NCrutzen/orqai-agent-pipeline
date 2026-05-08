# Phase 80: Swarm-agnostic Stage 3 classifier/dispatcher split — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning
**Source:** Synthesized from operator design conversation + ROADMAP.md Phase 80 entry

<domain>
## Phase Boundary

Split the current monolithic `debtor-email-coordinator` Inngest function into two clean responsibilities:

1. **Stage 3 classifier** (refactored from existing coordinator) — runs the Intent Agent, persists ranked intents, flips `agent_runs.status` to `predicted`, emits a `<swarm>/predicted` event, and returns. No dispatch logic.
2. **Stage 3.5 dispatcher** (new, swarm-agnostic) — listens on `*/predicted` events, looks up `swarm_intents.handler_status` for the row's `(swarm_type, intent_key)`, and routes to either the human-lane Kanban path (`placeholder`) or to a Stage 4 handler (`registered`).

`predicted` becomes a **first-class observable state**, not a transient checkpoint. A row stuck in `classifying` means the classifier broke; a row stuck in `predicted` means the dispatcher broke; a row in `routed_human_queue` is the expected terminal for placeholder intents. This separation is the whole point of the phase.

The dispatcher must be cross-swarm from day one — it serves both `debtor-email` (existing) and `sales-email` (Phase 78, in-flight). It reads `swarm_type` from the event payload, not from hardcoded constants.

</domain>

<decisions>
## Implementation Decisions

### State Machine (locked)

- **`classifying`** — Stage 3 classifier in flight. Written when the classifier creates the `agent_runs` row. Stuck >N min = classifier bug.
- **`predicted`** — Stage 3 classifier done, ranked intents persisted on `coordinator_runs`. **First-class observable state.** Written by the classifier and read by the dispatcher. Stuck >N min = dispatcher bug.
- **`routed_human_queue`** — Dispatcher determined `swarm_intents.handler_status='placeholder'`; Kanban `automation_runs` row written; awaiting human triage. **Terminal** for the no-handler path.
- **Handler-owned statuses** (`fetching_document`, `generating_body`, `done`, etc.) — Dispatcher emitted `swarm_intents.handler_event`; Stage 4 worker owns subsequent transitions. Classifier and dispatcher do NOT touch these statuses.

### Classifier Refactor Boundaries

- The classifier function (currently `debtor-email-coordinator.ts`) MUST stop dispatching. Its responsibilities shrink to:
  1. Resolve agent_run_id (caller-provided OR create new with `status='classifying'`).
  2. Insert `coordinator_runs` row.
  3. Invoke Intent Agent (existing logic, unchanged).
  4. Write `tool_outputs.intent_first_pass` via `mergeToolOutputs` (existing).
  5. Hoist top-1 onto `agent_runs` back-compat columns (`intent`, `confidence`, etc — existing).
  6. Persist `ranked_intents` on `coordinator_runs` (existing).
  7. **Flip `agent_runs.status` from `classifying` → `predicted`** (NEW — closes the silent-stuck-row bug).
  8. **Emit `<swarm_type>/predicted` event with the agent_run_id, run_id, ranked_intents, etc.** (NEW).
  9. Return.
- Specifically REMOVE: the `if (decision.kind === "single_shot")` branch (lines 241–340 of current `debtor-email-coordinator.ts`) including the Phase 76 `if (intent.handler_status === "placeholder")` Kanban write and the `dispatch-single-shot` step. These move to the dispatcher.
- The escalation-gate evaluation (Phase 76 D-09 single decision point) stays in the classifier ONLY if it produces metadata the dispatcher needs. If the gate's only consumer was the inline dispatch, the gate moves to the dispatcher too. Planner must decide based on Phase 76 gate semantics.

### Dispatcher Design (new function)

- **Name suggestion:** `stage-3-dispatcher.ts` (planner may refine).
- **Inngest event subscription:** wildcard or per-swarm. Cross-swarm event naming convention: `{swarm_type}/predicted` (e.g. `debtor-email/predicted`, `sales-email/predicted`). Planner decides between one function with multiple triggers vs. fan-in subscription pattern based on Inngest capabilities.
- **Routing logic per `swarm_intents.handler_status`:**
  - `placeholder` → write `automation_runs` Kanban row (`automation='{swarm_type}-kanban'`, `kanban_reason='no_handler'`, etc — same shape as Phase 76) → flip `agent_runs.status='routed_human_queue'` → mark `coordinator_runs.completed_at` with `completed_handlers=0`. **All four writes inside ONE `step.run` for atomicity / replay safety.**
  - `registered` → emit `swarm_intents.handler_event` with payload (run_id, agent_run_id, email_id, automation_run_id, intent, ranked, swarm_type, budget_run_id) → mark `coordinator_runs.completed_at` (or leave to handler — planner decides based on existing handler contracts).
- **Reserved future hook:** dormant escalation branch for Stage 3.5 orchestrator-worker fan-out. Per Phase 76 D-07 the fan-out path is replaced by Kanban write for now, but the dispatcher must leave a clean re-enable seam (e.g. an `if (escalation_decision === "orchestrator")` branch that currently writes Kanban with a distinct `kanban_reason='low_confidence'` per Phase 76 semantics).
- **Cross-swarm contract:** Dispatcher reads `swarm_type` from event payload + `swarm_intents` registry. Zero hardcoded swarm names. Same code serves `debtor-email` and `sales-email` (Phase 78) and any future swarm.

### Idempotency / Replay Safety

- All non-deterministic IDs (UUIDs, timestamps used as keys) MUST be generated inside `step.run` per CLAUDE.md Inngest pattern (Phase 65 learning). The classifier already follows this for `run_id`; the dispatcher must too.
- The dispatcher must be safe against duplicate `<swarm>/predicted` events for the same `agent_run_id` — check current `agent_runs.status` before writing; if already `routed_human_queue` or a handler-owned status, no-op.

### Backfill (the 407 stuck rows)

- One-shot script: `web/scripts/backfill-stuck-classifying-stage3.ts`.
- Logic: for each `agent_runs` row with `status='classifying'` AND `tool_outputs ? 'intent_first_pass'` (i.e. classifier finished but never got promoted):
  1. Look up matching `automation_runs` Kanban row by `email_id` + `automation IN (..., '{swarm_type}-kanban')`.
  2. **If Kanban row exists** → flip `agent_runs.status='routed_human_queue'`. The work was already done; only the status update is missing.
  3. **If no Kanban row** → flag for manual triage (write to a JSON file or a separate `stuck_no_kanban` log). Do NOT auto-flip.
- Idempotent (re-runnable). Safe against concurrent live traffic (use `WHERE status='classifying'` guard).
- Default to acceptance/test creds per CLAUDE.md; production run requires explicit confirmation.
- The separate `intent=null + multiple Kanban rows for one email` cluster is OUT OF SCOPE — flag for follow-up phase.

### State-Machine Doc Lock

- Update `docs/agentic-pipeline/stage-3-coordinator.md` with:
  - New state diagram (classifying → predicted → {routed_human_queue | handler-owned}).
  - Transition table (who writes what, when).
  - "Stuck-status meaning" table for monitoring.
  - Cross-swarm dispatcher contract (event naming, swarm_type as parameter).
- The doc is RFC-locked per the project's CLAUDE.md convention. Code follows doc.

### UI Semantics Audit

- `web/lib/automations/swarm-bridge/sync.ts` currently treats `predicted` as "show in review queue" (line 35, 64, 588). Verify this is still correct under the new semantics:
  - If `predicted` is now sub-second transient (classifier emits, dispatcher consumes immediately) → review-queue surface should track `routed_human_queue` instead, OR the sync logic should treat both as "review eligible".
  - If the dispatcher might lag (queue depth, retry, etc) → `predicted` is observable and should still surface (with a "dispatcher pending" hint).
- Planner produces a concrete recommendation with code-grep evidence.

### Monitoring / Alerting Reframe

- Existing alert (if any) on "rows in `classifying` for >N min" should split into two distinct signals:
  - `classifying` stuck → classifier bug. Page.
  - `predicted` stuck → dispatcher bug. Page.
  - `routed_human_queue` → expected human lane. NO alert.
- Specific alert config files / dashboards updated as part of this phase IF they exist; if monitoring is informal/ad-hoc, document the new health-query patterns instead.

### Cross-Swarm First-Class Goal

- Phase 78 (sales-email Stage 0→3 onboarding) is in-flight. Without this phase first, Phase 78 will copy the buggy monolithic-coordinator pattern into a second swarm, doubling the silent-stuck-row failure mode.
- The classifier refactor for `debtor-email` and the new dispatcher MUST land before sales-email's Stage 3 ships, so sales-email is built thin: just a classifier + handlers, with the shared dispatcher between them.
- Naming convention: prefer generic file/function names (`stage-3-classifier`, `stage-3-dispatcher`) over swarm-specific names where the code is genuinely cross-swarm.

### Out of Scope (locked)

- Stage 3.5 orchestrator-worker fan-out for multi-intent emails. Per Phase 76 D-07 it's deferred. This phase only reserves a clean re-enable seam in the dispatcher.
- The `intent=null + 6 Kanban rows for one email` duplicate-write bug observed in live data. Diagnose-and-fix in a follow-up phase. Backfill script flags these for manual triage.
- Building any new Stage 4 handler. None of the 8 placeholder intents ship a handler in this phase. Output of dispatcher's `placeholder` branch is always Kanban + `routed_human_queue`.
- Changing the Intent Agent prompt, schema, or LLM. The classifier's invocation of the agent is unchanged.

### Resolved After Research (locked 2026-05-08)

- **`agent_runs.status` CHECK constraint** — already includes both `predicted` and `routed_human_queue` (verified via `pg_constraint` query). No migration needed; TS literal-union in `web/lib/automations/debtor-email/coordinator/types.ts` confirmed to already include both. Open Question #1 closed.
- **Escalation-gate registry-lookup bug fix is IN SCOPE.** Researcher found that `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` looks up `requires_orchestration` against `swarm_noise_categories` rows but the field lives on `swarm_intents` per Phase 76 migration `20260504b:94`. The flag-based escalation branch is silently dead today. Phase 80 moves the gate to the dispatcher AND fixes the registry lookup at the same time. Open Question #2 closed.
- **Sales-email `swarm_intents` seed is OUT of scope.** Phase 78 owns the sales-email registry rows. Phase 80 ships the cross-swarm dispatcher mechanism + tests that prove it works for any swarm with a populated registry, but does NOT insert sales-email rows itself. Phase 80's cross-swarm acceptance test uses `debtor-email` rows or a synthetic test swarm. Open Question #3 closed.

### Claude's Discretion

- Specific Inngest event subscription pattern (wildcard vs. per-swarm trigger).
- Whether the escalation-gate evaluation moves entirely to the dispatcher or stays partially in the classifier.
- Exact field names on the `<swarm>/predicted` event payload.
- File/function naming for the new dispatcher (`stage-3-dispatcher.ts` is a suggestion).
- Whether the dispatcher's "no-Kanban-row" sub-case in the backfill writes a placeholder Kanban row or flags only.
- Test strategy: unit tests for classifier and dispatcher in isolation, plus integration test exercising the full classifying → predicted → routed_human_queue flow on acceptance creds.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pipeline architecture (RFC-locked)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel architecture, cross-swarm canonical
- `docs/agentic-pipeline/stage-3-coordinator.md` — current Stage 3 RFC (will be updated as deliverable #4)
- `docs/agentic-pipeline/stage-1-regex.md` — context for hard-separation rule (Stage 1 noise vs Stage 3 intent registries)

### Project root
- `CLAUDE.md` — stack, Inngest patterns (replay-safety, this-binding, step.run), Supabase patterns, registry-as-source-of-truth, codegen pattern

### Phase 76 (no-handler Kanban surface — direct precedent)
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md`
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-VERIFICATION.md`
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-03-pipeline-runtime-no-handler-low-confidence-PLAN.md`
- `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-03-pipeline-runtime-no-handler-low-confidence-SUMMARY.md`

### Files being refactored (read first)
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — current monolithic coordinator (lines 100–340)
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — dormant Stage 3.5 fan-out (defensive `handler_status` check at lines 93–123); leave clean re-enable seam
- `web/lib/automations/debtor-email/coordinator/agent-runs.ts` — `createRun`, `updateRun`, `mergeToolOutputs` helpers
- `web/lib/automations/debtor-email/coordinator/types.ts` — `Status` literal-union type (must include new transitions if not already)
- `web/lib/automations/debtor-email/coordinator/escalation-gate.ts` — Phase 76 single decision point; planner determines if it moves to dispatcher
- `web/lib/automations/swarm-bridge/sync.ts` — UI status mapping (lines 35, 64, 220–266, 588, 663)

### Registries
- `swarm_intents` table (Supabase) — `(swarm_type, intent_key, handler_status, handler_event)` source of truth for dispatch routing
- `swarm_noise_categories` table — referenced for context on hard-separation rule (NOT consumed by dispatcher)

### Phase 78 (sales-email; cross-swarm consumer)
- `.planning/phases/78-sales-email-stage-0-to-stage-3-onboarding-verkoop-smeba-nl/` — read CONTEXT/PLAN if present so dispatcher contract is compatible

### Phase 65 (Inngest replay-safety landmines — directly applicable)
- Commits `dd2583a` (replay-id) + `dae6276` (this-binding) — referenced in CLAUDE.md

</canonical_refs>

<specifics>
## Specific Ideas

### Live data confirming the bug

- 407 `agent_runs` rows currently in `status='classifying'`, oldest ~9 days, all with `tool_outputs.intent_first_pass` populated and intents like `payment_dispute`, `peppol_request`, `general_inquiry`, `contract_inquiry`, `other` (all `handler_status='placeholder'` per `swarm_intents`).
- For each stuck row, a matching `automation_runs` Kanban row already exists with `automation='debtor-email-kanban'` keyed off `result->>'email_id'`. The work succeeded; only the `agent_runs.status` flip is missing.
- Sub-cluster: ~6 `intent=null` rows have multiple (6) Kanban rows each. Out of scope; flagged.

### Code locations to touch (initial scan; planner verifies)

- `web/lib/inngest/functions/debtor-email-coordinator.ts` — refactor to thin classifier (lines ~125–220 keep; lines 241–340 remove or move to dispatcher).
- `web/lib/inngest/functions/stage-3-dispatcher.ts` — NEW file.
- `web/lib/automations/debtor-email/coordinator/types.ts` — confirm `Status` includes `predicted` and `routed_human_queue` (it does, per existing `agent_runs` data).
- `web/lib/inngest/functions/coordinator-orchestrator.ts` — keep dormant; ensure dispatcher's escalation hook is compatible with future re-enable.
- `web/lib/automations/swarm-bridge/sync.ts` — audit + adjust if needed.
- `web/scripts/backfill-stuck-classifying-stage3.ts` — NEW script.
- `docs/agentic-pipeline/stage-3-coordinator.md` — UPDATE with new state machine.
- `web/app/api/inngest/route.ts` — register new dispatcher function.
- `web/lib/inngest/functions/__tests__/` — new tests for classifier + dispatcher.

### Acceptance signals (must_haves)

1. After Phase 80, **zero** `agent_runs` rows can be in `status='classifying'` for >5 minutes when traffic is flowing (modulo in-flight LLM calls). Verifiable via SQL.
2. **Zero** rows can be in `status='classifying'` while having both `tool_outputs.intent_first_pass` AND a matching Kanban row. Verifiable via SQL on backfilled state.
3. New `<swarm>/predicted` event fires for every successful classification. Verifiable via Inngest dashboard / pipeline_events table.
4. Dispatcher correctly handles both `placeholder` and `registered` paths. Verified by integration test on acceptance creds covering at least one of each.
5. `coordinator-orchestrator.ts` defensive check still works (Phase 76 D-09 invariant preserved).
6. Sales-email Phase 78 work can subscribe to `sales-email/predicted` and let the shared dispatcher route, without copy-pasting dispatch logic.

</specifics>

<deferred>
## Deferred Ideas

- **Stage 3.5 orchestrator-worker fan-out** for multi-intent emails — Phase 76 D-07 deferred indefinitely; this phase only reserves a clean re-enable seam.
- **`intent=null + multiple Kanban rows` duplicate-write bug** — separate diagnosis. Likely Inngest replay or `coordinator-orchestrator.ts` defensive fan-out re-firing. Backfill script flags these rows for manual triage.
- **Stage 4 handler implementations** — every `placeholder` intent stays human-lane until a dedicated handler phase ships.
- **Telemetry dashboard / alert config** for the new "classifying-stuck vs predicted-stuck vs routed_human_queue" signals — documented in this phase as health-query patterns; formal dashboarding is a follow-up.

</deferred>

---

*Phase: 80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted*
*Context gathered: 2026-05-08 via synthesized brief (operator design conversation + ROADMAP.md)*
