"use server";

// Phase 76 Plan 05 — Replay Server Action.
//
// D-01 (LOCKED): two-branch behavior.
//   - same-intent (operator picked the coordinator's original top intent):
//       fire the registered handler_event directly. NO axis-3 override row;
//       no override.submitted emit. Path mirrors a normal Stage 3 dispatch.
//   - edited-intent (operator picked a different intent):
//       emit `debtor-email/override.submitted` with `axis:'stage_3_intent'`.
//       The existing override handler (web/lib/inngest/functions/
//       debtor-email-override-handler.ts:184-202) writes the axis-3
//       pipeline_events row and re-emits the new handler_event.
//
// Pipeline architecture lock: this Server Action operates only on Stage 3
// intent dispatch. It NEVER touches swarm_noise_categories (Stage 1).
// Reclassify-as-noise is a separate action with axis-1 emit.
//
// Security gates:
//   - T-76-05-01 (T): chosenIntent validated against swarm_intents registry.
//   - T-76-05-03 (S): swarmType validated against swarms registry.
//   - T-76-05-04 (E/IDOR): compound .eq('id') + .eq('swarm_type') on UPDATE.
//
// inngest.send binding pattern (CLAUDE.md commit dae6276): destructuring
// inngest.send loses `this`. Cast through SendFn and call inline.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadHandlerEvent,
} from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function replayKanbanRow(args: {
  kanbanRowId: string;
  swarmType: string;
  emailId: string;
  originalIntent: string;
  chosenIntent: string;
  // pipeline_events.id of Stage 3 emit; nullable per R-3 (legacy rows or
  // Stage 3 events may not have a row in pipeline_events yet).
  originalEventId: string | null;
  operatorId: string;
}): Promise<
  { ok: true; mode: "same-intent" | "edited-intent" } | { ok: false; error: string }
> {
  if (
    !args.kanbanRowId ||
    !args.swarmType ||
    !args.emailId ||
    !args.chosenIntent ||
    !args.operatorId
  ) {
    return { ok: false, error: "missing args" };
  }
  const admin = createAdminClient();

  // T-76-05-03: validate swarm against registry (rejects spoofed [swarm] segment).
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };

  // T-76-05-01: validate chosenIntent against registry. Rejects injection
  // strings AND typos in one check (registry miss = same error).
  const intents = await loadSwarmIntents(admin, args.swarmType);
  const chosenRow = intents.find((i) => i.intent_key === args.chosenIntent);
  if (!chosenRow) return { ok: false, error: "unknown intent" };

  const sameIntent = args.chosenIntent === args.originalIntent;
  // CLAUDE.md Phase 65: never destructure inngest.send (loses `this`-binding).
  // Cast applied to the call expression itself; preserves binding at each call site.
  const send: SendFn = (event) =>
    (inngest.send as unknown as SendFn)(event);

  if (sameIntent) {
    // D-01 same-intent: bypass override handler; fire handler_event directly.
    const handlerEvent = await loadHandlerEvent(
      admin,
      args.swarmType,
      args.chosenIntent,
    );
    if (!handlerEvent) return { ok: false, error: "no handler_event" };
    await send({
      name: handlerEvent,
      data: {
        email_id: args.emailId,
        swarm_type: args.swarmType,
        triggered_by: "operator-replay-same-intent",
      },
    });
  } else {
    // D-01 edited-intent: axis-3 override; existing handler resolves and dispatches.
    // R-4 known gap: if chosenRow.handler_status === 'placeholder', the
    // override handler will write a no_handler Kanban row when it tries to
    // dispatch. Documented; not blocked here in v1.
    await send({
      name: "debtor-email/override.submitted",
      data: {
        axis: "stage_3_intent",
        email_id: args.emailId,
        original_event_id: args.originalEventId,
        original_decision: args.originalIntent,
        decision: args.chosenIntent,
        decision_details: { intent_key: args.chosenIntent },
        eval_type: "capability",
        operator_id: args.operatorId,
      },
    });
  }

  // Close Kanban row (compound filter for IDOR safety).
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "row not found or already closed" };
  }

  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true, mode: sameIntent ? "same-intent" : "edited-intent" };
}
