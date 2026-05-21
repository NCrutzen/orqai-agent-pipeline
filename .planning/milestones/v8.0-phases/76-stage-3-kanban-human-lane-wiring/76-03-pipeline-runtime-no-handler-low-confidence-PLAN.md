---
phase: 76
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - web/lib/inngest/functions/debtor-email-coordinator.ts
  - web/lib/inngest/functions/coordinator-orchestrator.ts
  - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "When Stage 3 single-shot picks an intent whose swarm_intents.handler_status='placeholder', a Kanban row is INSERTed with result.kanban_reason='no_handler' and NO inngest.send fires"
    - "When escalation-gate decision.kind='orchestrator', a Kanban row is INSERTed with result.kanban_reason='low_confidence' and the orchestrator dispatch event is NOT sent"
    - "When intent.handler_status='registered' (default), single-shot still dispatches handler_event normally — no regression"
    - "coordinator-orchestrator.ts fan-out loop applies the same handler_status check (defensive — Pitfall 6 / R-5) so future Stage 3.5 re-enable degrades gracefully"
    - "escalation-gate.ts stays a pure function — no createAdminClient import"
  artifacts:
    - path: "web/lib/inngest/functions/debtor-email-coordinator.ts"
      provides: "no_handler check at single-shot dispatch + low_confidence Kanban write at orchestrator branch"
      contains: "kanban_reason"
    - path: "web/lib/inngest/functions/coordinator-orchestrator.ts"
      provides: "Defensive handler_status check inside fan-out loop"
      contains: "handler_status"
  key_links:
    - from: "debtor-email-coordinator.ts:255 single-shot branch"
      to: "automation_runs INSERT (Kanban)"
      via: "step.run('kanban-no-handler', ...)"
      pattern: "kanban_reason.*no_handler"
    - from: "debtor-email-coordinator.ts:293-312 orchestrator branch"
      to: "automation_runs INSERT (Kanban)"
      via: "step.run('kanban-low-confidence', ...)"
      pattern: "kanban_reason.*low_confidence"
    - from: "coordinator-orchestrator.ts:94-123 fan-out loop"
      to: "Kanban INSERT or continue (no throw on placeholder)"
      via: "if (intent.handler_status === 'placeholder')"
      pattern: "handler_status.*placeholder"
---

<objective>
Wire the two pipeline-runtime triggers from CONTEXT.md into the existing Stage 3 dispatch path. (1) `no_handler`: when the resolved `swarm_intents.handler_status='placeholder'`, write a Kanban row instead of `inngest.send`. (2) `low_confidence` (D-07): repurpose the `decision.kind === 'orchestrator'` branch to write a Kanban row instead of dispatching `debtor-email/orchestrator.requested`. Plus defensive: same handler_status check inside `coordinator-orchestrator.ts` fan-out loop (Pitfall 6).

Per D-09: `escalation-gate.ts` STAYS pure — body unchanged. The behavior change is in the CALLER (`debtor-email-coordinator.ts:293-312`).

Purpose: Close the silent-dead-letter loop for 8 of 9 debtor-email intents AND for low-confidence cases. After this plan, every Stage 3 outcome either dispatches a registered handler OR creates a Kanban row.

Output: Modified coordinator + orchestrator files; Wave 0 RED tests in `debtor-email-coordinator.test.ts` flip to GREEN.
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
@docs/inngest-patterns.md
@web/lib/inngest/functions/debtor-email-coordinator.ts
@web/lib/inngest/functions/coordinator-orchestrator.ts
@web/lib/automations/debtor-email/coordinator/escalation-gate.ts
@web/lib/automations/runs/emit.ts

<interfaces>
<!-- RESEARCH §Code Examples 1+2 are the authoritative shape for the changes. -->
<!-- emitAutomationRunStale signature: (admin: SupabaseClient, automationName: string) → void -->
<!-- automation_runs columns (post-Phase-65): automation, swarm_type, status, topic, entity, result jsonb, triggered_by, completed_at -->
<!-- Channel naming convention: '${swarm_type}-kanban' — verified at emit.ts:22 -->
<!-- Replay-safe: ALL writes inside step.run; no UUIDs generated outside step.run (CLAUDE.md Phase 65 rule). -->
<!-- inngest.send call sites must use the binding pattern: (inngest.send as unknown as SendFn)(...) per CLAUDE.md commit dae6276. -->

