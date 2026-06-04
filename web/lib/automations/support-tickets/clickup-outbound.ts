// Plan 05-03 Task 1 & 2 — ClickUp Outbound Inngest function.
//
// Consumes `support-tickets/clickup-status.received` (emitted by the Plan
// 05-02 webhook route) and is the replay-safe write-path that:
//   (OUTBOUND-02) Maps ClickUp status → support_notifications row (kind='status_update')
//   (OUTBOUND-03) Captures human overrides of intent/system/assignee into
//                 support_tickets.final_* as training signal
//   Writes ONE aggregate pipeline_events row per invocation.
//
// Function-id LOCKED: "support-tickets-clickup-outbound" — NEVER rename
// across runs (in-flight runs would orphan on rename).
//
// CLAUDE.md guards observed:
//   - All side effects inside ONE step.run boundary (replay safety).
//   - now() captured INSIDE step.run so time is deterministic across retries
//     (Phase 65 leer dd2583a).
//   - NO direct OpenAI/Anthropic/ClickUp SDK.
//   - NO inngest.send needed — this function only writes to DB.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  mapClickupStatus,
  CANONICAL_OUTBOUND_STATUSES,
} from "./clickup-status-map";
import type { ClickupStatusCategory } from "./clickup-status-map";
import { writeStage4Event, writeNotification } from "./handler-shared";

// Re-export CANONICAL_OUTBOUND_STATUSES to silence unused-import lint
export { CANONICAL_OUTBOUND_STATUSES };

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// W3: named constants for ClickUp custom_field names that carry override data.
// These names must match the exact ClickUp field names used in the workspace.
// If ClickUp renames a field, update this object — do NOT hardcode strings
// in the parser body.
// ---------------------------------------------------------------------------

const OVERRIDE_CUSTOM_FIELD_NAMES = {
  intent: "intent",
  system: "system",
  assignee: "assignee",
} as const satisfies Record<string, string>;

type OverrideFieldKey = keyof typeof OVERRIDE_CUSTOM_FIELD_NAMES;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ClickupOutboundDecision =
  | "clickup_outbound_applied"
  | "clickup_outbound_status_ignored"
  | "clickup_outbound_noop"
  | "clickup_outbound_ticket_not_found"
  | "already_applied";

export interface ClickupOutboundEvent {
  clickup_task_id: string;
  event_type: string;
  history_items: Array<Record<string, unknown>>;
  received_at: string;
}

export interface ClickupOutboundResult {
  ok: true;
  decision: ClickupOutboundDecision;
}

export interface ClickupOutboundDeps {
  supabase: SupabaseAdmin;
  now: () => Date;
}

export interface ParsedClickupHistory {
  status_change: ClickupStatusCategory | null;
  raw_status: string | null;
  overrides: {
    intent?: string;
    system?: string;
    assignee?: string;
  };
  /** W3: any custom_field names that were not in OVERRIDE_CUSTOM_FIELD_NAMES */
  unrecognized_fields: Array<{ name: string; value: unknown }>;
}

// ---------------------------------------------------------------------------
// parseClickupHistory — pure parser, no imports beyond clickup-status-map
// ---------------------------------------------------------------------------

/**
 * Parse a ClickUp history_items array into a normalized struct.
 *
 * - Status changes come as { field: "status", after: { status: string } }.
 * - Custom field overrides come as { field: "custom_field", custom_field: { name }, after: string }.
 * - Assignee overrides come as { field: "assignee", after: { id: string } }.
 *
 * W3: unrecognized custom_field names are captured in unrecognized_fields rather
 * than silently dropped, so operators can discover new ClickUp field names.
 */
export function parseClickupHistory(
  history_items: Array<Record<string, unknown>>,
): ParsedClickupHistory {
  let status_change: ClickupStatusCategory | null = null;
  let raw_status: string | null = null;
  const overrides: { intent?: string; system?: string; assignee?: string } = {};
  const unrecognized_fields: Array<{ name: string; value: unknown }> = [];

  for (const item of history_items) {
    const field = item.field as string | undefined;

    if (field === "status") {
      const after = item.after as Record<string, unknown> | undefined;
      const rawStr = (after?.status as string | undefined) ?? null;
      if (rawStr != null) {
        raw_status = rawStr;
        status_change = mapClickupStatus(rawStr);
      }
      continue;
    }

    if (field === "custom_field") {
      const cf = item.custom_field as Record<string, unknown> | undefined;
      const cfName = (cf?.name as string | undefined) ?? "";
      const cfValue = item.after;

      if (cfName === OVERRIDE_CUSTOM_FIELD_NAMES.intent) {
        overrides.intent = cfValue as string;
      } else if (cfName === OVERRIDE_CUSTOM_FIELD_NAMES.system) {
        overrides.system = cfValue as string;
      } else if (cfName === OVERRIDE_CUSTOM_FIELD_NAMES.assignee) {
        overrides.assignee = cfValue as string;
      } else if (cfName) {
        // W3: record unrecognized field — FAIL LOUD (surface rather than drop)
        unrecognized_fields.push({ name: cfName, value: cfValue });
      }
      continue;
    }

    if (field === "assignee") {
      const after = item.after as Record<string, unknown> | undefined;
      const assigneeId = (after?.id as string | undefined) ?? null;
      if (assigneeId) {
        overrides.assignee = assigneeId;
      }
      continue;
    }
  }

  return { status_change, raw_status, overrides, unrecognized_fields };
}

