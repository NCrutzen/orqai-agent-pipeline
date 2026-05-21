---
phase: 80
plan: 01
type: tdd
wave: 0
depends_on: []
files_modified:
  - web/lib/automations/debtor-email/coordinator/types.ts
  - web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts
  - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
  - web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "RED test scaffolds exist for dispatcher placeholder/registered/wildcard/idempotency/replay paths"
    - "Existing classifier test asserts status flip to 'predicted' and emit of '<swarm>/predicted' event"
    - "Existing classifier test asserts NO inline Kanban INSERT (dispatch removed)"
    - "Backfill script test scaffold exists with RED idempotency + status-precondition + dry-run cases"
    - "TypeScript STATUS literal-union in coordinator/types.ts includes 'predicted'"
  artifacts:
    - path: "web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts"
      provides: "RED test scaffold for new dispatcher (5 test cases per VALIDATION.md Wave 0)"
      contains: "describe('stage-3-dispatcher'"
    - path: "web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts"
      provides: "RED test scaffold for backfill script"
      contains: "describe("
    - path: "web/lib/automations/debtor-email/coordinator/types.ts"
      provides: "Updated STATUS literal-union including 'predicted'"
      contains: "predicted"
  key_links:
    - from: "stage-3-dispatcher.test.ts"
      to: "@/lib/inngest/client + @/lib/swarms/registry mocks"
      via: "vi.mock"
      pattern: "vi\\.mock"
    - from: "debtor-email-coordinator.test.ts"
      to: "assertion that mockInngestSend received '<swarm>/predicted'"
      via: "expect(...).toHaveBeenCalledWith"
      pattern: "predicted"
---

<objective>
Wave 0 RED scaffolds for the entire phase. Establish failing tests + the `predicted` literal-union type addition so subsequent waves can implement against pre-defined contracts.

**Task structure (revised — 3 tasks, one concern each):** Originally a 2-task plan that interleaved type edits, dispatcher scaffold, classifier scaffold, and backfill scaffold inside two large tasks. Per checker feedback, split into three sequential tasks to lower cognitive load and produce one-concern commits:

1. Task 1: `types.ts` STATUS literal-union edit only — verify with tsc.
2. Task 2: dispatcher RED test scaffold only.
3. Task 3: classifier test update + backfill RED test scaffold.

Each task ends with a verifiable checkpoint and a clean commit. No task touches more than two files.

Purpose: Per VALIDATION.md Wave 0 list and CLAUDE.md TDD guidance, create test contracts BEFORE the implementation lands. This makes Wave 1 dispatcher implementation fail-fast against concrete assertions and prevents regressions when Wave 2 strips dispatch logic from the classifier.

Output: Three test files (one new, two updated/new) that all FAIL today. One TS file with `predicted` added to the STATUS literal-union.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-CONTEXT.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-RESEARCH.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-PATTERNS.md
@.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-VALIDATION.md
@web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts
@web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
@web/lib/automations/debtor-email/coordinator/types.ts
@CLAUDE.md

<interfaces>
<!-- From web/lib/automations/debtor-email/coordinator/types.ts (lines 39-51) -->
Current STATUS literal-union (per RESEARCH §"`agent_runs.status` literal-union"):
  classifying, routed_human_queue, fetching_document, generating_body, creating_draft,
  copy_document_drafted, copy_document_needs_review, copy_document_failed_not_found,
  copy_document_failed_transient, login_failed_blocked, done

CONTEXT.md "Resolved After Research" #1 confirms DB CHECK constraint already accepts 'predicted'.
Only the TS literal-union is missing it.