<!-- escalation-gate orchestrator-decision shape (W2 verification — verified at escalation-gate.ts lines 15-51): -->
<!--   type GateDecision = -->
<!--     | { kind: "single_shot" } -->
<!--     | { kind: "orchestrator"; reason: "low_confidence" | "high_intent_count" | "requires_orchestration_flag" } -->
<!-- The orchestrator-branch field name is `reason` (NOT `gate_reason`, NOT `cause`). The Kanban write must read `decision.reason`. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: no_handler check at single-shot dispatch site</name>
  <files>web/lib/inngest/functions/debtor-email-coordinator.ts, web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/debtor-email-coordinator.ts (FULL file — locate single-shot branch at lines ~237-291; understand `intent`, `top`, `entity`, `email_id`, `automation_run_id`, `run_id`, `SWARM_TYPE` variable scopes)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Code Examples §Example 1 (verbatim shape)
    - web/lib/automations/runs/emit.ts (emitAutomationRunStale signature)
    - web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts (Plan 01 RED scaffolds — flip to GREEN)
    - web/lib/swarms/registry.ts (loadSwarmIntents — already pulls handler_status post-Plan 02)
    - CLAUDE.md §Inngest patterns (replay-safe id generation; inngest.send binding rule — applies to other Inngest call sites in this file, not this task)
    - docs/agentic-pipeline/stage-3-coordinator.md
  </read_first>
  <behavior>
    - Test 1 (no_handler/placeholder): mock `loadSwarmIntents` to return `[{ swarm_type:'debtor-email', intent_key:'address_change', handler_event:'debtor-email/address-change.requested', handler_status:'placeholder' }]`; coordinator output ranks `address_change` top with `confidence:'high'`; gate returns `kind:'single_shot'`. Expect: `admin.from('automation_runs').insert` called with `result.kanban_reason='no_handler'`, `automation='debtor-email-kanban'`, `topic='address_change'`. Expect: NO inngest.send call to `debtor-email/address-change.requested`. Expect: `coordinator_runs` row marked `completed_at`.
    - Test 2 (registered/regression): same as above but `handler_status:'registered'`. Expect: inngest.send called for `debtor-email/address-change.requested`; NO automation_runs INSERT with `kanban_reason='no_handler'`.
    - Test 3 (broadcast): on no_handler path, `emitAutomationRunStale` called with `('debtor-email-kanban')` channel arg.
  </behavior>
  <action>
1. Open `web/lib/inngest/functions/debtor-email-coordinator.ts`. Locate the single-shot branch — it follows the pattern (verified in research):

   ```ts
   if (decision.kind === "single_shot") {
     const top = output.ranked[0];
     const intent = await step.run("resolve-intent-row", async () => {
       const intents = await loadSwarmIntents(supabase, SWARM_TYPE);
       return intents.find((i) => i.intent_key === top.intent) ?? null;
     });
     if (!intent) {
       throw new Error(`no swarm_intents row for (${SWARM_TYPE}, ${top.intent})`);
     }
     // [INSERT new no_handler check HERE — between `if (!intent) throw` and the existing dispatch step]
     const handler_event = intent.handler_event;
     await step.run("dispatch-single-shot", async () => { /* … existing inngest.send … */ });
   }
   ```

