// Plan 04-03 Task 1 — handler-shared.ts tests (RED → GREEN).
//
// Tests all shared helpers consumed by clarification-handler, duplicate-handler,
// info-answer-handler, and clickup-escalate-handler.
//
// NINE behaviors covered:
//   1. loadSupportTicket: missing row → throws TicketNotFoundError
//   2. loadSupportTicket: present row → returns typed object
//   3. quarantineGuardCheck: pii_quarantine=true → blocked
//   4. quarantineGuardCheck: quarantine_state non-null → blocked
//   5. quarantineGuardCheck: both clean → not blocked
//   6. costCeilingGuard: over ceiling → exceeded
//   7. costCeilingGuard: under ceiling → not exceeded
//   8. writeStage4Event: inserts row with correct shape
//   9. writeNotification: inserts support_notifications row

import { describe, it, expect, vi } from "vitest";

import {
  TicketNotFoundError,
  loadSupportTicket,
  quarantineGuardCheck,
  costCeilingGuard,
  writeStage4Event,
  writeNotification,
} from "../handler-shared";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const TICKET_ROW_BASE = {
  id: TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "nl" as const,
  transcript: "My PDF export is broken.",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: null,
};

// ---------------------------------------------------------------------------
// Supabase mock helpers
// ---------------------------------------------------------------------------

