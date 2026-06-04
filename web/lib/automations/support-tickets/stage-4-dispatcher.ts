// Plan 04-02 Task 2 — Stage 4 Dispatcher Inngest function.
//
// Listens on `support-tickets/stage-4.handler.requested` (emitted by
// Stage 3 Coordinator on happy-path decisions).
//
// Function-id LOCKED: `stage-4-support-tickets-dispatcher` — NEVER rename
// across runs (in-flight runs would orphan on rename).
//
// Pipeline (inside a single step.run boundary for replay safety):
//   (1) Load support_tickets row. Missing → write stage_4_dispatch_failed +
//       return.
//   (2) Quarantine defense-in-depth: if pii_quarantine=true OR
//       quarantine_state non-null → write stage_4_dispatcher_quarantine_blocked
//       and return WITHOUT fanout (Stage 3 already checks but defense-in-depth
//       re-check is required per T-04-02-06).
//   (3) Load swarm_intents row for (swarm_type='support-tickets',
//       intent_key=event.chosen_intent). Missing → stage_4_dispatch_intent_not_in_registry.
//   (4) handler_status='placeholder' (or anything other than 'registered') →
//       write stage_4_dispatch_kanban_fallback, NO fanout.
//   (5) handler_status='registered' → sendEvent with handler_event FROM DB
//       (registry is source of truth — Test 7 contract). NO pipeline_events
//       row written by dispatcher on fanout path; the handler owns stage=4 row.
//   (6) sendEvent throws → PROPAGATE so Inngest retries the whole step.
//       Rationale: fanout IS the dispatcher's primary job, unlike Stage 3
//       where the aggregate row was the primary output and the Stage 4 emit
//       was wrapped non-fatal (see 03-03 SUMMARY). If we swallow here the
//       ticket would be silently dropped with no handler invoked.
//
// CLAUDE.md guards observed:
//   - inngest.send.bind(inngest) — NEVER destructure (Phase 65 leer dae6276).
//   - Date.now()/new Date() generated INSIDE step.run by the wrapper (replay
//     safety — Phase 65 leer dd2583a).
//   - NO direct OpenAI/Anthropic/ClickUp SDK (not applicable — dispatcher
//     is a pure routing function).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupportTicketIntent } from "./coordinator-types";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

const TRIGGERED_BY = "support-tickets:stage-4-dispatcher";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type Stage4DispatchDecision =
  | "stage_4_dispatch_fanout" // used in return value ONLY — dispatcher writes NO row on fanout
  | "stage_4_dispatch_kanban_fallback"
  | "stage_4_dispatcher_quarantine_blocked"
  | "stage_4_dispatch_intent_not_in_registry"
  | "stage_4_dispatch_failed";

export type Stage4HandlerEvent = {
  support_ticket_id: string;
  submission_id: string;
  chosen_intent: SupportTicketIntent;
  completeness_verdict: "complete" | "incomplete";
};

export type Stage4DispatchResult =
  | {
      ok: true;
      decision: Stage4DispatchDecision;
      fanout_event?: string; // present only when decision='stage_4_dispatch_fanout'
    }
  | {
      ok: false;
      decision: "stage_4_dispatch_failed";
      reason: string;
    };

export interface Stage4DispatchDeps {
  supabase: SupabaseAdmin;
  sendEvent: (payload: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
  now: () => Date;
  /** Testing escape-hatch: override registry-enabled check. Not used in production. */
  registryEnabledOverride?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function writeStage4DispatchEvent(
  supabase: SupabaseAdmin,
  args: {
    decision: Exclude<Stage4DispatchDecision, "stage_4_dispatch_fanout">;
    decision_details: Record<string, unknown>;
    automation_run_id: string;
    email_id: string;
  },
): Promise<void> {
  const row: Record<string, unknown> = {
    swarm_type: "support-tickets",
    stage: 4,
    decision: args.decision,
    decision_details: args.decision_details,
    triggered_by: TRIGGERED_BY,
    automation_run_id: args.automation_run_id,
    email_id: args.email_id,
  };
  const res = await supabase.from("pipeline_events").insert(row);
  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `pipeline_events insert (decision=${args.decision}) failed: ${err?.message ?? "unknown"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Pure runner — testable without an Inngest runtime
// ---------------------------------------------------------------------------

/**
 * Pure orchestrator. The Inngest wrapper below calls this inside a single
 * step.run boundary for replay safety (all DB ops and side effects are
 * memoized on retry by Inngest).
 */
export async function runStage4Dispatcher(
  event: Stage4HandlerEvent,
  deps: Stage4DispatchDeps,
): Promise<Stage4DispatchResult> {
  const { supabase, sendEvent } = deps;

  // (1) Load support_tickets row
  const ticketRes = await supabase
    .from("support_tickets")
    .select("id, submission_id, pii_quarantine, quarantine_state")
    .eq("id", event.support_ticket_id)
    .maybeSingle();
  if ((ticketRes as { error?: unknown } | null)?.error) {
    const err = (ticketRes as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets lookup failed: ${err?.message ?? "unknown"}`,
    );
  }
  const ticket = (ticketRes as { data: Record<string, unknown> | null }).data;