2. Insert the new no_handler check IMMEDIATELY before the existing `dispatch-single-shot` step:

   ```ts
   if (intent.handler_status === "placeholder") {
     // Phase 76: no_handler trigger — Kanban row instead of dispatching to a non-existent worker.
     await step.run("kanban-no-handler", async () => {
       const { error } = await supabase.from("automation_runs").insert({
         automation: `${SWARM_TYPE}-kanban`,
         swarm_type: SWARM_TYPE,
         status: "pending",
         topic: top.intent,
         entity,
         result: {
           kanban_reason: "no_handler",
           intent: top.intent,
           confidence: top.confidence,
           email_id,
           automation_run_id: automation_run_id ?? null,
           coordinator_run_id: run_id,
         },
         triggered_by: "stage-3-no-handler",
       });
       if (error) throw new Error(`kanban-no-handler insert: ${error.message}`);
       await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
     });
     await step.run("mark-coordinator-deferred", async () => {
       await supabase.from("coordinator_runs")
         .update({ completed_at: new Date().toISOString(), completed_handlers: 0 })
         .eq("run_id", run_id);
     });
     return { run_id, email_id, decision: "kanban_no_handler" as const };
   }
   ```

   Notes:
   - Use the EXISTING variable names from the file scope: `top`, `intent`, `entity`, `email_id`, `automation_run_id`, `run_id`, `SWARM_TYPE`, `supabase`. Adjust if the local scope uses different names.
   - The `automation_run_id ?? null` guard is essential — `automation_run_id` is optional on the event payload per Phase 65 work.
   - Import `emitAutomationRunStale` if not already imported: `import { emitAutomationRunStale } from "@/lib/automations/runs/emit";`
   - Per replay-id rule (CLAUDE.md Phase 65), do NOT generate any UUID outside `step.run`. The DB default UUID handles row id; nothing else here is non-deterministic.

