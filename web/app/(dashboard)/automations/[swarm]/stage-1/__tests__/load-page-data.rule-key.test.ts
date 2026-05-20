// Phase 89 Plan 05 — RED scaffold: loadPageData row-loader must synthesize
// PredictedRow.ruleKey for LLM 2nd-pass rows so the (swarm_type, rule_key)
// aggregate in classifier_rule_telemetry tracks LLM rows alongside regex rows
// (SC-89-02 second half).
//
// Contract (WAVE0-PROBE DECISION-02, RESEARCH OQ4):
//   For each PredictedRow whose Stage 1 pipeline_events timeline event has
//   decision_details.predictor === "llm_2nd_pass":
//     ruleKey = `llm:${decision_details.llm_category_key}:${decision_details.llm_confidence}`
//   Field paths are flat snake_case top-level on decision_details (verified
//   across 5/5 sampled prod rows). Confidence ∈ {"high","medium"}, category
//   key e.g. "auto_reply","unknown".
//
// Guards (skip synthesis, fall through to existing regex rule_key path):
//   - llm_category_key null/empty
//   - llm_confidence null/empty
//   - llm_category_key === "unknown" (must never auto-promote on unknown)
//
// Regex rows MUST be unchanged (Plan 02 Pitfall 2): predictor='regex' →
// ruleKey is sourced from the existing regex path (today: null on the
// PredictedRow, threaded separately downstream). Synthesis never produces
// 'llm:*' for regex rows.
//
// Hard-separation discipline: Stage 1 noise-filter rows only. The mock
// timelineMap below contains stage=1 events only — no swarm_intents
// (Stage 3) bleed.

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
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
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
  b.maybeSingle = async () => resolveValue;
  b.then = (cb) => Promise.resolve(cb(resolveValue));
  return b as MockBuilder;
}

// ---- Side-loader mocks ----------------------------------------------------

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
vi.mock("@/app/(dashboard)/automations/[swarm]/_shell/_lib/load-email-mailboxes", () => ({
  loadEmailMailboxes: async () => new Map<string, number>(),
}));

// ---- Fixtures: pipeline_events Stage 1 timeline rows ---------------------

interface PipelineEventFixture {
  id: string;
  created_at: string;
  swarm_type: string;
  stage: number;
  email_id: string | null;
  decision: string;
  confidence: number | null;
  decision_details: Record<string, unknown> | null;
  override: Record<string, unknown> | null;
  eval_type: null;
  triggered_by: string | null;
  automation_run_id: string | null;
  agent_run_id: string | null;
}

// Summary view row — drives the row list. One row per email.
interface SummaryRowFixture {
  email_id: string;
  swarm_type: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  recipient_mailbox: string | null;
  email_received_at: string | null;
  stage_0_decision: string | null;
  stage_1_decision: string | null;
  stage_2_decision: string | null;
  stage_3_decision: string | null;
  stage_4_decision: string | null;
  stage_1_overridden: boolean | null;
  stage_2_overridden: boolean | null;
  stage_3_overridden: boolean | null;
  stage_4_overridden: boolean | null;
  total_cost_cents: number | null;
  tool_call_count: number | null;
  first_event_at: string | null;
  last_event_at: string | null;
}

function makeSummaryRow(email_id: string): SummaryRowFixture {
  return {
    email_id,
    swarm_type: "debtor-email",
    subject: "Re: Invoice",
    sender_email: "bounce@example.com",
    sender_name: "Bounce",
    recipient_mailbox: "debiteuren@smeba.nl",
    email_received_at: "2026-05-20T10:00:00Z",
    stage_0_decision: "safe",
    stage_1_decision: "auto_reply",
    stage_2_decision: null,
    stage_3_decision: null,
    stage_4_decision: null,
    stage_1_overridden: false,
    stage_2_overridden: false,
    stage_3_overridden: false,
    stage_4_overridden: false,
    total_cost_cents: 0,
    tool_call_count: 0,
    first_event_at: "2026-05-20T10:00:00Z",
    last_event_at: "2026-05-20T10:00:00Z",
  };
}

