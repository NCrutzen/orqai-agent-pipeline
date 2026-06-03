// Plan 04-03 Task 4 — Stage 4 duplicate handler.
//
// Function-id LOCKED: `stage-4-support-tickets-duplicate-handler`
// Listens on: `support-tickets/duplicate.requested`
//
// Path A design decision (04-03 Plan interfaces block):
//   For duplicate-handler v1, instead of posting to ClickUp via Zapier, we write
//   the link directly into support_notifications.payload as
//   { kind: 'duplicate_link', clickup_task_id, clickup_task_url }. Phase 5's outbound
//   worker will materialize this as a real ClickUp comment when its webhook runs.
//   This avoids racing the zapier_tools clickup-add-comment provisioning into Plan
//   04-01 and keeps this handler's tool-allowlist clean (HANDLE-07: ZERO Orq/Zapier
//   calls in v1). See 04-03-SUMMARY.md for the deferred-outbound rationale.
//
// ZERO Orq calls (HANDLE-07). Grep test D7 asserts this statically.
//
// Pipeline:
//   1. loadSupportTicket → TicketNotFoundError → write stage_4_duplicate_failed
//   2. quarantineGuardCheck → write stage_4_duplicate_quarantine_blocked
//   3. Load Stage 2 pipeline_events row → missing → stage_4_duplicate_failed
//   4. Extract similar_tickets[]. Empty → stage_4_duplicate_no_similar
//   5. Read similar_tickets[0].source_key. Missing → stage_4_duplicate_failed
//   6. resolveSubmitterLocale
//   7. writeNotification kind='duplicate_link'
//   8. UPDATE support_tickets
//   9. writeStage4Event decision='stage_4_duplicate'
//
// CLAUDE.md guards:
//   - inngest.send.bind(inngest) — NEVER destructure
//   - Date.now()/new Date() inside step.run (replay safety)
//   - NO Orq fetch, NO Zapier client

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSubmitterLocale } from "./i18n";
import {
  TicketNotFoundError,
  loadSupportTicket,
  quarantineGuardCheck,
  writeStage4Event,
  writeNotification,
  buildClickupTaskUrl,
} from "./handler-shared";
import type { Stage4HandlerEvent } from "./stage-4-dispatcher";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HANDLER_NAME = "duplicate-handler";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DuplicateDecision =
  | "stage_4_duplicate"
  | "stage_4_duplicate_no_similar"
  | "stage_4_duplicate_quarantine_blocked"
  | "stage_4_duplicate_failed";

export type DuplicateResult = {
  decision: DuplicateDecision;
};

export interface DuplicateDeps {
  supabase: SupabaseAdmin;
  sendEvent: (payload: { name: string; data: Record<string, unknown> }) => Promise<unknown>;
  now: () => Date;
}

type SimilarTicket = {
  ticket_id?: string;
  source_key?: string | null;
  cosine_distance?: number;
  summary_text?: string;
  resolution_text?: string;
  final_intent?: string;
  final_system?: string;
};

// ---------------------------------------------------------------------------
// Pure runner
// ---------------------------------------------------------------------------