3. Update the corresponding RED tests in `web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts` (replace `expect(false).toBe(true)` placeholders) to assert the behaviors in `<behavior>` above. Use the existing test file's mock patterns for `supabase` and `inngest.send`. Expand the existing fixture if needed to include `handler_status` on intent rows (it MUST already be there once Plan 01 types.ts edit landed).
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "no_handler"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "kanban-no-handler" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "kanban_reason.*no_handler" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "intent.handler_status" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "emitAutomationRunStale" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1 (already may exist; this confirms not removed)
    - `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "no_handler"` exits 0 with all assertions passing
    - `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "single-shot"` (existing dispatch test) STILL PASSES — no regression
    - `cd web && npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>no_handler trigger live in single-shot path; both placeholder-Kanban and registered-dispatch paths covered; no regression on existing dispatch tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: low_confidence Kanban write at orchestrator branch (D-07/D-09)</name>
  <files>web/lib/inngest/functions/debtor-email-coordinator.ts, web/lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts</files>
  <read_first>
    - web/lib/inngest/functions/debtor-email-coordinator.ts (locate `if (decision.kind === "orchestrator")` branch around lines 293-312)
    - web/lib/automations/debtor-email/coordinator/escalation-gate.ts (PURE function — must NOT change. **W2 mandate:** before emitting `decision.<field>` in the Kanban write, READ the orchestrator-decision union return type at lines 15-21 and confirm the EXACT field name. As of the current source, the union is `{ kind: "orchestrator"; reason: "low_confidence" | "high_intent_count" | "requires_orchestration_flag" }` — the field is `reason`. If this file has changed since planning, use whatever field name the union actually exports. Do NOT guess; do NOT use `gate_reason`, `cause`, or `decision_reason` — those are NOT the field on the union. Verify by running the W2 grep gate in `<acceptance_criteria>` before declaring this task done.)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Code Examples §Example 2 + §Pitfall 1 (gate stays pure; caller changes)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-CONTEXT.md (D-07, D-08, D-09 — locked)
  </read_first>
  <behavior>
    - Test 1 (low_confidence reason): coordinator output with `ranked[0].confidence='low'`; gate returns `{ kind:'orchestrator', reason:'low_confidence' }`. Expect: `automation_runs.insert` called with `result.kanban_reason='low_confidence'`, `result.gate_reason='low_confidence'`, `topic=ranked[0].intent`. Expect: NO `inngest.send('debtor-email/orchestrator.requested')` call.
    - Test 2 (high_intent_count): output with `ranked.length===3` all `confidence:'high'`; gate returns `{ kind:'orchestrator', reason:'high_intent_count' }`. Expect: Kanban INSERT with `result.gate_reason='high_intent_count'`. Same negative assertion on orchestrator dispatch.
    - Test 3 (single_shot regression): gate returns `{ kind:'single_shot' }`. Expect: NO Kanban INSERT with `kanban_reason='low_confidence'`. (Combined with Task 1 paths, full coverage.)
  </behavior>
  <action>
1. In `web/lib/inngest/functions/debtor-email-coordinator.ts`, locate the orchestrator branch:

   ```ts
   if (decision.kind === "orchestrator") {
     // existing body — currently calls inngest.send('debtor-email/orchestrator.requested', ...)
   }
   ```

2. Replace the body of that `if` block with the Kanban-write shape from RESEARCH §Code Example 2 (verbatim, adjusted for the file's local variable names):

   ```ts
   if (decision.kind === "orchestrator") {
     await step.run("kanban-low-confidence", async () => {
       const { error } = await supabase.from("automation_runs").insert({
         automation: `${SWARM_TYPE}-kanban`,
         swarm_type: SWARM_TYPE,
         status: "pending",
         topic: output.ranked[0].intent,
         entity,
         result: {
           kanban_reason: "low_confidence",
           gate_reason: decision.reason, // 'low_confidence' | 'high_intent_count' | 'requires_orchestration_flag' — confirmed via W2 read-first; field name is `reason` on the orchestrator union
           ranked: output.ranked,
           email_id,
           automation_run_id: automation_run_id ?? null,
           coordinator_run_id: run_id,
         },
         triggered_by: "stage-3-low-confidence",
       });
       if (error) throw new Error(`kanban-low-confidence insert: ${error.message}`);
       await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
     });
     await step.run("mark-coordinator-deferred", async () => {
       await supabase.from("coordinator_runs")
         .update({ completed_at: new Date().toISOString(), completed_handlers: 0 })
         .eq("run_id", run_id);
     });
     return { run_id, email_id, decision: "kanban_low_confidence" as const };
   }
   ```

   The `inngest.send('debtor-email/orchestrator.requested', ...)` call MUST be removed from this branch. The orchestrator file (`coordinator-orchestrator.ts`) stays in the codebase per "Things to NOT touch" — but its trigger event no longer fires from here.

3. DO NOT modify `web/lib/automations/debtor-email/coordinator/escalation-gate.ts`. It stays pure (CONTEXT.md D-09; RESEARCH §Pitfall 1). Verify by running its tests after the change: `cd web && npx vitest run lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` — must stay green with zero changes.

4. Update RED tests in `debtor-email-coordinator.test.ts` for the `Phase 76: low_confidence trigger` describe block to flip GREEN. Use the existing mock-supabase pattern; assert (a) Kanban INSERT shape, (b) absence of orchestrator dispatch.
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "low_confidence" && cd web && npx vitest run lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "kanban-low-confidence" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "kanban_reason.*low_confidence" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "gate_reason" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1
    - `grep -c "debtor-email/orchestrator.requested" web/lib/inngest/functions/debtor-email-coordinator.ts` = 0 (removed from this file — it's no longer fired here)
    - `grep -c "createAdminClient\|supabase.from" web/lib/automations/debtor-email/coordinator/escalation-gate.ts` = 0 (gate stayed pure — Pitfall 1)
    - **W2 field-name verification gate:** `grep -E "kind.*orchestrator" web/lib/automations/debtor-email/coordinator/escalation-gate.ts | grep -E "reason"` ≥ 1 (the orchestrator-decision union exposes a `reason` field — this anchors `decision.reason` on the read side)
    - **W2 caller emits the verified field:** `grep -c "decision\\.reason" web/lib/inngest/functions/debtor-email-coordinator.ts` ≥ 1 (the Kanban write reads `decision.reason`, the field that exists on the union)
    - **W2 negative gate (no guessed field names):** `grep -nE "decision\\.(gate_reason|cause|decision_reason|reason_code)" web/lib/inngest/functions/debtor-email-coordinator.ts` returns ZERO matches
    - `cd web && npx vitest run lib/inngest/functions/__tests__/debtor-email-coordinator.test.ts -t "low_confidence"` exits 0
    - `cd web && npx vitest run lib/automations/debtor-email/coordinator/__tests__/escalation-gate.test.ts` exits 0 — no regression
    - `cd web && npx tsc --noEmit` exits 0 (this is the strongest backstop: if the field name was wrong, tsc would fail on the discriminated-union member access)
  </acceptance_criteria>
  <done>orchestrator branch repurposed to write Kanban row; gate stays pure; W2 field-name verified via grep + tsc; both new + pre-existing tests green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Defensive handler_status check in coordinator-orchestrator.ts fan-out loop (R-5/Pitfall 6)</name>
  <files>web/lib/inngest/functions/coordinator-orchestrator.ts</files>
  <read_first>
    - web/lib/inngest/functions/coordinator-orchestrator.ts (FULL file — locate the for-of loop at lines ~94-123 that iterates over `plan.handlers` and dispatches each)
    - .planning/phases/76-stage-3-kanban-human-lane-wiring/76-RESEARCH.md §Pitfall 6 + §Risk R-5
    - web/lib/inngest/functions/debtor-email-coordinator.ts (the no_handler shape from Task 1 — mirror the same Kanban-INSERT structure for consistency)
    - web/lib/swarms/registry.ts (loadSwarmIntents)
  </read_first>
  <behavior>
    - The orchestrator file is currently UNREACHED (Task 2 stopped firing it). It stays in the codebase per CONTEXT.md "Things to NOT touch" (D-07). This task adds defensive code — no test required for the fan-out path itself (it's dead code today), but the change must preserve TS compile and the file's existing tests.
    - The throw at line ~100 (`throw new Error("no handler for intent X")` or similar) is replaced with a Kanban INSERT + `continue`. Pattern matches Task 1.
  </behavior>
  <action>
1. Open `web/lib/inngest/functions/coordinator-orchestrator.ts`. Locate the for-of loop iterating `plan.handlers` (research §Pitfall 6 cites lines 94-123; line numbers may have drifted by ±5).

2. Inside the loop, before the existing `inngest.send(handler_event, ...)` call, look up the intent row's `handler_status`:

   ```ts
   for (const handler of plan.handlers) {
     // existing: handler has { intent, handler_event } shape from the planner
     const intentRow = await step.run(`resolve-intent-${handler.intent}`, async () => {
       const intents = await loadSwarmIntents(supabase, SWARM_TYPE);
       return intents.find((i) => i.intent_key === handler.intent) ?? null;
     });
     if (!intentRow) {
       // existing throw — keep this path; missing-from-registry is a different error class
       throw new Error(`no swarm_intents row for (${SWARM_TYPE}, ${handler.intent})`);
     }
     if (intentRow.handler_status === "placeholder") {
       // Phase 76 defensive: write Kanban row, do NOT throw, do NOT inngest.send. Continue loop.
       await step.run(`kanban-no-handler-${handler.intent}`, async () => {
         const { error } = await supabase.from("automation_runs").insert({
           automation: `${SWARM_TYPE}-kanban`,
           swarm_type: SWARM_TYPE,
           status: "pending",
           topic: handler.intent,
           entity,
           result: {
             kanban_reason: "no_handler",
             intent: handler.intent,
             email_id,
             automation_run_id: automation_run_id ?? null,
             coordinator_run_id: run_id,
             via: "orchestrator-fanout",
           },
           triggered_by: "stage-3-no-handler-fanout",
         });
         if (error) throw new Error(`kanban-no-handler-fanout insert: ${error.message}`);
         await emitAutomationRunStale(supabase, `${SWARM_TYPE}-kanban`);
       });
       continue;
     }
     // existing dispatch (unchanged): inngest.send(handler.handler_event, ...)
   }
   ```

   The existing `throw new Error("no handler for intent X")` at the loop body's start (research line ~100) — if it's a generic missing-handler error, REMOVE it and let the placeholder branch handle that case. If it's the missing-from-registry case (`!intentRow`), KEEP it.

3. Variable names must match the file's local scope. Read the file FIRST to confirm `SWARM_TYPE`, `supabase`, `entity`, `email_id`, `automation_run_id`, `run_id` are all in scope; if not, adapt to whatever the file uses. Replay-id rule: all writes inside `step.run`. Step ID includes `${handler.intent}` to keep replay deterministic per handler.

4. No new test required (the file is dead-code-reachable today). Existing `coordinator-orchestrator.test.ts` (if any) MUST stay green.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit && grep -E "handler_status.*placeholder" web/lib/inngest/functions/coordinator-orchestrator.ts && cd web && npx vitest run lib/inngest/functions/__tests__/coordinator-orchestrator.test.ts 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "handler_status" web/lib/inngest/functions/coordinator-orchestrator.ts` ≥ 1
    - `grep -c "kanban_reason.*no_handler" web/lib/inngest/functions/coordinator-orchestrator.ts` ≥ 1
    - `grep -c "continue" web/lib/inngest/functions/coordinator-orchestrator.ts` ≥ 1
    - `grep -c "step.run" web/lib/inngest/functions/coordinator-orchestrator.ts` ≥ existing-count + 1 (one new step added)
    - `cd web && npx tsc --noEmit` exits 0
    - Pre-existing tests (if any) for coordinator-orchestrator stay green
  </acceptance_criteria>
  <done>Defensive handler_status check in fan-out loop; future Stage 3.5 re-enablement degrades gracefully; tsc green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Inngest event payload → coordinator | Stage 3 events carry email_id and automation_run_id from Stage 2 — assumed non-tampered (Inngest signing) |