// ---------------------------------------------------------------------------
// Ticket shape for the outbound runner
// ---------------------------------------------------------------------------

interface OutboundTicket {
  id: string;
  submission_id: string;
  submitted_at: string;
  clickup_status: string | null;
  proposed_intent: string | null;
  proposed_system: string | null;
  proposed_assignee: string | null;
  final_intent: string | null;
  final_system: string | null;
  final_assignee: string | null;
}

async function loadOutboundTicket(
  supabase: SupabaseAdmin,
  clickup_task_id: string,
): Promise<OutboundTicket | null> {
  const SELECT_COLS =
    "id, submission_id, submitted_at, clickup_status, proposed_intent, proposed_system, proposed_assignee, final_intent, final_system, final_assignee";

  // Primary join: outbound_clickup_task_id (set by Phase 4 escalate handler)
  const primary = await supabase
    .from("support_tickets")
    .select(SELECT_COLS)
    .eq("outbound_clickup_task_id", clickup_task_id)
    .maybeSingle();

  if ((primary as { error?: unknown } | null)?.error) {
    const err = (primary as { error?: { message?: string } }).error;
    throw new Error(`support_tickets lookup (outbound) failed: ${err?.message ?? "unknown"}`);
  }

  const row = (primary as { data: Record<string, unknown> | null }).data;
  if (row) return rowToTicket(row);

  // Fallback: clickup_task_id (tolerant correlation — webhook may carry either key)
  const fallback = await supabase
    .from("support_tickets")
    .select(SELECT_COLS)
    .eq("clickup_task_id", clickup_task_id)
    .maybeSingle();

  if ((fallback as { error?: unknown } | null)?.error) {
    const err = (fallback as { error?: { message?: string } }).error;
    throw new Error(`support_tickets lookup (fallback) failed: ${err?.message ?? "unknown"}`);
  }

  const fallbackRow = (fallback as { data: Record<string, unknown> | null }).data;
  return fallbackRow ? rowToTicket(fallbackRow) : null;
}

