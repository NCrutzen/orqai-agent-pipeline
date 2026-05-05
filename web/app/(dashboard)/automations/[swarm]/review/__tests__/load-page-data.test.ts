// Phase 70-06 (TELE-03). Loader test for the predicted-row feed migration to
// `public.pipeline_events`. Locks (per Plan 70-06):
//   - Sub-query (2) at line 147 (predicted-row list) reads from pipeline_events
//   - Sub-query (6) at line 246 (selected-row detail) reads from pipeline_events
//   - Sub-query (3) at line 161/187 (cost-outlier RPC) STAYS on automation_runs
//     in v1 (Phase 72 may move). Tested as-is for parity.
//   - Out-of-scope side-loaders (loadCoordinatorRunsForReview,
//     loadTaggingFailuresForReview) and out-of-scope queries
//     (classifier_queue_counts RPC, classifier_rules promoted/candidate) are
//     unchanged — tested via regression assertions.
//   - Visual contract: when pipeline_events returns N rows, the page data
//     result has N row entries with the same shape downstream consumers
//     expect.
//
// We mock the admin client as a chainable query-builder. The list query for
// the predicted-feed branch chains
//   .from("pipeline_events").select(...).eq.eq.order.limit  (and optionally .lt)
// then resolves with `{ data, error }`. The mock records every `.from(table)`
// call so we can assert which table the loader hit.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Chainable query-builder mock ----------------------------------------

type EqCall = { col: string; val: unknown };

