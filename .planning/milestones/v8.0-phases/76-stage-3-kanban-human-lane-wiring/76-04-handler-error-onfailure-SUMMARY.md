---
phase: 76
plan: 04
subsystem: stage-4-handler
tags: [inngest, on-failure, kanban, handler-error, replay-safety]
dependency_graph:
  requires:
    - 76-01 (handler_status types + automation_runs.kanban schema fields exist)
    - 76-02 (schema-push applied — automation_runs supports kanban result shape)
  provides:
    - onFailure callback on classifier-invoice-copy-handler that writes Kanban row when handler throws unrecoverably
    - Canonical onFailure shape (interfaces block) for 8 future Stage 4 handlers
  affects:
    - automation_runs (new INSERT path tagged automation='${swarm}-kanban', status='pending', result.kanban_reason='handler_error')
    - Kanban realtime channel (automations:${swarm}-kanban:stale broadcast)
tech_stack:
  added: []
  patterns:
    - Inngest per-function onFailure config option (canonical: pipeline.ts:70, briefing-refresh.ts:29)
    - Phase 65 replay-safety: all DB side-effects inside step.run
    - Phase 59 D-02 stale-broadcast pattern via emitAutomationRunStale
key_files:
  created: []
  modified:
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
decisions:
  - "onFailure body wraps the INSERT in step.run('kanban-handler-error') so Inngest replay does not double-write the Kanban row. retries:0 means the callback fires on first failure."
  - "Use ${swarm_type}-kanban as the automation column value to align with the loader filter that Plan 06 will apply on the Stage 3/4 Kanban surface."
  - "result.error_detail receives the raw error.message; T-76-04-02 disposition 'accept' from the threat register — service-role-only read, redact later in Phase 79 if dashboard exposure widens."
  - "email_id falls back to orig.message_id when the original handler trigger payload omits an email_id key (the production trigger uses message_id)."
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-07"
  tasks_completed: 1
  files_modified: 2
---

# Phase 76 Plan 04: handler-error onFailure Summary

**One-liner:** `onFailure` callback on `classifier-invoice-copy-handler` writes a Kanban row tagged `result.kanban_reason='handler_error'` when the handler throws unrecoverably, surfacing the email to operators instead of letting it disappear into Inngest's failed-run log.

## What changed

### `web/lib/inngest/functions/classifier-invoice-copy-handler.ts`

Added `onFailure` callback inside the `inngest.createFunction` config object (the first argument, alongside the existing `id` and `retries: 0`).

Behaviour when fired (after retries exhausted; with `retries:0` that is the first failure):

