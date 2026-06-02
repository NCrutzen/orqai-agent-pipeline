// Plan 04-03 Task 1 — clarification-handler.ts tests (RED → GREEN).
//
// Tests the pure runner `runClarificationHandler(event, deps)`.
// The Inngest wrapper is a thin orchestrator — its function-id lock is
// asserted via the static structure check below.
//
// Mock strategy: chainable Supabase stub + injected deps (invokeOrqJson,
// sendEvent, now, supabase). All DB side-effects tracked in the mock's calls.
//
// SEVEN behaviors covered:
//   C1 - happy path: produces questions in submitter_locale (nl), writes notification
//   C2 - locale fallback I18N-02: 'de' → 'en', notification payload.locale='en'
//   C3 - attempt cap exceeded: attempt=5 → escalate event, no Orq call
//   C4 - quarantine defense-in-depth: pii_quarantine=true → no Orq call
//   C5 - Orq fails: decision='stage_4_clarification_failed', no notification
//   C6 - cost ceiling exceeded after Orq: STILL writes notification + _cost_ceiling_exceeded
//   C7 - bounded single-shot static check: exactly ONE fetch() call in production file

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

import {
  runClarificationHandler,
  stage4SupportTicketsClarificationHandler,
} from "../clarification-handler";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "clarification-needed" as const,
  completeness_verdict: "incomplete" as const,
};

const TICKET_ROW_NL = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  submitter_id: "user-1",
  submitter_locale: "nl",
  transcript: "Mijn PDF export werkt niet.",
  clarification_questions: null,
  attempt: 1,
  pii_quarantine: false,
  quarantine_state: null,
  stage2_cost_cents: 10,
  stage3_cost_cents: 8,
  handler_executed: null,
};

const ORQ_RESPONSE_NL = {
  questions: ["Welke browser gebruik je?", "Krijg je een foutmelding?"],
  locale_confirmed: "nl",
};

