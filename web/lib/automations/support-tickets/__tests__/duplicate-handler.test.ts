// Plan 04-03 Task 1 — duplicate-handler.ts tests (RED → GREEN).
//
// Tests the pure runner `runDuplicateHandler(event, deps)`.
//
// SEVEN behaviors covered:
//   D1 - happy path: similar_tickets[0] present, notification kind='duplicate_link' written
//   D2 - no similar_tickets → no notification, decision='stage_4_duplicate_no_similar'
//   D3 - similar_tickets[0].source_key missing → decision='stage_4_duplicate_failed'
//   D4 - quarantine defense-in-depth
//   D5 - stage2 row missing → decision='stage_4_duplicate_failed'
//   D6 - locale: fr ticket → payload.submitter_locale='fr'; unknown → 'en' fallback
//   D7 - zero Orq calls static check (HANDLE-07)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  runDuplicateHandler,
  stage4SupportTicketsDuplicateHandler,
} from "../duplicate-handler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "duplicate" as const,
  completeness_verdict: "complete" as const,
};

const TICKET_ROW_BASE = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "nl",
  transcript: "My PDF export is broken.",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: null,
};

const SIMILAR_TICKET = {
  ticket_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  source_key: "CU-12345",
  cosine_distance: 0.08,
  summary_text: "PDF export fails in iController",
  resolution_text: "Fixed in v2.4.1",
  final_intent: "clickup-escalate",
  final_system: "icontroller",
};

const STAGE2_ROW = {
  decision_details: {
    similar_tickets: [SIMILAR_TICKET],
    prior_tickets_same_user: [],
    prior_tickets_same_system: [],
    prior_clarifications: [],
    context_version: "1.0.0",
  },
};

