// Phase 82.2 Plan 10 — RED tests for the Stage 0 coverage probe.
// Implementation file: ../stage-0-coverage-probe.ts (Task 2 GREEN).
//
// Test-IDs map back to PLAN.md Task 1 cases:
//   T1  all mailboxes ≥99% → no breached rows; one pipeline_health row per mailbox
//   T2  one mailbox at 95% with stage1>0 → that row breached=true; others false
//   T3  mailbox at 100% with stage1=0 → breached=false (no volume, no breach)
//   T4  multiple mailboxes breached → all marked breached=true
//   T5  probe is read-only on pipeline_events (no INSERT)
//   T6  probe_run_id is the SAME across all inserted rows
//   T7  probe_run_id generated inside step.run("resolve-run-id", ...)
//   T8  RPC called once per ACTIVE_MAILBOXES with correct (mailbox, swarm) pairs
//
// Note: per the Plan 10 execution context the verified ACTIVE_MAILBOXES set
// is 7 entries (6 debtor + 1 sales) rather than the 5 the plan body sketches —
// tests assert the live registry of active mailboxes.

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
type RpcKey = string; // `${mailbox}|${swarm_type}`

const state: {
  rpcResults: Map<RpcKey, { stage1_count: number; stage0_count: number }>;
  rpcCalls: Array<{ name: string; args: { mailbox_arg: string; swarm_arg: string } }>;
  pipelineHealthInserts: Array<Record<string, unknown>[]>;
  pipelineEventsInserts: Array<Record<string, unknown>[]>;
} = {
  rpcResults: new Map(),
  rpcCalls: [],
  pipelineHealthInserts: [],
  pipelineEventsInserts: [],
};

