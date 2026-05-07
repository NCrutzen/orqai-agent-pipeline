---
phase: 76
plan: 04
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - web/lib/inngest/functions/classifier-invoice-copy-handler.ts
  - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "When classifier-invoice-copy-handler throws, an automation_runs row is INSERTed with result.kanban_reason='handler_error' and result.error_detail=error.message"
    - "Inngest's per-function onFailure callback fires after retries (retries:0 → fires on first failure)"
    - "Kanban INSERT is replay-safe (inside step.run)"
    - "automation column is set to '${swarm_type}-kanban' (matches loader filter)"
  artifacts:
    - path: "web/lib/inngest/functions/classifier-invoice-copy-handler.ts"
      provides: "onFailure config option that writes Kanban row"
      contains: "onFailure"
  key_links:
    - from: "Inngest retries-exhausted on classifier-invoice-copy-handler"
      to: "automation_runs row with kanban_reason=handler_error"
      via: "step.run('kanban-handler-error', ...)"
      pattern: "kanban_reason.*handler_error"
---

<objective>
Add an `onFailure` callback to `classifier-invoice-copy-handler.ts` (the only currently-shipping Stage 4 handler) that captures handler failures and writes a Kanban row with `result.kanban_reason='handler_error'`. This closes the third Kanban trigger condition from CONTEXT.md.

