/**
 * Phase 71-02 D-12 — Operator override fan-out function.
 *
 * Listens for `debtor-email/override.submitted` (emitted by the override
 * route) and: (1) emits one pipeline_events row per override (D-02),
 * (2) executes per-axis side effects (D-04..D-07).
 *
 * Replay safety (CLAUDE.md §Inngest, Phase 65 dae6276 + dd2583a):
 *   - submitted_at is generated INSIDE step.run.
 *   - inngest.send is invoked through a SendFn cast — never destructured.
 *
 * retries: 0 — operator overrides are explicit user actions; auto-retry
 * would compound side effects (verdict re-dispatch, coordinator replay).
 * On failure the row will not appear in pipeline_events; UI surfaces the
 * 500 from the route's caller.
 */
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { loadSwarmIntents } from "@/lib/swarms/registry";
import type { OverrideAxis, OverrideJson, StageValue } from "@/lib/pipeline-events/types";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

function stageFromAxis(axis: OverrideAxis): StageValue {
  switch (axis) {
    case "stage_1_category":
      return 1;
    case "stage_2_customer":
      return 2;
    case "stage_3_intent":
      return 3;
    case "stage_4_handler_output":
      return 4;
  }
}

export const debtorEmailOverrideHandler = inngest.createFunction(
  { id: "debtor-email/override-handler", retries: 0 },
  // The event name is registered by the override route at runtime; not yet in
  // the Events typed map, so cast through unknown to satisfy createFunction's
  // generic parameter without widening the events.ts contract from this plan.
  { event: "debtor-email/override.submitted" } as unknown as Parameters<
    typeof inngest.createFunction
  >[1],
  async ({ event, step }) => {
    const data = event.data as unknown as {
      axis: OverrideAxis;
      email_id: string;
      original_event_id: string;
      original_decision: string;
      decision: string;
      decision_details?: Record<string, unknown>;
      eval_type: "capability" | "regression";
      reason?: string;
      operator_id: string;
      re_run_downstream?: boolean;
    };

    const {
      axis,
      email_id,
      original_event_id,
      original_decision,
      decision,
      decision_details,
      eval_type,
      reason,
      operator_id,
      re_run_downstream,
    } = data;

    const admin = createAdminClient();
    const stage = stageFromAxis(axis);

    // STEP 1: emit override row (D-02). submitted_at MUST be inside step.run
    // (Pitfall 2 — Phase 65 dae6276 replay-id rule).
    await step.run(`axis-${stage}-emit`, async () => {
      const submitted_at = new Date().toISOString();
      const override: OverrideJson = {
        axis,
        original_decision,
        original_event_id,
        operator_id,
        reason: reason ?? null,
        submitted_at,
      };
      await emitPipelineEvent(admin, {
        swarm_type: "debtor-email",
        stage,
        email_id,
        decision,
        confidence: null,
        override,
        eval_type,
        decision_details: decision_details ?? null,
        triggered_by: "operator-override",
      });
    });

    // STEP 2: per-axis side effect.
    switch (axis) {
      case "stage_1_category": {
        // D-04: re-dispatch existing classifier/verdict.recorded so the
        // verdict-worker performs the reroute (categorize/archive/swarm_dispatch).
        // The triggered_by=operator-override marker lets downstream observe
        // that this dispatch chain originated from an override.
        await step.run("axis-1-redispatch-verdict", async () => {
          await (inngest.send as unknown as SendFn)({
            name: "classifier/verdict.recorded",
            data: {
              email_id,
              decision: "approve",
              new_category_key: decision,
              triggered_by: "operator-override",
              operator_id,
            },
          });
        });
        break;
      }
      case "stage_2_customer": {
        // D-05: update coordinator_runs.customer_account_id; conditionally
        // re-emit downstream when re_run_downstream=true.
        await step.run("axis-2-update-coordinator", async () => {
          const new_customer =
            (decision_details as Record<string, unknown> | undefined)?.customer_account_id ??
            decision;
          await admin
            .from("coordinator_runs")
            .update({ customer_account_id: new_customer })
            .eq("email_id", email_id);
        });
        if (re_run_downstream === true) {
          await step.run("axis-2-replay-stage-3-4", async () => {
            await (inngest.send as unknown as SendFn)({
              name: "debtor-email/coordinator-complete",
              data: { email_id, triggered_by: "operator-override-replay" },
            });
          });
        }
        break;
      }
      case "stage_3_intent": {
        // D-06: dispatch new handler event from swarm_intents registry.
        await step.run("axis-3-dispatch-handler", async () => {
          const intents = await loadSwarmIntents(admin, "debtor-email");
          const desired_intent_key =
            (decision_details as Record<string, unknown> | undefined)?.intent_key ?? decision;
          const intent = intents.find((r) => r.intent_key === desired_intent_key);
          if (!intent) {
            throw new Error(
              `unknown intent_key for axis-3 override: ${String(desired_intent_key)}`,
            );
          }
          await (inngest.send as unknown as SendFn)({
            name: intent.handler_event,
            data: { email_id, triggered_by: "operator-override-replay" },
          });
        });
        break;
      }
      case "stage_4_handler_output": {
        // D-07 / D-15: emit-only. NO re-run, NO iController draft mutation.
        break;
      }
      default: {
        const _exhaustive: never = axis;
        throw new Error(`unhandled override axis: ${_exhaustive as string}`);
      }
    }

    return { ok: true, axis };
  },
);
