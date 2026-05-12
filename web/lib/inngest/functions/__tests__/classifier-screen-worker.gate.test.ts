// Phase 999.8 Plan 01 — RED scaffold for the confidence gate (D-01, D-10).
//
// These tests describe the contract the Wave 2 implementation must satisfy:
// when the LLM 2nd-pass returns medium/low confidence on a category that
// would otherwise auto-archive, the worker must emit a new event
// `classifier/screen.requires_review` INSTEAD of the existing
// `classifier/verdict.recorded` — leaving the upstream
// automation_runs.status='predicted' so the row stays queued for human
// review in the Stage 1 row list.
//
// Hard-separation discipline: this is pure Stage 1 noise-filter mechanics
// (RFC docs/agentic-pipeline/stage-1-regex.md §"Pass 2"). No
// swarm_intents / Stage 3 crossings.
//
// All 6 tests in this file MUST fail RED against today's code. The
// existing worker unconditionally emits `classifier/verdict.recorded` on
// the LLM path (classifier-screen-worker.ts:317-330) — there is no gate
// yet. Plan 03 (Wave 2) lands the gate; these tests turn GREEN then.
//
// Mock pattern mirrors classifier-screen-worker.test.ts (the canonical
// analog at the same path) — same Inngest createFunction mock that
// captures (cfg, trigger, handler), same Orq agent mock, same
// loadSwarm / loadSwarmNoiseCategories mocks, same step.run stub.

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

// ---- Regex module mock --------------------------------------------------
const classifyMock = vi.fn();
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: (...args: unknown[]) => classifyMock(...args),
}));

// ---- Phase 82.2 Plan 06 dispatch-deps mocks (safe defaults) -------------
// The new debtor-email dispatch block in classifier-screen-worker.ts loads
// settings + whitelist + Outlook meta. We mock these as no-ops/empty so the
// dispatch block bails out (settings=null → fall through to existing
// verdict.recorded / requires_review path that this file actually tests).
vi.mock("@/lib/classifier/cache", () => ({
  readWhitelist: vi.fn().mockResolvedValue(new Set<string>()),
}));
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: vi.fn().mockResolvedValue({ success: true, error: null }),
  archiveEmail: vi.fn().mockResolvedValue({ success: true, error: null }),
  getMessageMeta: vi.fn().mockResolvedValue({
    subject: "",
    from: "",
    fromName: "",
    receivedAt: "",
    categories: [],
  }),
}));
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
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
      if (table === "agent_runs") return { insert: insertFn };
      return { insert: vi.fn(async () => ({ data: null, error: null })) };
    }),
    // Phase 82.2 Plan 06 — `debtor.labeling_settings` chain. Default returns
    // null → the dispatch block in classifier-screen-worker bails out and
    // the existing verdict.recorded / requires_review path under test runs.
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
  id: overrides.id ?? "evt-gate-1",
  name: "classifier/screen.requested",
  data: {
    automation_run_id: "ar-uuid-gate-1",
    email_id: "email-uuid-gate-1",
    message_id: "msg-graph-gate-1",
    source_mailbox: "debiteuren@smeba.nl",
    subject: overrides.subject ?? "Test subject",
    body_text: overrides.body_text ?? "Test body",
    swarm_type: overrides.swarm_type ?? "debtor-email",
    entity: overrides.entity ?? "smeba",
  },
});

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

function eventNamesSent(): string[] {
  return inngestSend.mock.calls.map(
    (c) => (c[0] as { name: string }).name,
  );
}

describe("Phase 999.8 D-01 / D-10 — classifier-screen-worker confidence gate", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts.length = 0;
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    loadSwarmMock.mockResolvedValue(DEBTOR_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
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

  it("regex hit (llmInvoked=false) → emits classifier/verdict.recorded (unchanged today)", async () => {
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.9,
      matchedRule: "payment_kw_v1",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const names = eventNamesSent();
    expect(names).toContain("classifier/verdict.recorded");
    expect(names).not.toContain("classifier/screen.requires_review");
  });

  it("LLM high confidence → emits classifier/verdict.recorded, NOT requires_review", async () => {
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "payment_admittance",
        confidence: "high",
        reasoning: null,
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const names = eventNamesSent();
    expect(names).toContain("classifier/verdict.recorded");
    expect(names).not.toContain("classifier/screen.requires_review");
  });

  it("LLM medium confidence → emits classifier/screen.requires_review, DOES NOT emit verdict.recorded", async () => {
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "payment_admittance",
        confidence: "medium",
        reasoning: "ambiguous",
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const names = eventNamesSent();
    expect(names).toContain("classifier/screen.requires_review");
    expect(names).not.toContain("classifier/verdict.recorded");

    // Payload contract from RESEARCH §4: requires_review carries enough
    // identifiers for a future learning-loop subscriber.
    const reviewCall = inngestSend.mock.calls.find(
      (c) => (c[0] as { name: string }).name ===
        "classifier/screen.requires_review",
    );
    expect(reviewCall).toBeDefined();
    expect(reviewCall![0]).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          automation_run_id: "ar-uuid-gate-1",
          email_id: "email-uuid-gate-1",
          swarm_type: "debtor-email",
          llm_confidence: "medium",
          final_category_key: "payment_admittance",
        }),
      }),
    );
  });

  it("LLM low confidence → emits classifier/screen.requires_review, DOES NOT emit verdict.recorded", async () => {
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "payment_admittance",
        confidence: "low",
        reasoning: "very unsure",
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const names = eventNamesSent();
    expect(names).toContain("classifier/screen.requires_review");
    expect(names).not.toContain("classifier/verdict.recorded");
  });

  it("LLM returns 'unknown' regardless of confidence → label-only-skip path emits verdict.recorded (NOT requires_review)", async () => {
    // RESEARCH §1 gate: finalCategoryKey === "unknown" clears the gate
    // because the label-only-skip path (action=manual_review) is the
    // existing 'unknown' escape, not an auto-archive.
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "unknown",
        confidence: "medium",
        reasoning: "unsure → unknown",
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const names = eventNamesSent();
    expect(names).toContain("classifier/verdict.recorded");
    expect(names).not.toContain("classifier/screen.requires_review");
  });

  it("emit-pipeline-event is called unconditionally on every branch (regex / high / medium / low / unknown)", async () => {
    // RESEARCH §1: the pipeline_events row is emitted regardless of the
    // gate decision, so per-email aggregate views still observe the
    // Stage 1 decision in all cases.
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "payment_admittance",
        confidence: "medium",
        reasoning: null,
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
  });
});