<!-- Test mock shapes from debtor-email-orchestrator.test.ts -->
type IntentRow = {
  swarm_type: string; intent_key: string; handler_agent_key: string | null;
  handler_event: string; handler_status: "registered" | "placeholder";
  requires_orchestration: boolean; created_at: string; updated_at: string;
};
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add 'predicted' to STATUS literal-union in coordinator/types.ts</name>
  <read_first>
    - web/lib/automations/debtor-email/coordinator/types.ts (lines 1-80) — locate existing STATUS const + Status type
    - 80-RESEARCH.md §"`agent_runs.status` literal-union" — confirms scope (TS-only edit; DB CHECK constraint already accepts 'predicted')
    - 80-CONTEXT.md "Resolved After Research" #1 — locked decision
  </read_first>
  <files>web/lib/automations/debtor-email/coordinator/types.ts</files>
  <behavior>
    types.ts:
      - STATUS const array includes 'predicted' (alphabetical-ish or grouped sensibly; preserve other entries exactly)
      - Status TS type derived from STATUS still works (no other consumer breaks)
  </behavior>
  <action>
    1. Read web/lib/automations/debtor-email/coordinator/types.ts. Locate STATUS const array (lines ~39-51).
    2. Add the literal `"predicted"` to the array. Keep all existing entries verbatim. Place it after `"classifying"` (semantically the next state) for readability.
    3. Ensure derived `Status` type still compiles (typically `Status = typeof STATUS[number]`).
    4. Do NOT touch any test file in this task — that's Task 2 + Task 3.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit lib/automations/debtor-email/coordinator/types.ts && grep -c "predicted" lib/automations/debtor-email/coordinator/types.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "predicted" web/lib/automations/debtor-email/coordinator/types.ts` returns >= 1
    - `grep -E "STATUS.*=.*\\[" web/lib/automations/debtor-email/coordinator/types.ts` finds the array AND the line range from STATUS to closing bracket includes "predicted"
    - `cd web && npx tsc --noEmit` succeeds for the project (literal-union widening does not break consumers; if a consumer's exhaustive switch breaks, fix in this same task — those would be expected fall-through cases that simply need a `case "predicted":` arm)
    - No test file changes in this task (verify via `git diff --name-only` shows ONLY types.ts modified)
  </acceptance_criteria>
  <done>STATUS includes 'predicted'; tsc clean across the project; no test files touched yet.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create dispatcher RED test scaffold (stage-3-dispatcher.test.ts)</name>
  <read_first>
    - web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts (full) — primary analog for mock-step shell, loadSwarmIntents mock, chainable Supabase mock, makeStep factory
    - 80-PATTERNS.md §"web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts" — required test cases enumerated
    - 80-VALIDATION.md §"Wave 0 Requirements" — test scaffold requirements (note: fixtures are inline per RESEARCH Q9, no separate fixtures module)
  </read_first>
  <files>web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts</files>
  <behavior>
    stage-3-dispatcher.test.ts MUST contain these failing test cases:
      - Test A: "placeholder routes to kanban + flips agent_runs.status='routed_human_queue'"
        → loadSwarmIntents mock returns handler_status='placeholder'
        → assert admin.from('automation_runs').insert called with automation='debtor-email-kanban', kanban_reason='no_handler'
        → assert admin.from('agent_runs').update({status:'routed_human_queue'}) called for the agent_run_id
        → assert step.run callOrder includes 'dispatch-placeholder' as a SINGLE step
      - Test B: "registered emits handler_event from swarm_intents (does NOT flip agent_runs.status)"
        → loadSwarmIntents mock returns handler_status='registered', handler_event='debtor-email/copy-document.requested'
        → assert inngest.send called with name=handler_event
        → assert NO update on agent_runs.status (handler-owned)
      - Test C: "wildcard routes sales-email/predicted via event.name discrimination" (cross-swarm, must_have #6)
        → event.name='sales-email/predicted', swarm_type derived from name
        → loadSwarmIntents mock called with 'sales-email'
      - Test D: "duplicate */predicted event for same agent_run_id is no-op (idempotency)"
        → status precondition mock returns {status:'routed_human_queue'} (already dispatched)
        → assert no insert / no update / no inngest.send
      - Test E: "replay does not duplicate kanban (status precondition gates entire step.run)"
        → invoke handler twice; second invocation's precondition mock returns {status:'routed_human_queue'}
        → assert insert called exactly once

    All fixtures inline (no separate fixtures module per RESEARCH Q9). Use local helper functions `placeholderRow(intent)` and `registeredRow(intent, handler_event)` per PATTERNS.md.
  </behavior>
  <action>
    1. Create web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts. Copy the mock-step shell, vi.mock blocks for `@/lib/inngest/client` and `@/lib/swarms/registry`, the chainable Supabase mock, and the makeStep() factory verbatim from web/lib/inngest/functions/__tests__/debtor-email-orchestrator.test.ts (lines 1-117). Adapt:
       - Import target should be `stage3Dispatcher` from `@/lib/inngest/functions/stage-3-dispatcher` (file does NOT exist yet — that's the RED).
       - Add an extra Supabase chain to support `.from('agent_runs').select('status').eq('id', X).single()` returning configurable `{data: {status}, error}` per test (idempotency precondition).
       - Add inline helpers `placeholderRow(intent)` and `registeredRow(intent, handler_event)` per PATTERNS.md.
    2. Implement Test A through Test E exactly as specified in <behavior>. Each test should fail today (module-not-found is acceptable — that IS the RED state). Use `it.todo` ONLY if absolutely necessary; prefer real failing assertions.
    3. DO NOT implement stage-3-dispatcher.ts — that's plan 80-02's job. The tests must reference it as if it exists; the import failure is the expected RED state.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts 2>&1 | grep -E "(failed|FAIL|Cannot find module|stage-3-dispatcher)" | head -20</automated>
  </verify>
  <acceptance_criteria>
    - File web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts exists
    - `grep -c "placeholder routes to kanban" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns 1
    - `grep -c "registered emits handler_event" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns 1
    - `grep -c "wildcard routes sales-email" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns 1
    - `grep -c "duplicate.*predicted.*no-op\\|idempotency" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns >= 1
    - `grep -c "replay.*duplicate.*kanban\\|replay does not" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns >= 1
    - `grep -cE "placeholderRow|registeredRow" web/lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` returns >= 2 (inline helpers present)
    - vitest run reports the dispatcher test as failing (RED state) — output includes "Cannot find module" OR "FAIL" for stage-3-dispatcher
    - No production code changes (verify via `git diff --name-only` shows ONLY the new test file modified)
  </acceptance_criteria>
  <done>Dispatcher test file exists with 5 RED cases; vitest confirms RED state.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Update classifier test for 'predicted' flip + emit assertions; create backfill test scaffold</name>
  <read_first>
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (full) — existing classifier test
    - web/scripts/replay-stage1-unknown-failures.ts (full) — primary analog for backfill script structure
    - 80-PATTERNS.md §"web/scripts/backfill-stuck-classifying-stage3.ts" — three-bucket logic + safety guards
    - 80-VALIDATION.md §"Wave 0 Requirements" — backfill test scaffold requirements
  </read_first>
  <files>web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts, web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts</files>
  <behavior>
    debtor-email-coordinator.test.ts updates:
      - REMOVE / SKIP existing assertions on inline Kanban INSERT and `dispatch-single-shot` step.run (these moves to dispatcher in Wave 2; the classifier no longer dispatches).
      - ADD test "flips agent_runs.status from 'classifying' to 'predicted'":
        → asserts step.run called with name 'flip-status-predicted'
        → asserts admin.from('agent_runs').update({status:'predicted'}).eq('id',...).eq('status','classifying') was called
      - ADD test "emits 'debtor-email/predicted' event with run_id, agent_run_id, ranked, swarm_type":
        → asserts inngest.send called with name='debtor-email/predicted', data containing those keys
      - ADD negative test "classifier does NOT call automation_runs.insert with kanban_reason" (proves dispatch is gone):
        → assert admin.from('automation_runs').insert NOT called with any payload containing kanban_reason

    backfill-stuck-classifying-stage3.test.ts (NEW):
      - Test 1: "dry-run does NOT mutate DB" — invoke main() with apply=false → assert no admin.from(...).update calls
      - Test 2: "HAS_KANBAN bucket flips status to routed_human_queue" — fixture row with kanban_rows=1, apply=true → assert update({status:'routed_human_queue'}).eq('status','classifying')
      - Test 3: "NO_KANBAN bucket writes to JSON file (apply=true), does NOT flip" — fixture row with kanban_rows=0, apply=true → assert no update; assert fs.writeFile/append called for backfill-stuck-no-kanban.json
      - Test 4: "MULTI_KANBAN bucket flagged via JSON (apply=true), does NOT flip" — fixture row with kanban_rows>=2, apply=true → assert no update; assert fs.writeFile for backfill-multi-kanban.json
      - Test 5: "status-precondition guard prevents racing dispatcher" — assert .eq("status", "classifying") present on the UPDATE chain
      - Test 6 (mock-only, prod gate): mock `node:readline/promises` so the prod typed-phrase prompt resolves to the correct phrase; assert script proceeds. (Documents the two-factor gate per Plan 80-05; impl in Wave 4.)
  </behavior>
  <action>
    1. Open web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts.
       a. Locate existing test cases that assert inline dispatch (search for "kanban_reason", "dispatch-single-shot", or automation_runs.insert assertions). Mark them with `it.skip(...)` and a comment `// Phase 80 Wave 2: dispatch moved to stage-3-dispatcher; assertions migrated to stage-3-dispatcher.test.ts` — do NOT delete; preserve git history readability.
       b. Add the three new test cases per <behavior>. Use the existing test's mock infrastructure (already present in the file). For the inngest.send assertion, use the same mockInngestSend variable already in the file.
    2. Create web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts.
       a. Mock `@supabase/supabase-js` createClient with a chainable factory similar to other tests; allow per-test override of the SELECT result (the fixture rows + their kanban_rows count).
       b. Mock `node:fs/promises` (or `fs`) to capture writeFile/appendFile calls.
       c. Mock `node:readline/promises` so the production typed-phrase prompt does not block tests (return a resolved phrase).
       d. Implement Tests 1–6 per <behavior>. Import target: `../backfill-stuck-classifying-stage3` (file does NOT exist yet — that's the RED).
       e. Use `process.argv` manipulation to toggle `--apply` between tests.
    3. Both files must reference modules/code that does not yet exist (stage-3-dispatcher.ts; backfill-stuck-classifying-stage3.ts) — RED state is expected.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts scripts/__tests__/backfill-stuck-classifying-stage3.test.ts 2>&1 | tail -40</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "flips agent_runs.status from 'classifying' to 'predicted'\\|flip-status-predicted" web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` returns >= 1
    - `grep -c "debtor-email/predicted\\|emits.*predicted.*event" web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` returns >= 1
    - `grep -c "does NOT.*kanban_reason\\|classifier does NOT" web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` returns >= 1
    - `grep -c "it.skip\\|it\\.skip" web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` returns >= 1
    - File web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts exists
    - `grep -cE "HAS_KANBAN|NO_KANBAN|MULTI_KANBAN" web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` returns >= 3
    - `grep -c "dry-run\\|apply=false\\|--apply" web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` returns >= 1
    - `grep -c "status.*classifying\\|precondition" web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` returns >= 1
    - `grep -cE "readline|createInterface" web/scripts/__tests__/backfill-stuck-classifying-stage3.test.ts` returns >= 1 (mocks the prod prompt)
    - vitest run on classifier test fails on the new "flip-status-predicted" / emit-predicted assertions (RED) AND new tests appear in output
    - vitest run on backfill test fails with module-not-found OR red assertions (RED state)
  </acceptance_criteria>
  <done>Classifier test asserts predicted-flip + emit + no-inline-dispatch (all RED); backfill test scaffold exists with 6 RED cases; readline prompt mocked.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

None new. Test files run only locally / in CI; no new external inputs, no new auth surface, no PII.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-80-01 | Tampering | TS literal-union narrowing | accept | Type-only change; runtime CHECK constraint is the actual gate (already includes 'predicted' per CONTEXT §"Resolved After Research" #1) |
</threat_model>

<verification>
- `cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts scripts/__tests__/backfill-stuck-classifying-stage3.test.ts 2>&1 | tail -50` shows the expected RED failures (module-not-found for dispatcher + backfill; assertion failures for the new classifier expectations).
- `cd web && npx tsc --noEmit` succeeds for the types.ts change (no breaking consumers).
</verification>

<success_criteria>
- STATUS literal-union includes 'predicted'; tsc passes.
- Three test files updated/created with the exact test cases enumerated.
- vitest output shows RED state for all new assertions.
- No production code changes outside of types.ts (no implementation drift into Wave 0).
- Plan splits cleanly into 3 single-concern commits (types-only, dispatcher-test-only, classifier+backfill-tests).
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-01-SUMMARY.md` with: per-task outcomes, RED-state confirmation (paste tail of vitest output), files modified per task.
</output>
