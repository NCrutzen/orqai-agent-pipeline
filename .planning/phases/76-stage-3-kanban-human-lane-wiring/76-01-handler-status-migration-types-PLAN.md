---
phase: 76
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql
  - web/lib/swarms/types.ts
  - web/lib/swarms/__tests__/registry.test.ts
  - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
  - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts
  - web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "swarm_intents table has handler_status column constrained to ('registered','placeholder')"
    - "8 placeholder intents (address_change, contract_inquiry, copy_document_request, credit_request, general_inquiry, peppol_request, payment_dispute, other) marked placeholder"
    - "invoice_copy_request stays 'registered' (default)"
    - "SwarmIntentRow TS type includes handler_status: 'registered' | 'placeholder'"
    - "Failing test scaffolds exist for every Wave 1+2 task — RED state until later waves implement"
  artifacts:
    - path: "supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql"
      provides: "handler_status column DDL + UPDATE for placeholders"
      contains: "ADD COLUMN handler_status"
    - path: "web/lib/swarms/types.ts"
      provides: "SwarmIntentRow.handler_status field"
    - path: "web/lib/swarms/__tests__/registry.test.ts"
      provides: "loadSwarmIntents handler_status row-shape coverage"
  key_links:
    - from: "web/lib/swarms/registry.ts"
      to: "swarm_intents.handler_status"
      via: "select('*') already pulls new column — type only"
      pattern: "handler_status"
---

<objective>
Add the `handler_status` column to `public.swarm_intents` (registry source-of-truth for which Stage 4 handlers are actually shipped), update the `SwarmIntentRow` TypeScript type to carry the new field, and scaffold all failing test files Wave 1/2 tasks need (Nyquist gate). After this plan: schema/types are in place; no runtime behavior changed yet.

Purpose: Phase 76's `no_handler` decision (D-01 implicit, RESEARCH §Pattern 1) hinges on this column. Phase 68's "registry as source-of-truth" principle is extended one column further. CI codegen extension is deferred to Phase 78 per RESEARCH Open Q1.

Output: One migration file, one type-file edit, one extended registry test, four new test scaffolds (REDs that subsequent plans turn GREEN).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md
@.planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md
@docs/agentic-pipeline/stage-3-coordinator.md
@web/lib/swarms/types.ts
@web/lib/swarms/registry.ts
@supabase/migrations/20260507_phase75_swarm_categories_rename_to_noise.sql

<interfaces>
<!-- SwarmIntentRow current shape (web/lib/swarms/types.ts:66-75) — extend with handler_status. -->
<!-- loadSwarmIntents already does select('*') — column shows up automatically; only type narrows. -->
<!-- Migration shape verified against research §Pattern 1; placeholder list verified against CONTEXT.md (8 of 9 intents). -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration — add handler_status column with placeholder seeds</name>
  <files>supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql</files>
  <read_first>
    - supabase/migrations/20260507_phase75_swarm_categories_rename_to_noise.sql (Phase 75 migration style — follow same header comment + transactional shape)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Pattern 1 (lines ~143-170 — full migration shape)
    - docs/agentic-pipeline/stage-3-coordinator.md (intent_key list confirmation — 9 debtor-email intents)
    - CLAUDE.md §Supabase patterns
  </read_first>
  <action>
Create migration file with EXACT contents:

```sql
-- Phase 76: handler_status registry column on swarm_intents.
-- Purpose: Stage 3 dispatch checks handler_status before inngest.send.
-- 'registered' → handler exists, fire event. 'placeholder' → write Kanban row.
-- Per RESEARCH.md §Pattern 1 + CONTEXT.md "Schema / row shape on automation_runs".

BEGIN;

ALTER TABLE public.swarm_intents
  ADD COLUMN handler_status text NOT NULL DEFAULT 'registered'
  CHECK (handler_status IN ('registered','placeholder'));

-- 8 of 9 debtor-email intents have NO Stage 4 handler today.
-- Only invoice_copy_request stays 'registered' (default).
-- Source: classifier-invoice-copy-handler.ts is the only *-handler.ts in the Stage 4 set.
UPDATE public.swarm_intents
   SET handler_status = 'placeholder'
 WHERE swarm_type = 'debtor-email'
   AND intent_key IN (
     'address_change',
     'contract_inquiry',
     'copy_document_request',
     'credit_request',
     'general_inquiry',
     'peppol_request',
     'payment_dispute',
     'other'
   );

COMMENT ON COLUMN public.swarm_intents.handler_status IS
  'Phase 76: registry source-of-truth for Stage 4 handler registration. Stage 3 dispatch checks this before inngest.send; placeholder intents land in Kanban human lane (automation_runs.status=pending, result.kanban_reason=no_handler).';

COMMIT;
```