function makeStage1Event(
  email_id: string,
  decision_details: Record<string, unknown>,
): PipelineEventFixture {
  return {
    id: `ev-${email_id}`,
    created_at: "2026-05-20T10:00:00Z",
    swarm_type: "debtor-email",
    stage: 1,
    email_id,
    decision: (decision_details.final_category_key as string) ?? "unknown",
    confidence: null,
    decision_details,
    override: null,
    eval_type: null,
    triggered_by: "classifier-screen-worker",
    automation_run_id: null,
    agent_run_id: null,
  };
}

// ---- Admin mock ----------------------------------------------------------

let summaryRows: SummaryRowFixture[] = [];
let timelineEvents: PipelineEventFixture[] = [];
let predictedRunsRows: Array<{ id: string; result: { message_id?: string } | null }> = [];
let emailRows: Array<{ id: string; source_id: string | null }> = [];
let bodyRows: Array<{ id: string; body_text: string | null; body_html: string | null }> = [];

const adminClientMock = {
  from: vi.fn((table: string) => {
    if (table === "pipeline_events_email_summary") {
      return makeBuilder(table, { data: summaryRows, error: null });
    }
    if (table === "pipeline_events") {
      // Both the entity-hydration query (no order) and the timeline query
      // (with stage order) resolve here; data is the full timeline so the
      // synthesis loop finds stage=1 events.
      return makeBuilder(table, { data: timelineEvents, error: null });
    }
    if (table === "classifier_rules") {
      return makeBuilder(table, { data: [], error: null });
    }
    if (table === "automation_runs") {
      return makeBuilder(table, { data: predictedRunsRows, error: null });
    }
    return makeBuilder(table, { data: [], error: null });
  }),
  rpc: vi.fn(async () => ({ data: [], error: null })),
  schema(_name: string) {
    // email_pipeline.emails — return chainable builder seeded per call site.
    return {
      from: (table: string) => {
        if (table === "emails") {
          // Two call sites: source_id .in() lookup and id .in() body lookup.
          // The mock resolves with both fixture sets concatenated; the
          // loader filters by the requested .in() ids so this is safe.
          const data = [
            ...emailRows.map((r) => ({ ...r })),
            ...bodyRows.map((r) => ({ ...r })),
          ];
          return makeBuilder(table, { data, error: null });
        }
        if (table === "email_labels") {
          return makeBuilder(table, { data: [], error: null });
        }
        return makeBuilder(table, { data: [], error: null });
      },
    };
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

// Import AFTER mocks
import {
  loadPageData,
  type PageSearchParams,
  type PredictedRow,
} from "@/app/(dashboard)/automations/[swarm]/stage-1/page";

beforeEach(() => {
  summaryRows = [];
  timelineEvents = [];
  predictedRunsRows = [];
  emailRows = [];
  bodyRows = [];
  adminClientMock.from.mockClear();
  adminClientMock.rpc.mockClear();
});

async function runLoader(): Promise<PredictedRow[]> {
  const params: PageSearchParams = {} as PageSearchParams;
  const data = await loadPageData(
    params,
    adminClientMock as unknown as ReturnType<
      typeof import("@/lib/supabase/admin").createAdminClient
    >,
    "debtor-email",
  );
  return data.rows;
}

describe("Phase 89 Plan 05 — PredictedRow.ruleKey synthesis for LLM 2nd-pass rows", () => {
  it("predictor='llm_2nd_pass' + llm_category_key='auto_reply' + llm_confidence='high' → ruleKey='llm:auto_reply:high'", async () => {
    const emailId = "email-llm-1";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-1", result: { message_id: "mid-1" } }];
    emailRows = [{ id: emailId, source_id: "mid-1" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        predictor: "llm_2nd_pass",
        llm_invoked: true,
        llm_category_key: "auto_reply",
        llm_confidence: "high",
        regex: { invoked: true, matchedRule: "no_match", category: "unknown" },
        final_category_key: "auto_reply",
      }),
    ];

    const rows = await runLoader();
    expect(rows.length).toBe(1);
    expect(rows[0].predictor).toBe("llm_2nd_pass");
    expect(rows[0].ruleKey).toBe("llm:auto_reply:high");
  });

  it("predictor='llm_2nd_pass' + medium confidence → ruleKey='llm:auto_reply:medium'", async () => {
    const emailId = "email-llm-2";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-2", result: { message_id: "mid-2" } }];
    emailRows = [{ id: emailId, source_id: "mid-2" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        predictor: "llm_2nd_pass",
        llm_invoked: true,
        llm_category_key: "auto_reply",
        llm_confidence: "medium",
        final_category_key: "auto_reply",
      }),
    ];

    const rows = await runLoader();
    expect(rows[0].ruleKey).toBe("llm:auto_reply:medium");
  });

  it("predictor='llm_2nd_pass' + llm_category_key='unknown' → ruleKey=null (never auto-promote on unknown)", async () => {
    const emailId = "email-llm-unknown";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-3", result: { message_id: "mid-3" } }];
    emailRows = [{ id: emailId, source_id: "mid-3" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        predictor: "llm_2nd_pass",
        llm_invoked: true,
        llm_category_key: "unknown",
        llm_confidence: "high",
        final_category_key: "unknown",
      }),
    ];

    const rows = await runLoader();
    expect(rows[0].predictor).toBe("llm_2nd_pass");
    expect(rows[0].ruleKey).toBeNull();
  });

  it("predictor='regex' → ruleKey is NOT synthesized as llm:* (regex behavior preserved, Plan 02 Pitfall 2)", async () => {
    const emailId = "email-regex-1";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-4", result: { message_id: "mid-4" } }];
    emailRows = [{ id: emailId, source_id: "mid-4" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        predictor: "regex",
        llm_invoked: false,
        regex: {
          invoked: true,
          matchedRule: "payment_subject",
          category: "payment_admittance",
        },
        final_category_key: "payment_admittance",
      }),
    ];

    const rows = await runLoader();
    expect(rows[0].predictor).toBe("regex");
    // Regex rows do not get llm:* synthesis. ruleKey stays null on the
    // PredictedRow shape (regex rule_key is threaded downstream via a
    // separate path).
    expect(rows[0].ruleKey).toBeNull();
  });

  it("predictor null / missing decision_details → ruleKey=null (does not throw)", async () => {
    const emailId = "email-null-1";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-5", result: { message_id: "mid-5" } }];
    emailRows = [{ id: emailId, source_id: "mid-5" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        // No predictor field — pre-cutover row.
        regex: { invoked: false, matchedRule: null, category: "unknown" },
      }),
    ];

    const rows = await runLoader();
    expect(rows[0].predictor).toBeNull();
    expect(rows[0].ruleKey).toBeNull();
  });

  it("predictor='llm_2nd_pass' but llm_confidence missing → ruleKey=null (skip synthesis)", async () => {
    const emailId = "email-llm-no-conf";
    summaryRows = [makeSummaryRow(emailId)];
    predictedRunsRows = [{ id: "ar-6", result: { message_id: "mid-6" } }];
    emailRows = [{ id: emailId, source_id: "mid-6" }];
    bodyRows = [{ id: emailId, body_text: "", body_html: null }];
    timelineEvents = [
      makeStage1Event(emailId, {
        predictor: "llm_2nd_pass",
        llm_invoked: true,
        llm_category_key: "auto_reply",
        // llm_confidence absent
        final_category_key: "auto_reply",
      }),
    ];

    const rows = await runLoader();
    expect(rows[0].predictor).toBe("llm_2nd_pass");
    expect(rows[0].ruleKey).toBeNull();
  });
});
