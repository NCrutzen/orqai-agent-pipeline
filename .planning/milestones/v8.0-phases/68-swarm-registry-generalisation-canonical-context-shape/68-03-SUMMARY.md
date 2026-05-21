---
phase: 68
plan: 03
status: complete
date: 2026-05-04
---

# Plan 68-03 — verdict-worker stage-1 cleanup → registry dispatch

## What was built

`classifier-verdict-worker.ts`:
- Imported `evaluateSideEffects` from `@/lib/swarms/side-effects`.
- Replaced the literal `swarm_type === "debtor-email"` gate (line 127) with an `evaluateSideEffects(admin, swarm_type, "stage1_categorize_archive", { category_action: "categorize_archive" })` call.
- Loop over returned descriptors:
  - `kind === "automation_run_insert"` → INSERT into `automation_runs` with the descriptor's `result_template` merged with caller-owned runtime fields (`source_automation_run_id`, `message_id`, `source_mailbox`).
  - `kind === "inngest_event"` → fan out via `inngest.send` (no descriptors today, future-proofing).
- Removed dead D-12 comment.
- All side-effect work inside `step.run` (replay-safe).

`__tests__/classifier-verdict-worker.test.ts` (new):
- Test 1: cleanup descriptor → `automation_runs` INSERT with `automation: "debtor-email-cleanup"`, `status: "deferred"`, `result.icontroller === "pending"`, `result.stage === "icontroller_delete"`, runtime ids preserved.
- Test 2: empty registry result → no cleanup INSERT.
- Test 3: `inngest_event` descriptor (sales-email stub) → `inngest.send` called with the descriptor's event name.

## Tests

`npx vitest run lib/inngest/functions/__tests__/classifier-verdict-worker.test.ts` → **3 / 3 pass**.

## Acceptance criteria

- ✅ `evaluateSideEffects` invoked
- ✅ `swarm_type === "debtor-email"` literal: 0 matches
- ✅ `stage1_categorize_archive` literal present
- ✅ `automation_run_insert` literal present
- ✅ no destructured `inngest.send` (no this-binding break)

## Requirement satisfied

**SWRM-04** acceptance bullet 1 — verdict-worker dispatches via `side_effects[]` lookup, not via literal swarm_type.
