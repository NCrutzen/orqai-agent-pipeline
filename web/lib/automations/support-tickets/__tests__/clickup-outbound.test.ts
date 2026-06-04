// Plan 05-03 Task 1 — clickup-outbound.ts tests (RED → GREEN).
//
// Tests parseClickupHistory (pure parser) and runClickupOutbound (pure runner).
//
// BEHAVIORS COVERED:
//   T1 - status change in-progress → status_change='in-progress', raw_status captured
//   T2 - status 'to do' → mapClickupStatus returns null → no notification, decision='clickup_outbound_status_ignored'
//   T3 - status 'closed' → updates clickup_status + computes time_to_resolve_minutes; one notification kind='status_update'
//   T4 - all 4 CANONICAL_OUTBOUND_STATUSES produce exactly one notification each
//   T5 - custom_field override of intent → final_intent written; delta in decision_details
//   T6 - assignee override via field='assignee' → final_assignee written; delta recorded
//   T7 - no status change AND no overrides → no notification, no final_* update; decision='clickup_outbound_noop'
//   T8 - unmatched task → ticket_not_found, stage=4 row, no notification
//   T9 - status change AND override in same event → both applied (combined delta + one notification)
//   W1 - idempotency: duplicate event (same received_at + same clickup_status) → 'already_applied', no double-write
//   W3 - unrecognized custom_field name → surfaces in decision_details.unrecognized_override_fields

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  parseClickupHistory,
  runClickupOutbound,
} from "../clickup-outbound";
import type { ClickupOutboundDeps } from "../clickup-outbound";
import { CANONICAL_OUTBOUND_STATUSES } from "../clickup-status-map";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CLICKUP_TASK_ID = "CU-99999";
const SUBMITTED_AT = "2026-06-01T10:00:00.000Z";
const NOW = new Date("2026-06-01T12:30:00.000Z");

// 2h30m = 150min
const EXPECTED_TTR_MINUTES = Math.round(
  (NOW.getTime() - new Date(SUBMITTED_AT).getTime()) / 60000,
);

const TICKET_BASE = {
  id: TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitted_at: SUBMITTED_AT,
  clickup_status: null as string | null,
  proposed_intent: "duplicate" as string | null,
  proposed_system: "iController" as string | null,
  proposed_assignee: "U-proposed" as string | null,
  final_intent: null as string | null,
  final_system: null as string | null,
  final_assignee: null as string | null,
};

const EVENT_BASE = {
  clickup_task_id: CLICKUP_TASK_ID,
  event_type: "taskStatusUpdated",
  history_items: [] as Array<Record<string, unknown>>,
  received_at: "2026-06-01T12:30:00.000Z",
};

// ---------------------------------------------------------------------------
// Supabase mock factory
// ---------------------------------------------------------------------------

function makeSupabaseMock(opts: {
  ticket?: typeof TICKET_BASE | null;
  updateError?: string | null;
}) {
  const { ticket = TICKET_BASE, updateError = null } = opts;

  // Support two-step ticket lookup: first by outbound_clickup_task_id, then by clickup_task_id
  let outboundCallCount = 0;

  const makeTicketSelectChain = (resolveData: typeof TICKET_BASE | null) => ({
    eq: vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: resolveData, error: null }),
    }),
  });

  // First call: outbound_clickup_task_id lookup → return ticket (or null for not-found)
  // Second call: fallback clickup_task_id lookup → return ticket only if first returned null
  const ticketSelect = vi.fn().mockImplementation(() => {
    outboundCallCount++;
    if (outboundCallCount === 1) {
      // outbound_clickup_task_id lookup
      return makeTicketSelectChain(ticket);
    }
    // fallback clickup_task_id lookup (only reached when first returns null)
    return makeTicketSelectChain(ticket);
  });

  const ticketUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      error: updateError ? { message: updateError } : null,
    }),
  });

  const notifInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: "notif-1" }, error: null }),
    }),
  });

  const pipelineInsert = vi.fn().mockResolvedValue({ error: null });

  const fromMap: Record<string, unknown> = {
    support_tickets: {
      select: ticketSelect,
      update: ticketUpdate,
    },
    support_notifications: {
      insert: notifInsert,
    },
    pipeline_events: {
      insert: pipelineInsert,
    },
  };

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table in fromMap) return fromMap[table];
      return { select: vi.fn(), update: vi.fn(), insert: vi.fn() };
    }),
    _ticketUpdate: ticketUpdate,
    _notifInsert: notifInsert,
    _pipelineInsert: pipelineInsert,
    _ticketSelect: ticketSelect,
  };
}

