// Phase 82.2 Plan 10 — RED tests for the daily Stage 0 coverage probe.
// Implementation file: ../stage-0-coverage-probe.ts (Task 2 GREEN).
// Test-IDs map back to PLAN.md Task 1 cases:
//   T1  all 5 mailboxes ≥99% → no breach, 5 rows written
//   T2  one mailbox at 95% with stage1>0 → that row breached=true; others false
//   T3  100% coverage with stage1_count=0 → breached=false (no volume)
//   T4  multiple mailboxes breached → all marked breached=true
//   T5  read-only: NO pipeline_events INSERT happens
//   T6  probe_run_id is the SAME across all 5 inserted rows
//   T7  probe_run_id generated INSIDE step.run (Phase 65 replay-safety)
//   T8  RPC called exactly 5 times with the correct (mailbox, swarm_type) pairs

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest client mock -------------------------------------------------
const { createFunctionMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

// ---- Supabase admin mock --------------------------------------------------
// Captures rpc() and from(table).insert calls (also tracks any from() target
// so Test 5 can assert no pipeline_events writes).
type CoverageRow = { stage1_count: number; stage0_count: number };

const state: {
  rpcCalls: Array<{ name: string; args: Record<string, string> }>;
  rpcResponder: (args: Record<string, string>) => CoverageRow;
  insertCalls: Array<{ table: string; rows: Record<string, unknown>[] }>;
} = {
  rpcCalls: [],
  rpcResponder: () => ({ stage1_count: 100, stage0_count: 100 }),
  insertCalls: [],
};

function makeAdmin() {
  const rpc = vi.fn(async (name: string, args: Record<string, string>) => {
    state.rpcCalls.push({ name, args });
    const row = state.rpcResponder(args);
    return { data: [row], error: null };
  });

  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      state.insertCalls.push({ table, rows });
      return { data: null, error: null };
    }),
  }));

  return { rpc, from };
}

let adminInstance = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminInstance),
}));

// ---- Step stub (Inngest test harness) -----------------------------------
function makeStep() {
  const calls: Array<{ id: string }> = [];
  const run = vi.fn(async (id: string, fn: () => unknown) => {
    calls.push({ id });
    return await fn();
  });
  return { run, calls };
}

// ---- Import the function under test (RED until Task 2 lands) ------------
import { stage0CoverageProbe } from "../stage-0-coverage-probe";

// Phase 88.2-03 lint-narrow (D-10).
type ProbeHandler = (ctx: { step: { run: ReturnType<typeof vi.fn> } }) => Promise<unknown>;
function getHandler(): ProbeHandler {
  return (stage0CoverageProbe as unknown as { handler: ProbeHandler }).handler;
}

beforeEach(() => {
  state.rpcCalls = [];
  state.insertCalls = [];
  state.rpcResponder = () => ({ stage1_count: 100, stage0_count: 100 });
  adminInstance = makeAdmin();
});

// ---------------------------------------------------------------------------
// T1 — all 5 mailboxes ≥99% → no breach, 5 rows written
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T1 (all healthy)", () => {
  it("writes 5 pipeline_health rows, none breached", async () => {
    state.rpcResponder = () => ({ stage1_count: 100, stage0_count: 100 });
    const ret = await getHandler()({ step: makeStep() });

    expect(state.insertCalls).toHaveLength(1);
    expect(state.insertCalls[0].table).toBe("pipeline_health");
    const rows = state.insertCalls[0].rows;
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r.breached).toBe(false);
    }
    expect(ret).toMatchObject({ mailboxes: 5, breaches: 0 });
  });
});

// ---------------------------------------------------------------------------
// T2 — one mailbox at 95% → that row breached, others not
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T2 (single breach)", () => {
  it("flags only the under-covered mailbox", async () => {
    state.rpcResponder = (args) => {
      if (args.mailbox_arg === "debiteuren@smeba.nl") {
        return { stage1_count: 100, stage0_count: 95 };
      }
      return { stage1_count: 50, stage0_count: 50 };
    };
    const ret = await getHandler()({ step: makeStep() });

    const rows = state.insertCalls[0].rows;
    expect(rows).toHaveLength(5);
    const breachedRows = rows.filter((r) => r.breached === true);
    expect(breachedRows).toHaveLength(1);
    expect(breachedRows[0].mailbox).toBe("debiteuren@smeba.nl");
    expect(ret).toMatchObject({ breaches: 1 });
  });
});

