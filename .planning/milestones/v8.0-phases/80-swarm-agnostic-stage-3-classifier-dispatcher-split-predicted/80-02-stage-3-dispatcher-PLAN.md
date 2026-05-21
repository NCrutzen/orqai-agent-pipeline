---
phase: 80
plan: 02
type: execute
wave: 1
depends_on: ["80-01"]
files_modified:
  - web/lib/automations/debtor-email/coordinator/escalation-gate.ts
  - web/lib/inngest/functions/stage-3-dispatcher.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "evaluateEscalationGate parameter type is SwarmIntentRow[] (registry-correct lookup, hard-separation rule honored)"
    - "Stage 3.5 dispatcher Inngest function exists and subscribes to wildcard '*/predicted'"
    - "Dispatcher routes 'placeholder' handler_status to Kanban + 'routed_human_queue' atomically in one step.run"
    - "Dispatcher routes 'registered' handler_status by emitting swarm_intents.handler_event (does NOT flip agent_runs.status)"
    - "Dispatcher reads swarm_type from event payload + event.name; zero hardcoded swarm names"
    - "Duplicate '*/predicted' events for the same agent_run_id are no-ops — placeholder branch via agent_runs.status precondition; registered branch via coordinator_runs.completed_at precondition"
    - "All dispatcher tests in 80-01 turn GREEN"
  artifacts:
    - path: "web/lib/automations/debtor-email/coordinator/escalation-gate.ts"
      provides: "Pure escalation gate (parameter type swapped to SwarmIntentRow[])"
      contains: "SwarmIntentRow"
    - path: "web/lib/inngest/functions/stage-3-dispatcher.ts"
      provides: "Cross-swarm Stage 3.5 dispatcher Inngest function"
      contains: "stage3Dispatcher"
      min_lines: 120
  key_links:
    - from: "stage-3-dispatcher.ts"
      to: "swarm_intents registry"
      via: "loadSwarmIntents(admin, swarm_type)"
      pattern: "loadSwarmIntents"
    - from: "stage-3-dispatcher.ts"
      to: "Inngest event bus"
      via: "wildcard trigger '*/predicted' + (inngest.send as unknown as SendFn)"
      pattern: "\\*/predicted"
    - from: "stage-3-dispatcher.ts (placeholder branch)"
      to: "agent_runs status precondition"
      via: ".select('status').eq('id', agent_run_id).single() inside step.run"
      pattern: "status.*predicted"
    - from: "stage-3-dispatcher.ts (registered branch)"
      to: "coordinator_runs.completed_at precondition"
      via: ".select('completed_at').eq('run_id', run_id).single() inside step.run"
      pattern: "completed_at"
    - from: "escalation-gate.ts"
      to: "swarm_intents.requires_orchestration"
      via: "intents.find((i) => i.intent_key === r.intent)?.requires_orchestration"
      pattern: "intent_key"
---

<objective>
Build the new swarm-agnostic Stage 3.5 dispatcher and fix the escalation-gate hard-separation bug. This plan turns the Wave 0 dispatcher tests GREEN.

**Task ordering rationale (revised):** The escalation-gate parameter swap MUST land before the dispatcher implementation, because the dispatcher imports `evaluateEscalationGate` and passes `SwarmIntentRow[]` to it. If the dispatcher shipped first, its `tsc --noEmit` acceptance criterion would fail (caller passes `SwarmIntentRow[]` but signature still expects `SwarmNoiseCategoryRow[]`). Reordering puts the type swap in Task 1 and the dispatcher in Task 2 — both compile in isolation.

Purpose: Per CONTEXT.md `<decisions>` and RESEARCH §"Architecture Recommendation", the dispatcher is the new home for routing logic. It subscribes to `*/predicted` via Inngest's wildcard trigger, looks up `swarm_intents.handler_status`, and routes atomically. The escalation-gate parameter swap (`SwarmNoiseCategoryRow[]` → `SwarmIntentRow[]`) fixes a silently-dead path flagged by RESEARCH §"Pitfall 1" — `requires_orchestration` lives on `swarm_intents` per migration `20260504b:94`, not on `swarm_noise_categories`.