The pattern set here is the canonical shape for the 8 future Stage 4 handlers — when each one ships, it MUST add the same `onFailure` config option (plan does NOT add it to those handlers; they don't exist yet).

Purpose: When a registered handler throws (Orq.ai timeout, downstream API rejection, deadlock, etc.), the email surfaces in the Kanban lane instead of disappearing into Inngest's failed-run log. Operator can Replay or Close the row.

Output: Modified handler file with onFailure callback; Wave 0 RED test in `classifier-invoice-copy-handler.test.ts` flips GREEN.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@docs/inngest-patterns.md
@web/lib/inngest/functions/classifier-invoice-copy-handler.ts
@web/lib/inngest/functions/pipeline.ts
@web/lib/inngest/functions/briefing-refresh.ts
@web/lib/automations/runs/emit.ts

<interfaces>
<!-- onFailure signature, verified against pipeline.ts:70 and 5 other functions: -->
<!--   onFailure: async ({ error, event, step }) => { … } -->
<!-- The event payload here is Inngest's failure-event wrapper: -->
<!--   event.data.event.data → original handler trigger payload -->
<!-- For invoice-copy-handler the original trigger is `debtor-email/invoice-copy.requested` -->
<!-- Per Phase 65: ALL DB writes inside step.run; per CLAUDE.md commit dae6276: never destructure inngest.send -->
<!-- emit pattern: emitAutomationRunStale(admin, `${swarm_type}-kanban`) -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add onFailure callback to classifier-invoice-copy-handler.ts</name>
  <files>web/lib/inngest/functions/classifier-invoice-copy-handler.ts, web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/classifier-invoice-copy-handler.ts (FULL file — locate the createFunction config object at line ~47; understand current shape)
    - web/lib/inngest/functions/pipeline.ts (line ~70 — onFailure signature reference)
    - web/lib/inngest/functions/briefing-refresh.ts (line ~29 — second onFailure reference)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Code Examples §Example 3 (verbatim shape)
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts (Plan 01 RED scaffold + any existing test infrastructure)
    - web/lib/automations/runs/emit.ts (emitAutomationRunStale)
    - web/lib/supabase/admin.ts (createAdminClient — confirm import path)
    - CLAUDE.md §Inngest patterns
  </read_first>
  <behavior>
    - Test 1: Mock createFunction to capture the config object: `vi.fn((cfg, trigger, handler) => ({ cfg, trigger, handler }))`. Import classifierInvoiceCopyHandler. Assert `cfg.onFailure` is a function.
    - Test 2: Call `cfg.onFailure({ error: new Error('Orq timeout'), event: { data: { event: { data: { swarm_type: 'debtor-email', intent: 'invoice_copy_request', email_id: 'em-1', automation_run_id: 'run-1' } } } }, step: { run: vi.fn(async (_id, fn) => fn()) } })`. Mock supabase admin client to capture the INSERT. Assert insert called with `automation: 'debtor-email-kanban'`, `result.kanban_reason: 'handler_error'`, `result.error_detail: 'Orq timeout'`, `result.intent: 'invoice_copy_request'`, `result.email_id: 'em-1'`, `result.automation_run_id: 'run-1'`, `topic: 'invoice_copy_request'`, `status: 'pending'`.
    - Test 3: Assert `emitAutomationRunStale` called with `(admin, 'debtor-email-kanban')`.
  </behavior>
  <action>
1. Open `web/lib/inngest/functions/classifier-invoice-copy-handler.ts`. Locate the `inngest.createFunction({ … }, { event: 'debtor-email/invoice-copy.requested' }, async ({ event, step }) => { … })` call.

2. Inside the FIRST argument (the config object — currently has `id` and `retries: 0`), add the `onFailure` callback. Pattern verified at `pipeline.ts:70` and `briefing-refresh.ts:29`:

   ```ts
   onFailure: async ({ error, event, step }) => {
     const admin = createAdminClient();
     // Inngest convention: when retries are exhausted, event.data.event.data holds the original trigger payload.
     const orig = (event.data as unknown as { event: { data: Record<string, unknown> } }).event.data;
     await step.run("kanban-handler-error", async () => {
       const swarmType = (orig.swarm_type as string) ?? "debtor-email";
       const { error: insertError } = await admin.from("automation_runs").insert({
         automation: `${swarmType}-kanban`,
         swarm_type: swarmType,
         status: "pending",
         topic: (orig.intent as string) ?? "invoice_copy_request",
         result: {
           kanban_reason: "handler_error",
           intent: orig.intent ?? "invoice_copy_request",
           email_id: orig.email_id,
           automation_run_id: orig.automation_run_id,
           error_detail: error.message,
           error_name: error.name,
         },
         triggered_by: "stage-4-onFailure",
       });
       if (insertError) {
         throw new Error(`kanban-handler-error insert: ${insertError.message}`);
       }
       await emitAutomationRunStale(admin, `${swarmType}-kanban`);
     });
   },
   ```

3. Imports — add at top of file if not already present:
   - `import { createAdminClient } from "@/lib/supabase/admin";`
   - `import { emitAutomationRunStale } from "@/lib/automations/runs/emit";`

   If the import paths differ in this codebase (verify by reading the file's existing imports), use whatever path the file already uses for these symbols.

4. Do NOT change the handler body (third argument to createFunction). Do NOT change retries setting (stays `retries: 0` per RESEARCH note: "auto-retry compounds Orq.ai cost; Bulk Review/Kanban retry is the recovery path").

5. Update the RED test in `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` for the `Phase 76 onFailure` describe block to flip GREEN. Test pattern:

   ```ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';

   // Mock the inngest client to capture createFunction config
   const mockCreateFunction = vi.fn((cfg, trigger, handler) => ({ cfg, trigger, handler }));
   vi.mock('@/lib/inngest/client', () => ({
     inngest: { createFunction: mockCreateFunction },
   }));

   const mockInsert = vi.fn(async () => ({ error: null }));
   const mockChannel = vi.fn(() => ({ send: vi.fn(async () => {}) }));
   vi.mock('@/lib/supabase/admin', () => ({
     createAdminClient: () => ({
       from: vi.fn(() => ({ insert: mockInsert })),
       channel: mockChannel,
     }),
   }));

   describe('Phase 76: classifier-invoice-copy-handler onFailure', () => {
     beforeEach(() => { mockInsert.mockClear(); });

     it('writes Kanban row when handler throws', async () => {
       const { classifierInvoiceCopyHandler } = await import('../classifier-invoice-copy-handler');
       const { cfg } = classifierInvoiceCopyHandler as any;
       expect(typeof cfg.onFailure).toBe('function');

       await cfg.onFailure({
         error: new Error('Orq timeout'),
         event: { data: { event: { data: {
           swarm_type: 'debtor-email',
           intent: 'invoice_copy_request',
           email_id: 'em-1',
           automation_run_id: 'run-1',
         }}}},
         step: { run: async (_id: string, fn: () => Promise<unknown>) => fn() },
       });

       expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
         automation: 'debtor-email-kanban',
         status: 'pending',
         topic: 'invoice_copy_request',
         result: expect.objectContaining({
           kanban_reason: 'handler_error',
           error_detail: 'Orq timeout',
           intent: 'invoice_copy_request',
           email_id: 'em-1',
           automation_run_id: 'run-1',
         }),
       }));
     });
   });
   ```

   Adapt the mock paths to whatever this codebase uses (the test's own imports of `inngest` and admin client). Verify by reading any existing `__tests__/*.test.ts` for similar mocks.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts -t "onFailure" && cd web && npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "onFailure" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ 1
    - `grep -c "kanban_reason.*handler_error" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ 1
    - `grep -c "kanban-handler-error" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ 1
    - `grep -c "step.run" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ existing+1 (new step inside onFailure)
    - `grep -c "createAdminClient" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ 1
    - `grep -c "emitAutomationRunStale" web/lib/inngest/functions/classifier-invoice-copy-handler.ts` ≥ 1
    - `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts -t "onFailure"` exits 0
    - `cd web && npx vitest run lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` (full file) — pre-existing tests in this file STILL PASS
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>onFailure callback in place; failed handler runs surface as Kanban rows; pattern documented for the 8 future handlers.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inngest failure event → onFailure callback | event payload is Inngest-signed; original handler payload accessed via event.data.event.data |
| onFailure → automation_runs INSERT | Service-role admin client; trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-04-01 | T (Tampering) | event.data.event.data is the original handler trigger | mitigate | Inngest signs all events; payload integrity is Inngest's responsibility, not application's |
| T-76-04-02 | I (Information disclosure) | error.message stored in result.error_detail | accept | error.message may include stack frames or downstream payload. Service-role-only read. Phase 79 dashboard may want to redact, but for v1 raw is acceptable per CONTEXT.md "Pull-only surface" |
| T-76-04-03 | D (Denial of service) | A handler that fails repeatedly creates one Kanban row per failure | accept | retries:0 means one Kanban row per failed run; same volume as today's `automation_runs.status='failed'` rows. No amplification |
| T-76-04-04 | R (Repudiation) | Operator audit: which Kanban rows came from handler failures | mitigate | result.error_detail + result.error_name + triggered_by='stage-4-onFailure' provide full provenance; result.automation_run_id links back to original run |
| T-76-04-05 | E (Elevation of privilege) | onFailure body uses createAdminClient | accept | Same posture as every other Stage 4 handler that uses service-role for cleanup; no new privilege |
</threat_model>

<verification>
- onFailure unit test (mocked Inngest config capture pattern from briefing-refresh) passes.
- handler body unchanged — pre-existing tests in this file still pass.
- TypeScript compiles cleanly.
- `automation` column value matches what `[swarm]/kanban/page.tsx` (Plan 06) will filter on (`'debtor-email-kanban'`).
</verification>

<success_criteria>
- Phase 76 handler_error trigger live for invoice_copy_request.
- Pattern documented as `<interfaces>` block for the 8 future handlers.
- No regression on existing handler tests.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-04-SUMMARY.md` documenting:
- Diff summary for `classifier-invoice-copy-handler.ts`
- Test result (handler_error onFailure GREEN)
- Pattern note for the 8 future Stage 4 handlers (cite this file as the canonical example)
</output>