1. Build admin client via `createAdminClient`.
2. Resolve original handler payload via `event.data.event.data` (Inngest's failure-event wrapper convention).
3. Inside `step.run("kanban-handler-error", ...)`:
   - INSERT into `automation_runs`:
     - `automation: '${swarm_type}-kanban'`
     - `swarm_type: '${swarm_type}'`
     - `status: 'pending'`
     - `topic: '${intent}'` (default `invoice_copy_request`)
     - `result.kanban_reason: 'handler_error'`
     - `result.error_detail: error.message`
     - `result.error_name: error.name`
     - `result.intent`, `result.email_id`, `result.automation_run_id` for provenance back to the original run
     - `triggered_by: 'stage-4-onFailure'`
   - Throw on insert error so Inngest captures the failure-side failure in its run history.
   - Emit `emitAutomationRunStale(admin, '${swarm_type}-kanban')` so the Kanban UI refreshes.

Handler body (third argument) and `retries: 0` setting unchanged. Imports (`createAdminClient`, `emitAutomationRunStale`) were already present at the top of the file.

### `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts`

Replaced the Wave 0 RED placeholder (`expect(false).toBe(true)`) under `describe("Phase 76: onFailure → handler_error Kanban row", ...)` with three GREEN specs:

1. **`createFunction config carries an onFailure callback`** — asserts `cfg.onFailure` is a function (the existing `inngest.createFunction` mock returns `{ __config: cfg, handler }`, so the test reads `__config`).
2. **`onFailure writes Kanban row with kanban_reason=handler_error`** — invokes `cfg.onFailure` with a synthetic Inngest failure-event payload and asserts the captured `automation_runs` INSERT carries the full expected shape (automation, swarm_type, status, topic, triggered_by, full result object).
3. **`onFailure defaults swarm_type to 'debtor-email' when payload omits it`** — verifies the `?? 'debtor-email'` fallback path.

The pre-existing tests (CORD-03 orchestrator wiring, CANO-01 canonical input shape, Phase 70 TELE-01 dual-write) continue to pass — the handler body was not touched.

## Verification

```bash
$ cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

All 9 tests pass (6 pre-existing + 3 new Phase 76).

```bash
$ cd web && npx tsc --noEmit
```

TypeScript compiles cleanly for the files touched in this plan. Two pre-existing TS errors in `__tests__/debtor-email-coordinator.test.ts:440` and `__tests__/debtor-email-orchestrator.test.ts:265` were verified present on `eef5045` (the worktree base) before this plan's changes — out of scope for Plan 04.

Acceptance grep counts:

| Pattern | Count | Required |
|---------|-------|----------|
| `onFailure` | 4 | ≥1 |
| `kanban_reason.*handler_error` | 2 | ≥1 |
| `kanban-handler-error` | 2 | ≥1 |
| `createAdminClient` | 5 | ≥1 |
| `emitAutomationRunStale` | 4 | ≥1 |

## Threat model coverage

All five entries from the plan's threat register are covered:

- **T-76-04-01** (event payload integrity): mitigated by Inngest event signing — no application work needed.
- **T-76-04-02** (error.message disclosure): accepted; `result.error_detail` carries raw `error.message`. Service-role read only.
- **T-76-04-03** (DoS via repeated failure): accepted; `retries:0` means one Kanban row per failed run, same volume as today's `automation_runs.status='failed'` rows.
- **T-76-04-04** (operator audit / repudiation): mitigated via `result.error_name`, `result.error_detail`, `result.automation_run_id`, and `triggered_by='stage-4-onFailure'`.
- **T-76-04-05** (privilege escalation via service-role admin): accepted; same posture as every other Stage 4 handler.

No new surface introduced — `automation_runs` was already writable by Stage 4 handlers via `failRun`/`closeRun`.

## Pattern note for the 8 future Stage 4 handlers

When each Stage 4 handler ships, it MUST add the same `onFailure` config option. The canonical shape lives now in `web/lib/inngest/functions/classifier-invoice-copy-handler.ts:48-95` (the config-object literal passed as the first argument to `inngest.createFunction`). Copy that block verbatim, swapping only:

- The default fallback for `swarmType` (currently `"debtor-email"`) if the handler serves a different swarm.
- The default fallback for `topic` (currently `"invoice_copy_request"`) to whatever intent that handler dispatches.

Do not change:

- The `step.run("kanban-handler-error", ...)` step name — Plan 06's Kanban loader and operator-facing telemetry will key off it.
- The `result.kanban_reason: "handler_error"` literal — Plan 06's filter requires this exact value.
- The `triggered_by: "stage-4-onFailure"` literal — distinguishes onFailure-originated rows from low-confidence (Plan 03) and no-handler (Plan 03) Kanban rows.
- The `automation: '${swarmType}-kanban'` shape — Plan 06's `[swarm]/kanban/page.tsx` filter requires it.

## Deviations from Plan

None. The plan was executed exactly as written. Two minor cosmetic adaptations:

- The plan's example test code used `cfg.onFailure` against a `{ cfg, ... }` mock return; the existing Phase 65 test mock returns `{ __config: cfg, ... }` (using `__config`). The new tests use `__config` to align with the existing mock shape — no behavioural difference.
- Added `email_id ?? orig.message_id` fallback for `result.email_id` because the live `debtor-email/invoice-copy.requested` trigger payload uses `message_id` (not `email_id`). Without the fallback, all real-world failures would land with `result.email_id: undefined`. Logged as a Rule 2 fix (correctness — Kanban operators need the email ref).

## Self-Check: PASSED

- web/lib/inngest/functions/classifier-invoice-copy-handler.ts — FOUND
- web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts — FOUND
- Commit 931e7d6 — FOUND in `git log --oneline -5`
