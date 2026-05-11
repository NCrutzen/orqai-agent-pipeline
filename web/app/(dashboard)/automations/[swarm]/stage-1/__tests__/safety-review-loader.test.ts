// Phase 64-05 (SAFE-02 / SAFE-04 / BUDG-03). Loader test for the
// `?tab=safety` branch in the bulk-review page-data loader. Locks:
//   - filter on topic='safety_review'
//   - outlier enrichment via automation_runs_with_outlier RPC
//   - bootstrap-guard (sample_count<100 → is_cost_outlier=false on every row)
//   - regression: existing (non-safety) tab branches stay unchanged
//
// We mock the admin client as a chainable query-builder. The list query for
// the safety branch chains
//   .from(...).select(...).eq.eq.eq.eq.order.limit  (and optionally .lt)
// then resolves with `{ data, error }`. The RPC call resolves with the same
// shape. The mock records every `.eq(col, val)` call so the test can assert
// that `topic='safety_review'` was applied.

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
  b.in = () => b as MockBuilder;
  b.single = async () => resolveValue;
  // The Supabase JS query is a thenable — `await query` triggers `.then`.
  b.then = (cb: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(cb(resolveValue));
  return b as MockBuilder;
}

// ---- Stage scenario --------------------------------------------------------

// Phase 70-06: rows match the public.pipeline_events shape.
interface PipelineEventFixture {
  id: string;
  created_at: string;
  swarm_type: string;
  stage: number;
  email_id: string | null;
  decision: string;
  confidence: number | null;
  automation_run_id: string | null;
  agent_run_id: string | null;
  decision_details: Record<string, unknown> | null;
}

interface Scenario {
  // Rows the safety query returns (pipeline_events shape).
  safetyRows: PipelineEventFixture[];
  // Outlier RPC payload — keyed on automation_run_id (still on automation_runs in v1).
  outlierRows: Array<{ id: string; is_cost_outlier: boolean }>;
  outlierError?: { message: string } | null;
  // Counts RPC.
  countsRows: Array<{ swarm_type: string; topic: string | null; entity: string | null; mailbox_id: number | null; count: number }>;
  // Candidates classifier_rules query (used by every tab branch).
  candidatesRows: Array<{ rule_key: string; status: string; n: number; ci_lo: number | null }>;
  // Generic predicted-list query (pipeline_events shape, stage=1).
  predictedRows: PipelineEventFixture[];
}

let scenario: Scenario;

// Track every .from() call so we can assert which path the loader took.
const fromCalls: string[] = [];
const rpcCalls: Array<{ fn: string; args: unknown }> = [];

// Last-built builder per table — exposes .eq calls for assertion.
let lastListBuilder: MockBuilder | null = null;

const adminClientMock = {
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "pipeline_events") {
      // Phase 70-06: predicted-list + safety-list now both read from
      // pipeline_events. The fixture rows already have the
      // pipeline_events shape (id, decision, decision_details).
      const inUseTab = currentTab;
      const data =
        inUseTab === "safety" ? scenario.safetyRows : scenario.predictedRows;
      const b = makeBuilder({ data, error: null });
      lastListBuilder = b;
      return b;
    }
    if (table === "classifier_rules") {
      return makeBuilder({ data: scenario.candidatesRows, error: null });
    }
    return makeBuilder({ data: [], error: null });
  }),
  rpc: vi.fn((fn: string, args: unknown) => {
    rpcCalls.push({ fn, args });
    if (fn === "classifier_queue_counts") {
      return Promise.resolve({ data: scenario.countsRows, error: null });
    }
    if (fn === "automation_runs_with_outlier") {
      return Promise.resolve({
        data: scenario.outlierError ? null : scenario.outlierRows,
        error: scenario.outlierError ?? null,
      });
    }
    return Promise.resolve({ data: [], error: null });
  }),
};