type Inserted = { args: Record<string, unknown> };

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as Inserted[],
    notificationInserts: [] as Inserted[],
  };

  const admin = {
    from(table: string) {
      if (table === "support_tickets") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              maybeSingle: async () => ({ data: opts.ticketRow, error: null }),
            }),
          }),
        };
      }

      if (table === "pipeline_events") {
        return {
          insert(args: Record<string, unknown>) {
            calls.pipelineEventsInserts.push({ args });
            return Promise.resolve({ error: opts.insertError ?? null });
          },
        };
      }

      if (table === "support_notifications") {
        return {
          insert(args: Record<string, unknown>) {
            calls.notificationInserts.push({ args });
            return {
              select: (_cols: string) => ({
                single: async () => ({
                  data: { id: "notif-1" },
                  error: opts.insertError ?? null,
                }),
              }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    _calls: calls,
  };

  return admin as unknown as Parameters<typeof loadSupportTicket>[0] & {
    _calls: typeof calls;
  };
}

// ---------------------------------------------------------------------------
// 1. loadSupportTicket: missing row → throws TicketNotFoundError
// ---------------------------------------------------------------------------

describe("loadSupportTicket", () => {
  it("missing row → throws TicketNotFoundError", async () => {
    const admin = buildAdminMock({ ticketRow: null });
    await expect(loadSupportTicket(admin, TICKET_ID)).rejects.toBeInstanceOf(
      TicketNotFoundError,
    );
  });

  it("present row → returns typed object with all expected fields", async () => {
    const admin = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const ticket = await loadSupportTicket(admin, TICKET_ID);
    expect(ticket.id).toBe(TICKET_ID);
    expect(ticket.submission_id).toBe(SUBMISSION_ID);
    expect(ticket.submitter_locale).toBe("nl");
    expect(ticket.attempt).toBe(1);
    expect(ticket.pii_quarantine).toBe(false);
    expect(ticket.quarantine_state).toBeNull();
    expect(ticket.stage2_cost_cents).toBe(10);
    expect(ticket.stage3_cost_cents).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// 3–5. quarantineGuardCheck
// ---------------------------------------------------------------------------

describe("quarantineGuardCheck", () => {
  it("pii_quarantine=true → returns { blocked: true, reason: 'pii_quarantine' }", () => {
    const ticket = { ...TICKET_ROW_BASE, pii_quarantine: true };
    const result = quarantineGuardCheck(ticket);
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toBe("pii_quarantine");
    }
  });

  it("quarantine_state non-null → returns { blocked: true, reason: 'quarantine_state' }", () => {
    const ticket = {
      ...TICKET_ROW_BASE,
      pii_quarantine: false,
      quarantine_state: "rejected_safety_ssrf",
    };
    const result = quarantineGuardCheck(ticket);
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toBe("quarantine_state");
    }
  });

  it("both clean → returns { blocked: false }", () => {
    const ticket = {
      ...TICKET_ROW_BASE,
      pii_quarantine: false,
      quarantine_state: null,
    };
    const result = quarantineGuardCheck(ticket);
    expect(result.blocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6–7. costCeilingGuard
// ---------------------------------------------------------------------------

describe("costCeilingGuard", () => {
  it("(stage2+stage3+stage4) > ceiling → returns { exceeded: true, total_cost_cents }", () => {
    const ticket = { ...TICKET_ROW_BASE, stage2_cost_cents: 20, stage3_cost_cents: 20 };
    const result = costCeilingGuard(ticket, 15, 50);
    expect(result.exceeded).toBe(true);
    expect(result.total_cost_cents).toBe(55);
  });

  it("(stage2+stage3+stage4) under ceiling → returns { exceeded: false, total_cost_cents }", () => {
    const ticket = { ...TICKET_ROW_BASE, stage2_cost_cents: 10, stage3_cost_cents: 8 };
    const result = costCeilingGuard(ticket, 5, 50);
    expect(result.exceeded).toBe(false);
    expect(result.total_cost_cents).toBe(23);
  });
});

// ---------------------------------------------------------------------------
// 8. writeStage4Event
// ---------------------------------------------------------------------------

describe("writeStage4Event", () => {
  it("inserts row with correct shape (swarm_type, stage:4, decision, etc.)", async () => {
    const admin = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    await writeStage4Event(admin, {
      handler_name: "clarification-handler",
      decision: "stage_4_clarification",
      decision_details: { locale: "nl" },
      duration_ms: 1234,
      cost_cents: 5,
      automation_run_id: TICKET_ID,
      email_id: SUBMISSION_ID,
    });
    const inserted = admin._calls.pipelineEventsInserts[0].args;
    expect(inserted.swarm_type).toBe("support-tickets");
    expect(inserted.stage).toBe(4);
    expect(inserted.decision).toBe("stage_4_clarification");
    expect(inserted.duration_ms).toBe(1234);
    expect(inserted.cost_cents).toBe(5);
    expect(inserted.automation_run_id).toBe(TICKET_ID);
    expect(inserted.email_id).toBe(SUBMISSION_ID);
  });

  it("throws on insert error", async () => {
    const admin = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      insertError: { message: "db error" },
    });
    await expect(
      writeStage4Event(admin, {
        handler_name: "clarification-handler",
        decision: "stage_4_clarification",
        decision_details: {},
        duration_ms: 0,
        automation_run_id: TICKET_ID,
        email_id: SUBMISSION_ID,
      }),
    ).rejects.toThrow("db error");
  });
});

// ---------------------------------------------------------------------------
// 9. writeNotification
// ---------------------------------------------------------------------------

describe("writeNotification", () => {
  it("inserts support_notifications row with correct shape", async () => {
    const admin = buildAdminMock({ ticketRow: TICKET_ROW_BASE });
    const result = await writeNotification(admin, {
      submission_id: SUBMISSION_ID,
      kind: "clarification_request",
      payload: { questions: ["Q1"], locale: "nl" },
    });
    const inserted = admin._calls.notificationInserts[0].args;
    expect(inserted.submission_id).toBe(SUBMISSION_ID);
    expect(inserted.kind).toBe("clarification_request");
    expect((inserted.payload as Record<string, unknown>).questions).toEqual(["Q1"]);
    expect(result.id).toBe("notif-1");
  });

  it("throws on insert error", async () => {
    const admin = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      insertError: { message: "notif error" },
    });
    await expect(
      writeNotification(admin, {
        submission_id: SUBMISSION_ID,
        kind: "clarification_request",
        payload: {},
      }),
    ).rejects.toThrow("notif error");
  });
});