Do NOT apply locally (push happens in Plan 02). The migration must compile against existing schema (Phase 75 already shipped the table rename).
  </action>
  <verify>
    <automated>test -f supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql && grep -c "handler_status" supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql | grep -q "[1-9]"</automated>
  </verify>
  <acceptance_criteria>
    - File exists at exact path `supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql`
    - `grep -c "handler_status" supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` ≥ 4
    - `grep -c "address_change\|contract_inquiry\|copy_document_request\|credit_request\|general_inquiry\|peppol_request\|payment_dispute\|other" supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql` = 8
    - File contains literal `CHECK (handler_status IN ('registered','placeholder'))`
    - File contains literal `BEGIN;` and `COMMIT;`
    - File does NOT contain `invoice_copy_request` (it stays default)
  </acceptance_criteria>
  <done>Migration file written, transactional, includes all 8 placeholder UPDATEs, matches research §Pattern 1.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend SwarmIntentRow type + scaffold registry test for handler_status</name>
  <files>web/lib/swarms/types.ts, web/lib/swarms/__tests__/registry.test.ts</files>
  <read_first>
    - web/lib/swarms/types.ts (read full file — find SwarmIntentRow at lines ~66-75)
    - web/lib/swarms/registry.ts (loadSwarmIntents — select('*') pattern; column is auto-pulled)
    - web/lib/swarms/__tests__/registry.test.ts (existing test patterns — fixture shapes, mock supabase client style)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Implementation Seams (registry types row)
  </read_first>
  <behavior>
    - Test 1: loadSwarmIntents fixture rows include handler_status='registered' and 'placeholder' values; both pass through unchanged in returned array.
    - Test 2: TypeScript compile gate — assigning a row with handler_status='unknown' must fail typecheck (negative test commented as `@ts-expect-error` if registry test file uses inline type assertions, otherwise omit and rely on tsc).
  </behavior>
  <action>
1. In `web/lib/swarms/types.ts`, locate `SwarmIntentRow` (TS type or interface — read the file). Add field:
   ```ts
   handler_status: 'registered' | 'placeholder';
   ```
   Place adjacent to `handler_event` field for visual locality. If the type is exported as `type` alias from a shape literal, add it inside the shape; if `interface`, add as a property line. Do NOT change any other field or default.

2. In `web/lib/swarms/__tests__/registry.test.ts` (extend if it exists; create if missing — follow Vitest patterns from `web/lib/inngest/functions/__tests__/*.test.ts`), add a `describe('handler_status', ...)` block:
   ```ts
   it('returns handler_status for each intent row', async () => {
     // Mock supabase select to return rows with handler_status
     // Call loadSwarmIntents
     // Expect rows[i].handler_status to be one of 'registered' | 'placeholder'
   });
   ```

   The mock fixture must include AT LEAST one row with `handler_status: 'registered'` and one with `handler_status: 'placeholder'`. Test asserts:
   - `rows.length >= 2`
   - `rows.every(r => r.handler_status === 'registered' || r.handler_status === 'placeholder')`
   - At least one row matches each value.

