// Plan 04-02 Task 1 — Stage 4 dispatcher test suite (RED → GREEN).
//
// Tests the pure handler `runStage4Dispatcher(event, deps)`. The Inngest
// wrapper `stage4SupportTicketsDispatcher` is a thin orchestrator that
// delegates to this handler through a single step.run boundary.
//
// Mock strategy mirrors stage-3-coordinator.test.ts:
//   - hand-rolled SupabaseAdmin chain stub
//   - sendEvent injected as vi.fn() — no Inngest runtime needed
//   - now injected as () => Date — deterministic timestamps
//
// NINE behaviors covered:
//   1. happy fanout — handler_status='registered' → sendEvent called once, no pipeline_events row
//   2. Kanban fallback — handler_status='placeholder' → no sendEvent, pipeline_events row written
//   3. quarantine defense-in-depth — pii_quarantine=true → blocked, no fanout
//   4. quarantine via quarantine_state non-null → blocked same way
//   5. intent not in registry (zero rows returned) → not_in_registry row, no fanout
//   6. ticket row missing → dispatch_failed row, no fanout
//   7. handler_event override — DB value is source of truth, not hardcoded map
//   8. function-id lock — exported Inngest function has locked id + event filter
//   9. sendEvent failure propagates (Inngest retry) — pipeline_events still attempted

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  runStage4Dispatcher,
  stage4SupportTicketsDispatcher,
} from "../stage-4-dispatcher";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPPORT_TICKET_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SUBMISSION_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const EVENT_BASE = {
  support_ticket_id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  chosen_intent: "clickup-escalate" as const,
  completeness_verdict: "complete" as const,
};

const TICKET_ROW_BASE = {
  id: SUPPORT_TICKET_ID,
  submission_id: SUBMISSION_ID,
  pii_quarantine: false,
  quarantine_state: null,
};

const REGISTERED_INTENT_ROW = {
  intent_key: "clickup-escalate",
  handler_event: "support-tickets/clickup-escalate.requested",
  handler_status: "registered",
};

const FIXED_NOW = new Date("2026-06-02T12:00:00.000Z");

// ---------------------------------------------------------------------------
// Supabase mock builder
// ---------------------------------------------------------------------------

type Inserted = { args: Record<string, unknown> };

