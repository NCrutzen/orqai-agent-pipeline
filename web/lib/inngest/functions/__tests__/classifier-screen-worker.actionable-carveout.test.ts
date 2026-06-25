// Phase 130 Plan 05 Task 2 — SHARED swarm-agnostic actionable-token carve-out,
// WIRED into classifier-screen-worker.
//
// The carve-out is a registry-gated production veto: an adopting swarm
// (swarms.stage1_shared_block_rules ∋ 'actionable_token') whose LLM 2nd-pass
// returns a noise key but whose subject/body carries an actionable token
// (factuur/offerte/…) is forced BACK to 'unknown' (the non-archive key) so
// routable mail is never archived as noise. The override is auditable in
// agent_runs.tool_outputs (gated_to='unknown', shared_block_rule='actionable_token').
//
// REQ-6: the gate is a swarm-agnostic membership check on the adoption array,
// NOT a swarm_type literal. A swarm that did NOT adopt the rule (empty/undefined
// array — the default for debtor/sales/planning/order-entry) is NEVER vetoed:
// the LLM's noise key survives unchanged. Hard separation: this is a Stage-1
// noise-level override only — it never touches swarm_intents.
//
// Mock harness mirrors classifier-screen-worker.info-routing-categories.test.ts
// (same Inngest/registry/Orq/admin/step-stub mocks). The admin mock captures the
// agent_runs INSERT payload so we can assert tool_outputs.

import { describe, it, expect, vi, beforeEach } from "vitest";

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
const loadSwarmNoiseCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
}));

// ---- emitPipelineEvent mock ---------------------------------------------
const emitPipelineEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: (...args: unknown[]) => emitPipelineEventMock(...args),
}));

// ---- Orq agent mock ------------------------------------------------------
const invokeOrqAgentMock = vi.fn();
vi.mock("@/lib/automations/orq-agents/client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/automations/orq-agents/client")
  >("@/lib/automations/orq-agents/client");
  return {
    ...actual,
    invokeOrqAgent: (...args: unknown[]) => invokeOrqAgentMock(...args),
  };
});

// ---- Regex module mock (info-routing has none; keep import safe) ----------
const classifyMock = vi.fn();
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: (...args: unknown[]) => classifyMock(...args),
}));

// ---- Dispatch-deps mocks (safe no-op defaults) --------------------------
vi.mock("@/lib/classifier/cache", () => ({
  readWhitelist: vi.fn(async () => new Set<string>()),
}));
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: vi.fn().mockResolvedValue({ success: true, error: null }),
  archiveEmail: vi.fn().mockResolvedValue({ success: true, error: null }),
  getMessageMeta: vi.fn().mockResolvedValue({ categories: [] }),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

// ---- Supabase admin mock (captures agent_runs INSERT payload) -----------
let agentRunsInserts: Array<Record<string, unknown>>;
function makeAdminMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            agentRunsInserts.push(row);
            return { data: null, error: null };
          }),
        };
      }
      return { insert: vi.fn(async () => ({ data: null, error: null })) };
    }),
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: async () => ({ data: null, error: null }),
          })),
        })),
      })),
    })),
  };
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub -----------------------------------------------------------
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

// info-routing has NO Stage-1 regex module → every email reaches the LLM
// Pass-2. `stage1_shared_block_rules` carries the adoption array under test.
function swarmRow(adoption: string[] | undefined) {
  return {
    swarm_type: "info-routing",
    display_name: "Info Routing",
    description: null,
    review_route: "/automations/info-routing/review",
    source_table: "automation_runs",
    enabled: true,
    ui_config: {
      tree_levels: [],
      row_columns: [],
      drawer_fields: [],
      default_sort: "created_at desc",
    },
    side_effects: [],
    stage1_regex_module: null,
    stage2_entity_resolver: null,
    stage3_coordinator_agent_key: null,
    canonical_context_shape: null,
    entity_brand: [],
    tenant_domains: [],
    ...(adoption === undefined
      ? {}
      : { stage1_shared_block_rules: adoption }),
  };
}

// A single noise category so the LLM has something to predict.
const NOISE_CATEGORIES = [
  {
    swarm_type: "info-routing",
    category_key: "cold_sales_outreach",
    display_label: "Cold Sales / SEO Outreach",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 71,
    enabled: true,
  },
];

