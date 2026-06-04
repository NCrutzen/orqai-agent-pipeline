// Plan 04-04 Task 1 — info-answer-handler.ts tests (RED → GREEN).
//
// Tests the pure runner `runInfoAnswerHandler(event, deps)`.
//
// NINE behaviors covered:
//   I1 - happy path: submitter_locale='en', similar_tickets present, Orq returns high confidence answer
//   I2 - no grounding (empty similar_tickets): no Orq call, escalate to clickup-escalate
//   I3 - short citations (< 20 chars) → Orq still called, confidence='low', decision_details.short_citations=true
//   I4 - locale fallback: 'es' → resolveSubmitterLocale → 'en', locale_input='es'
//   I5 - quarantine defense-in-depth: pii_quarantine=true → blocked, no Orq, no notification
//   I6 - Orq fails: fetch throws → decision=stage_4_info_answer_failed, no notification, handler_executed set
//   I7 - cost ceiling exceeded: notification STILL written, decision=stage_4_info_answer_cost_ceiling_exceeded
//   I8 - Orq hallucinates cited_ticket_ids → confidence='low', decision_details.cited_ticket_ids_hallucinated=true
//   I9 - HANDLE-07 bounded single-shot: grep "fetch(" == 1 in production file

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  runInfoAnswerHandler,
  stage4SupportTicketsInfoAnswerHandler,
} from "../info-answer-handler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "info-answer" as const,
  completeness_verdict: "complete" as const,
};

const TICKET_ROW_BASE = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "en",
  transcript: "How do I export invoices from the system?",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: null,
};

const SIMILAR_TICKET_1 = {
  ticket_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  source_key: "CU-11111",
  cosine_distance: 0.07,
  summary_text: "PDF export from iController",
  resolution_text: "To export invoices, go to Reports > Export > PDF and pick a date range then click Export.",
  final_intent: "info-answer",
  final_system: "icontroller",
};

const SIMILAR_TICKET_2 = {
  ticket_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  source_key: "CU-22222",
  cosine_distance: 0.09,
  summary_text: "Invoice download guide",
  resolution_text: "Navigate to Finance > Invoices > Download. Select date range and click Download CSV or PDF.",
  final_intent: "info-answer",
  final_system: "icontroller",
};

const STAGE2_ROW_WITH_SIMILAR = {
  decision_details: {
    similar_tickets: [SIMILAR_TICKET_1, SIMILAR_TICKET_2],
    prior_tickets_same_user: [],
    prior_tickets_same_system: [],
    prior_clarifications: [],
    context_version: "1.0.0",
  },
};

const STAGE2_ROW_EMPTY_SIMILAR = {
  decision_details: {
    similar_tickets: [],
    prior_tickets_same_user: [],
    prior_tickets_same_system: [],
    prior_clarifications: [],
    context_version: "1.0.0",
  },
};

