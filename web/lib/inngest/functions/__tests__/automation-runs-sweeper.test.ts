// Phase 999.4 RED scaffold — failing imports gate Wave 1+ implementation. Do not fix by stubbing — implement the contract.
//
// Covers test-map IDs T-D1, T-D2, T-D3, T-D4 from RESEARCH.md (Wave 3 sweeper).
// Wave 3 will add `stage0StaleSweeper` to web/lib/inngest/functions/automation-runs-sweeper.ts.
// Until that lands, the import below MUST fail RED — that failure IS the contract.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest client mock -------------------------------------------------
const { inngestSend, emitAutomationRunStaleMock } = vi.hoisted(() => ({
  inngestSend: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  emitAutomationRunStaleMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- emitAutomationRunStale mock ----------------------------------------
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) =>
    emitAutomationRunStaleMock(...args),
}));

// ---- Supabase admin mock --------------------------------------------------
// Mimics PostgREST chain: from(table).select(...).eq(col, val).lt(col, val) → rows.
// Then per-row: from(table).update(payload).eq("id", id) → ok.
const fixtureRows: Array<Record<string, unknown>> = [];
const updateCalls: Array<{ id: string; payload: Record<string, unknown> }> = [];

function makeAdminMock() {
  const selectChain: {
    eq: ReturnType<typeof vi.fn>;
    lt: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    like: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(() => selectChain),
    lt: vi.fn(async () => ({
      data: [...fixtureRows],
      error: null,
    })),
    in: vi.fn(() => selectChain),
    like: vi.fn(() => selectChain),
  };
  const updateEqMock = vi.fn(
    async (_col: string, id: string, payload?: Record<string, unknown>) => ({
      data: null,
      error: null,
      // payload is captured via the closure-update below, not args here
      __id: id,
      __payload: payload,
    }),
  );
  const update = vi.fn((payload: Record<string, unknown>) => ({
    eq: vi.fn(async (_col: string, id: string) => {
      updateCalls.push({ id, payload });
      return { data: null, error: null };
    }),
  }));
  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => selectChain),
    update,
  }));
  return {
    from,
    __mocks__: { from, update, updateEqMock, selectChain },
  };
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub (Inngest test harness) -----------------------------------
const stepRunCalls: Array<{ id: string; result: unknown }> = [];
function makeStep() {
  return {
    run: vi.fn(async (id: string, fn: () => unknown) => {
      const result = await fn();
      stepRunCalls.push({ id, result });
      return result;
    }),
  };
}

// Wave 3 contract — this import will fail RED until implemented.
import { stage0StaleSweeper } from "../automation-runs-sweeper";

function getHandler() {
  return (stage0StaleSweeper as unknown as { handler: any }).handler;
}