| Coordinator → swarm_intents registry | Read-only; no operator-supplied keys here (operator-side comes in Plan 05) |
| Coordinator → automation_runs INSERT | Service-role write; service-role client trusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-76-03-01 | T (Tampering) | Replay-safety of Kanban INSERT on Inngest retry | mitigate | All INSERTs inside `step.run` (CLAUDE.md Phase 65 rule); Inngest dedupes step results so retries do not duplicate rows |
| T-76-03-02 | I (Information disclosure) | result.ranked may carry intent confidence + email_id | accept | result jsonb is read by service-role only via `[swarm]/kanban` UI; no public exposure |
| T-76-03-03 | D (Denial of service) | Kanban table accumulation if every email lands placeholder | accept | Pull-only surface (CONTEXT.md); Realtime fetch capped at 200 rows (Pitfall 2); Plan 06 may bump; Phase 79 will add SLA metric |
| T-76-03-04 | E (Elevation of privilege) | escalation-gate stays pure — no DB access | mitigate | Kept pure per D-09; tested via gate-purity grep in acceptance |
| T-76-03-05 | R (Repudiation) | coordinator_runs marked completed when Kanban row created | accept | Audit trail: coordinator_runs row + Kanban row + result.coordinator_run_id provide full traceability |
</threat_model>

