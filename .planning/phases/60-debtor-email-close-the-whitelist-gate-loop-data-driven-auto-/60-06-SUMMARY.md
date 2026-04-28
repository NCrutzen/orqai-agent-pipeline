---
phase: 60
plan: 06
subsystem: classifier-verdict-pipeline
tags: [inngest, server-action, telemetry, split-write, replay-safe]
requires:
  - 60-00 (it.todo stubs in tests/queue/actions.test.ts)
  - 60-01 (public.agent_runs.corrected_category column)
  - 60-02 (classifier/verdict.recorded event entry + classifierPromotionCron registration)
provides:
  - recordVerdict server action (verdict-write only, instant return)
  - classifier-verdict-worker Inngest function (categorize + archive + iController-delegate)
affects:
  - web/app/(dashboard)/automations/debtor-email-review/actions.ts (REWRITE)
  - web/app/api/inngest/route.ts (registered classifierVerdictWorker)
  - web/tests/queue/actions.test.ts (it.todo → real assertions)
tech-stack:
  added: []
  patterns:
    - Verdict-write/side-effect split (sync DB write + async Inngest event)
    - Split step.run blocks for replay-safe idempotency (Pitfall 8)
    - Delegate downstream browser work to existing pipeline (no duplicated Browserless wiring)
key-files:
  created:
    - web/lib/inngest/functions/classifier-verdict-worker.ts
  modified:
    - web/app/(dashboard)/automations/debtor-email-review/actions.ts
    - web/app/api/inngest/route.ts
    - web/tests/queue/actions.test.ts
decisions:
  - Reject path skips Outlook side-effects entirely; flips automation_runs.status to completed
    so the UI doesn't render a half-state (covers T-60-06-05).
  - iController-delete delegated to debtor-email-cleanup pipeline via 'deferred' row insert
    rather than inline browser session — matches the actions.ts pre-rewrite delegation pattern
    and avoids spawning new Browserless sessions per verdict.
  - retries: 0 on the worker (cleanup-worker analog rationale): each step.run is
    independently idempotent, failures surface as status='failed' with retry button.
metrics:
  duration: ~25 min
  completed: 2026-04-28
---

# Phase 60 Plan 06: Decouple verdict-write from side-effects Summary

**One-liner:** Reviewer's verdict server-action now writes `automation_runs.status='feedback'` + `public.agent_runs` telemetry + fires `classifier/verdict.recorded`, while a new event-triggered Inngest worker runs categorize+archive Outlook async with replay-safe `step.run` isolation and delegates iController-delete to the existing cleanup pipeline.

## What changed

**Synchronous path (`recordVerdict` server action):**

1. `UPDATE automation_runs SET status='feedback', completed_at=now() WHERE id=…` — row leaves the queue via Phase 59 broadcast invalidation (D-17).
2. `INSERT public.agent_runs` with `swarm_type='debtor-email'`, `human_verdict='approved'|'rejected_other'`, `corrected_category=override_category ?? null` (D-01, D-25), and a `context` JSONB carrying message_id/source_mailbox/entity/predicted_category.
3. `inngest.send({ name: "classifier/verdict.recorded", data: {...} })`.
4. `emitAutomationRunStale(admin, "debtor-email-review")` — single broadcast, queue UI refetches.

Returns `{ ok: true }` instantly. No Outlook, no iController, no reclassify-guard. The 5-minute server-action timeout class is eliminated for this path.

**Asynchronous path (`classifier-verdict-worker`):**

- Event: `classifier/verdict.recorded`, `retries: 0`.
- Reject path → `step.run("mark-complete-reject")` only (status='completed').
- Approve path → split steps:
  - `flip-to-pending` (kanban shows in-progress; re-trigger guard)
  - `categorize` (Outlook category, idempotent at API layer)
  - `archive` (move to Archive folder, no-op on second call)
  - `queue-icontroller-delete` (insert debtor-email-cleanup row in `deferred` status — Phase 55 cleanup-dispatcher cron picks it up; no inline Browserless work)
  - `mark-completed`
- On any thrown error → `step.run("mark-failed")` writes status='failed' + error_message and re-throws so Inngest dashboard surfaces it.
- `emitAutomationRunStale` after every status transition.

**Inngest registration:**

- `web/app/api/inngest/route.ts` imports and registers `classifierVerdictWorker`. Removed the placeholder `// TODO 60-06` comment from 60-02.