const FIXED_NOW = new Date("2026-06-02T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

type Inserted = { args: Record<string, unknown> };
type Updated = { args: Record<string, unknown>; id: string };

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  stage2Row?: Record<string, unknown> | null | "default";
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as Inserted[],
    notificationInserts: [] as Inserted[],
    supportTicketsUpdates: [] as Updated[],
    pipelineEventsSelects: [] as Record<string, unknown>[],
  };

  const stage2RowResolved =
    opts.stage2Row === "default" || opts.stage2Row === undefined
      ? STAGE2_ROW
      : opts.stage2Row;

  const admin = {
    from(table: string) {
      if (table === "support_tickets") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              maybeSingle: async () => ({ data: opts.ticketRow, error: null }),
            }),
          }),
          update(args: Record<string, unknown>) {
            return {
              eq(_c: string, id: unknown) {
                calls.supportTicketsUpdates.push({ args, id: id as string });
                return Promise.resolve({ error: opts.updateError ?? null });
              },
            };
          },
        };
      }

      if (table === "pipeline_events") {
        return {
          insert(args: Record<string, unknown>) {
            calls.pipelineEventsInserts.push({ args });
            return Promise.resolve({ error: opts.insertError ?? null });
          },
          select(_cols: string) {
            return {
              eq(_c: string, _v: unknown) {
                return {
                  eq(_c2: string, _v2: unknown) {
                    return {
                      in(_c3: string, _v3: unknown) {
                        return {
                          order(_col: string, _opts: unknown) {
                            return {
                              limit(_n: number) {
                                return {
                                  maybeSingle: async () => ({
                                    data: stage2RowResolved,
                                    error: null,
                                  }),
                                };
                              },
                            };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
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
                  data: { id: "notif-dup-1" },
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

  return admin as unknown as Parameters<typeof runDuplicateHandler>[1]["supabase"] & {
    _calls: typeof calls;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runDuplicateHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("D1: happy path — notification kind=duplicate_link written, support_tickets updated, ZERO Orq calls", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE });

    const result = await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_duplicate");

    // Notification inserted
    const notif = supabase._calls.notificationInserts[0];
    expect(notif).toBeDefined();
    expect(notif.args.kind).toBe("duplicate_link");
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.clickup_task_id).toBe("CU-12345");
    expect(payload.clickup_task_url).toBe("https://app.clickup.com/t/CU-12345");
    expect(payload.cosine_distance).toBe(0.08);
    expect(payload.submitter_locale).toBeDefined();

    // support_tickets updated
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.handler_executed).toBe("duplicate");
    expect(update.args.outbound_clickup_task_id).toBe("CU-12345");
    expect(update.args.stage4_cost_cents).toBe(0);
    expect(update.args.stage4_completed_at).toBeDefined();

    // pipeline_events row
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.stage).toBe(4);
    expect(peRow.args.decision).toBe("stage_4_duplicate");

    // No sendEvent fired by this handler
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("D2: no similar_tickets → no notification, decision=stage_4_duplicate_no_similar, handler_executed=duplicate", async () => {
    const stage2NoSimilar = {
      decision_details: {
        similar_tickets: [],
        prior_tickets_same_user: [],
        prior_tickets_same_system: [],
        prior_clarifications: [],
        context_version: "1.0.0",
      },
    };
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE, stage2Row: stage2NoSimilar });

    const result = await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_duplicate_no_similar");
    expect(supabase._calls.notificationInserts.length).toBe(0);
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.handler_executed).toBe("duplicate");
  });

  it("D3: similar_tickets[0].source_key missing → decision=stage_4_duplicate_failed", async () => {
    const stage2BadKey = {
      decision_details: {
        similar_tickets: [{ ...SIMILAR_TICKET, source_key: null }],
        prior_tickets_same_user: [],
        prior_tickets_same_system: [],
        prior_clarifications: [],
        context_version: "1.0.0",
      },
    };
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE, stage2Row: stage2BadKey });

    const result = await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_duplicate_failed");
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect((peRow.args.decision_details as Record<string, unknown>).reason).toBe(
      "source_key_missing",
    );
  });

  it("D4: pii_quarantine=true → decision=stage_4_duplicate_quarantine_blocked, no notification", async () => {
    const ticketQuarantined = { ...TICKET_ROW_BASE, pii_quarantine: true };
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: ticketQuarantined });

    const result = await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_duplicate_quarantine_blocked");
    expect(supabase._calls.notificationInserts.length).toBe(0);
  });

  it("D5: stage2 row missing → decision=stage_4_duplicate_failed, reason=stage2_row_missing", async () => {
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE, stage2Row: null });

    const result = await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_duplicate_failed");
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect((peRow.args.decision_details as Record<string, unknown>).reason).toBe(
      "stage2_row_missing",
    );
  });

  it("D6: fr locale → notification payload.submitter_locale='fr'; unknown locale → 'en' fallback", async () => {
    const ticketFr = { ...TICKET_ROW_BASE, submitter_locale: "fr" };
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: ticketFr });

    await runDuplicateHandler(EVENT_BASE, {
      supabase,
      sendEvent,
      now: () => FIXED_NOW,
    });

    const notif = supabase._calls.notificationInserts[0];
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.submitter_locale).toBe("fr");

    // Unknown locale fallback
    const ticketUnknown = { ...TICKET_ROW_BASE, submitter_locale: "de" };
    const supabase2 = buildAdminMock({ ticketRow: ticketUnknown });
    await runDuplicateHandler(EVENT_BASE, {
      supabase: supabase2,
      sendEvent,
      now: () => FIXED_NOW,
    });
    const notif2 = supabase2._calls.notificationInserts[0];
    const payload2 = notif2.args.payload as Record<string, unknown>;
    expect(payload2.submitter_locale).toBe("en");
  });

  it("D7: zero Orq calls — production file contains ZERO fetch() calls (HANDLE-07)", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const prodPath = join(__dirname, "..", "duplicate-handler.ts");
    const src = readFileSync(prodPath, "utf8");
    const fetchCount = (src.match(/\bfetch\(/g) ?? []).length;
    expect(fetchCount).toBe(0);

    const orqCount = (src.match(/\/v3\/router\/responses/g) ?? []).length;
    expect(orqCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Inngest function id lock
// ---------------------------------------------------------------------------

describe("stage4SupportTicketsDuplicateHandler", () => {
  it("has locked function-id 'stage-4-support-tickets-duplicate-handler'", () => {
    // In Inngest v3+, createFunction returns an object where id is a method.
    const fn = stage4SupportTicketsDuplicateHandler as unknown as { id: () => string };
    expect(fn.id()).toBe("stage-4-support-tickets-duplicate-handler");
  });
});
