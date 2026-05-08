// Phase 80 Plan 02 — Stage 3.5 Dispatcher (cross-swarm).
//
// Subscribes to the wildcard `*/predicted` Inngest event emitted by every
// swarm's Stage 3 classifier. Looks up the picked intent in
// `swarm_intents` (registry, hard-separation rule per
// docs/agentic-pipeline/stage-3-coordinator.md) and routes:
//
//   handler_status='registered'  → emit `swarm_intents.handler_event`.
//                                  Stage 4 handler owns subsequent
//                                  agent_runs.status transitions.
//   handler_status='placeholder' → INSERT a Kanban human-lane row
//                                  (automation_runs.status='pending',
//                                  result.kanban_reason='no_handler') and
//                                  flip agent_runs.status to
//                                  'routed_human_queue'.
//
// Asymmetric idempotency preconditions (see THREAT REGISTER T-80-03):
//   placeholder branch: reads agent_runs.status — this branch flips that
//                       field, so on replay status≠'predicted' short-circuits.
//   registered branch:  reads coordinator_runs.completed_at — this branch
//                       does NOT flip agent_runs.status (handler owns it),
//                       so status-based sentinel would re-fire on replay;
//                       this same step.run sets completed_at, so replays
//                       see it populated and skip.
//
// Zero hardcoded swarm names: swarm_type comes from event payload, falling
// back to event.name prefix. Cross-swarm reusable.
//
// Reserved hook: Stage 3.5 orchestrator-worker fan-out (Phase 76 D-07
// deferred). Re-enable by branching on `decision.kind === "orchestrator"`
// BEFORE the placeholder/registered split.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { loadSwarmIntents } from "@/lib/swarms/registry";
import { evaluateEscalationGate } from "@/lib/automations/debtor-email/coordinator/escalation-gate";

// CLAUDE.md / Phase 65 dae6276 — MANDATORY: never alias `inngest.send`.
// Inline-call via this cast each time.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export const stage3Dispatcher = inngest.createFunction(
  {
    id: "automations/stage-3-dispatcher",
    name: "Stage 3.5 Dispatcher (cross-swarm)",
    retries: 0,
    concurrency: [{ key: "event.data.run_id", limit: 1 }],
  },
  // Wildcard trigger — fan-in from every swarm's classifier.
  { event: "*/predicted" } as unknown as {
    event: keyof import("@/lib/inngest/events").Events;
  },
  async ({ event, step }) => {
    const data = (event as unknown as { data: Record<string, unknown> }).data as {
      swarm_type?: string;
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
    // Derive swarm_type from payload; fall back to event-name prefix
    // (`debtor-email/predicted` → `debtor-email`). Never hardcoded.
    const eventName = (event as unknown as { name: string }).name;
    const swarm_type = data.swarm_type ?? eventName.split("/")[0];
    const {
      run_id,
      agent_run_id,
      email_id,
      automation_run_id,
      budget_run_id,
      ranked,
      entity,
    } = data;
    const top = ranked?.[0];
    if (!top) {
      throw new Error(
        `stage-3-dispatcher: empty ranked[] for run_id=${run_id}`,
      );
    }
    const intent_key = top.intent;
    const confidence = top.confidence;
    const admin = createAdminClient();

    try {
      // 1. Load swarm_intents + locate the row for the picked intent.
      const intents = await step.run("load-intents", async () =>
        loadSwarmIntents(admin, swarm_type),
      );
      const intentRow =
        intents.find((i) => i.intent_key === intent_key) ?? null;
      if (!intentRow) {
        throw new Error(
          `stage-3-dispatcher: no swarm_intents row for (${swarm_type}, ${intent_key})`,
        );
      }

      // 2. Apply escalation gate (post-Task-1 reads SwarmIntentRow[]).
      //    Reserved-future-hook: when Stage 3.5 orchestrator fan-out is
      //    re-enabled (Phase 76 D-07), branch here on
      //    `decision.kind === "orchestrator"` BEFORE the placeholder/
      //    registered split. Current behavior collapses both decisions to
      //    dispatch.
      const decision = evaluateEscalationGate(
        {
          ranked,
          language: data.language ?? "",
          urgency: data.urgency ?? "",
        } as never,
        intents,
      );
      void decision; // suppress unused-var lint; reserved for future fan-out

      // 3a. Placeholder branch — single atomic step.run with idempotency
      //     precondition on agent_runs.status (this branch flips it).
      if (intentRow.handler_status === "placeholder") {
        await step.run("dispatch-placeholder", async () => {
          // Idempotency: placeholder branch flips agent_runs.status, so a
          // replay sees status≠'predicted' and short-circuits.
          const { data: row } = await admin
            .from("agent_runs")
            .select("status")
            .eq("id", agent_run_id)
            .single();
          if (row?.status !== "predicted") return; // already routed

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
          if (error) {
            throw new Error(`kanban-no-handler insert: ${error.message}`);
          }

          // Race guard via the .eq('status','predicted') compound match.
          await admin
            .from("agent_runs")
            .update({ status: "routed_human_queue" })
            .eq("id", agent_run_id)
            .eq("status", "predicted");

          await admin
            .from("coordinator_runs")
            .update({
              completed_at: new Date().toISOString(),
              completed_handlers: 0,
            })
            .eq("run_id", run_id);

          await emitAutomationRunStale(admin, `${swarm_type}-kanban`);
        });
        return { kind: "placeholder", swarm_type, agent_run_id };
      }

      // 3b. Registered branch — emit handler_event from registry. Does NOT
      //     flip agent_runs.status (handler owns subsequent transitions per
      //     CONTEXT.md "Handler-owned statuses"). Idempotency sentinel is
      //     coordinator_runs.completed_at (set in this same step.run).
      await step.run("dispatch-registered", async () => {
        // Idempotency: registered branch checks coordinator_runs.completed_at.
        const { data: coordRow } = await admin.from("coordinator_runs").select("completed_at").eq("run_id", run_id).single();
        if (coordRow?.completed_at) return; // already dispatched
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

        await admin
          .from("coordinator_runs")
          .update({
            completed_at: new Date().toISOString(),
            completed_handlers: 1,
          })
          .eq("run_id", run_id);
      });
      // NOTE: do NOT flip agent_runs.status here — handler owns it.
      return {
        kind: "registered",
        swarm_type,
        agent_run_id,
        handler_event: intentRow.handler_event,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        if (automation_run_id) {
          await admin
            .from("automation_runs")
            .update({
              status: "failed",
              error_message: msg,
              completed_at: new Date().toISOString(),
            })
            .eq("id", automation_run_id);
        }
        await admin
          .from("coordinator_runs")
          .update({ completed_at: new Date().toISOString() })
          .eq("run_id", run_id);
        await emitAutomationRunStale(admin, `${swarm_type}-review`);
      });
      throw err;
    }
  },
);
