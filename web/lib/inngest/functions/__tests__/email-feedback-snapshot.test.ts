// Phase 82.4 Plan 07 — RED tests for the nightly email_feedback snapshot cron.
// Implementation file: ../email-feedback-snapshot.ts (Task 2 GREEN).
//
// Test cases map back to 82.4-07-PLAN.md Task 1:
//   T1 cron config: id "feedback/nightly-snapshot" + cron "TZ=Europe/Amsterdam 0 2 * * *"
//   T2 step.run is called with the 4 expected names in order
//   T3 storage upload path matches /^\d{4}-\d{2}-\d{2}\.json$/ (bucket-relative)
//   T4 upload args include contentType "application/json" AND upsert:true
//   T5 empty result set still uploads "[]" and returns row_count:0
//   T6 read query uses .gte("created_at", <ISO 26h ago>)
//   T7 return value has run_id, snapshot_date, row_count, storage_path

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

// ---- Supabase admin mock -------------------------------------------------
type FeedbackRow = Record<string, unknown>;

const state: {
  selectRows: FeedbackRow[];
  selectError: { message: string } | null;
  gteCalls: Array<{ column: string; value: string }>;
  orderCalls: Array<{ column: string; opts: unknown }>;
  limitCalls: number[];
  uploadCalls: Array<{
    bucket: string;
    path: string;
    body: Buffer;
    opts: Record<string, unknown>;
  }>;
  uploadError: { message: string } | null;
} = {
  selectRows: [],
  selectError: null,
  gteCalls: [],
  orderCalls: [],
  limitCalls: [],
  uploadCalls: [],
  uploadError: null,
};

function makeAdmin() {
  const queryBuilder = {
    select: vi.fn(function (this: typeof queryBuilder) {
      return this;
    }),
    gte: vi.fn(function (this: typeof queryBuilder, column: string, value: string) {
      state.gteCalls.push({ column, value });
      return this;
    }),
    order: vi.fn(function (this: typeof queryBuilder, column: string, opts: unknown) {
      state.orderCalls.push({ column, opts });
      return this;
    }),
    limit: vi.fn(async function (this: typeof queryBuilder, n: number) {
      state.limitCalls.push(n);
      return { data: state.selectRows, error: state.selectError };
    }),
  };

  const from = vi.fn((_table: string) => queryBuilder);

  const storage = {
    from: vi.fn((bucket: string) => ({
      upload: vi.fn(
        async (path: string, body: Buffer, opts: Record<string, unknown>) => {
          state.uploadCalls.push({ bucket, path, body, opts });
          return { data: { path }, error: state.uploadError };
        },
      ),
    })),
  };

  return { from, storage };
}

let adminInstance = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminInstance),
}));

// ---- Step stub -----------------------------------------------------------
function makeStep() {
  const calls: Array<{ id: string }> = [];
  const run = vi.fn(async (id: string, fn: () => unknown) => {
    calls.push({ id });
    return await fn();
  });
  return { run, calls };
}

// ---- Import the function under test (RED until Task 2 lands) -----------
import { emailFeedbackSnapshot } from "../email-feedback-snapshot";

// Phase 88.2-03 lint-narrow (D-10): handler/config/trigger have shape that's
// only consumed in this test; inline minimal types instead of `any`.
type SnapshotResult = {
  run_id?: string;
  snapshot_date?: string;
  row_count?: number;
  storage_path?: string;
};
type SnapshotHandler = (ctx: { step: { run: ReturnType<typeof vi.fn> } }) => Promise<SnapshotResult>;
type SnapshotConfig = { id?: string; retries?: number };
type SnapshotTrigger = { cron?: string };

function getHandler(): SnapshotHandler {
  return (emailFeedbackSnapshot as unknown as { handler: SnapshotHandler }).handler;
}

function getConfig(): SnapshotConfig {
  return (emailFeedbackSnapshot as unknown as { __config: SnapshotConfig }).__config;
}

function getTrigger(): SnapshotTrigger {
  return (emailFeedbackSnapshot as unknown as { __trigger: SnapshotTrigger }).__trigger;
}

beforeEach(() => {
  state.selectRows = [];
  state.selectError = null;
  state.gteCalls = [];
  state.orderCalls = [];
  state.limitCalls = [];
  state.uploadCalls = [];
  state.uploadError = null;
  adminInstance = makeAdmin();
});