Output: One parameter-type swap on a pure helper + one new Inngest function file. No consumer changes yet — the dispatcher is registered and live traffic is switched to it in Wave 2.
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
@web/lib/inngest/functions/coordinator-orchestrator.ts
@web/lib/inngest/functions/debtor-email-coordinator.ts
@web/lib/automations/debtor-email/coordinator/escalation-gate.ts
@web/lib/swarms/registry.ts
@web/lib/automations/runs/emit.ts
@CLAUDE.md

<interfaces>
<!-- From web/lib/swarms/registry.ts:78-89 (loadSwarmIntents helper) -->
export function loadSwarmIntents(admin: SupabaseClient, swarm_type: string): Promise<SwarmIntentRow[]>;

<!-- SwarmIntentRow shape (verified populated for debtor-email per migration 20260507) -->
type SwarmIntentRow = {
  swarm_type: string;
  intent_key: string;
  handler_agent_key: string | null;
  handler_event: string;
  handler_status: "registered" | "placeholder";
  requires_orchestration: boolean;
  created_at: string;
  updated_at: string;
};

<!-- From CLAUDE.md / Phase 65 commit dae6276 — MANDATORY pattern -->
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
// Always inline-call: await (inngest.send as unknown as SendFn)({...})
// NEVER alias: const send = inngest.send

<!-- Wildcard trigger cast pattern from coordinator-orchestrator.ts:36 -->
{ event: "*/predicted" } as unknown as { event: keyof import("@/lib/inngest/events").Events }

<!-- Existing escalation-gate.ts signature (lines 24-27) — TO BE CHANGED in Task 1 -->
export function evaluateEscalationGate(
  output: IntentAgentOutputV2,
  categories: SwarmNoiseCategoryRow[],   // ← swap to SwarmIntentRow[]
): EscalationDecision;