  if (!ticket) {
    await writeStage4DispatchEvent(supabase, {
      decision: "stage_4_dispatch_failed",
      decision_details: { reason: "ticket_not_found" },
      automation_run_id: event.support_ticket_id,
      email_id: event.submission_id,
    });
    return {
      ok: false,
      decision: "stage_4_dispatch_failed",
      reason: "ticket_not_found",
    };
  }

  // (2) Quarantine defense-in-depth (T-04-02-06)
  if (
    ticket.pii_quarantine === true ||
    (ticket.quarantine_state != null && ticket.quarantine_state !== "")
  ) {
    await writeStage4DispatchEvent(supabase, {
      decision: "stage_4_dispatcher_quarantine_blocked",
      decision_details: {
        pii_quarantine: ticket.pii_quarantine === true,
        quarantine_state: ticket.quarantine_state ?? null,
      },
      automation_run_id: ticket.id as string,
      email_id: ticket.submission_id as string,
    });
    return {
      ok: true,
      decision: "stage_4_dispatcher_quarantine_blocked",
    };
  }

  // (3) Load swarm_intents row for this intent
  const intentRes = await supabase
    .from("swarm_intents")
    .select("intent_key, handler_event, handler_status")
    .eq("swarm_type", "support-tickets")
    .eq("intent_key", event.chosen_intent)
    .maybeSingle();
  if ((intentRes as { error?: unknown } | null)?.error) {
    const err = (intentRes as { error?: { message?: string } }).error;
    throw new Error(
      `swarm_intents lookup failed: ${err?.message ?? "unknown"}`,
    );
  }
  const intentRow = (intentRes as { data: Record<string, unknown> | null }).data;

  if (!intentRow) {
    await writeStage4DispatchEvent(supabase, {
      decision: "stage_4_dispatch_intent_not_in_registry",
      decision_details: { intent_key: event.chosen_intent },
      automation_run_id: ticket.id as string,
      email_id: ticket.submission_id as string,
    });
    return {
      ok: true,
      decision: "stage_4_dispatch_intent_not_in_registry",
    };
  }

  // (4) Kanban fallback — handler not yet registered
  if (intentRow.handler_status !== "registered") {
    await writeStage4DispatchEvent(supabase, {
      decision: "stage_4_dispatch_kanban_fallback",
      decision_details: {
        reason: "handler_placeholder",
        intent_key: intentRow.intent_key,
        handler_event: intentRow.handler_event,
        completeness_verdict: event.completeness_verdict,
      },
      automation_run_id: ticket.id as string,
      email_id: ticket.submission_id as string,
    });
    return {
      ok: true,
      decision: "stage_4_dispatch_kanban_fallback",
    };
  }

  // (5) Fanout — handler_status='registered'.
  // Use handler_event FROM DB (registry is source of truth — NOT a hardcoded
  // map). See Test 7: if the DB row has a non-canonical value, dispatcher
  // sends that value. This locks in registry-driven routing (T-04-02-03).
  //
  // sendEvent PROPAGATES on failure (see module comment §6). Inngest will
  // retry the whole step.run. No pipeline_events row is written here —
  // the handler owns its own stage=4 aggregate row (UNIQUE constraint
  // honoured because the two paths are mutually exclusive).
  const handlerEventName = intentRow.handler_event as string;
  await sendEvent({
    name: handlerEventName,
    data: {
      support_ticket_id: event.support_ticket_id,
      submission_id: event.submission_id,
      chosen_intent: event.chosen_intent,
      completeness_verdict: event.completeness_verdict,
    },
  });

  return {
    ok: true,
    decision: "stage_4_dispatch_fanout",
    fanout_event: handlerEventName,
  };
}

// ---------------------------------------------------------------------------
// Inngest wrapper
// ---------------------------------------------------------------------------

/**
 * Inngest function. Function-id LOCKED: `stage-4-support-tickets-dispatcher`.
 * NEVER rename — in-flight runs would orphan on rename. retries: 3 matches
 * Stage 3 precedent.
 *
 * All side effects run inside a single step.run boundary (replay safety).
 * now() is captured via a compute-now step so the timestamp is deterministic
 * across retries (Phase 65 leer dd2583a / replay-safe id generation).
 */
export const stage4SupportTicketsDispatcher = inngest.createFunction(
  { id: "stage-4-support-tickets-dispatcher", retries: 3 },
  { event: "support-tickets/stage-4.handler.requested" },
  async ({ event, step }) => {
    return await step.run("run-dispatch", async () =>
      runStage4Dispatcher(event.data as Stage4HandlerEvent, {
        supabase: createAdminClient(),
        // CLAUDE.md: NEVER destructure inngest.send — bind it (Phase 65 leer dae6276).
        sendEvent: inngest.send.bind(inngest) as Stage4DispatchDeps["sendEvent"],
        now: () => new Date(),
      }),
    );
  },
);