**Tests:**

- `web/tests/queue/actions.test.ts` replaced 5 `it.todo` lines with 6 real assertions:
  1. Approve path call shape (update + insert + send + emit, all with correct args)
  2. Reject path human_verdict='rejected_other' + decision='reject' in event
  3. D-25 override_category propagates to corrected_category and event payload
  4. UPDATE failure throws and short-circuits before send/emit
  5. INSERT failure throws and short-circuits before send/emit
  6. Static source-grep: actions.ts contains no `categorizeEmail`/`archiveEmail`/`icontroller`/`openIControllerSession`/`deleteEmailOnPage` references, but does contain `classifier/verdict.recorded`.

All 6 tests pass.

## Acceptance criteria

| Criterion | Result |
|-----------|--------|
| `grep -c "categorizeEmail\|archiveEmail" actions.ts` == 0 | 0 ✓ |
| `grep -c "iController\|icontroller" actions.ts` == 0 | 0 ✓ |
| `grep -c "openIControllerSession\|deleteEmailOnPage" actions.ts` == 0 | 0 ✓ |
| `grep -c "classifier/verdict.recorded" actions.ts` == 1 | 1 ✓ |
| `grep -c 'from("agent_runs")' actions.ts` >= 1 | 1 ✓ |
| `grep -c "emitAutomationRunStale" actions.ts` >= 1 | 2 ✓ |
| `grep -c "classifierVerdictWorker" route.ts` >= 2 | 2 ✓ |
| `grep -c "TODO 60-06" route.ts` == 0 | 0 ✓ |
| Tests have real `expect(...)` calls (no `it.todo`) | 6 expect-based tests ✓ |
| `pnpm vitest run tests/queue/actions.test.ts` exits 0 | 6/6 pass ✓ |
| `pnpm tsc --noEmit -p .` clean for actions.ts/route.ts/worker | clean ✓ |
| Worker has `id: "classifier/verdict-worker"`, `event: "classifier/verdict.recorded"`, `retries: 0` | ✓ |
| Worker has >= 5 distinct `step.run` blocks | 7 (flip-to-pending, categorize, archive, queue-icontroller-delete, mark-completed, mark-failed, mark-complete-reject) ✓ |
| Worker has no `openIControllerSession`/`deleteEmailOnPage` (delegated, not inline) | 0 ✓ |
| Worker imports `categorizeEmail` + `archiveEmail` | ✓ |

The plan-stated `human_verdict.*approved\|human_verdict.*rejected_other >= 2` is encoded as a single ternary in actions.ts — both verdict strings appear on one line. Behavior matches D-16; the test asserts both branches explicitly.

## Threat-model coverage

| Threat ID | Mitigation in code |
|-----------|---------------------|
| T-60-06-01 (Tampering — double-categorize on retry) | Each step.run independently memoized; `retries: 0`; Outlook-category is idempotent at API layer. |
| T-60-06-02 (Repudiation — silently dropped event) | mark-failed step writes status='failed' + error_message; Inngest dashboard surfaces failed events. |
| T-60-06-04 (Elevation — direct API call) | recordVerdict is a server-action (`"use server"`); not exposed as REST. |
| T-60-06-05 (Reject half-state) | Reject path explicitly marks status='completed' so UI doesn't see a partial state. |

## Deviations from Plan

**None substantively.**

Minor: removed `iController` mentions from actions.ts comments to satisfy the literal `grep -c "iController\|icontroller" == 0` acceptance criterion (initial draft had explanatory comments referencing iController). Behavior unchanged.

## Coordination notes

- Plan touches only `actions.ts`, the new worker, and route.ts. Per the plan's no-overlap constraint, **`bulk-review.tsx` (which currently imports `executeReviewDecisions` and `fetchReviewEmailBody`) will fail tsc until 60-05 replaces it**. This is expected — the plan's tsc acceptance specifically scopes to `actions.ts`, `route.ts`, and the new worker. Acceptable per plan.

## Self-Check: PASSED

- `web/lib/inngest/functions/classifier-verdict-worker.ts` — FOUND
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` (rewritten) — FOUND
- `web/app/api/inngest/route.ts` (worker registered) — FOUND
- `web/tests/queue/actions.test.ts` (real assertions) — FOUND
- Commit `343e17b` (worker) — present in `git log`
- Commit `b9396e1` (split + register + tests) — present in `git log`
