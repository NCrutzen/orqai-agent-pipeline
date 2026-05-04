---
phase: 66-pipeline-consolidation-retire-triage-path
plan: 03
subsystem: debtor-email pipeline (Stage 2 → Stage 3 seam)
tags: [inngest, events, label-resolver, coordinator, phase-66, D-03]
requires:
  - 66-01 (coordinator function-id rename)
  - 66-02 (doc reconciliation)
provides:
  - "Stage 2 → Stage 3 trigger wired: classifier-label-resolver emits debtor-email/coordinator.requested after close-automation-run"
  - "Coordinator subscription retargeted from orphan debtor/email.received to debtor-email/coordinator.requested"
  - "Vitest coverage on the emit (VALIDATION row 46)"
affects:
  - web/lib/inngest/events.ts
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/lib/inngest/functions/classifier-label-resolver.ts
  - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
  - web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
tech_stack:
  patterns:
    - "Inngest replay-safe step.run wrapping for non-deterministic Date.now / toISOString (CLAUDE.md commit dd2583a)"
    - "Inline `(inngest.send as unknown as SendFn)({...})` cast — never destructure inngest.send (CLAUDE.md commit dae6276)"
key_files:
  created:
    - web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
  modified:
    - web/lib/inngest/events.ts
    - web/lib/inngest/functions/debtor-email-coordinator.ts
    - web/lib/inngest/functions/classifier-label-resolver.ts
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
decisions:
  - "Coerce widened entity (string | null | undefined) back to ENTITY strict union in coordinator with 'smeba' default (Rule 3 blocking-fix). The producer (label-resolver) reads entity from labeling_settings.entity which is the same union; the cast is sound at runtime."
metrics:
  tasks_completed: 4
  duration_minutes: ~15
  completed: 2026-05-04
---

# Phase 66 Plan 03: D-03 Trigger Retarget — Summary

Wired the canonical Stage 2 → Stage 3 seam by adding `debtor-email/coordinator.requested`, retargeting the Phase 65 coordinator's subscription, emitting the new event from `classifier-label-resolver` after `close-automation-run`, deleting the orphan `debtor/email.received` event, and adding a dedicated unit test for the new emit (VALIDATION row 46). This is the only behavioural change in Phase 66 and the precondition for live smoke in Plan 05.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 3.1 | Add new event + delete orphan + refresh comment | `d191a6a` | `web/lib/inngest/events.ts` |
| 3.2 | Retarget coordinator subscription + update test | `9b889e3` | `web/lib/inngest/functions/debtor-email-coordinator.ts`, `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` |
| 3.3 | Emit coordinator.requested from label-resolver | `ba2ac83` | `web/lib/inngest/functions/classifier-label-resolver.ts` |
| 3.4 | Add label-resolver emit unit test | `7b62841` | `web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` |

## Diff: New event entry (events.ts:309-326)

```ts
// Debtor email swarm — Stage 3 coordinator trigger.
// Phase 66 retargeted from "debtor/email.received" (orphan, no live producer)
// to "debtor-email/coordinator.requested" emitted by classifier-label-resolver.
// Carries the Stage 0 budget envelope (budget_run_id), the pre-created
// agent_runs row (agent_run_id), and the Stage-2-resolved customer fields
// (customer_account_id, customer_name) through to the coordinator.
"debtor-email/coordinator.requested": {
  data: {
    email_id: string;
    automation_run_id?: string;
    run_id?: string;
    budget_run_id?: string;
    agent_run_id?: string;
    entity?: string | null;
    subject: string;
    body_text: string;
    sender_email: string;
    sender_domain?: string;
    mailbox: string;
    received_at: string;
    graph_message_id?: string;
    customer_account_id?: string | null;
    customer_name?: string | null;
  };
};
```

Shape matches `66-RESEARCH.md § Trigger Wiring Recommendation step 1` exactly (14 fields, documented optionality).

## Coordinator subscription before / after

```diff
-  { event: "debtor/email.received" },
+  { event: "debtor-email/coordinator.requested" },
```

Plus a coercion shim at the top of the handler for the widened entity (was `"smeba" | "berki" | "sicli-noord" | "sicli-sud" | "smeba-fire"`, now `string | null | undefined`):

```ts
const entity = (email.entity ?? "smeba") as
  | "smeba"
  | "berki"
  | "sicli-noord"
  | "sicli-sud"
  | "smeba-fire";
const sender_domain = email.sender_domain ?? "";
```

This is a Rule 3 deviation (auto-fix blocking issue caused by the retarget). Tracked under `<deviations>` below.

## Label-resolver emit (the actual code that landed)

Added immediately after the `close-automation-run` step in `classifier-label-resolver.ts`:

```ts
// Phase 66 D-03 — Stage 2 → Stage 3 seam. Emit coordinator.requested
// with the resolved customer fields so the coordinator runs with full
// Stage-2 context (no re-resolve). Wrapped in step.run for replay-
// safety: `new Date().toISOString()` is non-deterministic and the
// event payload becomes downstream coordinator state. Inline cast on
// `inngest.send` per CLAUDE.md commit dae6276 — NEVER destructure.
await step.run("emit-coordinator", async () =>
  (inngest.send as unknown as SendFn)({
    name: "debtor-email/coordinator.requested",
    data: {
      email_id: emailRow.id,
      automation_run_id,
      entity: settingsRow?.entity ?? null,
      subject: emailRow.subject ?? "",
      body_text: emailRow.body_text ?? "",
      sender_email: emailRow.sender_email ?? "",
      mailbox: emailRow.mailbox,
      received_at: new Date().toISOString(),
      graph_message_id: message_id,
      customer_account_id: result.customer_account_id,
      customer_name: result.customer_name,
    },
  }),
);
```

