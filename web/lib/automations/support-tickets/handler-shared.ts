/**
 * Plan 04-03 Task 2 — Shared Stage 4 handler helpers.
 *
 * Consumed by clarification-handler, duplicate-handler, info-answer-handler
 * (Plan 04-04), and clickup-escalate-handler (Plan 04-05).
 *
 * Exports:
 *   - TicketNotFoundError
 *   - loadSupportTicket
 *   - quarantineGuardCheck
 *   - costCeilingGuard
 *   - writeStage4Event
 *   - writeNotification
 *   - buildClickupTaskUrl
 *   - DEFAULT_COST_CEILING_CENTS
 *   - resolveCostCeilingCents
 */

import { createAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TicketNotFoundError extends Error {
  readonly ticket_id: string;
  constructor(ticket_id: string) {
    super(`support_tickets row not found for id=${ticket_id}`);
    this.name = "TicketNotFoundError";
    this.ticket_id = ticket_id;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HandlerTicket = {
  id: string;
  submission_id: string;
  submitter_id: string | null;
  submitter_locale: string | null;
  transcript: string | null;
  clarification_questions: string[] | null;
  attempt: number;
  pii_quarantine: boolean;
  quarantine_state: string | null;
  stage2_cost_cents: number;
  stage3_cost_cents: number;
  handler_executed: string | null;
};

export type QuarantineGuardResult =
  | { blocked: false }
  | {
      blocked: true;
      reason: "pii_quarantine" | "quarantine_state";
      details: Record<string, unknown>;
    };

export type CostCeilingGuardResult = {
  exceeded: boolean;
  total_cost_cents: number;
};

export interface WriteStage4EventArgs {
  handler_name: string;
  decision: string;
  decision_details: Record<string, unknown>;
  duration_ms: number;
  cost_cents?: number;
  automation_run_id: string;
  email_id: string;
}

export interface WriteNotificationArgs {
  // support_notifications.support_ticket_id is NOT NULL (Phase 1 migration).
  // Must be the support_tickets PK (ticket.id), NOT submission_id.
  support_ticket_id: string;
  submission_id: string;
  kind: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_COST_CEILING_CENTS = 50;

/**
 * Read cost ceiling from env. Reuses SUPPORT_STAGE2_COST_CEILING_CENTS per
 * the Phase 3 W-1 decision (the name is a misnomer post-Phase 3+4 but is
 * now treated as a per-submission total ceiling across stages 2+3+4).
 */
export function resolveCostCeilingCents(env: NodeJS.ProcessEnv): number {
  const raw = env.SUPPORT_STAGE2_COST_CEILING_CENTS;
  if (raw) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_COST_CEILING_CENTS;
}

// ---------------------------------------------------------------------------
// loadSupportTicket
// ---------------------------------------------------------------------------

/**
 * Load a support_tickets row by id. Throws TicketNotFoundError if the row
 * does not exist.
 */
export async function loadSupportTicket(
  supabase: SupabaseAdmin,
  ticket_id: string,
): Promise<HandlerTicket> {
  const res = await supabase
    .from("support_tickets")
    .select(
      "id, submission_id, submitter_id, submitter_locale, transcript, clarification_questions, attempt, pii_quarantine, quarantine_state, stage2_cost_cents, stage3_cost_cents, handler_executed",
    )
    .eq("id", ticket_id)
    .maybeSingle();

  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `support_tickets lookup failed: ${err?.message ?? "unknown"}`,
    );
  }

  const row = (res as { data: Record<string, unknown> | null }).data;

  if (!row) {
    throw new TicketNotFoundError(ticket_id);
  }

  return {
    id: row.id as string,
    submission_id: row.submission_id as string,
    submitter_id: (row.submitter_id as string) ?? null,
    submitter_locale: (row.submitter_locale as string) ?? null,
    transcript: (row.transcript as string) ?? null,
    clarification_questions: (row.clarification_questions as string[]) ?? null,
    attempt: (row.attempt as number) ?? 1,
    pii_quarantine: Boolean(row.pii_quarantine),
    quarantine_state: (row.quarantine_state as string) ?? null,
    stage2_cost_cents: (row.stage2_cost_cents as number) ?? 0,
    stage3_cost_cents: (row.stage3_cost_cents as number) ?? 0,
    handler_executed: (row.handler_executed as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// quarantineGuardCheck
// ---------------------------------------------------------------------------

/**
 * Defense-in-depth quarantine check. Should be called by every Stage 4
 * handler even though Stage 0/2/3 already checked — belt-and-suspenders per
 * T-04-03-01 threat mitigation.
 */
export function quarantineGuardCheck(
  ticket: Pick<HandlerTicket, "pii_quarantine" | "quarantine_state">,
): QuarantineGuardResult {
  if (ticket.pii_quarantine === true) {
    return {
      blocked: true,
      reason: "pii_quarantine",
      details: { pii_quarantine: true },
    };
  }
  if (ticket.quarantine_state != null && ticket.quarantine_state !== "") {
    return {
      blocked: true,
      reason: "quarantine_state",
      details: { quarantine_state: ticket.quarantine_state },
    };
  }
  return { blocked: false };
}

// ---------------------------------------------------------------------------
// costCeilingGuard
// ---------------------------------------------------------------------------

/**
 * Sum stage2 + stage3 + stage4 cost and compare against ceiling.
 *
 * Note: the ceiling env var is named SUPPORT_STAGE2_COST_CEILING_CENTS (Phase 3
 * W-1 decision). The "stage2" in the name is a historical misnomer — the value
 * is now a per-submission total across all stages (2+3+4). Never create a new
 * env var for this; use resolveCostCeilingCents().
 */
export function costCeilingGuard(
  ticket: Pick<HandlerTicket, "stage2_cost_cents" | "stage3_cost_cents">,
  stage4_cost_cents: number,
  ceilingCents: number,
): CostCeilingGuardResult {
  const total_cost_cents =
    (ticket.stage2_cost_cents ?? 0) +
    (ticket.stage3_cost_cents ?? 0) +
    stage4_cost_cents;
  return {
    exceeded: total_cost_cents > ceilingCents,
    total_cost_cents,
  };
}

// ---------------------------------------------------------------------------
// writeStage4Event
// ---------------------------------------------------------------------------

/**
 * Insert ONE aggregate pipeline_events row at stage=4. Called by every Stage 4
 * handler to record the final decision, cost, and duration.
 *
 * UNIQUE constraint on (email_id, swarm_type, stage) ensures only one row per
 * submission per stage. Handlers must call this exactly once.
 */
export async function writeStage4Event(
  supabase: SupabaseAdmin,
  args: WriteStage4EventArgs,
): Promise<void> {
  const row: Record<string, unknown> = {
    swarm_type: "support-tickets",
    stage: 4,
    decision: args.decision,
    decision_details: args.decision_details,
    triggered_by: `support-tickets:${args.handler_name}`,
    duration_ms: args.duration_ms,
    automation_run_id: args.automation_run_id,
    email_id: args.email_id,
  };
  if (args.cost_cents !== undefined) {
    row.cost_cents = args.cost_cents;
  }

  const res = await supabase.from("pipeline_events").insert(row);
  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `pipeline_events insert (decision=${args.decision}) failed: ${err?.message ?? "unknown"}`,
    );
  }
}

// ---------------------------------------------------------------------------
// writeNotification
// ---------------------------------------------------------------------------

/**
 * Insert a support_notifications row. Returns the inserted row's id so
 * handlers can include it in their pipeline_events.decision_details for
 * audit linkage.
 */
export async function writeNotification(
  supabase: SupabaseAdmin,
  args: WriteNotificationArgs,
): Promise<{ id: string }> {
  const res = await supabase
    .from("support_notifications")
    .insert({
      support_ticket_id: args.support_ticket_id,
      submission_id: args.submission_id,
      kind: args.kind,
      payload: args.payload,
    })
    .select("id")
    .single();

  if ((res as { error?: unknown } | null)?.error) {
    const err = (res as { error?: { message?: string } }).error;
    throw new Error(
      `support_notifications insert (kind=${args.kind}) failed: ${err?.message ?? "unknown"}`,
    );
  }

  return { id: ((res as { data?: { id?: string } }).data?.id ?? "") };
}

// ---------------------------------------------------------------------------
// buildClickupTaskUrl
// ---------------------------------------------------------------------------

/**
 * Build a ClickUp task URL from a task id. The host is always app.clickup.com
 * (T-04-03-05 mitigation — no user-supplied host).
 */
export function buildClickupTaskUrl(taskId: string): string {
  return `https://app.clickup.com/t/${taskId}`;
}