// ---------------------------------------------------------------------------
// parseClickupHistory tests
// ---------------------------------------------------------------------------

describe("parseClickupHistory", () => {
  it("T1: status field in-progress → status_change='in-progress', raw_status='in progress'", () => {
    const items = [
      { field: "status", after: { status: "in progress" } },
    ];
    const result = parseClickupHistory(items as Array<Record<string, unknown>>);
    expect(result.status_change).toBe("in-progress");
    expect(result.raw_status).toBe("in progress");
  });

  it("T1b: status field 'to do' → status_change=null (unmapped)", () => {
    const items = [
      { field: "status", after: { status: "to do" } },
    ];
    const result = parseClickupHistory(items as Array<Record<string, unknown>>);
    expect(result.status_change).toBeNull();
    expect(result.raw_status).toBe("to do");
  });

  it("T5: custom_field intent override captured in overrides.intent", () => {
    const items = [
      {
        field: "custom_field",
        custom_field: { name: "intent", id: "cf-1" },
        after: "clickup-escalate",
      },
    ];
    const result = parseClickupHistory(items as Array<Record<string, unknown>>);
    expect(result.overrides.intent).toBe("clickup-escalate");
  });

  it("T6: assignee field override captured in overrides.assignee", () => {
    const items = [
      { field: "assignee", after: { id: "U123" } },
    ];
    const result = parseClickupHistory(items as Array<Record<string, unknown>>);
    expect(result.overrides.assignee).toBe("U123");
  });

  it("W3: unrecognized custom_field name captured in unrecognized_fields", () => {
    const items = [
      {
        field: "custom_field",
        custom_field: { name: "some-unknown-field", id: "cf-x" },
        after: "some-value",
      },
    ];
    const result = parseClickupHistory(items as Array<Record<string, unknown>>);
    expect(result.unrecognized_fields).toHaveLength(1);
    expect(result.unrecognized_fields[0].name).toBe("some-unknown-field");
  });
});

// ---------------------------------------------------------------------------
// runClickupOutbound tests
// ---------------------------------------------------------------------------