3. Test must pass once types.ts is updated AND the migration is applied (Plan 02). For Wave 1 it MAY pass with the unit-test mock alone since the column is mocked client-side.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v "node_modules" | grep -E "swarms/types\.ts|swarms/registry" ; cd web && npx vitest run lib/swarms/__tests__/registry.test.ts -t "handler_status"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "handler_status" web/lib/swarms/types.ts` returns ≥ 1 line
    - The literal `'registered' | 'placeholder'` (or `"registered" | "placeholder"`) appears in `web/lib/swarms/types.ts`
    - `cd web && npx tsc --noEmit` exits 0 (no new type errors)
    - `cd web && npx vitest run lib/swarms/__tests__/registry.test.ts -t "handler_status"` exits 0 (test passes against the mock)
    - Existing tests in `lib/swarms/__tests__/registry.test.ts` still pass
  </acceptance_criteria>
  <done>SwarmIntentRow carries handler_status; registry test covers row-shape; tsc and vitest both green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Scaffold Wave 1+2 RED test files (Nyquist gate)</name>
  <files>
    web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts,
    web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts,
    web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/close.test.ts,
    web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/replay.test.ts,
    web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/reclassify-noise.test.ts,
    web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/kanban-loader.test.ts
  </files>
  <read_first>
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (extend — read existing structure, locate `single-shot dispatches via swarm_intents` test ~line 395)
    - web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts (extend if exists — research notes its existence)
    - web/lib/inngest/functions/__tests__/pipeline.test.ts OR briefing-refresh.test.ts (template for onFailure capture: `createFunction: vi.fn((cfg, trigger, handler) => ({ cfg, trigger, handler }))`)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Phase Requirements → Test Map AND §Eight-Dimensional Validation
  </read_first>
  <behavior>
    - debtor-email-coordinator.test.ts: add describe blocks 'no_handler' (placeholder intent → Kanban INSERT, no inngest.send) and 'low_confidence' (orchestrator decision → Kanban INSERT, no orchestrator dispatch). Both initially fail with `expect(...).toBe(...)` against unimplemented behavior — RED.
    - classifier-invoice-copy-handler.test.ts: add describe block 'onFailure' that captures the createFunction config object, asserts `cfg.onFailure` is a function, simulates error+event payload, asserts admin.from('automation_runs').insert called with kanban_reason='handler_error'. RED.
    - close.test.ts: assert closeKanbanRow updates status='completed' and emits broadcast. RED (action file does not exist yet).
    - replay.test.ts: two cases — same-intent (calls inngest.send with handler_event directly, NO override.submitted) and edited-intent (calls inngest.send with debtor-email/override.submitted). RED.
    - reclassify-noise.test.ts: emits debtor-email/override.submitted with axis='stage_1_category'. RED.
    - kanban-loader.test.ts: SELECT shape returns rows with status='pending' AND result->>'kanban_reason' IS NOT NULL filtered by swarm_type. RED.
  </behavior>
  <action>
Scaffold each test file with `it.todo` OR full RED test bodies that fail until subsequent plans implement. Pattern:

```ts
// web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (extend)
describe('Phase 76: no_handler trigger', () => {
  it('writes Kanban row when intent.handler_status === "placeholder"', () => {
    // Wave 0 RED — Plan 03 turns GREEN
    expect(false).toBe(true); // placeholder
  });
  it('does NOT call inngest.send when handler_status === "placeholder"', () => {
    expect(false).toBe(true);
  });
});