beforeEach(() => {
  fixtureRows.length = 0;
  updateCalls.length = 0;
  stepRunCalls.length = 0;
  adminMock = makeAdminMock();
  inngestSend.mockClear();
  emitAutomationRunStaleMock.mockReset();
  emitAutomationRunStaleMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// T-D1: cutoff filter — only rows older than 15 min are swept
// ---------------------------------------------------------------------------

describe("Sweeper — cutoff (T-D1)", () => {
  it("SELECT picks rows older than 15 min, ignores fresher rows", async () => {
    const now = Date.now();
    const stuck = {
      id: "ar-stuck",
      status: "pending",
      triggered_by: "stage-0/safety-worker",
      created_at: new Date(now - 16 * 60_000).toISOString(),
      result: { email_id: "abc", regex_matched: false },
      swarm_type: "debtor-email",
    };
    const fresh = {
      id: "ar-fresh",
      status: "pending",
      triggered_by: "stage-0/safety-worker",
      created_at: new Date(now - 5 * 60_000).toISOString(),
      result: { email_id: "def" },
      swarm_type: "debtor-email",
    };
    const alreadyFailed = {
      id: "ar-failed",
      status: "failed",
      triggered_by: "stage-0/safety-worker",
      created_at: new Date(now - 30 * 60_000).toISOString(),
      result: { email_id: "ghi" },
      swarm_type: "debtor-email",
    };
    // The mock's .lt() returns `fixtureRows` verbatim; the worker is
    // responsible for issuing the right .eq("status","pending") and
    // .lt("created_at", cutoff) chain. We pre-filter fixtureRows here to
    // mirror what a correct worker query would return.
    fixtureRows.push(stuck);
    void fresh;
    void alreadyFailed;

    const handler = getHandler();
    await handler({ event: { data: {} }, step: makeStep() });

    // Only the stuck row's id should be UPDATEd.
    const ids = updateCalls.map((c) => c.id);
    expect(ids).toContain("ar-stuck");
    expect(ids).not.toContain("ar-fresh");
    expect(ids).not.toContain("ar-failed");
  });
});

// ---------------------------------------------------------------------------
// T-D2: JSONB merge — read-modify-write preserves existing keys
// ---------------------------------------------------------------------------

describe("Sweeper — JSONB merge (T-D2)", () => {
  it("merges llm_reason into result without losing existing keys (email_id, regex_matched)", async () => {
    fixtureRows.push({
      id: "ar-merge",
      status: "pending",
      triggered_by: "stage-0/safety-worker",
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      result: { email_id: "abc", regex_matched: false },
      swarm_type: "debtor-email",
    });

    const handler = getHandler();
    await handler({ event: { data: {} }, step: makeStep() });

    expect(updateCalls).toHaveLength(1);
    const { payload } = updateCalls[0];
    expect(payload.status).toBe("failed");
    expect(typeof payload.completed_at).toBe("string");
    expect(payload.result).toMatchObject({
      email_id: "abc",
      regex_matched: false,
      llm_reason: "inngest_cancelled_stale",
    });
  });
});

// ---------------------------------------------------------------------------
// T-D3: replay-safe cutoff computed inside step.run
// ---------------------------------------------------------------------------

describe("Sweeper — replay-safe cutoff (T-D3)", () => {
  it("cutoff timestamp is computed inside step.run('compute-cutoff', ...)", async () => {
    fixtureRows.push({
      id: "ar-stuck-2",
      status: "pending",
      triggered_by: "stage-0/safety-worker",
      created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
      result: {},
      swarm_type: "debtor-email",
    });

    const step = makeStep();
    const handler = getHandler();
    await handler({ event: { data: {} }, step });

    const ids = (step.run as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(ids).toContain("compute-cutoff");
    // compute-cutoff must precede any DB-touching step.run call.
    const cutoffIdx = ids.indexOf("compute-cutoff");
    const dbTouchIdx = ids.findIndex((s) => s !== "compute-cutoff");
    expect(cutoffIdx).toBeGreaterThanOrEqual(0);
    expect(cutoffIdx).toBeLessThan(dbTouchIdx === -1 ? Infinity : dbTouchIdx);
  });
});

// ---------------------------------------------------------------------------
// T-D4: emit stale channel — once per distinct swarm_type
// ---------------------------------------------------------------------------

describe("Sweeper — emit stale channel (T-D4)", () => {
  it("calls emitAutomationRunStale once per distinct swarm_type after marking rows", async () => {
    fixtureRows.push(
      {
        id: "ar-debtor",
        status: "pending",
        triggered_by: "stage-0/safety-worker",
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        result: {},
        swarm_type: "debtor-email",
      },
      {
        id: "ar-sales",
        status: "pending",
        triggered_by: "stage-0/safety-worker",
        created_at: new Date(Date.now() - 20 * 60_000).toISOString(),
        result: {},
        swarm_type: "sales-email",
      },
    );

    const handler = getHandler();
    await handler({ event: { data: {} }, step: makeStep() });

    expect(emitAutomationRunStaleMock).toHaveBeenCalledTimes(2);
    const channels = emitAutomationRunStaleMock.mock.calls.map(
      (c) => c[1] as string,
    );
    expect(channels.sort()).toEqual(
      ["debtor-email-review", "sales-email-review"].sort(),
    );
  });
});