<verification>
- Single-shot path: when intent.handler_status='placeholder', Kanban INSERT fires, no inngest.send → unit test green.
- Single-shot path: when intent.handler_status='registered' (default), inngest.send fires → existing test stays green (regression guard).
- Orchestrator branch: when gate returns kind:'orchestrator', Kanban INSERT fires, NO orchestrator dispatch event → unit test green.
- W2 field-name gate: caller reads `decision.reason` (the verified union field); zero matches on guessed fields like `decision.gate_reason` / `decision.cause`.
- escalation-gate.ts: pure-function tests green (no behavioral change).
- coordinator-orchestrator.ts: TS compiles; defensive check present.
- `cd web && npx vitest run` (full suite) passes.
</verification>

<success_criteria>
- All `Phase 76: no_handler` and `Phase 76: low_confidence` test cases in `debtor-email-coordinator.test.ts` GREEN.
- Pre-existing single-shot dispatch test green (no regression).
- escalation-gate test file untouched and still green.
- `grep -c "debtor-email/orchestrator.requested" web/lib/inngest/functions/debtor-email-coordinator.ts` returns 0.
- W2: `decision.reason` is the only orchestrator-decision field accessed in the caller.
- TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/phases/76-stage-3-kanban-human-lane-wiring/76-03-SUMMARY.md` documenting:
- Diff summary for each of the 3 files (lines added/removed)
- Test results (no_handler GREEN, low_confidence GREEN, escalation-gate untouched)
- Confirmation that `debtor-email/orchestrator.requested` is no longer fired anywhere in the runtime path
- W2 evidence: paste the grep output anchoring `decision.reason` against the orchestrator-decision union in escalation-gate.ts
</output>