// Track the active tab so the .from('automation_runs') stub can pick the
// correct dataset (the loader calls it once per tab).
let currentTab: string | undefined;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Phase 70-06: side-loaders use their own admin client (not the one we
// inject into loadPageData). Stub them so the safety branch doesn't reach
// the real implementations.
vi.mock(
  "@/app/(dashboard)/automations/debtor-email/_lib/coordinator-runs-loader",
  () => ({
    loadCoordinatorRunsForReview: async () => new Map(),
  }),
);
vi.mock(
  "@/app/(dashboard)/automations/debtor-email/_lib/tagging-failures-loader",
  () => ({
    loadTaggingFailuresForReview: async () => new Map(),
  }),
);

// Import AFTER mocks
import { loadPageData, type PageSearchParams } from "@/app/(dashboard)/automations/[swarm]/stage-1/page";

beforeEach(() => {
  fromCalls.length = 0;
  rpcCalls.length = 0;
  lastListBuilder = null;
  currentTab = undefined;
  adminClientMock.from.mockClear();
  adminClientMock.rpc.mockClear();
  // Phase 70-06: rows now match the public.pipeline_events shape.
  // The loader maps `decision_details` → PredictedRow.result and joins
  // the cost-outlier RPC by `automation_run_id` instead of the row id.
  scenario = {
    safetyRows: [
      {
        id: "pe-safety-1",
        created_at: "2026-05-05T08:00:00Z",
        swarm_type: "debtor-email",
        stage: 0,
        email_id: "email-safety-1",
        decision: "injection_suspected",
        confidence: null,
        automation_run_id: "ar-safety-1",
        agent_run_id: null,
        decision_details: {
          stage: "stage_0_safety",
          regex_matched: "ignore_previous_instructions",
          llm_reason: "explicit jailbreak attempt",
          matched_span: "ignore previous instructions",
          cost_cents: 12,
          token_count: 800,
        },
      },
      {
        id: "pe-safety-2",
        created_at: "2026-05-05T07:59:00Z",
        swarm_type: "debtor-email",
        stage: 0,
        email_id: "email-safety-2",
        decision: "injection_suspected",
        confidence: null,
        automation_run_id: "ar-safety-2",
        agent_run_id: null,
        decision_details: {
          stage: "stage_0_safety",
          regex_matched: null,
          llm_reason: "instruction injection vector",
          matched_span: "now act as ...",
          cost_cents: 8,
          token_count: 540,
        },
      },
    ],
    outlierRows: [
      { id: "ar-safety-1", is_cost_outlier: true },
      { id: "ar-safety-2", is_cost_outlier: false },
    ],
    outlierError: null,
    countsRows: [],
    candidatesRows: [],
    predictedRows: [
      {
        id: "pe-pred-1",
        created_at: "2026-05-05T08:00:00Z",
        swarm_type: "debtor-email",
        stage: 1,
        email_id: "email-pred-1",
        decision: "credit_question",
        confidence: 0.9,
        automation_run_id: "ar-pred-1",
        agent_run_id: null,
        decision_details: { topic: "credit_question" },
      },
    ],
  };
});

describe("loadPageData — ?tab=safety branch (Phase 64-05 + Phase 70-06 TELE-03)", () => {
  it("filters pipeline_events on stage=0 + decision='injection_suspected' when params.tab==='safety'", async () => {
    currentTab = "safety";
    const params: PageSearchParams = { tab: "safety" };
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    // Phase 70-06: safety branch now reads pipeline_events (not automation_runs).
    expect(fromCalls).toContain("pipeline_events");
    expect(lastListBuilder).not.toBeNull();
    const eqCols = lastListBuilder!._eqCalls.map((c) => `${c.col}=${c.val}`);
    expect(eqCols).toContain("swarm_type=debtor-email");
    expect(eqCols).toContain("stage=0");
    expect(eqCols).toContain("decision=injection_suspected");
  });

  it("calls automation_runs_with_outlier RPC and merges is_cost_outlier into rows by automation_run_id", async () => {
    currentTab = "safety";
    const params: PageSearchParams = { tab: "safety" };
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    const outlierCall = rpcCalls.find((c) => c.fn === "automation_runs_with_outlier");
    expect(outlierCall).toBeDefined();
    expect((outlierCall!.args as { p_swarm_type: string }).p_swarm_type).toBe("debtor-email");

    expect(data.rows).toHaveLength(2);
    // Rows are now keyed by pipeline_events.id (pe-safety-*); the outlier
    // join uses automation_run_id (ar-safety-*) under the hood.
    const r1 = data.rows.find((r) => r.id === "pe-safety-1") as unknown as { is_cost_outlier: boolean };
    const r2 = data.rows.find((r) => r.id === "pe-safety-2") as unknown as { is_cost_outlier: boolean };
    expect(r1.is_cost_outlier).toBe(true);
    expect(r2.is_cost_outlier).toBe(false);
  });

  it("preserves stage-0 result fields needed by the detail pane (mapped from decision_details)", async () => {
    currentTab = "safety";
    const params: PageSearchParams = { tab: "safety" };
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    const r = data.rows.find((row) => row.id === "pe-safety-1");
    expect(r).toBeDefined();
    const result = r!.result as Record<string, unknown>;
    expect(result.regex_matched).toBe("ignore_previous_instructions");
    expect(result.llm_reason).toBe("explicit jailbreak attempt");
    expect(result.matched_span).toBe("ignore previous instructions");
    expect(result.cost_cents).toBe(12);
  });

  it("treats every row as is_cost_outlier=false when the RPC reports a sub-100 sample window (bootstrap guard, Pitfall 6)", async () => {
    // Simulate the RPC's bootstrap behavior: under 100 samples the function
    // returns is_cost_outlier=false for all ids regardless of cost.
    scenario.outlierRows = [
      { id: "ar-safety-1", is_cost_outlier: false },
      { id: "ar-safety-2", is_cost_outlier: false },
    ];
    currentTab = "safety";
    const params: PageSearchParams = { tab: "safety" };
    // @ts-expect-error — admin shape is structurally compatible for test.
    const data = await loadPageData(params, adminClientMock, "debtor-email");

    for (const r of data.rows) {
      expect((r as unknown as { is_cost_outlier: boolean }).is_cost_outlier).toBe(false);
    }
  });

  it("regression: when params.tab is not 'safety', the loader does NOT filter on stage=0 / decision=injection_suspected", async () => {
    currentTab = undefined;
    const params: PageSearchParams = {}; // no tab
    // @ts-expect-error — admin shape is structurally compatible for test.
    await loadPageData(params, adminClientMock, "debtor-email");

    // Phase 71-03 D-10: the default-branch predicted-row feed now reads
    // public.pipeline_events_email_summary (per-email aggregate view), not
    // raw public.pipeline_events with stage=1. The from('pipeline_events')
    // builder may not be touched at all on this branch — assert via the
    // .from() call log instead of lastListBuilder.
    expect(fromCalls).toContain("pipeline_events_email_summary");
    // It must NOT add a decision=injection_suspected filter (that is the
    // safety-tab signature; we are on the default tab here).
    if (lastListBuilder) {
      const eqCols = lastListBuilder._eqCalls.map((c) => `${c.col}=${c.val}`);
      expect(eqCols).not.toContain("decision=injection_suspected");
    }
  });
});
