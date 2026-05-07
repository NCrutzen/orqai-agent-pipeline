// Phase 76 Plan 05 — GREEN tests for loadKanbanRows.
//
// Locks (per Plan 76-05):
//   - SELECT shape on automation_runs: status='pending' AND
//     result->>'kanban_reason' IS NOT NULL filtered by swarm_type, ordered
//     by created_at DESC, limit 500.
//   - pipeline_events join is W4-deterministic: ordered by created_at DESC
//     and Map.set is gated by `if (!has(...))` (first-write-wins). Newest
//     emit per (email_id, stage) wins regardless of how many rows exist.
//   - When no email_ids are present in the result rows, the loader skips
//     the pipeline_events lookup entirely.

import { describe, it, expect, vi } from "vitest";
import { loadKanbanRows } from "../kanban-loader";

interface BuilderTrace {
  table: string;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  notCalls: Array<{ col: string; op: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts: unknown }>;
  inCalls: Array<{ col: string; vals: unknown[] }>;
  limit: number | null;
}

function makeBuilder(
  trace: BuilderTrace,
  resolveValue: { data: unknown; error: unknown },
): {
  select: (cols: string) => unknown;
  then: (cb: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
} {
  const b: Record<string, unknown> = {};
  b.select = (cols: string) => {
    trace.selectCols = cols;
    return b;
  };
  b.eq = (col: string, val: unknown) => {
    trace.eqCalls.push({ col, val });
    return b;
  };
  b.not = (col: string, op: string, val: unknown) => {
    trace.notCalls.push({ col, op, val });
    return b;
  };
  b.order = (col: string, opts: unknown) => {
    trace.orderCalls.push({ col, opts });
    return b;
  };
  b.in = (col: string, vals: unknown[]) => {
    trace.inCalls.push({ col, vals });
    return b;
  };
  b.limit = (n: number) => {
    trace.limit = n;
    return b;
  };
  // Promise-like — await b resolves to resolveValue.
  b.then = (cb: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(cb(resolveValue));
  return b as unknown as {
    select: (cols: string) => unknown;
    then: (cb: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
  };
}

function makeAdmin(
  resolveByTable: Record<string, { data: unknown; error: unknown }>,
): {
  admin: { from: (t: string) => unknown };
  traces: BuilderTrace[];
} {
  const traces: BuilderTrace[] = [];
  const admin = {
    from: (table: string) => {
      const trace: BuilderTrace = {
        table,
        selectCols: null,
        eqCalls: [],
        notCalls: [],
        orderCalls: [],
        inCalls: [],
        limit: null,
      };
      traces.push(trace);
      return makeBuilder(trace, resolveByTable[table] ?? { data: [], error: null });
    },
  };
  return { admin, traces };
}

describe("Phase 76: loadKanbanRows", () => {
  it("SELECT shape: status='pending' AND result->>'kanban_reason' IS NOT NULL filtered by swarm_type", async () => {
    const { admin, traces } = makeAdmin({
      automation_runs: {
        data: [
          {
            id: "row-A",
            swarm_type: "debtor-email",
            topic: "address_change",
            entity: "smeba",
            created_at: "2026-05-07T10:00:00Z",
            result: { kanban_reason: "no_handler", email_id: "email-1" },
          },
          {
            id: "row-B",
            swarm_type: "debtor-email",
            topic: "general_inquiry",
            entity: "smeba",
            created_at: "2026-05-07T09:00:00Z",
            result: { kanban_reason: "low_confidence", email_id: "email-2" },
          },
        ],
        error: null,
      },
      pipeline_events: { data: [], error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadKanbanRows(admin as any, "debtor-email");
    expect(rows).toHaveLength(2);
    const arTrace = traces.find((t) => t.table === "automation_runs")!;
    expect(arTrace.eqCalls).toEqual(
      expect.arrayContaining([
        { col: "swarm_type", val: "debtor-email" },
        { col: "status", val: "pending" },
      ]),
    );
    expect(arTrace.notCalls).toEqual([
      { col: "result->>kanban_reason", op: "is", val: null },
    ]);
    expect(arTrace.orderCalls[0]).toEqual({
      col: "created_at",
      opts: expect.objectContaining({ ascending: false }),
    });
    expect(arTrace.limit).toBe(500);
  });

  it("W4: pipeline_events lookup is ordered DESC by created_at (deterministic event_id surfacing)", async () => {
    const { admin, traces } = makeAdmin({
      automation_runs: {
        data: [
          {
            id: "row-A",
            swarm_type: "debtor-email",
            topic: null,
            entity: null,
            created_at: "2026-05-07T10:00:00Z",
            result: { kanban_reason: "no_handler", email_id: "email-1" },
          },
        ],
        error: null,
      },
      pipeline_events: { data: [], error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await loadKanbanRows(admin as any, "debtor-email");
    const peTrace = traces.find((t) => t.table === "pipeline_events")!;
    expect(peTrace.orderCalls).toContainEqual(
      expect.objectContaining({
        col: "created_at",
        opts: expect.objectContaining({ ascending: false }),
      }),
    );
    expect(peTrace.inCalls).toEqual(
      expect.arrayContaining([
        { col: "email_id", vals: ["email-1"] },
        { col: "stage", vals: [1, 3] },
      ]),
    );
  });

  it("W4: first-write-wins — most recent stage_1 event wins when multiple exist for same email_id", async () => {
    // Loader uses ORDER BY created_at DESC, so the events arrive newest-first.
    // The Map.set guard `if (!stage1Map.has(...))` then keeps only the FIRST
    // (= newest) hit. If the guard is missing (bare Map.set), the LAST hit
    // (= oldest) would overwrite it and this test would fail.
    const { admin } = makeAdmin({
      automation_runs: {
        data: [
          {
            id: "row-A",
            swarm_type: "debtor-email",
            topic: null,
            entity: null,
            created_at: "2026-05-07T10:00:00Z",
            result: { kanban_reason: "no_handler", email_id: "email-1" },
          },
        ],
        error: null,
      },
      pipeline_events: {
        data: [
          // Newest first (ORDER BY created_at DESC).
          { id: "ev-newest", email_id: "email-1", stage: 1, created_at: "2026-05-07T09:00:00Z" },
          { id: "ev-older", email_id: "email-1", stage: 1, created_at: "2026-05-07T08:00:00Z" },
          { id: "ev-stage3-newest", email_id: "email-1", stage: 3, created_at: "2026-05-07T09:30:00Z" },
          { id: "ev-stage3-older", email_id: "email-1", stage: 3, created_at: "2026-05-07T08:30:00Z" },
        ],
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadKanbanRows(admin as any, "debtor-email");
    expect(rows[0].stage_1_event_id).toBe("ev-newest");
    expect(rows[0].stage_3_event_id).toBe("ev-stage3-newest");
  });

  it("populates stage_1_event_id / stage_3_event_id when matching rows exist", async () => {
    const { admin } = makeAdmin({
      automation_runs: {
        data: [
          {
            id: "row-A",
            swarm_type: "debtor-email",
            topic: null,
            entity: null,
            created_at: "2026-05-07T10:00:00Z",
            result: { kanban_reason: "low_confidence", email_id: "email-1" },
          },
          {
            id: "row-B",
            swarm_type: "debtor-email",
            topic: null,
            entity: null,
            created_at: "2026-05-07T09:00:00Z",
            result: { kanban_reason: "no_handler", email_id: "email-2" },
          },
        ],
        error: null,
      },
      pipeline_events: {
        data: [
          { id: "ev-1-1", email_id: "email-1", stage: 1, created_at: "2026-05-07T08:00:00Z" },
          { id: "ev-1-3", email_id: "email-1", stage: 3, created_at: "2026-05-07T09:00:00Z" },
          // email-2 has only stage 1, no stage 3.
          { id: "ev-2-1", email_id: "email-2", stage: 1, created_at: "2026-05-07T07:00:00Z" },
        ],
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadKanbanRows(admin as any, "debtor-email");
    expect(rows[0].stage_1_event_id).toBe("ev-1-1");
    expect(rows[0].stage_3_event_id).toBe("ev-1-3");
    expect(rows[1].stage_1_event_id).toBe("ev-2-1");
    expect(rows[1].stage_3_event_id).toBeNull();
  });

  it("returns null event_ids when no email_ids are present (R-3 graceful)", async () => {
    const { admin, traces } = makeAdmin({
      automation_runs: {
        data: [
          {
            id: "row-X",
            swarm_type: "debtor-email",
            topic: null,
            entity: null,
            created_at: "2026-05-07T10:00:00Z",
            // No email_id → loader skips pipeline_events lookup entirely.
            result: { kanban_reason: "handler_error" },
          },
        ],
        error: null,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadKanbanRows(admin as any, "debtor-email");
    expect(rows).toHaveLength(1);
    expect(rows[0].stage_1_event_id).toBeNull();
    expect(rows[0].stage_3_event_id).toBeNull();
    // Verify no pipeline_events SELECT happened.
    expect(traces.find((t) => t.table === "pipeline_events")).toBeUndefined();
  });

  it("returns [] when SELECT yields no rows (no pipeline_events lookup)", async () => {
    const { admin, traces } = makeAdmin({
      automation_runs: { data: [], error: null },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await loadKanbanRows(admin as any, "debtor-email");
    expect(rows).toEqual([]);
    expect(traces.find((t) => t.table === "pipeline_events")).toBeUndefined();
  });

  it("throws on automation_runs SELECT error", async () => {
    const { admin } = makeAdmin({
      automation_runs: { data: null, error: { message: "boom" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(loadKanbanRows(admin as any, "debtor-email")).rejects.toThrow(
      /loadKanbanRows: boom/,
    );
  });

  // Suppress unused-import warning when vi is not directly referenced above.
  it("vi import sanity", () => {
    expect(typeof vi.fn).toBe("function");
  });
});