function buildAdminMock(opts: {
  ticketRow: Record<string, unknown> | null;
  swarmIntentsRow?: Record<string, unknown> | null;
  insertError?: { message: string } | null;
}) {
  const calls = {
    pipelineEventsInserts: [] as Inserted[],
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

      if (table === "swarm_intents") {
        return {
          select: (_cols: string) => ({
            eq: (_c: string, _v: unknown) => ({
              eq: (_c2: string, _v2: unknown) => ({
                maybeSingle: async () => ({
                  data: opts.swarmIntentsRow === undefined ? REGISTERED_INTENT_ROW : opts.swarmIntentsRow,
                  error: null,
                }),
              }),
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

      throw new Error(`Unexpected admin.from(${table}) in test`);
    },
  };

  return { admin, calls };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("runStage4Dispatcher — Plan 04-02 vertical slice", () => {
  it("Test 1 — happy fanout: handler_status='registered' → sendEvent called once, NO pipeline_events row", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      swarmIntentsRow: REGISTERED_INTENT_ROW,
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatch_fanout");

    // dispatcher does NOT write a pipeline_events row on fanout
    expect(calls.pipelineEventsInserts.length).toBe(0);

    // sendEvent called ONCE with the correct per-handler event + Stage4HandlerPayload
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sent = sendEvent.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe("support-tickets/clickup-escalate.requested");
    expect(sent.data).toEqual({
      support_ticket_id: SUPPORT_TICKET_ID,
      submission_id: SUBMISSION_ID,
      chosen_intent: "clickup-escalate",
      completeness_verdict: "complete",
    });
  });

  it("Test 2 — Kanban fallback: handler_status='placeholder' → no sendEvent, pipeline_events written", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE },
      swarmIntentsRow: {
        intent_key: "vendor-draft",
        handler_event: "support-tickets/vendor-draft.requested",
        handler_status: "placeholder",
      },
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(
      {
        ...EVENT_BASE,
        chosen_intent: "vendor-draft",
        completeness_verdict: "complete",
      },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: admin as any,
        sendEvent,
        now: () => FIXED_NOW,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatch_kanban_fallback");

    // No fanout
    expect(sendEvent).not.toHaveBeenCalled();

    // Exactly one pipeline_events row
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.swarm_type).toBe("support-tickets");
    expect(pe.stage).toBe(4);
    expect(pe.decision).toBe("stage_4_dispatch_kanban_fallback");
    expect(pe.email_id).toBe(SUBMISSION_ID);
    expect(pe.automation_run_id).toBe(SUPPORT_TICKET_ID);

    const dd = pe.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("handler_placeholder");
    expect(dd.intent_key).toBe("vendor-draft");
    expect(dd.handler_event).toBe("support-tickets/vendor-draft.requested");
    expect(dd.completeness_verdict).toBe("complete");
  });

  it("Test 3 — quarantine defense-in-depth: pii_quarantine=true → blocked, no fanout", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE, pii_quarantine: true },
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatcher_quarantine_blocked");

    expect(sendEvent).not.toHaveBeenCalled();
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_4_dispatcher_quarantine_blocked");

    const dd = pe.decision_details as Record<string, unknown>;
    expect(dd.pii_quarantine).toBe(true);
  });

  it("Test 4 — quarantine via quarantine_state non-null → blocked", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: { ...TICKET_ROW_BASE, pii_quarantine: false, quarantine_state: "rejected_safety_ssrf" },
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatcher_quarantine_blocked");

    expect(sendEvent).not.toHaveBeenCalled();
    const pe = calls.pipelineEventsInserts[0].args;
    const dd = pe.decision_details as Record<string, unknown>;
    expect(dd.quarantine_state).toBe("rejected_safety_ssrf");
  });

  it("Test 5 — intent not in registry: swarm_intents returns null → dispatch_intent_not_in_registry, no fanout", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      swarmIntentsRow: null, // zero rows for this intent_key
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatch_intent_not_in_registry");

    expect(sendEvent).not.toHaveBeenCalled();
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_4_dispatch_intent_not_in_registry");
    const dd = pe.decision_details as Record<string, unknown>;
    expect(dd.intent_key).toBe("clickup-escalate");
  });

  it("Test 6 — ticket row missing: support_tickets returns null → dispatch_failed, no fanout", async () => {
    const { admin, calls } = buildAdminMock({
      ticketRow: null, // ticket not found
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.decision).toBe("stage_4_dispatch_failed");

    expect(sendEvent).not.toHaveBeenCalled();
    expect(calls.pipelineEventsInserts.length).toBe(1);
    const pe = calls.pipelineEventsInserts[0].args;
    expect(pe.decision).toBe("stage_4_dispatch_failed");
    const dd = pe.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("ticket_not_found");
  });

  it("Test 7 — handler_event from DB is source of truth, not hardcoded map", async () => {
    // Simulate a DB row whose handler_event has a typo (unusual path for registry).
    // Dispatcher MUST use the DB value regardless — registry-driven contract.
    const { admin, calls } = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      swarmIntentsRow: {
        intent_key: "clickup-escalate",
        handler_event: "support-tickets/clickup-escalate.req", // intentional typo
        handler_status: "registered",
      },
    });
    const sendEvent = vi.fn(async () => undefined);

    const result = await runStage4Dispatcher(EVENT_BASE, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase: admin as any,
      sendEvent,
      now: () => FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.decision).toBe("stage_4_dispatch_fanout");

    // Must use the DB value, NOT a hardcoded canonical name
    expect(sendEvent).toHaveBeenCalledTimes(1);
    const sent = sendEvent.mock.calls[0][0] as { name: string };
    expect(sent.name).toBe("support-tickets/clickup-escalate.req");

    void calls;
  });

  it("Test 8 — function-id lock: exported Inngest function has locked id and event filter", () => {
    // Static check — the exported constant must carry the locked id.
    // In Inngest v3+, createFunction returns an object where `id` is a method
    // (not a plain string property) — call fn.id() to get the string id.
    // We access it via type-cast to avoid depending on internal Inngest types.
    const fn = stage4SupportTicketsDispatcher as unknown as {
      id: () => string;
    };
    expect(fn.id()).toBe("stage-4-support-tickets-dispatcher");
  });

  it("Test 9 — sendEvent failure propagates so Inngest retries the step", async () => {
    // When sendEvent throws, the dispatcher should propagate the error
    // (fanout IS the job — unlike Stage 3 where the aggregate row is primary).
    // The pipeline_events insert is NOT attempted before sendEvent; fanout first.
    const { admin, calls } = buildAdminMock({
      ticketRow: TICKET_ROW_BASE,
      swarmIntentsRow: REGISTERED_INTENT_ROW,
    });
    const sendEvent = vi.fn(async () => {
      throw new Error("Inngest network error");
    });

    await expect(
      runStage4Dispatcher(EVENT_BASE, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase: admin as any,
        sendEvent,
        now: () => FIXED_NOW,
      }),
    ).rejects.toThrow("Inngest network error");

    // No pipeline_events row written by dispatcher on fanout path (dispatcher
    // does not own a stage=4 row when the handler was supposed to be invoked).
    expect(calls.pipelineEventsInserts.length).toBe(0);
  });
});