function makeAdmin() {
  const rpc = vi.fn(
    async (
      name: string,
      args: { mailbox_arg: string; swarm_arg: string },
    ) => {
      state.rpcCalls.push({ name, args });
      const key: RpcKey = `${args.mailbox_arg}|${args.swarm_arg}`;
      const data = state.rpcResults.get(key) ?? {
        stage1_count: 0,
        stage0_count: 0,
      };
      return { data, error: null };
    },
  );

  const from = vi.fn((table: string) => ({
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      if (table === "pipeline_health") {
        state.pipelineHealthInserts.push(rows);
      } else if (table === "pipeline_events") {
        state.pipelineEventsInserts.push(rows);
      }
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

// ---- Import under test (RED until Task 2 lands) -------------------------
import {
  stage0CoverageProbe,
  ACTIVE_MAILBOXES,
} from "../stage-0-coverage-probe";

function getHandler() {
  return (stage0CoverageProbe as unknown as { handler: any }).handler;
}

function setAllAtCoverage(coverage: number, stage1Count = 100): void {
  state.rpcResults = new Map();
  for (const m of ACTIVE_MAILBOXES) {
    const stage0 = Math.round(stage1Count * coverage);
    state.rpcResults.set(`${m.mailbox}|${m.swarm_type}`, {
      stage1_count: stage1Count,
      stage0_count: stage0,
    });
  }
}

beforeEach(() => {
  state.rpcResults = new Map();
  state.rpcCalls = [];
  state.pipelineHealthInserts = [];
  state.pipelineEventsInserts = [];
  adminInstance = makeAdmin();
});

// ---------------------------------------------------------------------------
// T1 — All mailboxes ≥99% → no breaches; one row per mailbox written
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T1 (all green)", () => {
  it("writes one pipeline_health row per active mailbox, none breached", async () => {
    setAllAtCoverage(1.0, 50);
    const ret = await getHandler()({ step: makeStep() });

    expect(state.pipelineHealthInserts).toHaveLength(1);
    const rows = state.pipelineHealthInserts[0];
    expect(rows).toHaveLength(ACTIVE_MAILBOXES.length);
    for (const row of rows) {
      expect(row.breached).toBe(false);
    }
    expect(ret).toMatchObject({
      mailboxes: ACTIVE_MAILBOXES.length,
      breaches: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// T2 — One mailbox at 95% with stage1>0 → that row breached, others not
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T2 (single breach)", () => {
  it("marks only the under-99% mailbox as breached", async () => {
    setAllAtCoverage(1.0, 50);
    const target = ACTIVE_MAILBOXES[0];
    // 95/100 = 0.95 — below the 0.99 floor with non-zero volume
    state.rpcResults.set(`${target.mailbox}|${target.swarm_type}`, {
      stage1_count: 100,
      stage0_count: 95,
    });

    const ret = await getHandler()({ step: makeStep() });
    const rows = state.pipelineHealthInserts[0];
    expect(rows).toHaveLength(ACTIVE_MAILBOXES.length);
    const breached = rows.filter((r) => r.breached === true);
    expect(breached).toHaveLength(1);
    expect(breached[0].mailbox).toBe(target.mailbox);
    expect(ret.breaches).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T3 — Mailbox at "100%" with stage1_count=0 → NOT breached (no volume)
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T3 (zero-volume not a breach)", () => {
  it("treats stage1_count=0 as breached=false regardless of trivial coverage", async () => {
    setAllAtCoverage(1.0, 50);
    const target = ACTIVE_MAILBOXES[0];
    state.rpcResults.set(`${target.mailbox}|${target.swarm_type}`, {
      stage1_count: 0,
      stage0_count: 0,
    });

    const ret = await getHandler()({ step: makeStep() });
    const rows = state.pipelineHealthInserts[0];
    const targetRow = rows.find((r) => r.mailbox === target.mailbox);
    expect(targetRow).toBeDefined();
    expect(targetRow!.breached).toBe(false);
    expect(ret.breaches).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// T4 — Multiple breaches all marked
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T4 (multiple breaches)", () => {
  it("marks every under-99% mailbox as breached", async () => {
    setAllAtCoverage(0.5, 80);
    const ret = await getHandler()({ step: makeStep() });
    const rows = state.pipelineHealthInserts[0];
    expect(rows.every((r) => r.breached === true)).toBe(true);
    expect(ret.breaches).toBe(ACTIVE_MAILBOXES.length);
  });
});

// ---------------------------------------------------------------------------
// T5 — Probe is read-only on pipeline_events
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T5 (read-only on pipeline_events)", () => {
  it("never INSERTs into pipeline_events", async () => {
    setAllAtCoverage(0.5, 80);
    await getHandler()({ step: makeStep() });
    expect(state.pipelineEventsInserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T6 — probe_run_id is the same across all rows of one tick
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T6 (probe_run_id groups the run)", () => {
  it("uses one probe_run_id for every row inserted in a single tick", async () => {
    setAllAtCoverage(1.0, 10);
    await getHandler()({ step: makeStep() });
    const rows = state.pipelineHealthInserts[0];
    const ids = new Set(rows.map((r) => r.probe_run_id));
    expect(ids.size).toBe(1);
    const [theId] = Array.from(ids);
    expect(typeof theId).toBe("string");
    expect((theId as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// T7 — probe_run_id generated INSIDE step.run("resolve-run-id", ...)
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T7 (replay-safe probe_run_id)", () => {
  it("calls step.run('resolve-run-id', ...) before measure-coverage", async () => {
    setAllAtCoverage(1.0, 10);
    const step = makeStep();
    await getHandler()({ step });
    const ids = step.calls.map((c) => c.id);
    expect(ids).toContain("resolve-run-id");
    const resolveIdx = ids.indexOf("resolve-run-id");
    const measureIdx = ids.indexOf("measure-coverage");
    expect(resolveIdx).toBeGreaterThanOrEqual(0);
    expect(measureIdx).toBeGreaterThan(resolveIdx);
  });
});

// ---------------------------------------------------------------------------
// T8 — RPC called once per ACTIVE_MAILBOXES with correct args
// ---------------------------------------------------------------------------
describe("Stage 0 coverage probe — T8 (one RPC per active mailbox)", () => {
  it("invokes stage0_coverage_24h exactly once per ACTIVE_MAILBOXES entry", async () => {
    setAllAtCoverage(1.0, 10);
    await getHandler()({ step: makeStep() });
    expect(state.rpcCalls).toHaveLength(ACTIVE_MAILBOXES.length);
    for (const call of state.rpcCalls) {
      expect(call.name).toBe("stage0_coverage_24h");
    }
    const seen = new Set(
      state.rpcCalls.map((c) => `${c.args.mailbox_arg}|${c.args.swarm_arg}`),
    );
    for (const m of ACTIVE_MAILBOXES) {
      expect(seen.has(`${m.mailbox}|${m.swarm_type}`)).toBe(true);
    }
  });
});