<!-- Phase 76 Kanban row shape (from debtor-email-coordinator.ts:265-301) — to copy verbatim -->
{
  automation: `${swarm_type}-kanban`,
  swarm_type,
  status: "pending",
  topic: intent_key,
  entity,
  result: {
    kanban_reason: "no_handler",
    intent: intent_key,
    confidence,
    email_id,
    automation_run_id: automation_run_id ?? null,
    coordinator_run_id: run_id,
  },
  triggered_by: "stage-3-no-handler",
}
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Swap escalation-gate parameter type to SwarmIntentRow[] (registry-bug fix)</name>
  <read_first>
    - web/lib/automations/debtor-email/coordinator/escalation-gate.ts (full, ~52 lines)
    - 80-RESEARCH.md §"Pitfall 1" — exact bug description
    - 80-PATTERNS.md §"escalation-gate.ts" — old vs new code excerpts
    - web/lib/swarms/types.ts (or wherever SwarmIntentRow is defined) — verify the type exists with `intent_key` and `requires_orchestration`
    - 80-CONTEXT.md §"Resolved After Research" — confirms this fix is IN scope
  </read_first>
  <files>web/lib/automations/debtor-email/coordinator/escalation-gate.ts</files>
  <action>
    Edit web/lib/automations/debtor-email/coordinator/escalation-gate.ts:

    1. Replace the import `SwarmNoiseCategoryRow` with `SwarmIntentRow` (from `@/lib/swarms/types` — verify the type name during read-first; if it's exported from `web/lib/swarms/registry.ts` instead, import from there).

    2. Update the function signature:
       ```ts
       // OLD:
       // export function evaluateEscalationGate(output: IntentAgentOutputV2, categories: SwarmNoiseCategoryRow[]): EscalationDecision
       // NEW:
       export function evaluateEscalationGate(output: IntentAgentOutputV2, intents: SwarmIntentRow[]): EscalationDecision
       ```

    3. Update the lookup at lines ~41-45:
       ```ts
       // OLD:
       // const flagged = output.ranked.some(
       //   (r) => categories.find((c) => c.category_key === r.intent)?.requires_orchestration === true,
       // );
       // NEW (intent_key on swarm_intents per migration 20260504b:94):
       const flagged = output.ranked.some(
         (r) => intents.find((i) => i.intent_key === r.intent)?.requires_orchestration === true,
       );
       ```

    4. Update any local variable named `categories` to `intents` for consistency. Update inline comments referencing noise-categories. Function body remains pure (Phase 76 D-09 invariant preserved — only the input source changes).

    5. The existing caller in `debtor-email-coordinator.ts` will be REMOVED in plan 80-03 Wave 2; until then, that caller passes `SwarmNoiseCategoryRow[]` and will produce a tsc error. To keep tsc green between Wave 1 and Wave 2:

       - Verify the existing caller pattern in debtor-email-coordinator.ts. If the call site loads from `loadSwarmNoiseCategories` and the variable is typed `SwarmNoiseCategoryRow[]`, the tsc error will surface immediately after this task lands.
       - If a transient tsc error in `debtor-email-coordinator.ts` is unacceptable, ALSO swap that caller's load to `loadSwarmIntents(admin, swarm_type)` here in Task 1 (one extra line) so tsc stays green between waves. This is a minimal preview of the Wave 2 refactor and does not violate the "no live traffic switch until Wave 2" rule (the dispatcher is still unregistered in route.ts).
       - Document in the SUMMARY whether the caller-side swap was applied here or deferred to Wave 2.

    6. Run grep across the codebase: `grep -rn "evaluateEscalationGate" web/lib web/app --include="*.ts"` — every hit must compile against the new signature after this task.
  </action>
  <verify>
    <automated>cd web && npx tsc --noEmit 2>&1 | grep -E "(escalation-gate|evaluateEscalationGate)" | head -10 ; grep -c "SwarmIntentRow" lib/automations/debtor-email/coordinator/escalation-gate.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "SwarmIntentRow" web/lib/automations/debtor-email/coordinator/escalation-gate.ts` returns >= 2 (import + parameter)
    - `grep -c "SwarmNoiseCategoryRow" web/lib/automations/debtor-email/coordinator/escalation-gate.ts` returns 0
    - `grep -c "intent_key === r.intent" web/lib/automations/debtor-email/coordinator/escalation-gate.ts` returns 1
    - `grep -c "category_key === r.intent" web/lib/automations/debtor-email/coordinator/escalation-gate.ts` returns 0
    - `cd web && npx tsc --noEmit 2>&1 | grep "escalation-gate.ts"` returns no errors
    - `grep -rn "evaluateEscalationGate(" web/lib web/app --include="*.ts"` shows callers all pass `SwarmIntentRow[]` (or the transient caller swap noted above is in place)
  </acceptance_criteria>
  <done>escalation-gate.ts parameter is SwarmIntentRow[]; lookup uses intent_key; tsc clean for escalation-gate.ts itself; callers documented.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement stage-3-dispatcher.ts (cross-swarm wildcard subscriber)</name>
  <read_first>
    - web/lib/inngest/functions/coordinator-orchestrator.ts lines 29-37 (function shell + trigger cast) and lines 142-181 (catch/error block + emitAutomationRunStale usage) — narrow read; do not load full file
    - web/lib/inngest/functions/debtor-email-coordinator.ts lines 241-393 — semantics being extracted (Phase 76 Kanban + dispatch-single-shot)
    - 80-PATTERNS.md §"web/lib/inngest/functions/stage-3-dispatcher.ts (NEW)" — full step-by-step shape with code excerpts
    - 80-RESEARCH.md §"Replay safety (Q2)" — atomic single step.run rationale
    - 80-RESEARCH.md §"Architecture Recommendation" — wildcard trigger, escalation-gate placement decision
    - web/lib/automations/runs/emit.ts — emitAutomationRunStale signature
    - web/lib/automations/debtor-email/coordinator/escalation-gate.ts (post-Task-1) — confirm parameter type is now `SwarmIntentRow[]` so this task's import compiles
  </read_first>
  <files>web/lib/inngest/functions/stage-3-dispatcher.ts</files>
  <action>
    Create web/lib/inngest/functions/stage-3-dispatcher.ts. Structure (per PATTERNS.md):

    **Idempotency-precondition asymmetry (read first — critical):**
    The two routing branches use DIFFERENT idempotency sentinels because they touch different fields:
    - **Placeholder branch** flips `agent_runs.status` from `predicted` → `routed_human_queue` itself. So its idempotency precondition reads `agent_runs.status` — on replay, the second pass sees status≠'predicted' and short-circuits.
    - **Registered branch** does NOT flip `agent_runs.status` (handler owns subsequent transitions per CONTEXT.md locked decisions §"Handler-owned statuses"). So `agent_runs.status` cannot be the sentinel — on replay the status is still `predicted`, the precondition would still pass, and `inngest.send(handler_event)` would re-fire → duplicate handler trigger. Instead, the registered branch uses `coordinator_runs.completed_at`: the dispatcher DOES set `completed_at` inside the same `step.run`, so replays after the first successful execution see `completed_at IS NOT NULL` and short-circuit.

    1. Imports (top of file):
       - `import { inngest } from "@/lib/inngest/client";`
       - `import { createAdminClient } from "@/lib/supabase/admin";`
       - `import { emitAutomationRunStale } from "@/lib/automations/runs/emit";`
       - `import { loadSwarmIntents } from "@/lib/swarms/registry";`
       - `import { evaluateEscalationGate } from "@/lib/automations/debtor-email/coordinator/escalation-gate";`
       - Type imports: `SwarmIntentRow` from `@/lib/swarms/types` (verify the type name; if absent, use whatever loadSwarmIntents returns).

    2. Module-level types:
       ```ts
       type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
       ```

    3. Function shell (copy from coordinator-orchestrator.ts:29-37, drop entity-key concurrency per RESEARCH §"Concurrency keys"):
       ```ts
       export const stage3Dispatcher = inngest.createFunction(
         {
           id: "automations/stage-3-dispatcher",
           name: "Stage 3.5 Dispatcher (cross-swarm)",
           retries: 0,
           concurrency: [{ key: "event.data.run_id", limit: 1 }],
         },
         { event: "*/predicted" } as unknown as { event: keyof import("@/lib/inngest/events").Events },
         async ({ event, step }) => { /* body */ },
       );
       ```

    4. Body — extract typed payload:
       ```ts
       const data = event.data as {
         swarm_type: string;
         run_id: string;
         agent_run_id: string;
         email_id: string;
         automation_run_id: string | null;
         budget_run_id: string | null;
         ranked: Array<{ intent: string; confidence: string }>;
         language?: string;
         urgency?: string;
         entity?: unknown;
       };
       const swarm_type = data.swarm_type ?? (event.name as string).split("/")[0];
       const { run_id, agent_run_id, email_id, automation_run_id, budget_run_id, ranked, entity } = data;
       const top = ranked[0];
       if (!top) throw new Error(`stage-3-dispatcher: empty ranked[] for run_id=${run_id}`);
       const intent_key = top.intent;
       const confidence = top.confidence;
       const admin = createAdminClient();
       ```

    5. Try/catch around the routing block. Inside try:

       a. Load intents + apply escalation gate (note: escalation-gate signature is already `SwarmIntentRow[]` post-Task-1):
          ```ts
          const intents = await step.run("load-intents", async () => loadSwarmIntents(admin, swarm_type));
          const intentRow = intents.find((i) => i.intent_key === intent_key) ?? null;
          if (!intentRow) {
            throw new Error(`stage-3-dispatcher: no swarm_intents row for (${swarm_type}, ${intent_key})`);
          }
          const decision = evaluateEscalationGate(
            { ranked, language: data.language ?? "", urgency: data.urgency ?? "" } as never,
            intents,
          );
          ```

       b. Reserved-future-hook for orchestrator fan-out (per CONTEXT decision + RESEARCH §"Pitfall 6"). DO NOT activate; document only:
          ```ts
          // Reserved: Stage 3.5 orchestrator-worker fan-out (Phase 76 D-07 deferred).
          // When re-enabling, branch here on `decision.kind === "orchestrator"` BEFORE the
          // placeholder/registered split. Current behavior collapses both decisions to dispatch.
          // if (false /* TODO: re-enable orchestrator fan-out */) { ... }
          void decision; // suppress unused-var lint
          ```

       c. Placeholder branch (single atomic step.run per RESEARCH §"Replay safety (Q2)").
          Idempotency sentinel = `agent_runs.status` (this branch flips it, so it's the natural marker):
          ```ts
          if (intentRow.handler_status === "placeholder") {
            await step.run("dispatch-placeholder", async () => {
              // Idempotency: placeholder branch flips agent_runs.status → use it as the sentinel.
              const { data: row } = await admin
                .from("agent_runs").select("status").eq("id", agent_run_id).single();
              if (row?.status !== "predicted") return; // idempotency: already routed

              const { error } = await admin.from("automation_runs").insert({
                automation: `${swarm_type}-kanban`,
                swarm_type,
                status: "pending",
                topic: intent_key,
                entity,
                result: {
                  kanban_reason: "no_handler",
                  intent: intent_key,
                  confidence,
                  email_id,
                  automation_run_id: automation_run_id ?? null,
                  coordinator_run_id: run_id,
                },
                triggered_by: "stage-3-no-handler",
              });
              if (error) throw new Error(`kanban-no-handler insert: ${error.message}`);

              await admin.from("agent_runs")
                .update({ status: "routed_human_queue" })
                .eq("id", agent_run_id)
                .eq("status", "predicted"); // race guard

              await admin.from("coordinator_runs")
                .update({ completed_at: new Date().toISOString(), completed_handlers: 0 })
                .eq("run_id", run_id);

              await emitAutomationRunStale(admin, `${swarm_type}-kanban`);
            });
            return { kind: "placeholder", swarm_type, agent_run_id };
          }
          ```

       d. Registered branch.
          Idempotency sentinel = `coordinator_runs.completed_at`. The dispatcher does NOT flip
          `agent_runs.status` here (handler owns subsequent transitions), so on replay the status
          would still be `predicted` and a status-based precondition would pass twice → duplicate
          `inngest.send(handler_event)`. Querying `coordinator_runs.completed_at` instead works
          because this same `step.run` sets `completed_at`, so replays after the first success
          see it populated and short-circuit BEFORE re-firing the handler:
          ```ts
          await step.run("dispatch-registered", async () => {
            // Idempotency: registered branch does NOT flip agent_runs.status (handler owns it).
            // Use coordinator_runs.completed_at as the sentinel — this step.run sets it, so
            // replays after first success see it populated and skip the handler re-fire.
            const { data: coordRow } = await admin
              .from("coordinator_runs")
              .select("completed_at")
              .eq("run_id", run_id)
              .single();
            if (coordRow?.completed_at) return; // idempotency: already dispatched

            await (inngest.send as unknown as SendFn)({
              name: intentRow.handler_event,
              data: {
                run_id,
                agent_run_id,
                email_id,
                automation_run_id,
                budget_run_id,
                intent: intent_key,
                ranked,
                swarm_type,
              },
            });

            await admin.from("coordinator_runs")
              .update({ completed_at: new Date().toISOString(), completed_handlers: 1 })
              .eq("run_id", run_id);
          });
          // NOTE: do NOT flip agent_runs.status — handler owns subsequent transitions
          // (per CONTEXT.md locked decisions §"Handler-owned statuses").
          return { kind: "registered", swarm_type, agent_run_id, handler_event: intentRow.handler_event };
          ```

    6. Catch block (copy from coordinator-orchestrator.ts:161-181, swap orchestrator-specific naming):
       ```ts
       } catch (err) {
         const msg = err instanceof Error ? err.message : String(err);
         await step.run("mark-failed", async () => {
           if (automation_run_id) {
             await admin.from("automation_runs").update({
               status: "failed",
               error_message: msg,
               completed_at: new Date().toISOString(),
             }).eq("id", automation_run_id);
           }
           await admin.from("coordinator_runs")
             .update({ completed_at: new Date().toISOString() })
             .eq("run_id", run_id);
           await emitAutomationRunStale(admin, `${swarm_type}-review`);
         });
         throw err;
       }
       ```

    NOTE: do NOT register the function in `web/app/api/inngest/route.ts` — that's Wave 2's job (paired with the classifier refactor that emits the event, so live traffic flips atomically).
  </action>
  <verify>
    <automated>cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts 2>&1 | tail -40 ; npx tsc --noEmit 2>&1 | grep "stage-3-dispatcher" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - File web/lib/inngest/functions/stage-3-dispatcher.ts exists with >=120 lines
    - `grep -c "stage3Dispatcher" web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - `grep -cE '"\\*/predicted"' web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - `grep -c "loadSwarmIntents" web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - `grep -c "dispatch-placeholder" web/lib/inngest/functions/stage-3-dispatcher.ts` returns 1
    - `grep -c "dispatch-registered" web/lib/inngest/functions/stage-3-dispatcher.ts` returns 1
    - `grep -c "routed_human_queue" web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - `grep -cE "kanban_reason.*no_handler" web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - **Placeholder branch idempotency:** `grep -c 'row?.status !== "predicted"' web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1 (placeholder branch only — registered branch uses a different sentinel)
    - **Registered branch idempotency:** `grep -cE 'coordinator_runs[^\n]*completed_at|completed_at[^\n]*coordinator_runs' web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1 — i.e. there is a SELECT on `coordinator_runs` reading `completed_at` BEFORE the `inngest.send` call. Stronger check: `grep -B2 'inngest.send' web/lib/inngest/functions/stage-3-dispatcher.ts | grep -c "coordinator_runs"` returns >= 1 confirming the precondition sits above the send.
    - `grep -c 'coordRow?.completed_at' web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1 (early-return guard on the registered branch)
    - `grep -c "SWARM_TYPE\\s*=" web/lib/inngest/functions/stage-3-dispatcher.ts` returns 0 (zero hardcoded swarm names)
    - `grep -c "as unknown as SendFn\\|inngest.send" web/lib/inngest/functions/stage-3-dispatcher.ts` returns >= 1
    - `cd web && npx tsc --noEmit 2>&1 | grep "stage-3-dispatcher"` returns no errors (escalation-gate signature already swapped in Task 1, so this file compiles cleanly)
    - vitest dispatcher tests for placeholder + registered + wildcard + idempotency + replay are GREEN. Note specifically: the registered-branch replay test in 80-01 must verify that on a second invocation with `coordinator_runs.completed_at` already set, `inngest.send` is NOT called a second time.
  </acceptance_criteria>
  <done>Dispatcher file compiles; routing logic + asymmetric idempotency preconditions (placeholder via agent_runs.status, registered via coordinator_runs.completed_at) + atomic step.run for placeholder branch all present; Wave 0 dispatcher tests GREEN including registered-branch replay no-double-send.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

- **Inngest event bus → dispatcher**: untrusted-shape event payload (any swarm could emit `*/predicted`). Mitigated by structural typing and `loadSwarmIntents` failing closed if the (swarm_type, intent_key) tuple is absent.
- **dispatcher → Supabase**: service-role writes; same boundary as existing coordinator. No new boundary.

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-80-02 | Spoofing | Wildcard `*/predicted` event | accept | Inngest events originate inside our own VPC/serverless; no external publishers. Dispatcher fails closed if `swarm_intents` lookup misses. |
| T-80-03 | Tampering | Duplicate `*/predicted` event causing double-Kanban-write or double-handler-trigger on replay | mitigate | Asymmetric idempotency preconditions inside each `step.run`: placeholder branch uses `agent_runs.status !== 'predicted'` (it flips that field), registered branch uses `coordinator_runs.completed_at IS NOT NULL` (it does NOT flip agent_runs.status, so status-based sentinel would re-fire on replay). Atomic single-step.run for placeholder branch (per RESEARCH §Replay safety). |
| T-80-04 | Elevation of Privilege | escalation-gate registry-source bug allowing wrong escalation flag | mitigate | Task 1 swap to `SwarmIntentRow[]` so `requires_orchestration` is read from the correct registry table per hard-separation rule |
</threat_model>

<verification>
- `cd web && npx vitest run lib/inngest/functions/__tests__/stage-3-dispatcher.test.ts` — all 5 dispatcher tests GREEN.
- `cd web && npx tsc --noEmit` — full project type-check clean (modulo unrelated pre-existing errors).
- `grep -rn "evaluateEscalationGate(" web/lib web/app --include="*.ts"` — every caller compatible with `SwarmIntentRow[]`.
- Dispatcher NOT yet registered in route.ts (intentional; Wave 2 wires it in).
</verification>

<success_criteria>
- escalation-gate parameter swap complete; all callers updated; no `SwarmNoiseCategoryRow` reference remains in escalation-gate.ts.
- Dispatcher file present, compiles, passes its 5 unit tests (placeholder, registered, wildcard cross-swarm, idempotency, replay).
- No production behavior change yet (dispatcher is unregistered — live traffic still hits monolithic coordinator until Wave 2).
</success_criteria>

<output>
After completion, create `.planning/phases/80-swarm-agnostic-stage-3-classifier-dispatcher-split-predicted/80-02-SUMMARY.md` with: escalation-gate diff summary, dispatcher file structure, vitest GREEN output for dispatcher tests, lines added/removed, note on whether transient caller-side swap was applied here vs deferred to Wave 2.
</output>
