// Phase 76 Plan 05 — GREEN tests for replayKanbanRow.
//
// D-01 branch coverage:
//   - same-intent → handler_event fired directly (NO override.submitted).
//   - edited-intent → debtor-email/override.submitted with axis=stage_3_intent.
//
// Threats covered:
//   - T-76-05-01 (T): unknown intent rejected (incl. injection-shaped strings).
//   - T-76-05-03 (S): unknown swarm rejected.
//   - T-76-05-04 (E/IDOR): compound filter on UPDATE.

import { describe, it, expect, vi, beforeEach } from "vitest";

const loadSwarmMock = vi.fn();
const loadSwarmIntentsMock = vi.fn();
const loadHandlerEventMock = vi.fn();
const sendMock = vi.fn();
const emitStaleMock = vi.fn();

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmIntents: (...args: unknown[]) => loadSwarmIntentsMock(...args),
  loadHandlerEvent: (...args: unknown[]) => loadHandlerEventMock(...args),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => sendMock(...args),
  },
}));

interface UpdateTrace {
  payload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
}

function makeAdminMock(updateResult: { data: unknown; error: unknown }): {
  admin: unknown;
  trace: UpdateTrace;
} {
  const trace: UpdateTrace = { payload: null, eqCalls: [] };
  const builder: Record<string, unknown> = {};
  builder.update = (payload: Record<string, unknown>) => {
    trace.payload = payload;
    return builder;
  };
  builder.eq = (col: string, val: unknown) => {
    trace.eqCalls.push({ col, val });
    return builder;
  };
  builder.select = (_cols: string) => Promise.resolve(updateResult);
  return { admin: { from: (_t: string) => builder }, trace };
}

let currentAdmin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

import { replayKanbanRow } from "../replay";

const VALID_INTENTS = [
  { swarm_type: "debtor-email", intent_key: "address_change", handler_event: "debtor-email/address-change.requested", handler_status: "registered" },
  { swarm_type: "debtor-email", intent_key: "credit_request", handler_event: "debtor-email/credit-request.requested", handler_status: "placeholder" },
  { swarm_type: "debtor-email", intent_key: "general_inquiry", handler_event: "debtor-email/general-inquiry.requested", handler_status: "registered" },
];

describe("Phase 76: replayKanbanRow Server Action", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
    loadSwarmIntentsMock.mockReset();
    loadHandlerEventMock.mockReset();
    sendMock.mockReset();
    emitStaleMock.mockReset();
    sendMock.mockResolvedValue({ ids: ["evt-1"] });
    emitStaleMock.mockResolvedValue(undefined);
  });

  it("rejects when args missing", async () => {
    const res = await replayKanbanRow({
      kanbanRowId: "",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "general_inquiry",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "missing args" });
  });

  it("T-76-05-03: rejects unknown swarm", async () => {
    loadSwarmMock.mockResolvedValueOnce(null);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;
    const res = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "bogus",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "general_inquiry",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "unknown swarm" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("T-76-05-01: rejects unknown intent (typo or injection-shaped)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;

    const res1 = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "not_in_registry",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res1).toEqual({ ok: false, error: "unknown intent" });

    const res2 = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "'; DROP TABLE swarm_intents--",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res2).toEqual({ ok: false, error: "unknown intent" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("D-01 same-intent: fires handler_event directly (NO override.submitted)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    loadHandlerEventMock.mockResolvedValue("debtor-email/general-inquiry.requested");
    const { admin, trace } = makeAdminMock({ data: [{ id: "row-1" }], error: null });
    currentAdmin = admin;

    const res = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "general_inquiry",
      originalEventId: "ev-3",
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: true, mode: "same-intent" });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "debtor-email/general-inquiry.requested",
        data: expect.objectContaining({
          email_id: "email-1",
          swarm_type: "debtor-email",
          triggered_by: "operator-replay-same-intent",
        }),
      }),
    );
    // Critical: NO override.submitted in same-intent path.
    const sentNames = sendMock.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(sentNames).not.toContain("debtor-email/override.submitted");
    // Compound filter on UPDATE.
    expect(trace.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "id", val: "row-1" },
        { col: "swarm_type", val: "debtor-email" },
        { col: "status", val: "pending" },
      ]),
    );
    expect(emitStaleMock).toHaveBeenCalledWith(admin, "debtor-email-kanban");
  });

  it("D-01 same-intent: returns no handler_event when registry resolves to null", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    loadHandlerEventMock.mockResolvedValue(null);
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;

    const res = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "general_inquiry",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "no handler_event" });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("D-01 edited-intent: emits debtor-email/override.submitted with axis=stage_3_intent", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    const { admin } = makeAdminMock({ data: [{ id: "row-1" }], error: null });
    currentAdmin = admin;

    const res = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "address_change",
      originalEventId: "ev-3",
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: true, mode: "edited-intent" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "debtor-email/override.submitted",
        data: expect.objectContaining({
          axis: "stage_3_intent",
          email_id: "email-1",
          original_event_id: "ev-3",
          original_decision: "general_inquiry",
          decision: "address_change",
          decision_details: { intent_key: "address_change" },
          eval_type: "capability",
          operator_id: "op-1",
        }),
      }),
    );
    expect(loadHandlerEventMock).not.toHaveBeenCalled();
  });

  it("R-4 edited-intent → placeholder intent: still emits override.submitted (gap documented)", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    currentAdmin = makeAdminMock({ data: [{ id: "row-1" }], error: null }).admin;

    const res = await replayKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "credit_request", // handler_status='placeholder' in fixture
      originalEventId: "ev-3",
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: true, mode: "edited-intent" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "debtor-email/override.submitted",
        data: expect.objectContaining({ axis: "stage_3_intent", decision: "credit_request" }),
      }),
    );
  });

  it("T-76-05-04 IDOR: cross-swarm row UPDATE matches 0 rows → { ok:false }", async () => {
    loadSwarmMock.mockResolvedValue({ swarm_type: "debtor-email" });
    loadSwarmIntentsMock.mockResolvedValue(VALID_INTENTS);
    loadHandlerEventMock.mockResolvedValue("debtor-email/general-inquiry.requested");
    currentAdmin = makeAdminMock({ data: [], error: null }).admin;

    const res = await replayKanbanRow({
      kanbanRowId: "sales-row-x",
      swarmType: "debtor-email",
      emailId: "email-1",
      originalIntent: "general_inquiry",
      chosenIntent: "general_inquiry",
      originalEventId: null,
      operatorId: "op-1",
    });
    expect(res).toEqual({ ok: false, error: "row not found or already closed" });
  });
});
