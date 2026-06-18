# Phase 119 Verification — Behavior-sync per-mailbox isolation

**Verdict: PASS** — goal achieved, all must-have truths satisfied, gates green.

**Verified:** 2026-06-17 (inline goal-backward verification; subagent verifier
unavailable under current permission policy, so the orchestrator verified directly).

## Goal
Make `swarm-behavior-sync.ts` fault-isolate and fairly budget each
`(swarm × mailbox)` so one heavy/failing mailbox cannot starve or abort the whole
delta-sync tick — fixing the confirmed 2026-06-16 regression where enabling
debtor's multi-mailbox observe froze the sales observe.

## Gates
- `cd web && tsc --noEmit` → **0 errors**.
- `cd web && vitest run lib/email-behavior/__tests__/behavior-sync.test.ts` →
  **18 passed** (14 retargeted existing + 4 new Phase 119 regression).
- No other code/tests reference the refactored function (grep clean); refactor is
  self-contained.

## Must-have truths (119-01)
1. Cron fires an orchestrator that emits exactly one fan-out event per enabled
   `(swarm × mailbox)`; never processes a mailbox inline.
   → ✓ `swarmBehaviorSync` only runs `load-enabled-swarms` + `fan-out-mailboxes`;
   FAN-OUT-COVERAGE test asserts 3 pairs and `graphFetch` not called.
2. Each `(swarm × mailbox)` is its own worker invocation; a throw is isolated.
   → ✓ `swarmBehaviorSyncMailbox` consumes one event; FAULT-ISOLATION test
   (LARGE rejects, BB/CC complete).
3. A heavy mailbox consumes only its own worker budget; cannot starve others.
   → ✓ separate invocations + `concurrency:[{key:event.data.mailbox,limit:1},{limit:4}]`;
   BUDGET/NON-STARVATION test.
4. A per-mailbox terminal failure writes a VISIBLE `pipeline_events`
   `decision='behavior_sync_mailbox_failed'` row.
   → ✓ worker `onFailure` (recordWorkerFailure + guarded attributable row);
   FAULT-ISOLATION test asserts the row carries the mailbox.
5. Replay-safety: runId/tickIso minted inside `step.run` in the worker; unique
   deterministic step ids; lean ids-only over the event boundary.
   → ✓ STEP-ID-UNIQUENESS test (heavy 12-folder invocation, all-unique ids +
   singular run/tick); lean `{swarm_type,mailbox,weights}` payload.
6. `TRACKED_INGEST_SOURCES=['outlook','zapier-debtor-ingest']` and the 23505
   idempotent no-op inserts preserved byte-for-behavior.
   → ✓ verbatim in the worker; tests 3, 10, 14.
7. Manual `swarm/behavior-sync.requested` (optional `data.swarm_type`) still
   fans out.
   → ✓ orchestrator keeps both triggers and applies the swarm filter in
   `load-enabled-swarms`.

## Artifacts
- `web/lib/inngest/functions/swarm-behavior-sync.ts` — orchestrator + worker, both exported; onFailure sink.
- `web/lib/inngest/events.ts` — typed `swarm/behavior-sync.mailbox` event.
- `web/app/api/inngest/route.ts` — `swarmBehaviorSyncMailbox` registered (and `swarmBehaviorSync` retained).
- `docs/swarm-behavior-tracking.md` — new fan-out topology + regression rationale.
- `web/lib/email-behavior/__tests__/behavior-sync.test.ts` — retargeted + regression suite.

## Out of scope (post-merge operator step)
Re-enabling debtor `behavior_tracking_config={enabled:true, mailboxes:[4]}` +
re-verifying the per-mailbox observe (119-CONTEXT.md deferred).

---
*Phase: 119-behavior-sync-per-mailbox-isolation · Completed 2026-06-17*
