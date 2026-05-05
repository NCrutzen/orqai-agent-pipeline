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
  _inCalls: Array<{ col: string; vals: unknown[] }>;
  _selectCols: string | null;
  _resolveValue: { data: unknown; error: unknown };
  select: (cols: string) => MockBuilder;
  eq: (col: string, val: unknown) => MockBuilder;
  order: (col: string, opts?: unknown) => MockBuilder;
  limit: (n: number) => MockBuilder;
  lt: (col: string, val: unknown) => MockBuilder;
  gte: (col: string, val: unknown) => MockBuilder;
  in: (col: string, vals: unknown[]) => MockBuilder;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: (cb: (v: { data: unknown; error: unknown }) => unknown) => Promise<unknown>;
}

function makeBuilder(resolveValue: { data: unknown; error: unknown }): MockBuilder {
  const b: Partial<MockBuilder> = {};
  b._eqCalls = [];
  b._orderCalls = [];
  b._limit = null;
  b._lt = null;
  b._inCalls = [];
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
  b.in = (col: string, vals: unknown[]) => {
    b._inCalls!.push({ col, vals });
    return b as MockBuilder;
  };
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

// Phase 71-03 D-10. Per-email aggregate view shape mirrors
// supabase/migrations/20260507a_pipeline_events_email_summary.sql.
interface EmailSummaryFixture {
  email_id: string;
  swarm_type: string;
  stage_0_decision: string | null;
  stage_1_decision: string | null;
  stage_2_decision: string | null;
  stage_3_decision: string | null;
  stage_4_decision: string | null;
  stage_1_overridden: boolean | null;
  stage_2_overridden: boolean | null;
  stage_3_overridden: boolean | null;
  stage_4_overridden: boolean | null;
  total_cost_cents: number;
  tool_call_count: number;
  first_event_at: string;
  last_event_at: string;
}

interface Scenario {
  pipelineEventsRows: PipelineEventFixture[];
  emailSummaryRows: EmailSummaryFixture[];
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
let lastSummaryBuilder: MockBuilder | null = null;

const adminClientMock = {
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "pipeline_events_email_summary") {
      // Phase 71-03 D-10. Predicted-row feed reads the per-email aggregate
      // view; selected-row detail still reads raw pipeline_events below.
      const b = makeBuilder({
        data: scenario.emailSummaryRows,
        error: null,
      });
      lastSummaryBuilder = b;
      return b;
    }
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
  lastSummaryBuilder = null;
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
    emailSummaryRows: [
      {
        email_id: "email-1",
        swarm_type: "debtor-email",
        stage_0_decision: "ok",
        stage_1_decision: "invoice_copy_request",
        stage_2_decision: "123.4567",
        stage_3_decision: "invoice_copy",
        stage_4_decision: "draft_created",
        stage_1_overridden: false,
        stage_2_overridden: false,
        stage_3_overridden: false,
        stage_4_overridden: false,
        total_cost_cents: 42,
        tool_call_count: 3,
        first_event_at: "2026-05-05T07:00:00Z",
        last_event_at: "2026-05-05T08:00:00Z",
      },
      {
        email_id: "email-2",
        swarm_type: "debtor-email",
        stage_0_decision: "ok",
        stage_1_decision: "noise",
        stage_2_decision: null,
        stage_3_decision: null,
        stage_4_decision: null,
        stage_1_overridden: true,
        stage_2_overridden: false,
        stage_3_overridden: false,
        stage_4_overridden: false,
        total_cost_cents: 0,
        tool_call_count: 0,
        first_event_at: "2026-05-05T07:30:00Z",
        last_event_at: "2026-05-05T07:59:00Z",
      },
    ],
    selectedRow: null,
    outlierRows: [],
    countsRows: [],
    candidatesRows: [],
  };
});

describe("loadPageData — Phase 71-03 D-10 view-driven predicted-row feed", () => {
  it("Test 1: predicted-row feed reads from pipeline_events_email_summary (NOT raw pipeline_events, NOT automation_runs)", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    expect(fromCalls).toContain("pipeline_events_email_summary");
    // No selected param → no detail fetch → raw pipeline_events not hit.
    expect(fromCalls.filter((t) => t === "pipeline_events")).toHaveLength(0);
    // The predicted-row feed must NOT hit automation_runs as a primary list.
    expect(fromCalls.filter((t) => t === "automation_runs")).toHaveLength(0);
  });

  it("Test 2: predicted-row feed filters by swarm_type and orders by last_event_at DESC", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    expect(lastSummaryBuilder).not.toBeNull();
    const eqCols = lastSummaryBuilder!._eqCalls.map((c) => `${c.col}=${c.val}`);
    expect(eqCols).toContain("swarm_type=debtor-email");
    expect(lastSummaryBuilder!._orderCalls.map((o) => o.col)).toContain(
      "last_event_at",
    );
    expect(lastSummaryBuilder!._limit).toBe(100);
  });

  it("Test 3: still calls classifier_queue_counts RPC (out-of-scope regression)", async () => {
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
    // It is invoked with the row ids from the view feed (now email_id-keyed).
    const callArg = loadCoordinatorRunsForReviewMock.mock.calls[0][0];
    expect(Array.isArray(callArg)).toBe(true);
    expect(callArg).toEqual(["email-1", "email-2"]);
  });

  it("Test 5: when view returns 2 rows, page data has 2 row entries keyed by email_id", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    expect(data.rows).toHaveLength(2);
    expect(data.rows.map((r) => r.id)).toEqual(["email-1", "email-2"]);
  });

  it("Test 6: predicted-row carries stage_1..4_decision + stage_1..4_overridden + total_cost_cents from view", async () => {
    const params: PageSearchParams = {};
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    const row1 = data.rows[0];
    expect(row1.stage_decisions).toBeDefined();
    expect(row1.stage_decisions).toMatchObject({
      0: "ok",
      1: "invoice_copy_request",
      2: "123.4567",
      3: "invoice_copy",
      4: "draft_created",
    });
    expect(row1.stage_overridden).toMatchObject({
      1: false,
      2: false,
      3: false,
      4: false,
    });
    expect(row1.total_cost_cents).toBe(42);
    expect(row1.tool_call_count).toBe(3);
    expect(row1.first_event_at).toBe("2026-05-05T07:00:00Z");
    expect(row1.last_event_at).toBe("2026-05-05T08:00:00Z");

    const row2 = data.rows[1];
    expect(row2.stage_overridden).toMatchObject({ 1: true });
  });

  it("Test 7: when ?selected=<email_id> is set, selected-row detail STILL reads raw pipeline_events", async () => {
    const params: PageSearchParams = {
      selected: "00000000-0000-4000-8000-000000000071",
    };
    scenario.selectedRow = {
      id: "pe-detail-1",
      created_at: "2026-05-05T08:00:00Z",
      swarm_type: "debtor-email",
      stage: 1,
      email_id: "00000000-0000-4000-8000-000000000071",
      decision: "invoice_copy_request",
      confidence: 0.92,
      decision_details: { rule_id: "rule-1" },
      automation_run_id: "ar-1",
      agent_run_id: null,
    };

    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    // Both tables hit in a single call: view for list, raw events for detail.
    expect(fromCalls).toContain("pipeline_events_email_summary");
    expect(fromCalls).toContain("pipeline_events");
  });
});