function rowToTicket(row: Record<string, unknown>): OutboundTicket {
  return {
    id: row.id as string,
    submission_id: row.submission_id as string,
    submitted_at: row.submitted_at as string,
    clickup_status: (row.clickup_status as string) ?? null,
    proposed_intent: (row.proposed_intent as string) ?? null,
    proposed_system: (row.proposed_system as string) ?? null,
    proposed_assignee: (row.proposed_assignee as string) ?? null,
    final_intent: (row.final_intent as string) ?? null,
    final_system: (row.final_system as string) ?? null,
    final_assignee: (row.final_assignee as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// runClickupOutbound — pure orchestrator (testable without Inngest runtime)
// ---------------------------------------------------------------------------

/**
 * Pure orchestrator. The Inngest wrapper calls this inside a single step.run
 * boundary for replay safety.
 *
 * W1 IDEMPOTENCY GUARD: If the incoming status maps to a canonical value AND
 * the ticket already has that value in clickup_status, we short-circuit with
 * 'already_applied' — no DB writes, no double notifications on retry.
 */
export async function runClickupOutbound(
  event: ClickupOutboundEvent,
  deps: ClickupOutboundDeps,
): Promise<ClickupOutboundResult> {
  const { supabase, now } = deps;

  // (1) Parse history
  const parsed = parseClickupHistory(event.history_items);
  const { status_change, raw_status, overrides, unrecognized_fields } = parsed;

  // (2) Load ticket
  const ticket = await loadOutboundTicket(supabase, event.clickup_task_id);

  if (!ticket) {
    await writeStage4Event(supabase, {
      handler_name: "clickup-outbound",
      decision: "clickup_outbound_ticket_not_found",
      decision_details: {
        clickup_task_id: event.clickup_task_id,
        event_type: event.event_type,
        received_at: event.received_at,
      },
      duration_ms: 0,
      automation_run_id: event.clickup_task_id,
      email_id: event.clickup_task_id,
    });
    return { ok: true, decision: "clickup_outbound_ticket_not_found" };
  }

  // (3) W1 idempotency: short-circuit if the target status is already applied.
  // A status that maps to a canonical value AND is already the stored value means
  // this event was already processed (e.g. Inngest retry after a transient failure
  // that already wrote to DB).
  if (status_change !== null && ticket.clickup_status === status_change) {
    return { ok: true, decision: "already_applied" };
  }

  // (4) Determine what changed
  const hasStatusChange = status_change !== null;
  const hasAnyOverride =
    overrides.intent !== undefined ||
    overrides.system !== undefined ||
    overrides.assignee !== undefined;

  // (5) Build DB updates + decide
  const ticketUpdates: Record<string, unknown> = {};
  const overrideDelta: Record<string, { proposed: string | null; final: string }> = {};

  // Status change (OUTBOUND-02)
  if (hasStatusChange) {
    ticketUpdates.clickup_status = status_change;

    if (status_change === "closed") {
      const nowTime = now();
      const submittedAt = new Date(ticket.submitted_at);
      ticketUpdates.time_to_resolve_minutes = Math.round(
        (nowTime.getTime() - submittedAt.getTime()) / 60000,
      );
    }
  }

  // Override diff (OUTBOUND-03)
  if (hasAnyOverride) {
    if (overrides.intent !== undefined) {
      ticketUpdates.final_intent = overrides.intent;
      overrideDelta.intent = {
        proposed: ticket.proposed_intent,
        final: overrides.intent,
      };
    }
    if (overrides.system !== undefined) {
      ticketUpdates.final_system = overrides.system;
      overrideDelta.system = {
        proposed: ticket.proposed_system,
        final: overrides.system,
      };
    }
    if (overrides.assignee !== undefined) {
      ticketUpdates.final_assignee = overrides.assignee;
      overrideDelta.assignee = {
        proposed: ticket.proposed_assignee,
        final: overrides.assignee,
      };
    }
  }

  const somethingChanged =
    hasStatusChange || hasAnyOverride;

  // Early noop/ignored path — still write the pipeline row
  if (!somethingChanged) {
    // Distinguish: was there a status field that mapped to null (ignored),
    // vs no relevant items at all (noop)?
    const decision: ClickupOutboundDecision =
      raw_status !== null ? "clickup_outbound_status_ignored" : "clickup_outbound_noop";
    await writeStage4Event(supabase, {
      handler_name: "clickup-outbound",
      decision,
      decision_details: {
        status_change: null,
        raw_status,
        override_delta: {},
        unrecognized_override_fields: unrecognized_fields,
        received_at: event.received_at,
      },
      duration_ms: 0,
      automation_run_id: ticket.id,
      email_id: ticket.submission_id,
    });
    return { ok: true, decision };
  }

  // (6) Write ticket updates (status + overrides combined in one update)
  if (Object.keys(ticketUpdates).length > 0) {
    const updateRes = await supabase
      .from("support_tickets")
      .update(ticketUpdates)
      .eq("id", ticket.id);
    if ((updateRes as { error?: unknown } | null)?.error) {
      const err = (updateRes as { error?: { message?: string } }).error;
      throw new Error(`support_tickets update failed: ${err?.message ?? "unknown"}`);
    }
  }

  // (7) Write notification for relevant status (OUTBOUND-02)
  if (hasStatusChange && status_change !== null) {
    await writeNotification(supabase, {
      support_ticket_id: ticket.id,
      submission_id: ticket.submission_id,
      kind: "status_update",
      payload: {
        status: status_change,
        clickup_task_id: event.clickup_task_id,
        raw_status,
        received_at: event.received_at,
      },
    });
  }

  // (8) Write ONE aggregate pipeline_events row
  await writeStage4Event(supabase, {
    handler_name: "clickup-outbound",
    decision: "clickup_outbound_applied",
    decision_details: {
      status_change,
      raw_status,
      override_delta: overrideDelta,
      unrecognized_override_fields: unrecognized_fields,
      received_at: event.received_at,
    },
    duration_ms: 0,
    automation_run_id: ticket.id,
    email_id: ticket.submission_id,
  });

  return { ok: true, decision: "clickup_outbound_applied" };
}

// ---------------------------------------------------------------------------
// Inngest wrapper
// ---------------------------------------------------------------------------

/**
 * Inngest function. Function-id LOCKED: "support-tickets-clickup-outbound".
 * NEVER rename — in-flight runs would orphan on rename. retries: 3.
 *
 * All side effects run inside a single step.run boundary (replay safety).
 * now() is computed INSIDE step.run so the timestamp is deterministic
 * across retries (Phase 65 leer dd2583a / replay-safe id generation).
 *
 * NO sendEvent needed: this function is a pure write-path, no fanout.
 */
export const clickupOutbound = inngest.createFunction(
  { id: "support-tickets-clickup-outbound", retries: 3 },
  { event: "support-tickets/clickup-status.received" },
  async ({ event, step }) => {
    return await step.run("run-clickup-outbound", async () =>
      runClickupOutbound(
        event.data as ClickupOutboundEvent,
        {
          supabase: createAdminClient(),
          // now() inside step.run for replay safety (Phase 65 leer dd2583a)
          now: () => new Date(),
        },
      ),
    );
  },
);