describe('Phase 76: low_confidence trigger', () => {
  it('writes Kanban row when escalation-gate decision.kind === "orchestrator"', () => {
    expect(false).toBe(true);
  });
  it('does NOT dispatch debtor-email/orchestrator.requested', () => {
    expect(false).toBe(true);
  });
});
```

For Server Action test files in `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/` — the directory MUST be created. The action files themselves do not exist yet (Plan 05 creates them); the test files import from `../close`, `../replay`, `../reclassify-noise` and will fail at module-resolve — that IS the RED state. To keep vitest from breaking the entire suite at collection, wrap imports in dynamic `await import()` inside `it.todo` or use `it.todo('…')` markers.

Use `it.todo` for the Server Action tests since those modules don't exist yet:

```ts
// close.test.ts
import { describe, it } from 'vitest';
describe('Phase 76: closeKanbanRow', () => {
  it.todo('UPDATE automation_runs SET status=completed');
  it.todo('emits broadcast on automations:${swarm_type}-kanban:stale');
});
```

Same `it.todo` shape for replay.test.ts (two todos: same-intent, edited-intent), reclassify-noise.test.ts (one todo), kanban-loader.test.ts (one todo for the SELECT-shape).

For `classifier-invoice-copy-handler.test.ts` and `debtor-email-coordinator.test.ts` — the modules DO exist; use real `it()` blocks with `expect(false).toBe(true)` so those waves see RED that turns GREEN with implementation, NOT `it.todo` (it.todo doesn't fail).

The two test-runtime-existing files: use `it()` with failing assertions (RED that subsequent plans flip to GREEN).
The four test-runtime-missing files: use `it.todo()` (executor turns into `it()` when implementation lands).

Create directories `web/app/(dashboard)/automations/[swarm]/kanban/actions/__tests__/` and `web/app/(dashboard)/automations/[swarm]/kanban/_lib/__tests__/`. Empty `kanban/page.tsx` is NOT in scope here — only test directories.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "no_handler" 2>&1 | grep -E "FAIL|fail" ; cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban 2>&1 | grep -E "todo|skipped|FAIL"</automated>
  </verify>
  <acceptance_criteria>
    - File `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` contains literal strings `Phase 76: no_handler` AND `Phase 76: low_confidence`
    - File `web/lib/inngest/functions/__tests__/classifier-invoice-copy-handler.test.ts` contains literal `Phase 76` AND `onFailure`
    - Six test files exist at the exact paths declared in `<files>`
    - `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "Phase 76"` reports failing tests (RED state — expected)
    - `cd web && npx vitest run app/\(dashboard\)/automations/\[swarm\]/kanban` reports `todo` markers for Server Action tests (does NOT fail collection)
    - The full suite `cd web && npx vitest run` does NOT regress any pre-existing passing test (Phase 76 RED tests are new failures only)
  </acceptance_criteria>
  <done>All Wave 0 test scaffolds exist; subsequent plans flip RED → GREEN as they implement. No pre-existing tests broken.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator browser → Server Actions | Untrusted operator-supplied identifiers (kanbanRowId, intent_key, noise_key) — Plan 05 enforces; Plan 01 just defines the registry the validator reads. |
| Migration runtime → Supabase | Service-role-equivalent DDL; runs in CI/local via supabase db push (Plan 02). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-01-01 | T (Tampering) | swarm_intents.handler_status | mitigate | CHECK constraint `handler_status IN ('registered','placeholder')` enforced at DB level; no application-layer trust required |
| T-76-01-02 | I (Information disclosure) | Migration UPDATE WHERE clause | accept | UPDATE only flips placeholder/registered; no PII; rollback = single UPDATE setting handler_status='registered' (default) for the same 8 rows |
| T-76-01-03 | E (Elevation of privilege) | Migration must run with service-role-equivalent access | accept | Same access posture as every Phase 75 migration; no new attack surface |
| T-76-01-04 | S (Spoofing) | Test scaffolds — placeholder `it.todo` markers | accept | Tests run in dev/CI only; no production behavior change in this plan |
</threat_model>

<verification>
- Migration file shape matches research §Pattern 1 verbatim (with the 8-intent placeholder list).
- `web/lib/swarms/types.ts` carries `handler_status: 'registered' | 'placeholder'`.
- Six test files exist at declared paths; two contain RED `it()` failures, four contain `it.todo()` markers.
- `cd web && npx tsc --noEmit` passes (no new type errors).
- `cd web && npx vitest run` does not regress pre-existing passing tests; the 4 RED Phase 76 tests fail as expected (Wave 1+2 turn them GREEN).
</verification>

<success_criteria>
- Migration committed and ready for `supabase db push` in Plan 02.
- TypeScript compiles cleanly with the new field.
- Wave 1/2/3 plans inherit a complete test scaffold (Nyquist gate satisfied).
- No runtime behavior change yet — registry column is dormant until Plan 03 reads it.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-01-SUMMARY.md` documenting:
- Migration file path
- Type-file diff summary (one-line addition)
- List of test files scaffolded with their RED/todo state
- Confirmation that `cd web && npx tsc --noEmit` passes
</output>
