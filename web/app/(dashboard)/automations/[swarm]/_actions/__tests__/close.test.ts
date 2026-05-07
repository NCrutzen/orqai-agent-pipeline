// Phase 76 Plan 05 — GREEN tests for closeKanbanRow.
//
// Threats covered:
//   - T-76-05-03 (Spoofing): unknown swarmType → action rejects.
//   - T-76-05-04 (IDOR): rowId belongs to a different swarm_type → compound
//     filter matches 0 rows → action returns { ok:false }.
//
// Mocks:
//   - @/lib/swarms/registry: loadSwarm
//   - @/lib/supabase/admin: createAdminClient (returns a mock supabase)
//   - @/lib/automations/runs/emit: emitAutomationRunStale
//
// We capture the eq-chain on the UPDATE so we can assert the compound filter.

import { describe, it, expect, vi, beforeEach } from "vitest";

const loadSwarmMock = vi.fn();
const emitStaleMock = vi.fn();

vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
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
  const admin = {
    from: (_table: string) => builder,
  };
  return { admin, trace };
}

let currentAdmin: unknown = null;
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

import { closeKanbanRow } from "../close";

describe("Phase 76: closeKanbanRow Server Action", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
    emitStaleMock.mockReset();
    emitStaleMock.mockResolvedValue(undefined);
  });

  it("rejects when args missing", async () => {
    const res1 = await closeKanbanRow({ kanbanRowId: "", swarmType: "debtor-email" });
    expect(res1).toEqual({ ok: false, error: "missing args" });
    const res2 = await closeKanbanRow({ kanbanRowId: "row-1", swarmType: "" });
    expect(res2).toEqual({ ok: false, error: "missing args" });
  });

  it("T-76-05-03: rejects unknown swarm (registry miss)", async () => {
    loadSwarmMock.mockResolvedValueOnce(null);
    const { admin } = makeAdminMock({ data: [], error: null });
    currentAdmin = admin;
    const res = await closeKanbanRow({ kanbanRowId: "row-1", swarmType: "bogus" });
    expect(res).toEqual({ ok: false, error: "unknown swarm" });
    expect(loadSwarmMock).toHaveBeenCalledWith(admin, "bogus");
    expect(emitStaleMock).not.toHaveBeenCalled();
  });

  it("happy path: UPDATEs status='completed' with compound filter and emits broadcast", async () => {
    loadSwarmMock.mockResolvedValueOnce({ swarm_type: "debtor-email" });
    const { admin, trace } = makeAdminMock({ data: [{ id: "row-1" }], error: null });
    currentAdmin = admin;
    const res = await closeKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
    });
    expect(res).toEqual({ ok: true });
    // Compound filter: id, swarm_type, status='pending'
    expect(trace.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "id", val: "row-1" },
        { col: "swarm_type", val: "debtor-email" },
        { col: "status", val: "pending" },
      ]),
    );
    expect(trace.payload).toMatchObject({ status: "completed" });
    expect(emitStaleMock).toHaveBeenCalledWith(admin, "debtor-email-kanban");
  });

  it("T-76-05-04 IDOR: cross-swarm rowId returns no rows → { ok:false }", async () => {
    loadSwarmMock.mockResolvedValueOnce({ swarm_type: "debtor-email" });
    const { admin } = makeAdminMock({ data: [], error: null });
    currentAdmin = admin;
    const res = await closeKanbanRow({
      kanbanRowId: "sales-row-1", // belongs to sales-email
      swarmType: "debtor-email",
    });
    expect(res).toEqual({ ok: false, error: "row not found or already closed" });
    expect(emitStaleMock).not.toHaveBeenCalled();
  });

  it("propagates supabase update error", async () => {
    loadSwarmMock.mockResolvedValueOnce({ swarm_type: "debtor-email" });
    const { admin } = makeAdminMock({ data: null, error: { message: "db boom" } });
    currentAdmin = admin;
    const res = await closeKanbanRow({
      kanbanRowId: "row-1",
      swarmType: "debtor-email",
    });
    expect(res).toEqual({ ok: false, error: "db boom" });
    expect(emitStaleMock).not.toHaveBeenCalled();
  });
});