const event = (over: Record<string, unknown> = {}) => ({
  id: "evt-carveout-1",
  name: "classifier/screen.requested",
  data: {
    automation_run_id: "ar-1",
    email_id: "email-1",
    message_id: "msg-1",
    source_mailbox: "info@smeba.nl",
    subject: "Beste aanbieding voor uw bedrijf",
    body_text: "Generic cold outreach the regex cannot classify.",
    swarm_type: "info-routing",
    entity: "smeba",
    ...over,
  },
});

function agentRunRow() {
  // Only the predicted (not the failed) row carries the carve-out audit.
  return agentRunsInserts.find((r) => r.status === "predicted");
}

describe("Phase 130 Task 2 — actionable-token shared block-rule carve-out (wired)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts = [];
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockResolvedValue(NOISE_CATEGORIES);
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    invokeOrqAgentMock.mockReset();
    // LLM predicts a NOISE key — the carve-out's job is to veto this back to
    // 'unknown' when (and only when) the swarm adopted the rule and the content
    // carries an actionable token.
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "cold_sales_outreach",
        confidence: "high",
        reasoning: null,
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    classifyMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../classifier-screen-worker");
    handler = (
      mod.classifierScreenWorker as unknown as { handler: typeof handler }
    ).handler;
  });

  it("Test 1: adopted + actionable token in SUBJECT → forced 'unknown', auditable override", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(["actionable_token"]));
    const cache: StepCache = new Map();
    await handler({
      event: event({ subject: "Uw factuur van vorige week" }),
      step: makeStepStub(cache),
    });

    const run = agentRunRow();
    expect(run).toBeDefined();
    const out = run!.tool_outputs as Record<string, unknown>;
    // Raw LLM prediction preserved for audit…
    expect(out.stage1_category).toBe("cold_sales_outreach");
    // …but the verdict is forced back to the non-archive key.
    expect(out.gated_to).toBe("unknown");
    expect(out.shared_block_rule).toBe("actionable_token");

    // The pipeline_events emit carries the forced 'unknown' (not archived).
    const decision = (emitPipelineEventMock.mock.calls[0]?.[1] as {
      decision: string;
    }).decision;
    expect(decision).toBe("unknown");
  });

  it("Test 2: adopted + actionable token in BODY → forced 'unknown' (predicate sees subject+body)", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(["actionable_token"]));
    const cache: StepCache = new Map();
    await handler({
      event: event({
        subject: "Even een vraagje",
        body_full_text: "Goedemiddag,\n\nHierbij de gevraagde offerte.\n\nMvg",
      }),
      step: makeStepStub(cache),
    });

    const out = agentRunRow()!.tool_outputs as Record<string, unknown>;
    expect(out.gated_to).toBe("unknown");
    expect(out.shared_block_rule).toBe("actionable_token");
  });

  it("Test 3: NOT adopted (empty array) + actionable token → NO veto (LLM noise key survives)", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow([]));
    const cache: StepCache = new Map();
    await handler({
      event: event({ subject: "Uw factuur van vorige week" }),
      step: makeStepStub(cache),
    });

    const out = agentRunRow()!.tool_outputs as Record<string, unknown>;
    // Debtor/sales/planning/order-entry behaviour is untouched: the LLM's
    // noise key survives, no override recorded.
    expect(out.gated_to).toBe("cold_sales_outreach");
    expect(out.shared_block_rule).toBeUndefined();
  });

  it("Test 3b: adoption array UNDEFINED (pre-migration row) → NO veto", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(undefined));
    const cache: StepCache = new Map();
    await handler({
      event: event({ subject: "Uw factuur van vorige week" }),
      step: makeStepStub(cache),
    });

    const out = agentRunRow()!.tool_outputs as Record<string, unknown>;
    expect(out.gated_to).toBe("cold_sales_outreach");
    expect(out.shared_block_rule).toBeUndefined();
  });

  it("Test 4: adopted but NO actionable token → NO veto (carve-out is back-off only, never archives more)", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(["actionable_token"]));
    const cache: StepCache = new Map();
    await handler({
      event: event({
        subject: "Rank higher: improve your website SEO today",
        body_full_text: "Cold outreach, no actionable signal anywhere.",
      }),
      step: makeStepStub(cache),
    });

    const out = agentRunRow()!.tool_outputs as Record<string, unknown>;
    expect(out.gated_to).toBe("cold_sales_outreach");
    expect(out.shared_block_rule).toBeUndefined();
  });
});