const FIXED_NOW = new Date("2026-06-02T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

type Inserted = { args: Record<string, unknown> };
type Updated = { args: Record<string, unknown>; id: string };

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  stage2Row?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as Inserted[],
    notificationInserts: [] as Inserted[],
    supportTicketsUpdates: [] as Updated[],
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
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              eq: (_c2: string, _v2: unknown) => ({
                in: (_c3: string, _v3: unknown) => ({
                  order: (_col: string, _opts: unknown) => ({
                    limit: (_n: number) => ({
                      maybeSingle: async () => ({
                        data: opts.stage2Row ?? null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }

      if (table === "support_notifications") {
        return {
          insert(args: Record<string, unknown>) {
            calls.notificationInserts.push({ args });
            return {
              select: (_cols: string) => ({
                single: async () => ({
                  data: { id: "notif-123" },
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

  return admin as unknown as Parameters<typeof runClarificationHandler>[1]["supabase"] & {
    _calls: typeof calls;
  };
}

// ---------------------------------------------------------------------------
// C1 — happy path: nl locale, 2 questions, notification written
// ---------------------------------------------------------------------------

describe("runClarificationHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("C1: happy path — produces questions in submitter_locale=nl, writes notification + pipeline_events", async () => {
    const invokeOrqJson = vi.fn().mockResolvedValue(ORQ_RESPONSE_NL);
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_NL });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 100,
    });

    expect(result.decision).toBe("stage_4_clarification");

    // notification inserted with nl locale
    const notif = supabase._calls.notificationInserts[0];
    expect(notif).toBeDefined();
    expect(notif.args.kind).toBe("clarification_request");
    const payload = notif.args.payload as Record<string, unknown>;
    expect(Array.isArray(payload.questions)).toBe(true);
    expect((payload.questions as string[]).length).toBe(2);
    expect(payload.locale).toBe("nl");

    // support_tickets updated
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update).toBeDefined();
    expect(update.args.handler_executed).toBe("clarification");
    expect(update.args.stage4_completed_at).toBeDefined();
    expect(typeof update.args.stage4_cost_cents).toBe("number");

    // pipeline_events row inserted at stage=4
    const peRow = supabase._calls.pipelineEventsInserts[0];
    expect(peRow.args.stage).toBe(4);
    expect(peRow.args.decision).toBe("stage_4_clarification");

    // Orq called EXACTLY once (HANDLE-07 bounded single-shot)
    expect(invokeOrqJson).toHaveBeenCalledTimes(1);

    // No Stage 5 trigger from this handler
    expect(sendEvent).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // C2 — locale fallback: 'de' → 'en' (I18N-02)
  // ---------------------------------------------------------------------------

  it("C2: locale fallback I18N-02 — 'de' (unknown) → 'en', notification payload.locale='en'", async () => {
    const ticketDe = { ...TICKET_ROW_NL, submitter_locale: "de" };
    const orqRespEn = { questions: ["What browser?"], locale_confirmed: "en" };
    const invokeOrqJson = vi.fn().mockResolvedValue(orqRespEn);
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: ticketDe });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 100,
    });

    // locale should be resolved to 'en'
    const notif = supabase._calls.notificationInserts[0];
    expect(notif).toBeDefined();
    const payload = notif.args.payload as Record<string, unknown>;
    expect(payload.locale).toBe("en");
    expect(payload.locale_input).toBe("de");
    expect(result.decision).toBe("stage_4_clarification");
  });

  // ---------------------------------------------------------------------------
  // C3 — attempt cap exceeded (attempt >= 5) → escalate, no Orq call
  // ---------------------------------------------------------------------------

  it("C3: attempt cap exceeded (attempt=5) → escalate event, no Orq call, no notification", async () => {
    const ticketAttempt5 = { ...TICKET_ROW_NL, attempt: 5 };
    const invokeOrqJson = vi.fn();
    const sendEvent = vi.fn().mockResolvedValue(undefined);
    const supabase = buildAdminMock({ ticketRow: ticketAttempt5 });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 100,
    });

    expect(result.decision).toBe("stage_4_clarification_attempt_cap_exceeded");
    expect(invokeOrqJson).not.toHaveBeenCalled();
    expect(supabase._calls.notificationInserts.length).toBe(0);
    expect(sendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "support-tickets/clickup-escalate.requested",
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // C4 — quarantine defense-in-depth
  // ---------------------------------------------------------------------------

  it("C4: pii_quarantine=true → no Orq call, no notification, decision=quarantine_blocked", async () => {
    const ticketQuarantined = { ...TICKET_ROW_NL, pii_quarantine: true };
    const invokeOrqJson = vi.fn();
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: ticketQuarantined });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 100,
    });

    expect(result.decision).toBe("stage_4_clarification_quarantine_blocked");
    expect(invokeOrqJson).not.toHaveBeenCalled();
    expect(supabase._calls.notificationInserts.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // C5 — Orq fails → decision='stage_4_clarification_failed', no notification
  // C6 comment added: C5 vs C6 distinction — C5 is an Orq infrastructure error
  // (network/HTTP/parse failure — we never got valid output). C6 is a cost
  // accounting signal: Orq succeeded and returned valid questions, but the
  // accumulated cost post-call crossed the ceiling. Different dispositions:
  //   C5: no questions exist → no notification. decision='_failed'.
  //   C6: questions exist (we paid for them) → write notification. decision='_cost_ceiling_exceeded'.
  // ---------------------------------------------------------------------------

  it("C5: Orq fails (throws) → decision=stage_4_clarification_failed, no notification", async () => {
    const orqError = Object.assign(new Error("orq_http_503"), { code: "orq_http_503" });
    const invokeOrqJson = vi.fn().mockRejectedValue(orqError);
    const sendEvent = vi.fn();
    const supabase = buildAdminMock({ ticketRow: TICKET_ROW_NL });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 100,
    });

    expect(result.decision).toBe("stage_4_clarification_failed");
    expect(supabase._calls.notificationInserts.length).toBe(0);

    // support_tickets should still update handler_executed + stage4_completed_at
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update).toBeDefined();
    expect(update.args.handler_executed).toBe("clarification");
    expect(update.args.stage4_completed_at).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // C6 — cost ceiling exceeded AFTER Orq → STILL writes notification
  // ---------------------------------------------------------------------------

  it("C6: cost ceiling exceeded after Orq → STILL writes notification, decision=_cost_ceiling_exceeded", async () => {
    // Set a very low ceiling so even a 1-cent Orq call exceeds total
    const ticketHighCost = {
      ...TICKET_ROW_NL,
      stage2_cost_cents: 30,
      stage3_cost_cents: 25,
    };
    const invokeOrqJson = vi.fn().mockResolvedValue(ORQ_RESPONSE_NL);
    const sendEvent = vi.fn();
    // ceiling = 50, stage2=30+stage3=25 already = 55 > 50 before stage4 cost
    const supabase = buildAdminMock({ ticketRow: ticketHighCost });

    const result = await runClarificationHandler(EVENT_BASE, {
      supabase,
      invokeOrqJson,
      sendEvent,
      now: () => FIXED_NOW,
      costCeilingCents: 50,
    });

    expect(result.decision).toBe("stage_4_clarification_cost_ceiling_exceeded");
    // Notification MUST still be written (questions exist, we paid)
    expect(supabase._calls.notificationInserts.length).toBeGreaterThan(0);
    // stage4_cost_cents should be persisted
    const update = supabase._calls.supportTicketsUpdates[0];
    expect(update.args.stage4_cost_cents).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // C7 — bounded single-shot HANDLE-07: exactly ONE fetch() call
  // ---------------------------------------------------------------------------

  it("C7: bounded single-shot — production file contains exactly ONE fetch() call (HANDLE-07)", () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const prodPath = join(
      __dirname,
      "..",
      "clarification-handler.ts",
    );
    const src = readFileSync(prodPath, "utf8");
    const fetchCount = (src.match(/\bfetch\(/g) ?? []).length;
    expect(fetchCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Inngest function id / event name lock
// ---------------------------------------------------------------------------

describe("stage4SupportTicketsClarificationHandler", () => {
  it("has locked function-id 'stage-4-support-tickets-clarification-handler'", () => {
    // In Inngest v3+, createFunction returns an object where id is a method.
    const fn = stage4SupportTicketsClarificationHandler as unknown as { id: () => string };
    expect(fn.id()).toBe("stage-4-support-tickets-clarification-handler");
  });
});
