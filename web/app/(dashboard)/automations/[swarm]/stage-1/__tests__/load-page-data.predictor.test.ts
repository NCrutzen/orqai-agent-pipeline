// Phase 999.8 Plan 01 — RED scaffold for D-05 (URL filter chips) +
// D-11 (denormalized predictor / confidence filter via decision_details).
//
// Contract (RESEARCH §6 + PATTERNS §"loadPageData extension point"):
//   - ?predictor=llm_2nd_pass adds an eq filter on
//     decision_details->>predictor on the predicted-row query.
//   - ?predictor=regex adds the analogous filter.
//   - ?confidence=medium adds an eq filter on
//     decision_details->>llm_confidence.
//   - Invalid ?predictor=garbage is silently ignored (no filter applied;
//     not a 400) — opt-in slicing, broken URLs degrade gracefully.
//   - Default (no params) returns rows UNFILTERED by predictor/confidence
//     (D-06).
//
// Hard-separation discipline: Stage 1 noise-filter rows only —
// pipeline_events stage=1. No swarm_intents / Stage 3 crossings.
//
// RED today because:
//   - PageSearchParams does not declare predictor / confidence.
//   - loadPageData does not call .eq("decision_details->>predictor", ...)
//     or .eq("decision_details->>llm_confidence", ...).

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Chainable mock builder ----------------------------------------------

interface EqCall {
  col: string;
  val: unknown;
}

interface MockBuilder {
  _table: string;
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

function makeBuilder(
  table: string,
  resolveValue: { data: unknown; error: unknown },
): MockBuilder {
  const b: Partial<MockBuilder> = {};
  b._table = table;
  b._eqCalls = [];
  b._orderCalls = [];
  b._limit = null;
  b._lt = null;
  b._inCalls = [];
  b._selectCols = null;
  b._resolveValue = resolveValue;
  b.select = (cols) => {
    b._selectCols = cols;
    return b as MockBuilder;
  };
  b.eq = (col, val) => {
    b._eqCalls!.push({ col, val });
    return b as MockBuilder;
  };
  b.order = (col) => {
    b._orderCalls!.push({ col });
    return b as MockBuilder;
  };
  b.limit = (n) => {
    b._limit = n;
    return b as MockBuilder;
  };
  b.lt = (col, val) => {
    b._lt = { col, val };
    return b as MockBuilder;
  };
  b.gte = () => b as MockBuilder;
  b.in = (col, vals) => {
    b._inCalls!.push({ col, vals });
    return b as MockBuilder;
  };
  b.single = async () => resolveValue;
  b.then = (cb) => Promise.resolve(cb(resolveValue));
  return b as MockBuilder;
}

// ---- Side-loader mocks (TELE-02 regression) ------------------------------

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

// ---- Admin mock ----------------------------------------------------------

let pipelineEventsBuilder: MockBuilder | null = null;
const fromCalls: string[] = [];

const adminClientMock = {
  from: vi.fn((table: string) => {
    fromCalls.push(table);
    if (table === "pipeline_events_email_summary") {
      return makeBuilder(table, { data: [], error: null });
    }
    if (table === "pipeline_events") {
      const b = makeBuilder(table, { data: [], error: null });
      pipelineEventsBuilder = b;
      return b;
    }
    if (table === "classifier_rules") {
      return makeBuilder(table, { data: [], error: null });
    }
    return makeBuilder(table, { data: [], error: null });
  }),
  rpc: vi.fn(async () => ({ data: [], error: null })),
  schema(_name: string) {
    return this;
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Import AFTER mocks
import {
  loadPageData,
  type PageSearchParams,
} from "@/app/(dashboard)/automations/[swarm]/stage-1/page";

beforeEach(() => {
  fromCalls.length = 0;
  pipelineEventsBuilder = null;
  adminClientMock.from.mockClear();
  adminClientMock.rpc.mockClear();
});

function eqColsOnPipelineEvents(): EqCall[] {
  return pipelineEventsBuilder?._eqCalls ?? [];
}

describe("Phase 999.8 D-05 + D-11 — predictor/confidence URL filter chips", () => {
  it("?predictor=llm_2nd_pass adds eq filter on decision_details->>predictor", async () => {
    const params: PageSearchParams = {
      predictor: "llm_2nd_pass",
    } as PageSearchParams;
    await loadPageData(
      params,
      adminClientMock as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
      "debtor-email",
    );
    const eqs = eqColsOnPipelineEvents();
    const predictorFilter = eqs.find(
      (e) => e.col === "decision_details->>predictor",
    );
    expect(predictorFilter).toBeDefined();
    expect(predictorFilter!.val).toBe("llm_2nd_pass");
  });

  it("?predictor=regex adds eq filter on decision_details->>predictor with value 'regex'", async () => {
    const params: PageSearchParams = {
      predictor: "regex",
    } as PageSearchParams;
    await loadPageData(
      params,
      adminClientMock as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
      "debtor-email",
    );
    const eqs = eqColsOnPipelineEvents();
    const predictorFilter = eqs.find(
      (e) => e.col === "decision_details->>predictor",
    );
    expect(predictorFilter).toBeDefined();
    expect(predictorFilter!.val).toBe("regex");
  });

  it("?confidence=medium adds eq filter on decision_details->>llm_confidence", async () => {
    const params: PageSearchParams = {
      confidence: "medium",
    } as PageSearchParams;
    await loadPageData(
      params,
      adminClientMock as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
      "debtor-email",
    );
    const eqs = eqColsOnPipelineEvents();
    const confidenceFilter = eqs.find(
      (e) => e.col === "decision_details->>llm_confidence",
    );
    expect(confidenceFilter).toBeDefined();
    expect(confidenceFilter!.val).toBe("medium");
  });

  it("invalid ?predictor=garbage is silently ignored (no filter applied)", async () => {
    const params: PageSearchParams = {
      predictor: "garbage",
    } as PageSearchParams;
    await loadPageData(
      params,
      adminClientMock as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
      "debtor-email",
    );
    const eqs = eqColsOnPipelineEvents();
    const predictorFilter = eqs.find(
      (e) => e.col === "decision_details->>predictor",
    );
    // Either filter absent entirely, or value should NOT be 'garbage'.
    if (predictorFilter) {
      expect(predictorFilter.val).not.toBe("garbage");
    } else {
      expect(predictorFilter).toBeUndefined();
    }
  });

  it("D-06 default: no predictor/confidence params → NO filter applied on decision_details->>predictor or decision_details->>llm_confidence", async () => {
    const params: PageSearchParams = {} as PageSearchParams;
    await loadPageData(
      params,
      adminClientMock as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
      "debtor-email",
    );
    const eqs = eqColsOnPipelineEvents();
    expect(
      eqs.find((e) => e.col === "decision_details->>predictor"),
    ).toBeUndefined();
    expect(
      eqs.find((e) => e.col === "decision_details->>llm_confidence"),
    ).toBeUndefined();
  });
});