const ORQ_HAPPY_RESPONSE = {
  answer: "To export invoices, go to Reports > Export > PDF and pick a date range.",
  cited_ticket_ids: ["cccccccc-cccc-cccc-cccc-cccccccccccc", "dddddddd-dddd-dddd-dddd-dddddddddddd"],
  locale_confirmed: "en" as const,
  confidence: "high" as const,
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
  };

  const stage2RowResolved =
    opts.stage2Row === "default" || opts.stage2Row === undefined
      ? STAGE2_ROW_WITH_SIMILAR
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
                  data: { id: "notif-info-1" },
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

  return admin as unknown as Parameters<typeof runInfoAnswerHandler>[1]["supabase"] & {
    _calls: typeof calls;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runInfoAnswerHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("I1: happy path — Orq returns high confidence answer, notification kind=info_answer written, no Stage 5 event, outbound_clickup_task_id=null", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const invokeOrqJson = vi.fn().mockResolvedValue(ORQ_HAPPY_RESPONSE);
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_info_answer");

    // Notification written
    const notif = supabase._calls.notificationInserts[0];
    expect(notif).toBeDefined();
    expect(notif.args.kind).toBe("info_answer");
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.answer).toBe(ORQ_HAPPY_RESPONSE.answer);
    expect(payload.submitter_locale).toBe("en");
    expect(payload.cited_ticket_ids).toEqual(ORQ_HAPPY_RESPONSE.cited_ticket_ids);
    expect(payload.citation_count).toBe(2);

    // support_tickets updated
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.handler_executed).toBe("info-answer");
    expect(update.args.outbound_clickup_task_id).toBeNull();
    expect(update.args.stage4_cost_cents).toBeGreaterThan(0);
    expect(update.args.stage4_completed_at).toBeDefined();

    // pipeline_events row
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.stage).toBe(4);
    expect(peRow.args.decision).toBe("stage_4_info_answer");

    // No escalation event fired
    expect(sendEvent).not.toHaveBeenCalled();

    // Orq called exactly once
    expect(invokeOrqJson).toHaveBeenCalledTimes(1);
  });

  it("I2: empty similar_tickets → no Orq call, escalate to clickup-escalate, decision=stage_4_info_answer_no_grounding", async () => {
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const invokeOrqJson = vi.fn();
    const supabase = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      stage2Row: STAGE2_ROW_EMPTY_SIMILAR,
    });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_info_answer_no_grounding");

    // No Orq call
    expect(invokeOrqJson).not.toHaveBeenCalled();

    // Escalation event fired
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "support-tickets/clickup-escalate.requested",
      }),
    );

    // No notification
    expect(supabase._calls.notificationInserts.length).toBe(0);

    // handler_executed set
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.handler_executed).toBe("info-answer");

    // pipeline_events written
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.decision).toBe("stage_4_info_answer_no_grounding");
    const dd = peRow.args.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("similar_tickets_empty");
    expect(dd.escalated_to).toBe("clickup-escalate");
  });

  it("I3: short citations (resolution_text < 20 chars) → Orq called, confidence='low', decision_details.short_citations=true", async () => {
    const shortSimilarTicket = {
      ...SIMILAR_TICKET_1,
      resolution_text: "See docs.", // < 20 chars
    };
    const stage2WithShort = {
      decision_details: {
        similar_tickets: [shortSimilarTicket],
        prior_tickets_same_user: [],
        prior_tickets_same_system: [],
        prior_clarifications: [],
        context_version: "1.0.0",
      },
    };
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn().mockResolvedValue({
      ...ORQ_HAPPY_RESPONSE,
      cited_ticket_ids: [shortSimilarTicket.ticket_id],
      confidence: "high" as const, // Orq says high, but we downgrade
    });
    const supabase = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      stage2Row: stage2WithShort,
    });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_info_answer");

    // Orq was called
    expect(invokeOrqJson).toHaveBeenCalledTimes(1);

    // Notification payload confidence='low'
    const notif = supabase._calls.notificationInserts[0];
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.confidence).toBe("low");

    // pipeline_events decision_details.short_citations=true
    const peRow = supabase._calls.pipelineEventsInserts[0];
    const dd = peRow.args.decision_details as Record<string, unknown>;
    expect(dd.short_citations).toBe(true);
  });

  it("I4: locale fallback — submitter_locale='es' (unknown) → resolved='en', payload.locale_input='es', payload.submitter_locale='en'", async () => {
    const ticketEs = { ...TICKET_ROW_BASE, submitter_locale: "es" };
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn().mockResolvedValue({
      ...ORQ_HAPPY_RESPONSE,
      locale_confirmed: "en" as const,
    });
    const supabase = buildAdminMock({ ticketRow: ticketEs });

    await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    const notif = supabase._calls.notificationInserts[0];
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.submitter_locale).toBe("en");
    expect(payload.locale_input).toBe("es");

    // Verify Orq was instructed with resolved locale
    const orqCallArgs = invokeOrqJson.mock.calls[0][0] as { body: Record<string, unknown> };
    const inputText = JSON.parse(
      ((orqCallArgs.body.input as { role: string; content: { type: string; text: string }[] }[])[0]
        .content[0] as { text: string }).text,
    ) as { submitter_locale: string };
    expect(inputText.submitter_locale).toBe("en");
  });

  it("I5: pii_quarantine=true → decision=stage_4_info_answer_quarantine_blocked, no Orq, no notification", async () => {
    const ticketQuarantined = { ...TICKET_ROW_BASE, pii_quarantine: true };
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn();
    const supabase = buildAdminMock({ ticketRow: ticketQuarantined });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_info_answer_quarantine_blocked");
    expect(invokeOrqJson).not.toHaveBeenCalled();
    expect(supabase._calls.notificationInserts.length).toBe(0);

    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.decision).toBe("stage_4_info_answer_quarantine_blocked");
  });

  it("I6: Orq fails (fetch throws) → decision=stage_4_info_answer_failed, no notification, handler_executed + stage4_completed_at still persisted", async () => {
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn().mockRejectedValue(
      Object.assign(new Error("orq_request_failed"), { code: "orq_request_failed" }),
    );
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.decision).toBe("stage_4_info_answer_failed");

    // No notification
    expect(supabase._calls.notificationInserts.length).toBe(0);

    // handler_executed + stage4_completed_at still set
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.handler_executed).toBe("info-answer");
    expect(update.args.stage4_completed_at).toBeDefined();

    // pipeline_events with reason
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.decision).toBe("stage_4_info_answer_failed");
    const dd = peRow.args.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("orq_request_failed");
  });

  it("I7: cost ceiling exceeded → notification STILL written, decision=stage_4_info_answer_cost_ceiling_exceeded", async () => {
    // stage2+stage3 cost already high to exceed ceiling with any stage4 cost
    const expensiveTicket = {
      ...TICKET_ROW_BASE,
      stage2_cost_cents: 30,
      stage3_cost_cents: 25,
    };
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn().mockResolvedValue(ORQ_HAPPY_RESPONSE);
    const supabase = buildAdminMock({ ticketRow: expensiveTicket });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 50, // low ceiling: 30+25+any_stage4 > 50
    });

    expect(result.decision).toBe("stage_4_info_answer_cost_ceiling_exceeded");

    // Notification STILL written (T-04-04-06 mitigation)
    expect(supabase._calls.notificationInserts.length).toBe(1);

    // stage4_cost_cents persisted
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.stage4_cost_cents).toBeGreaterThanOrEqual(0);
  });

  it("I8: Orq returns hallucinated cited_ticket_ids (not in similar_tickets) → confidence='low', decision_details.cited_ticket_ids_hallucinated=true", async () => {
    const sendEvent = vi.fn();
    const invokeOrqJson = vi.fn().mockResolvedValue({
      answer: "Here is the answer based on our knowledge base.",
      cited_ticket_ids: ["unknown-uuid-hallucinated"],
      locale_confirmed: "en" as const,
      confidence: "high" as const,
    });
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_BASE });

    const result = await runInfoAnswerHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
    });

    // decision is still stage_4_info_answer (notification still sent, just degraded)
    expect(result.decision).toBe("stage_4_info_answer");

    // Notification with confidence='low'
    const notif = supabase._calls.notificationInserts[0];
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.confidence).toBe("low");

    // pipeline_events.decision_details has hallucination flag
    const peRow = supabase._calls.pipelineEventsInserts[0];
    const dd = peRow.args.decision_details as Record<string, unknown>;
    expect(dd.cited_ticket_ids_hallucinated).toBe(true);
  });

  it("I9: HANDLE-07 bounded single-shot — production file contains EXACTLY 1 fetch() call", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const prodPath = join(__dirname, "..", "info-answer-handler.ts");
    const src = readFileSync(prodPath, "utf8");
    const fetchCount = (src.match(/\bfetch\(/g) ?? []).length;
    expect(fetchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Inngest function id lock
// ---------------------------------------------------------------------------

describe("stage4SupportTicketsInfoAnswerHandler", () => {
  it("has locked function-id 'stage-4-support-tickets-info-answer-handler'", () => {
    const fn = stage4SupportTicketsInfoAnswerHandler as unknown as { id: () => string };
    expect(fn.id()).toBe("stage-4-support-tickets-info-answer-handler");
  });
});
