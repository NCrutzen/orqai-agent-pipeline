// Phase 82.2 Plan 09 — RED tests for the Stage 0 backfill function.
// Implementation file: ../stage-0-backfill.ts (Task 2 GREEN).
// Test-IDs map back to PLAN.md Task 1 cases:
//   T1  verdict=safe → decision='safe' row with backfill provenance
//   T2  verdict=injection_suspected → decision='injection_suspected'
//   T3  stage=stage_0_safety_pending → decision='unknown_legacy' (pending_orphan)
//   T4  no automation_runs row → decision='unknown_legacy' (no_source_record)
//   T5  1200 candidates → 3 batches (500/500/200)
//   T6  idempotency — pre-insert SELECT skips already-covered rows
//   T7  replay-safety — runId generated inside step.run("resolve-run-id", ...)
//   T8  window clamp — window_days=99 passed to RPC is clamped client-side to 30

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
// Captures rpc() and from("pipeline_events").select/insert calls.
type Candidate = {
  email_id: string;
  swarm_type: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
};

const state: {
  rpcCalls: Array<{ name: string; args: unknown }>;
  rpcReturn: Candidate[];
  selectFilters: Array<{ col: string; val: unknown }>;
  selectReturn: Array<{ email_id: string; swarm_type: string }>;
  insertCalls: Array<Record<string, unknown>[]>;
} = {
  rpcCalls: [],
  rpcReturn: [],
  selectFilters: [],
  selectReturn: [],
  insertCalls: [],
};

function makeAdmin() {
  const rpc = vi.fn(async (name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return { data: state.rpcReturn, error: null };
  });

  // Chainable .select().in().eq() returning state.selectReturn
  const selectChain = {
    in: vi.fn((col: string, val: unknown) => {
      state.selectFilters.push({ col, val });
      return selectChain;
    }),
    eq: vi.fn(async (col: string, val: unknown) => {
      state.selectFilters.push({ col, val });
      return { data: state.selectReturn, error: null };
    }),
  };

  const from = vi.fn((_table: string) => ({
    select: vi.fn(() => selectChain),
    insert: vi.fn(async (rows: Record<string, unknown>[]) => {
      state.insertCalls.push(rows);
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
import { stage0Backfill } from "../stage-0-backfill";

// Phase 88.2-03 lint-narrow (D-10).
type BackfillCtx = { step: { run: ReturnType<typeof vi.fn> }; event?: { data?: Record<string, unknown> } };
type BackfillResult = Record<string, unknown>;
type BackfillHandler = (ctx: BackfillCtx) => Promise<BackfillResult>;
function getHandler(): BackfillHandler {
  return (stage0Backfill as unknown as { handler: BackfillHandler }).handler;
}

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcReturn = [];
  state.selectFilters = [];
  state.selectReturn = [];
  state.insertCalls = [];
  adminInstance = makeAdmin();
});

// ---------------------------------------------------------------------------
// T1 — verdict='safe' reconstructs a decision='safe' row
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T1 (safe reconstruction)", () => {
  it("writes one pipeline_events row with decision='safe' and backfill provenance", async () => {
    state.rpcReturn = [
      {
        email_id: "e-1",
        swarm_type: "debtor-email",
        completed_at: "2026-04-20T10:00:00Z",
        result: {
          verdict: "safe",
          id: "ar-1",
          stage: "stage_0_safety",
          regex_matched: false,
          llm_reason: null,
          matched_span: null,
          cost_cents: 2,
        },
      },
    ];
    const step = makeStep();
    const ret = await getHandler()({ event: { data: {} }, step });

    expect(state.insertCalls).toHaveLength(1);
    const inserted = state.insertCalls[0];
    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.stage).toBe(0);
    expect(row.email_id).toBe("e-1");
    expect(row.swarm_type).toBe("debtor-email");
    expect(row.decision).toBe("safe");
    expect(row.triggered_by).toBe("backfill");
    expect(row.created_at).toBe("2026-04-20T10:00:00Z");
    const dd = row.decision_details as Record<string, unknown>;
    expect(dd.source).toBe("backfill");
    expect(dd.original_automation_run_id).toBe("ar-1");
    expect(typeof dd.backfill_run_id).toBe("string");
    expect(ret).toMatchObject({ candidates_count: 1, written: 1, skipped: 0 });
  });
});

// ---------------------------------------------------------------------------
// T2 — verdict='injection_suspected' carries forward
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T2 (injection_suspected)", () => {
  it("writes decision='injection_suspected'", async () => {
    state.rpcReturn = [
      {
        email_id: "e-2",
        swarm_type: "debtor-email",
        completed_at: "2026-04-21T11:00:00Z",
        result: { verdict: "injection_suspected", id: "ar-2", stage: "stage_0_safety" },
      },
    ];
    await getHandler()({ event: { data: {} }, step: makeStep() });
    expect(state.insertCalls[0][0].decision).toBe("injection_suspected");
  });
});