`SendFn` declared at the top of the file matching `coordinator-orchestrator.ts:25`:

```ts
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
```

CLAUDE.md compliance:
- `step.run("emit-coordinator", ...)` — replay-safe wrapping per commit `dd2583a` (Date.now / toISOString are non-deterministic; the emitted event becomes downstream state).
- `(inngest.send as unknown as SendFn)({...})` inline — binding-safe per commit `dae6276` (never destructure `inngest.send`; would lose `this`).

## Test outcome

### Coordinator unit test (Task 3.2 update)
`web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` — synthetic emit updated to fire `debtor-email/coordinator.requested`. **5/5 tests pass.**

### Label-resolver unit test (Task 3.4 — NEW)
`web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts` — new file. Mocks `@/lib/inngest/client`, `@/lib/supabase/admin` (full schema/from chain for `email_pipeline.emails`, `debtor.labeling_settings`, `debtor.email_labels`, `automation_runs`), `@/lib/automations/runs/emit`, and `@/lib/automations/debtor-email/resolve-debtor`. Drives a successful `sender_match` resolution and asserts:

```ts
expect(inngestSend).toHaveBeenCalledWith(
  expect.objectContaining({
    name: "debtor-email/coordinator.requested",
    data: expect.objectContaining({
      email_id: expect.any(String),
      automation_run_id: expect.any(String),
      customer_account_id: expect.anything(),
      mailbox: expect.any(String),
      subject: expect.any(String),
      body_text: expect.any(String),
      sender_email: expect.any(String),
      received_at: expect.any(String),
    }),
  }),
);
```

Plus concrete equality checks on `email_id`, `automation_run_id`, `customer_account_id`, `customer_name`, `mailbox`, `subject`, `body_text`, `sender_email`, `entity`, `graph_message_id` (so the test fails if the emit's data shape regresses, not just its name). **1/1 tests pass.**

### Inngest functions test directory
`vitest run lib/inngest/functions/__tests__/` — **7 files, 25 tests, all passing.**

### tsc
`tsc --noEmit` — **0 errors.**

### Full vitest suite
547 tests / 80 todo / 17 skipped. **454 pass, 13 fail in pre-existing unrelated files** (out of scope per Plan 66-02 summary):
- `tests/labeling/orq-agents-client.test.ts` (3)
- `lib/pipeline/__tests__/stages.test.ts` (4)
- `lib/v7/graph/__tests__/layout.test.ts` (1)
- `app/(dashboard)/automations/[swarm]/review/__tests__/safety-review-loader.test.ts` (5)

None touch files modified by this plan. Documented for transparency, not fixed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Entity / sender_domain TypeScript narrowing in coordinator**
- **Found during:** Task 3.2 (running `tsc --noEmit` after retargeting the trigger).
- **Issue:** The new event shape declares `entity?: string | null` and `sender_domain?: string` (producer-agnostic by design). The Phase 65 coordinator destructures `entity` and passes it to `createRun({entity})` (expects strict `Entity` union) and `invokeIntentAgent({sender_domain})` (expects `string`). 3 TS2322 errors at `debtor-email-coordinator.ts:88`, `:136`, `:138`.
- **Fix:** Added a coercion shim at the top of the handler — `(email.entity ?? "smeba") as Entity` and `email.sender_domain ?? ""`. The default is sound at runtime: the label-resolver producer reads `entity` from `labeling_settings.entity` which is the same ENTITY union, and a missing value defaults to `smeba` (the debiteuren-mailbox baseline used elsewhere in the swarm).
- **Files modified:** `web/lib/inngest/functions/debtor-email-coordinator.ts`
- **Commit:** `9b889e3` (folded into Task 3.2)

No Rule 1 / Rule 2 / Rule 4 deviations.

## Self-Check: PASSED

```
FOUND: web/lib/inngest/events.ts (debtor-email/coordinator.requested at line 315)
FOUND: web/lib/inngest/events.ts (no debtor/email.received event entry — only one comment-line historical reference at :310)
FOUND: web/lib/inngest/functions/debtor-email-coordinator.ts ({ event: "debtor-email/coordinator.requested" })
FOUND: web/lib/inngest/functions/classifier-label-resolver.ts (step.run("emit-coordinator", ...) + "debtor-email/coordinator.requested")
FOUND: web/lib/inngest/functions/__tests__/classifier-label-resolver.test.ts
FOUND: commit d191a6a (Task 3.1)
FOUND: commit 9b889e3 (Task 3.2)
FOUND: commit ba2ac83 (Task 3.3)
FOUND: commit 7b62841 (Task 3.4)
```

## Live Smoke Verification

Deferred to **Plan 05** per phase scope. Vercel-preview synthetic-emit smoke is the acceptance gate; the Stage 1 production-data gap is documented in `66-CONTEXT.md <deferred>`.