export async function runDuplicateHandler(
  event: Stage4HandlerEvent,
  deps: DuplicateDeps,
): Promise<DuplicateResult> {
  const { supabase, now } = deps;
  const startTime = now().getTime();
  const { support_ticket_id, submission_id } = event;

  const durationMs = () => Math.round(now().getTime() - startTime);

  // (1) Load ticket
  let ticket;
  try {
    ticket = await loadSupportTicket(supabase, support_ticket_id);
  } catch (err) {
    if (err instanceof TicketNotFoundError) {
      await writeStage4Event(supabase, {
        handler_name: HANDLER_NAME,
        decision: "stage_4_duplicate_failed",
        decision_details: { reason: "ticket_not_found" },
        duration_ms: durationMs(),
        cost_cents: 0,
        automation_run_id: support_ticket_id,
        email_id: submission_id,
      });
      return { decision: "stage_4_duplicate_failed" };
    }
    throw err;
  }

  // (2) Quarantine defense-in-depth
  const guard = quarantineGuardCheck(ticket);
  if (guard.blocked) {
    await writeStage4Event(supabase, {
      handler_name: HANDLER_NAME,
      decision: "stage_4_duplicate_quarantine_blocked",
      decision_details: { reason: guard.reason, ...guard.details },
      duration_ms: durationMs(),
      cost_cents: 0,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { decision: "stage_4_duplicate_quarantine_blocked" };
  }

  // (3) Load Stage 2 pipeline_events row (same query as stage-3-coordinator)
  const stage2Res = await supabase
    .from("pipeline_events")
    .select("decision_details")
    .eq("swarm_type", "support-tickets")
    .eq("email_id", ticket.submission_id)
    .in("decision", ["stage_2_enrichment", "stage_2_enrichment_pii_quarantined"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if ((stage2Res as { error?: unknown } | null)?.error) {
    const err = (stage2Res as { error?: { message?: string } }).error;
    throw new Error(`pipeline_events stage2 lookup failed: ${err?.message ?? "unknown"}`);
  }

  const stage2Row = (stage2Res as { data: Record<string, unknown> | null }).data;

  if (!stage2Row) {
    await writeStage4Event(supabase, {
      handler_name: HANDLER_NAME,
      decision: "stage_4_duplicate_failed",
      decision_details: { reason: "stage2_row_missing" },
      duration_ms: durationMs(),
      cost_cents: 0,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { decision: "stage_4_duplicate_failed" };
  }

  // (4) Extract similar_tickets
  const decisionDetails = stage2Row.decision_details as Record<string, unknown>;
  const similarTickets = (decisionDetails?.similar_tickets ?? []) as SimilarTicket[];

  if (!Array.isArray(similarTickets) || similarTickets.length === 0) {
    await supabase
      .from("support_tickets")
      .update({
        handler_executed: "duplicate",
        stage4_completed_at: now().toISOString(),
        stage4_cost_cents: 0,
      })
      .eq("id", ticket.id);
    await writeStage4Event(supabase, {
      handler_name: HANDLER_NAME,
      decision: "stage_4_duplicate_no_similar",
      decision_details: { reason: "similar_tickets_empty" },
      duration_ms: durationMs(),
      cost_cents: 0,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { decision: "stage_4_duplicate_no_similar" };
  }

  // (5) Read similar_tickets[0].source_key
  const similar = similarTickets[0];
  if (!similar.source_key) {
    await writeStage4Event(supabase, {
      handler_name: HANDLER_NAME,
      decision: "stage_4_duplicate_failed",
      decision_details: { reason: "source_key_missing" },
      duration_ms: durationMs(),
      cost_cents: 0,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { decision: "stage_4_duplicate_failed" };
  }

  // (6) Resolve locale
  const resolvedLocale = resolveSubmitterLocale(ticket.submitter_locale);

  // (7) writeNotification kind='duplicate_link'
  // Path A: write notification for Phase 5 outbound to materialize as ClickUp comment.
  // No Zapier call here (see module comment — Path A design decision).
  let notificationId: string | undefined;
  const notif = await writeNotification(supabase, {
    support_ticket_id: ticket.id,
    submission_id: ticket.submission_id,
    kind: "duplicate_link",
    payload: {
      clickup_task_id: similar.source_key,
      clickup_task_url: buildClickupTaskUrl(similar.source_key),
      cosine_distance: similar.cosine_distance,
      summary_text: similar.summary_text,
      submitter_locale: resolvedLocale,
      locale_input: ticket.submitter_locale,
    },
  });
  notificationId = notif.id;

  // (8) UPDATE support_tickets
  await supabase
    .from("support_tickets")
    .update({
      handler_executed: "duplicate",
      outbound_clickup_task_id: similar.source_key,
      stage4_completed_at: now().toISOString(),
      stage4_cost_cents: 0,
    })
    .eq("id", ticket.id);

  // (9) writeStage4Event
  await writeStage4Event(supabase, {
    handler_name: HANDLER_NAME,
    decision: "stage_4_duplicate",
    decision_details: {
      source_key: similar.source_key,
      cosine_distance: similar.cosine_distance,
      similar_ticket_count: similarTickets.length,
      notification_id: notificationId,
      submitter_locale: resolvedLocale,
    },
    duration_ms: durationMs(),
    cost_cents: 0,
    automation_run_id: ticket.id,
    email_id: ticket.submission_id,
  });

  return { decision: "stage_4_duplicate" };
}

// ---------------------------------------------------------------------------
// Inngest wrapper
// ---------------------------------------------------------------------------

/**
 * Inngest function. Function-id LOCKED: `stage-4-support-tickets-duplicate-handler`.
 * NEVER rename — in-flight runs would orphan on rename. retries:3 matches Stage 3.
 *
 * All side effects run inside a single step.run boundary (replay safety — Phase 65 dd2583a).
 * CLAUDE.md guard: inngest.send.bind(inngest) (dae6276).
 */
export const stage4SupportTicketsDuplicateHandler = inngest.createFunction(
  { id: "stage-4-support-tickets-duplicate-handler", retries: 3 },
  { event: "support-tickets/duplicate.requested" },
  async ({ event, step }) => {
    return await step.run("run-duplicate", async () =>
      runDuplicateHandler(event.data as Stage4HandlerEvent, {
        supabase: createAdminClient(),
        // CLAUDE.md: NEVER destructure inngest.send — bind it (Phase 65 dae6276).
        sendEvent: inngest.send.bind(inngest) as DuplicateDeps["sendEvent"],
        now: () => new Date(),
      }),
    );
  },
);
