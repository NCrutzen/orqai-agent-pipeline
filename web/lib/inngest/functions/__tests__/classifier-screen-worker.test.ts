// Phase 74 Plan 04 — RED tests for classifier-screen-worker.
//
// Covers D-19's 7 cases plus Pitfalls 4 (replay-id stability) and 6
// (empty categories list). Mock-step pattern mirrors
// classifier-verdict-worker.test.ts and classifier-label-resolver.test.ts:
// the Inngest createFunction mock captures `(cfg, trigger, handler)` so we
// can extract `handler` and invoke it with a stubbed `step.run`.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Inngest mock --------------------------------------------------------
const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- Registry mocks ------------------------------------------------------
const loadSwarmMock = vi.fn();
const loadSwarmCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmCategories: (...args: unknown[]) =>
    loadSwarmCategoriesMock(...args),
}));

// ---- emitPipelineEvent mock ---------------------------------------------
const emitPipelineEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: (...args: unknown[]) => emitPipelineEventMock(...args),
}));

// ---- Orq agent mock ------------------------------------------------------
const invokeOrqAgentMock = vi.fn();
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: (...args: unknown[]) => invokeOrqAgentMock(...args),
}));

// ---- Regex module mock — debtor-email's classify ------------------------
// The worker dynamically imports swarmRow.stage1_regex_module at runtime.
// We mock that module path so our regex outcome is deterministic per test.
const classifyMock = vi.fn();
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: (...args: unknown[]) => classifyMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
const agentRunsInserts: Record<string, unknown>[] = [];
function makeAdminMock() {
  const insertFn = vi.fn(async (row: Record<string, unknown>) => {
    agentRunsInserts.push(row);
    return { data: null, error: null };
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") {
        return { insert: insertFn };
      }
      return {
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    __insertFn: insertFn,
  };
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub -----------------------------------------------------------
// Pitfall 4: to validate replay-id stability we wrap step.run with a per-
// event-id memoization so the second invocation with the same event.id
// returns the cached value instead of re-executing the body.
type StepCache = Map<string, unknown>;
function makeStepStub(cache: StepCache) {
  return {
    run: async (name: string, fn: () => Promise<unknown>) => {
      if (cache.has(name)) return cache.get(name);
      const v = await fn();
      cache.set(name, v);
      return v;
    },
  };
}

// ---- Event factory -------------------------------------------------------
const baseEvent = (
  overrides: Partial<{
    id: string;
    swarm_type: string;
    entity: string | null;
    subject: string;
    body_text: string;
  }> = {},
) => ({
  id: overrides.id ?? "evt-1",
  name: "classifier/screen.requested",
  data: {
    automation_run_id: "ar-uuid-1",
    email_id: "email-uuid-1",
    message_id: "msg-graph-1",
    source_mailbox: "debiteuren@smeba.nl",
    subject: overrides.subject ?? "Test subject",
    body_text: overrides.body_text ?? "Test body",
    swarm_type: overrides.swarm_type ?? "debtor-email",
    entity: overrides.entity ?? "smeba",
  },
});

// ---- Default mock fixtures ----------------------------------------------
const DEBTOR_SWARM_ROW = {
  swarm_type: "debtor-email",
  display_name: "Debtor Email",
  description: null,
  review_route: "/automations/debtor-email/review",
  source_table: "automation_runs",
  enabled: true,
  ui_config: {
    tree_levels: [],
    row_columns: [],
    drawer_fields: [],
    default_sort: "created_at desc",
  },
  side_effects: [],
  stage1_regex_module: "@/lib/debtor-email/classify",
  stage2_entity_resolver: null,
  stage3_coordinator_agent_key: null,
  canonical_context_shape: null,
  entity_brand: [],
};

const SALES_SWARM_ROW = {
  ...DEBTOR_SWARM_ROW,
  swarm_type: "sales-email",
  display_name: "Sales Email",
  stage1_regex_module: null,
};

const DEBTOR_CATEGORIES = [
  {
    swarm_type: "debtor-email",
    category_key: "auto_reply",
    display_label: "Auto-reply",
    outlook_label: "Auto-Reply",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 10,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "payment_admittance",
    display_label: "Payment Admittance",
    outlook_label: "Payment Admittance",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 40,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "unknown",
    display_label: "Unknown",
    outlook_label: null,
    action: "manual_review",
    swarm_dispatch: null,
    display_order: 50,
    enabled: true,
  },
];

const SALES_CATEGORIES = [
  {
    swarm_type: "sales-email",
    category_key: "auto_reply",
    display_label: "Auto-reply",
    outlook_label: "Auto-Reply",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 10,
    enabled: true,
  },
  {
    swarm_type: "sales-email",
    category_key: "ooo_temporary",
    display_label: "OOO (temporary)",
    outlook_label: "OoO — Temporary",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 20,
    enabled: true,
  },
  {
    swarm_type: "sales-email",
    category_key: "unknown",
    display_label: "Unknown",
    outlook_label: null,
    action: "manual_review",
    swarm_dispatch: null,
    display_order: 50,
    enabled: true,
  },
];

describe("classifier-screen-worker — Phase 74 Plan 04 RED tests", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts.length = 0;
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmCategoriesMock.mockReset();
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    invokeOrqAgentMock.mockReset();
    classifyMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../classifier-screen-worker");
    handler = (
      mod.classifierScreenWorker as unknown as {
        handler: typeof handler;
      }
    ).handler;
  });

  it("REQ-3 / regex hit → skips LLM, no agent_runs row, verdict carries regex category (debtor-email)", async () => {
    loadSwarmMock.mockResolvedValue(DEBTOR_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.9,
      matchedRule: "payment_kw_v1",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    expect(invokeOrqAgentMock).not.toHaveBeenCalled();
    expect(agentRunsInserts.length).toBe(0);
    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
    expect(emitPipelineEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ decision: "payment_admittance", stage: 1 }),
    );
    expect(inngestSend).toHaveBeenCalledTimes(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "classifier/verdict.recorded",
        data: expect.objectContaining({
          predicted_category: "payment_admittance",
          swarm_type: "debtor-email",
          source_mailbox: "debiteuren@smeba.nl",
        }),
      }),
    );
  });

  it("REQ-3 / sales-email no-regex → LLM-only path", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockResolvedValue({
      raw: { category_key: "auto_reply", confidence: "high", reasoning: null },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    expect(classifyMock).not.toHaveBeenCalled();
    expect(invokeOrqAgentMock).toHaveBeenCalledTimes(1);
    expect(invokeOrqAgentMock).toHaveBeenCalledWith(
      "stage-1-category-classifier",
      expect.objectContaining({
        subject: "Test subject",
        body_text: "Test body",
        categories: expect.any(Array),
      }),
    );
    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0].swarm_type).toBe("sales-email");
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predicted_category: "auto_reply",
          swarm_type: "sales-email",
        }),
      }),
    );
  });

  it("REQ-4 / LLM low confidence → coerced to 'unknown' but agent_runs row stays at confidence='low'", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockResolvedValue({
      raw: { category_key: "auto_reply", confidence: "low", reasoning: "unsure" },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0].confidence).toBe("low");
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ predicted_category: "unknown" }),
      }),
    );
  });

  it("REQ-4 / LLM medium confidence → category_key passes through", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "ooo_temporary",
        confidence: "medium",
        reasoning: null,
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    expect(agentRunsInserts[0].confidence).toBe("medium");
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          predicted_category: "ooo_temporary",
        }),
      }),
    );
  });

  it("D-11 / LLM throws → agent_runs status='failed', error_message set, verdict still emits with predicted_category='unknown'", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockRejectedValue(new Error("Orq timeout"));

    const cache: StepCache = new Map();
    let threw = false;
    try {
      await handler({
        event: baseEvent({ swarm_type: "sales-email", entity: null }),
        step: makeStepStub(cache),
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(agentRunsInserts.length).toBe(1);
    expect(agentRunsInserts[0].status).toBe("failed");
    expect(agentRunsInserts[0].error_message).toBeTruthy();
    const toolOutputs = agentRunsInserts[0].tool_outputs as Record<
      string,
      unknown
    >;
    expect(toolOutputs.error).toBeTruthy();
    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ predicted_category: "unknown" }),
      }),
    );
  });

  it("REQ-5 / pipeline_events row count is exactly 1 per worker invocation (regex-hit path)", async () => {
    loadSwarmMock.mockResolvedValue(DEBTOR_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
    classifyMock.mockReturnValue({
      category: "auto_reply",
      confidence: 0.95,
      matchedRule: "ar_subj_v1",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
  });

  it("REQ-5 / agent_runs row only when LLM invoked (no insert on regex-hit path)", async () => {
    loadSwarmMock.mockResolvedValue(DEBTOR_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
    classifyMock.mockReturnValue({
      category: "auto_reply",
      confidence: 0.95,
      matchedRule: "ar_subj_v1",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    expect(agentRunsInserts.length).toBe(0);
  });

  it("REQ-6 / sales-email payload processes without throwing; handler returns trace shape", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockResolvedValue({
      raw: { category_key: "auto_reply", confidence: "high", reasoning: null },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    const result = await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        regex_category: "unknown",
        llm_invoked: true,
        final_category_key: "auto_reply",
      }),
    );
  });

  it("Pitfall 4 / replay-id stability: two invocations with same event.id do NOT double-insert agent_runs", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
    invokeOrqAgentMock.mockResolvedValue({
      raw: { category_key: "auto_reply", confidence: "high", reasoning: null },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    // Shared step cache simulates Inngest replay: second invocation re-runs
    // the handler but step.run returns the cached values, so no side-effect
    // inside step.run("llm-call") fires again.
    const cache: StepCache = new Map();
    const ev = baseEvent({
      id: "evt-replay-1",
      swarm_type: "sales-email",
      entity: null,
    });
    await handler({ event: ev, step: makeStepStub(cache) });
    await handler({ event: ev, step: makeStepStub(cache) });

    expect(agentRunsInserts.length).toBe(1);
  });

  it("Pitfall 6 / empty categories list → coerce to 'unknown', no LLM call", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmCategoriesMock.mockResolvedValue([]); // empty registry result

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    expect(invokeOrqAgentMock).not.toHaveBeenCalled();
    expect(agentRunsInserts.length).toBe(0);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ predicted_category: "unknown" }),
      }),
    );
  });

  it("REQ-6 (static check) / classifier-screen-worker.ts contains zero swarm_type === 'X' branches", () => {
    const src = readFileSync(
      resolve(__dirname, "../classifier-screen-worker.ts"),
      "utf8",
    );
    expect(src).not.toMatch(
      /swarm_type\s*===\s*['"](sales-email|debtor-email)['"]/,
    );
  });
});