// ---------------------------------------------------------------------------
// T3 — zero stage1 volume → not breached even at trivial 100%
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T3 (zero volume → no breach)", () => {
  it("does not mark breach when stage1_count=0", async () => {
    state.rpcResponder = () => ({ stage1_count: 0, stage0_count: 0 });
    const ret = await getHandler()({ step: makeStep() });
    const rows = state.insertCalls[0].rows;
    for (const r of rows) {
      expect(r.breached).toBe(false);
    }
    expect(ret).toMatchObject({ breaches: 0 });
  });
});

// ---------------------------------------------------------------------------
// T4 — multiple mailboxes breached
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T4 (multiple breaches)", () => {
  it("flags every under-covered mailbox", async () => {
    state.rpcResponder = (args) => {
      if (args.mailbox_arg === "verkoop@smeba.nl") {
        return { stage1_count: 200, stage0_count: 100 };
      }
      if (args.mailbox_arg === "debiteuren@berki.nl") {
        return { stage1_count: 100, stage0_count: 50 };
      }
      return { stage1_count: 100, stage0_count: 100 };
    };
    const ret = await getHandler()({ step: makeStep() });
    const rows = state.insertCalls[0].rows;
    const breachedRows = rows.filter((r) => r.breached === true);
    expect(breachedRows).toHaveLength(2);
    expect(ret).toMatchObject({ breaches: 2 });
  });
});

// ---------------------------------------------------------------------------
// T5 — read-only: probe never writes to pipeline_events
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T5 (no pipeline_events writes)", () => {
  it("does not call from('pipeline_events').insert", async () => {
    await getHandler()({ step: makeStep() });
    const pipelineEventInserts = state.insertCalls.filter(
      (c) => c.table === "pipeline_events",
    );
    expect(pipelineEventInserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T6 — probe_run_id is shared across all 5 inserted rows
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T6 (shared probe_run_id)", () => {
  it("groups all 5 rows under a single probe_run_id", async () => {
    await getHandler()({ step: makeStep() });
    const rows = state.insertCalls[0].rows;
    const ids = new Set(rows.map((r) => r.probe_run_id));
    expect(ids.size).toBe(1);
    expect(typeof rows[0].probe_run_id).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// T7 — probe_run_id generated inside step.run (Phase 65 replay-safety)
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T7 (replay-safe run id)", () => {
  it("resolves probe_run_id inside step.run", async () => {
    const step = makeStep();
    await getHandler()({ step });
    const ids = step.calls.map((c) => c.id);
    expect(ids).toContain("resolve-run-id");
  });
});

// ---------------------------------------------------------------------------
// T8 — RPC called exactly 5 times with correct (mailbox, swarm) pairs
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T8 (RPC fan-out)", () => {
  it("invokes stage0_coverage_24h once per active mailbox", async () => {
    await getHandler()({ step: makeStep() });
    expect(state.rpcCalls).toHaveLength(5);
    for (const c of state.rpcCalls) {
      expect(c.name).toBe("stage0_coverage_24h");
      expect(c.args).toHaveProperty("mailbox_arg");
      expect(c.args).toHaveProperty("swarm_arg");
    }
    const pairs = state.rpcCalls.map(
      (c) => `${c.args.mailbox_arg}|${c.args.swarm_arg}`,
    );
    expect(pairs).toContain("verkoop@smeba.nl|sales-email");
    expect(pairs).toContain("debiteuren@smeba.nl|debtor-email");
    expect(pairs).toContain("debiteuren@berki.nl|debtor-email");
    expect(pairs).toContain("debiteuren@smeba-fire.be|debtor-email");
    expect(pairs).toContain("administratie@fire-control.nl|debtor-email");
  });
});