// ---------------------------------------------------------------------------
// T1 — cron configuration
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T1 (cron config)", () => {
  it("registers id feedback/nightly-snapshot at TZ=Europe/Amsterdam 0 2 * * *", () => {
    const cfg = getConfig();
    const trigger = getTrigger();
    expect(cfg).toMatchObject({ id: "feedback/nightly-snapshot", retries: 1 });
    expect(trigger).toEqual({ cron: "TZ=Europe/Amsterdam 0 2 * * *" });
  });
});

// ---------------------------------------------------------------------------
// T2 — step.run names in order
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T2 (step.run sequencing)", () => {
  it("invokes the 4 expected step names in order", async () => {
    const step = makeStep();
    await getHandler()({ step });
    const ids = step.calls.map((c) => c.id);
    expect(ids).toEqual([
      "resolve-run-id",
      "resolve-snapshot-date",
      "read-feedback-window",
      "upload-snapshot",
    ]);
  });
});

// ---------------------------------------------------------------------------
// T3 — storage upload path is YYYY-MM-DD.json (bucket-relative)
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T3 (upload path shape)", () => {
  it("uploads to a path matching YYYY-MM-DD.json under the snapshots bucket", async () => {
    await getHandler()({ step: makeStep() });
    expect(state.uploadCalls).toHaveLength(1);
    const { bucket, path } = state.uploadCalls[0];
    expect(bucket).toBe("email-feedback-snapshots");
    expect(path).toMatch(/^\d{4}-\d{2}-\d{2}\.json$/);
  });
});

// ---------------------------------------------------------------------------
// T4 — upload args
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T4 (upload args)", () => {
  it("sets contentType application/json and upsert:true", async () => {
    await getHandler()({ step: makeStep() });
    const { opts } = state.uploadCalls[0];
    expect(opts).toMatchObject({
      contentType: "application/json",
      upsert: true,
    });
  });
});

// ---------------------------------------------------------------------------
// T5 — empty result set still uploads deterministic empty array
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T5 (empty snapshot)", () => {
  it("uploads [] and returns row_count:0 when no rows exist", async () => {
    state.selectRows = [];
    const ret = await getHandler()({ step: makeStep() });
    expect(state.uploadCalls).toHaveLength(1);
    const body = state.uploadCalls[0].body.toString("utf-8");
    expect(JSON.parse(body)).toEqual([]);
    expect(ret).toMatchObject({ row_count: 0 });
  });
});

// ---------------------------------------------------------------------------
// T6 — read query uses .gte("created_at", ~26h ago)
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T6 (26h window)", () => {
  it("filters email_feedback by created_at >= now-26h", async () => {
    const before = Date.now();
    await getHandler()({ step: makeStep() });
    const after = Date.now();
    expect(state.gteCalls).toHaveLength(1);
    expect(state.gteCalls[0].column).toBe("created_at");
    const since = Date.parse(state.gteCalls[0].value);
    // since should be ~26h before now; allow 5min slack on either side.
    const expectedMin = before - 26 * 60 * 60 * 1000 - 5 * 60 * 1000;
    const expectedMax = after - 26 * 60 * 60 * 1000 + 5 * 60 * 1000;
    expect(since).toBeGreaterThanOrEqual(expectedMin);
    expect(since).toBeLessThanOrEqual(expectedMax);
  });
});

// ---------------------------------------------------------------------------
// T7 — return shape
// ---------------------------------------------------------------------------
describe("emailFeedbackSnapshot — T7 (return shape)", () => {
  it("returns run_id, snapshot_date, row_count, storage_path", async () => {
    state.selectRows = [
      { id: "a", email_id: "e1", stage: 1, verdict: "confirm" },
      { id: "b", email_id: "e2", stage: 2, verdict: "override" },
    ];
    const ret = await getHandler()({ step: makeStep() });
    expect(ret).toMatchObject({
      row_count: 2,
    });
    expect(typeof ret.run_id).toBe("string");
    expect(ret.snapshot_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ret.storage_path).toMatch(
      /^email-feedback-snapshots\/\d{4}-\d{2}-\d{2}\.json$/,
    );
  });
});