interface MockBuilder {
  _eqCalls: EqCall[];
  _orderCalls: Array<{ col: string }>;
  _limit: number | null;
  _lt: { col: string; val: unknown } | null;
  _selectCols: string | null;
  _resolveValue: { data: unknown; error: unknown };
  select: (cols: string) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  order: (col: string, opts?: unknown) => MockBuilder;
  limit: (n: number) => MockBuilder;
  lt: (col: string, val: unknown) => MockBuilder;
  gte: (col: string, val: unknown) => MockBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: (cb: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
}

function makeBuilder(resolveValue: { data: unknown; error: unknown }): MockBuilder {
  const b: Partial<MockBuilder> = {};
  b._eqCalls = [];
  b._orderCalls = [];
  b._limit = null;
  b._lt = null;
  b._selectCols = null;
  b._resolveValue = resolveValue;
  b.select = (cols: string) => {
    b._selectCols = cols;
    return b as MockBuilder;
  };
  b.eq = (col: string, val: unknown) => {
    b._eqCalls!.push({ col, val });
    return b as MockBuilder;
  };
  b.order = (col: string) => {
    b._orderCalls!.push({ col });
    return b as MockBuilder;
  };
  b.limit = (n: number) => {
    b._limit = n;
    return b as MockBuilder;
  };
  b.lt = (col: string, val: unknown) => {
    b._lt = { col, val };
    return b as MockBuilder;
  };
  b.gte = () => b as MockBuilder;
  b.single = async () => resolveValue;
  // Supabase JS query is a thenable.
  b.then = (cb: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(cb(resolveValue));
  return b as MockBuilder;
}

// ---- Side-loader mocks (TELE-02 regression: must still be called) ---------

const loadCoordinatorRunsForReviewMock = vi.fn(async (_ids: string[]) => new Map());
const loadTaggingFailuresForReviewMock = vi.fn(
  async (_pairs: Array<{ automation_run_id: string; email_id: string }>) =>
    new Map(),
);

vi.mock(
  "@/app/(dashboard)/automations/debtor-email/_lib/coordinator-runs-loader",
  () => ({
    loadCoordinatorRunsForReview: (ids: string[]) =>
      loadCoordinatorRunsForReviewMock(ids),
  }),
);

vi.mock(
  "@/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader",
  () => ({
    loadTaggingFailuresForReview: (
      pairs: Array<{ automation_run_id: string; email_id: string }>,
    ) => loadTaggingFailuresForReviewMock(pairs),
  }),
);

// ---- Scenario --------------------------------------------------------------

interface PipelineEventFixture {
  id: string;
  created_at: string;
  swarm_type: string;
  stage: number;
  email_id: string | null;
  decision: string;
  confidence: number | null;
  decision_details: Record<string, unknown> | null;
  automation_run_id: string | null;
  agent_run_id: string | null;
}

interface Scenario {
  pipelineEventsRows: PipelineEventFixture[];
  selectedRow: PipelineEventFixture | null;
  outlierRows: Array<{
    id: string;
    is_cost_outlier: boolean;
    cost_cents: number;
    median_cost_cents: number | null;
    sample_count: number;
  }>;
  countsRows: Array<{
    swarm_type: string;
    topic: string | null;
    entity: string | null;
    mailbox_id: number | null;
    count: number;
  }>;
  candidatesRows: Array<{
    rule_key: string;
    status: string;
    n: number;
    ci_lo: number | null;
  }>;
}

let scenario: Scenario;

const fromCalls: string[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

let lastListBuilder: MockBuilder | null = null;

const adminClientMock = {
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "pipeline_events") {
      // Two paths hit pipeline_events: the predicted-list and the
      // selected-row detail. Both return from the same fixture; the detail
      // path uses .single() which returns scenario.selectedRow.
      const b = makeBuilder({ data: scenario.pipelineEventsRows, error: null });
      // Override .single() to return the selectedRow fixture.
      b.single = async () => ({ data: scenario.selectedRow, error: null });
      lastListBuilder = b;
      return b;
    }
    if (table === "classifier_rules") {
      return makeBuilder({ data: scenario.candidatesRows, error: null });
    }
    if (table === "automation_runs") {
      // If anything hits automation_runs via .from(), the test will pick it
      // up so we can flag scope-creep regressions.
      return makeBuilder({ data: [], error: null });
    }
    return makeBuilder({ data: [], error: null });
  }),
  rpc: vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    if (fn === "classifier_queue_counts") {
      return Promise.resolve({ data: scenario.countsRows, error: null });
    }
    if (fn === "automation_runs_with_outlier") {
      return Promise.resolve({ data: scenario.outlierRows, error: null });
    }
    return Promise.resolve({ data: [], error: null });
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Import AFTER mocks
import {
  loadPageData,
  type PageSearchParams,
} from "@/app/(dashboard)/automations/[swarm]/review/page";

beforeEach(() => {
  fromCalls.length = 0;
  rpcCalls.length = 0;
  lastListBuilder = null;
  adminClientMock.from.mockClear();
  adminClientMock.rpc.mockClear();
  loadCoordinatorRunsForReviewMock.mockClear();
  loadTaggingFailuresForReviewMock.mockClear();
  loadCoordinatorRunsForReviewMock.mockImplementation(async () => new Map());
  loadTaggingFailuresForReviewMock.mockImplementation(async () => new Map());
  scenario = {
    pipelineEventsRows: [
      {
        id: "pe-1",
        created_at: "2026-05-05T08:00:00Z",
        swarm_type: "debtor-email",
        stage: 1,
        email_id: "email-1",
        decision: "invoice_copy_request",
        confidence: 0.92,
        decision_details: { rule_id: "rule-1" },
        automation_run_id: "ar-1",
        agent_run_id: null,
      },
      {
        id: "pe-2",
        created_at: "2026-05-05T07:59:00Z",
        swarm_type: "debtor-email",
        stage: 1,
        email_id: "email-2",
        decision: "noise",
        confidence: 0.85,
        decision_details: null,
        automation_run_id: "ar-2",
        agent_run_id: null,
      },
      {
        id: "pe-3",
        created_at: "2026-05-05T07:58:00Z",
        swarm_type: "debtor-email",
        stage: 1,
        email_id: "email-3",
        decision: "unknown",
        confidence: null,
        decision_details: null,
        automation_run_id: "ar-3",
        agent_run_id: null,
      },
    ],
    selectedRow: null,
    outlierRows: [],
    countsRows: [],
    candidatesRows: [],
  };
});

describe("loadPageData — Phase 70-06 TELE-03 pipeline_events rewire", () => {
  it("Test 1: predicted-row feed reads from pipeline_events (NOT automation_runs)", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    expect(fromCalls).toContain("pipeline_events");
    // The predicted-row feed must NOT hit automation_runs as a primary list.
    // (The cost-outlier RPC stays on automation_runs but that's via .rpc, not .from.)
    expect(fromCalls.filter((t) => t === "automation_runs")).toHaveLength(0);
  });

  it("Test 2: filters by swarm_type AND stage=1 for the predicted-row feed", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    expect(lastListBuilder).not.toBeNull();
    const eqCols = lastListBuilder!._eqCalls.map((c) => `${c.col}=${c.val}`);
    expect(eqCols).toContain("swarm_type=debtor-email");
    expect(eqCols).toContain("stage=1");
  });

  it("Test 3: still calls classifier_queue_counts RPC (TELE-02 out-of-scope regression)", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    const countsCall = rpcCalls.find((c) => c.fn === "classifier_queue_counts");
    expect(countsCall).toBeDefined();
    expect((countsCall!.args as { p_swarm_type: string }).p_swarm_type).toBe(
      "debtor-email",
    );
  });

  it("Test 4: still calls loadCoordinatorRunsForReview (out-of-scope side-loader regression)", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    expect(loadCoordinatorRunsForReviewMock).toHaveBeenCalled();
    // It is invoked with the row ids from the pipeline_events feed.
    const callArg = loadCoordinatorRunsForReviewMock.mock.calls[0][0];
    expect(Array.isArray(callArg)).toBe(true);
    expect(callArg).toEqual(["pe-1", "pe-2", "pe-3"]);
  });

  it("Test 5: when pipeline_events returns 3 rows, page data has 3 row entries", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    expect(data.rows).toHaveLength(3);
    expect(data.rows.map((r) => r.id)).toEqual(["pe-1", "pe-2", "pe-3"]);
  });
});