describe("runClickupOutbound", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("T2: status 'to do' → no notification; decision='clickup_outbound_status_ignored'", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [{ field: "status", after: { status: "to do" } }],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_status_ignored");
    expect(supabase._notifInsert).not.toHaveBeenCalled();
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
  });

  it("T3: status 'closed' → updates clickup_status, computes time_to_resolve_minutes, writes one notification", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [{ field: "status", after: { status: "closed" } }],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_applied");

    // Ticket updated with clickup_status='closed' and time_to_resolve_minutes
    expect(supabase._ticketUpdate).toHaveBeenCalledOnce();
    const updateCall = supabase._ticketUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall.clickup_status).toBe("closed");
    expect(updateCall.time_to_resolve_minutes).toBe(EXPECTED_TTR_MINUTES);

    // Exactly one notification
    expect(supabase._notifInsert).toHaveBeenCalledOnce();
    const notifCall = supabase._notifInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(notifCall.kind).toBe("status_update");
    expect((notifCall.payload as Record<string, unknown>).status).toBe("closed");
    expect(notifCall.support_ticket_id).toBe(TICKET_ID);
  });

  it("T4: all 4 CANONICAL_OUTBOUND_STATUSES produce exactly one notification each", async () => {
    for (const canonicalStatus of CANONICAL_OUTBOUND_STATUSES) {
      const supabase = makeSupabaseMock({});
      const event = {
        ...EVENT_BASE,
        history_items: [{ field: "status", after: { status: canonicalStatus } }],
      };

      const result = await runClickupOutbound(event, {
        supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
        now: () => NOW,
      });

      expect(result.decision).toBe("clickup_outbound_applied");
      expect(supabase._notifInsert).toHaveBeenCalledOnce();
      const notifCall = supabase._notifInsert.mock.calls[0][0] as Record<string, unknown>;
      expect((notifCall.payload as Record<string, unknown>).status).toBe(canonicalStatus);
    }
  });

  it("T5: custom_field intent override → final_intent written; delta in decision_details", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [
        {
          field: "custom_field",
          custom_field: { name: "intent", id: "cf-1" },
          after: "clickup-escalate",
        },
      ],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_applied");

    // final_intent written
    expect(supabase._ticketUpdate).toHaveBeenCalledOnce();
    const updateCall = supabase._ticketUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall.final_intent).toBe("clickup-escalate");

    // pipeline_events written with override_delta
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
    const pipelineCall = supabase._pipelineInsert.mock.calls[0][0] as Record<string, unknown>;
    const details = pipelineCall.decision_details as Record<string, unknown>;
    const delta = details.override_delta as Record<string, unknown>;
    expect(delta.intent).toEqual({ proposed: "duplicate", final: "clickup-escalate" });
  });

  it("T6: assignee override via field='assignee' → final_assignee written; delta recorded", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [
        { field: "assignee", after: { id: "U123" } },
      ],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_applied");

    // final_assignee written
    expect(supabase._ticketUpdate).toHaveBeenCalledOnce();
    const updateCall = supabase._ticketUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall.final_assignee).toBe("U123");

    // delta recorded
    const pipelineCall = supabase._pipelineInsert.mock.calls[0][0] as Record<string, unknown>;
    const details = pipelineCall.decision_details as Record<string, unknown>;
    const delta = details.override_delta as Record<string, unknown>;
    expect(delta.assignee).toEqual({ proposed: "U-proposed", final: "U123" });
  });

  it("T7: no status change AND no overrides → no notification, no ticket update; decision='clickup_outbound_noop'", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_noop");
    expect(supabase._notifInsert).not.toHaveBeenCalled();
    expect(supabase._ticketUpdate).not.toHaveBeenCalled();
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
  });

  it("T8: unmatched task_id → decision='clickup_outbound_ticket_not_found', no notification", async () => {
    const supabase = makeSupabaseMock({ ticket: null });
    const event = {
      ...EVENT_BASE,
      history_items: [{ field: "status", after: { status: "closed" } }],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_ticket_not_found");
    expect(supabase._notifInsert).not.toHaveBeenCalled();
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
  });

  it("T9: status change AND override in same event → both applied (combined delta + one notification)", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [
        { field: "status", after: { status: "resolved" } },
        {
          field: "custom_field",
          custom_field: { name: "intent", id: "cf-1" },
          after: "info-answer",
        },
      ],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("clickup_outbound_applied");

    // One notification
    expect(supabase._notifInsert).toHaveBeenCalledOnce();

    // Ticket update carries both status and final_intent
    expect(supabase._ticketUpdate).toHaveBeenCalledOnce();
    const updateCall = supabase._ticketUpdate.mock.calls[0][0] as Record<string, unknown>;
    expect(updateCall.clickup_status).toBe("resolved");
    expect(updateCall.final_intent).toBe("info-answer");

    // Delta contains intent override
    const pipelineCall = supabase._pipelineInsert.mock.calls[0][0] as Record<string, unknown>;
    const details = pipelineCall.decision_details as Record<string, unknown>;
    const delta = details.override_delta as Record<string, unknown>;
    expect(delta.intent).toEqual({ proposed: "duplicate", final: "info-answer" });
  });

  it("W1: duplicate event (same clickup_status already set) → 'already_applied', no double-write", async () => {
    // Ticket already has clickup_status='closed' and same received_at in last_clickup_received_at
    const alreadyClosedTicket = {
      ...TICKET_BASE,
      clickup_status: "closed",
    };
    const supabase = makeSupabaseMock({ ticket: alreadyClosedTicket });
    const event = {
      ...EVENT_BASE,
      history_items: [{ field: "status", after: { status: "closed" } }],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    expect(result.decision).toBe("already_applied");
    expect(supabase._notifInsert).not.toHaveBeenCalled();
    expect(supabase._ticketUpdate).not.toHaveBeenCalled();
    expect(supabase._pipelineInsert).not.toHaveBeenCalled();
  });

  it("W3: unrecognized custom_field name → surfaces in decision_details.unrecognized_override_fields", async () => {
    const supabase = makeSupabaseMock({});
    const event = {
      ...EVENT_BASE,
      history_items: [
        {
          field: "custom_field",
          custom_field: { name: "some-mystery-field", id: "cf-x" },
          after: "some-value",
        },
      ],
    };

    const result = await runClickupOutbound(event, {
      supabase: supabase as unknown as ClickupOutboundDeps["supabase"],
      now: () => NOW,
    });

    // Decision is noop (no recognized change) but unrecognized fields recorded
    expect(supabase._pipelineInsert).toHaveBeenCalledOnce();
    const pipelineCall = supabase._pipelineInsert.mock.calls[0][0] as Record<string, unknown>;
    const details = pipelineCall.decision_details as Record<string, unknown>;
    const unrecognized = details.unrecognized_override_fields as Array<{ name: string }>;
    expect(Array.isArray(unrecognized)).toBe(true);
    expect(unrecognized.length).toBeGreaterThan(0);
    expect(unrecognized[0].name).toBe("some-mystery-field");
    expect(result.decision).toBe("clickup_outbound_noop");
  });
});
