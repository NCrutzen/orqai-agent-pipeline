// Phase 65 D-02/D-03 — Stage 3.5 orchestrator-planner Inngest function.
//
// Listens on `debtor-email/orchestrator.requested` (emitted by the
// debtor-email coordinator when the escalation gate fires per CORD-02).
// Calls debtor-orchestrator-agent to expand the ranked-intent list into
// a per-handler execution plan, then fans out N parallel handler events
// (debtor-email/<intent>.requested). Stage 4 handlers fan-in via the
// coordinator_complete_handler RPC (Plan 01 / Plan 65-04 Task 3).
//
// retries: 0 — matches the rest of the debtor-email worker family. Failures
// surface as automation_runs.status='failed'; recovery is operator-driven.
// Pitfall 1 (cost amplification on auto-retry) is structurally avoided.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { orchestratorOutputSchema } from "@/lib/automations/debtor-email/coordinator/orchestrator-types";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { loadSwarmIntents } from "@/lib/swarms/registry";

const ORCHESTRATOR_AGENT_KEY = "debtor-orchestrator-agent";
const SWARM_TYPE = "debtor-email";

// Phase 68 (SWRM-02): handler event names come from swarm_intents registry,
// not from a template literal. Adding a new intent = INSERT into
// swarm_intents only.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export const coordinatorOrchestrator = inngest.createFunction(
  {
    id: "automations/debtor-email-orchestrator",
    retries: 0,
    concurrency: [{ key: "event.data.run_id", limit: 1 }],
  },
  // Cast trigger event name — see SendFn note above.
  { event: "debtor-email/orchestrator.requested" } as unknown as { event: keyof import("@/lib/inngest/events").Events },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const data = (event as unknown as { data: Record<string, unknown> }).data;
    const run_id = data.run_id as string;
    const email_id = data.email_id as string | undefined;
    const automation_run_id = data.automation_run_id as string | undefined;
    const ranked = data.ranked as unknown;
    const language = data.language as string | undefined;
    const urgency = data.urgency as string | undefined;
    const escalation_reason = data.escalation_reason as string | undefined;
    const budget_run_id = data.budget_run_id as string | undefined;

    try {
      // 1. Load coordinator_runs row + assemble planner inputs.
      const planInput = await step.run("load-planner-input", async () => {
        const { data: cr } = await admin
          .from("coordinator_runs")
          .select("*")
          .eq("run_id", run_id)
          .maybeSingle();
        return {
          email_id,
          ranked,
          language,
          urgency,
          escalation_reason,
          automation_run_id,
          coordinator_run: cr,
        };
      });

      // 2. Invoke planner.
      const plan = await step.run("plan", async () => {
        const { raw } = await invokeOrqAgent(ORCHESTRATOR_AGENT_KEY, planInput);
        const validated = orchestratorOutputSchema.safeParse(raw);
        if (!validated.success) {
          throw new Error(
            "debtor-orchestrator-agent output schema mismatch: " +
              JSON.stringify(validated.error.issues),
          );
        }
        return validated.data;
      });

      // 3. Update expected_handlers BEFORE fan-out (RPC race protection: handlers may complete fast).
      await step.run("update-expected-count", async () => {
        await admin
          .from("coordinator_runs")
          .update({ expected_handlers: plan.handlers.length })
          .eq("run_id", run_id);
        await emitAutomationRunStale(admin, "debtor-email-review");
      });

      // 4. Fan-out via inngest.send. Phase 68 (SWRM-02): handler event names
      // resolve through loadSwarmIntents(swarm_intents). Missing intent ⇒
      // structured throw (no fallback per D-12). Phase 76 (R-5/Pitfall 6
      // defensive): when an intent's handler_status is 'placeholder', write
      // a Kanban human-lane row + continue the loop instead of dispatching
      // to a non-existent handler. Today this branch is unreachable (the
      // coordinator no longer fires orchestrator.requested post-Plan 76-03
      // Task 2), but the check keeps future Stage 3.5 re-enablement
      // graceful. Lookups live inside step.run so Inngest memoises across
      // replays.
      for (const h of plan.handlers) {
        const intentRow = await step.run(
          `resolve-intent-${h.intent}`,
          async () => {
            const intents = await loadSwarmIntents(admin, SWARM_TYPE);
            return intents.find((i) => i.intent_key === h.intent) ?? null;
          },
        );
        if (!intentRow) {
          throw new Error(
            `no handler for intent "${h.intent}" in swarm "${SWARM_TYPE}"`,
          );
        }
        if (intentRow.handler_status === "placeholder") {
          // Phase 76 defensive: Kanban row, do NOT throw, do NOT inngest.send.
          await step.run(`kanban-no-handler-${h.intent}`, async () => {
            const { error } = await admin.from("automation_runs").insert({
              automation: `${SWARM_TYPE}-kanban`,
              swarm_type: SWARM_TYPE,
              status: "pending",
              topic: h.intent,
              entity: null,
              result: {
                kanban_reason: "no_handler",
                intent: h.intent,
                email_id,
                automation_run_id: automation_run_id ?? null,
                coordinator_run_id: run_id,
                via: "orchestrator-fanout",
              },
              triggered_by: "stage-3-no-handler-fanout",
            });
            if (error) {
              throw new Error(
                `kanban-no-handler-fanout insert: ${error.message}`,
              );
            }
            await emitAutomationRunStale(admin, `${SWARM_TYPE}-kanban`);
          });
          continue;
        }
        const handler_event = intentRow.handler_event;
        await step.run(`fan-out-${h.intent}`, async () => {
          await (inngest.send as unknown as SendFn)({
            name: handler_event,
            data: {
              run_id,
              email_id,
              automation_run_id,
              intent: h.intent,
              handler_key: h.handler_key,
              context_payload: h.context_payload,
              budget_run_id,
              swarm_type: SWARM_TYPE,
              from_orchestrator: true,
            },
          });
        });
      }

      return { ok: true, run_id, handlers: plan.handlers.length, ordering: plan.ordering };
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
        await emitAutomationRunStale(admin, "debtor-email-review");
      });
      throw err;
    }
  },
);