// ---------------------------------------------------------------------------
// T3 — stage='stage_0_safety_pending' (worker never completed)
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T3 (pending orphan → unknown_legacy)", () => {
  it("writes decision='unknown_legacy' with reason='pending_orphan'", async () => {
    state.rpcReturn = [
      {
        email_id: "e-3",
        swarm_type: "debtor-email",
        completed_at: null,
        result: { stage: "stage_0_safety_pending", id: "ar-3" },
      },
    ];
    await getHandler()({ event: { data: {} }, step: makeStep() });
    const row = state.insertCalls[0][0];
    expect(row.decision).toBe("unknown_legacy");
    const dd = row.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("pending_orphan");
  });
});

// ---------------------------------------------------------------------------
// T4 — no automation_runs row at all
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T4 (no source record → unknown_legacy)", () => {
  it("writes decision='unknown_legacy' with reason='no_source_record'", async () => {
    state.rpcReturn = [
      {
        email_id: "e-4",
        swarm_type: "debtor-email",
        completed_at: null,
        result: null,
      },
    ];
    await getHandler()({ event: { data: {} }, step: makeStep() });
    const row = state.insertCalls[0][0];
    expect(row.decision).toBe("unknown_legacy");
    const dd = row.decision_details as Record<string, unknown>;
    expect(dd.reason).toBe("no_source_record");
  });
});

// ---------------------------------------------------------------------------
// T5 — 1200 candidates → 3 batches (500 + 500 + 200)
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T5 (batching at 500)", () => {
  it("splits 1200 candidates into 3 inserts of 500/500/200", async () => {
    state.rpcReturn = Array.from({ length: 1200 }, (_, i) => ({
      email_id: `e-${i}`,
      swarm_type: "debtor-email",
      completed_at: "2026-04-22T00:00:00Z",
      result: { verdict: "safe", id: `ar-${i}`, stage: "stage_0_safety" },
    }));
    const ret = await getHandler()({ event: { data: {} }, step: makeStep() });
    expect(state.insertCalls).toHaveLength(3);
    expect(state.insertCalls[0]).toHaveLength(500);
    expect(state.insertCalls[1]).toHaveLength(500);
    expect(state.insertCalls[2]).toHaveLength(200);
    expect(ret.written).toBe(1200);
  });
});

// ---------------------------------------------------------------------------
// T6 — idempotency: pre-insert SELECT returns existing rows for half the batch
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T6 (idempotency via pre-insert dedupe)", () => {
  it("skips candidates already covered by an existing pipeline_events row", async () => {
    state.rpcReturn = [
      {
        email_id: "e-A",
        swarm_type: "debtor-email",
        completed_at: "2026-04-23T00:00:00Z",
        result: { verdict: "safe", id: "ar-A", stage: "stage_0_safety" },
      },
      {
        email_id: "e-B",
        swarm_type: "debtor-email",
        completed_at: "2026-04-23T01:00:00Z",
        result: { verdict: "safe", id: "ar-B", stage: "stage_0_safety" },
      },
    ];
    // e-A is already present in pipeline_events → must be skipped.
    state.selectReturn = [{ email_id: "e-A", swarm_type: "debtor-email" }];

    const ret = await getHandler()({ event: { data: {} }, step: makeStep() });
    // Only e-B should be inserted
    const inserted = state.insertCalls[0];
    expect(inserted).toHaveLength(1);
    expect(inserted[0].email_id).toBe("e-B");
    expect(ret.written).toBe(1);
    expect(ret.skipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T7 — replay-safety: runId generated inside step.run("resolve-run-id", ...)
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T7 (replay-safe run id)", () => {
  it("calls step.run('resolve-run-id', ...) before any DB-touching step", async () => {
    state.rpcReturn = [];
    const step = makeStep();
    await getHandler()({ event: { data: {} }, step });
    const ids = step.calls.map((c) => c.id);
    expect(ids).toContain("resolve-run-id");
    const resolveIdx = ids.indexOf("resolve-run-id");
    const findGapsIdx = ids.indexOf("find-gaps");
    expect(resolveIdx).toBeGreaterThanOrEqual(0);
    expect(resolveIdx).toBeLessThan(findGapsIdx);
  });
});

// ---------------------------------------------------------------------------
// T8 — window clamp: event.data.window_days=99 → RPC called with 30
// ---------------------------------------------------------------------------
describe("Stage 0 backfill — T8 (window_days client-side clamp)", () => {
  it("clamps event.data.window_days=99 to 30 before calling the RPC", async () => {
    state.rpcReturn = [];
    await getHandler()({
      event: { data: { window_days: 99 } },
      step: makeStep(),
    });
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].name).toBe("stage0_backfill_candidates");
    const args = state.rpcCalls[0].args as { window_days: number };
    expect(args.window_days).toBe(30);
  });
});
