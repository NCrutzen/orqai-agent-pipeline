// Phase 130 Plan 03 Task 2 — info-routing categories reach the LLM closed list.
//
// NOISE-01 invariant (docs/agentic-pipeline/stage-1-regex.md §"Pass 2"): the
// six new info-routing noise classes registered in swarm_noise_categories must
// actually flow into the CALL-TIME closed category list passed to the
// `stage-1-category-classifier` Orq agent. A registry row that never reaches
// the LLM is inert — the LLM can only emit a `category_key` it was shown.
//
// This test proves the registry→LLM link WITHOUT a live LLM call: it mocks
// loadSwarmNoiseCategories to return the 6 info-routing keys, captures the
// arguments invokeOrqAgent is called with, and asserts the `categories` array
// passed to the agent contains all 6 category_keys for an unknown info-routing
// email (info-routing has no regex Pass-1 module → every email reaches Pass 2).
//
// Hard-separation discipline: these are pure Stage-1 noise categories
// (swarm_noise_categories), never swarm_intents (Stage 3). Hermetic — no
// network, no live DB.
//
// Mock pattern mirrors classifier-screen-worker.gate.test.ts (the canonical
// analog at the same path): same Inngest createFunction mock that captures
// (cfg, trigger, handler), same Orq agent mock, same loadSwarm /
// loadSwarmNoiseCategories mocks, same step.run stub.

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

// ---- Orq agent mock (captures call-time closed list) ---------------------
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

// ---- Regex module mock (info-routing has none, but keep import safe) ------
const classifyMock = vi.fn();
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: (...args: unknown[]) => classifyMock(...args),
}));

// ---- Dispatch-deps mocks (safe no-op defaults) --------------------------
// info-routing has stage1_regex_module=null, so the debtor Step 4.5 block is
// never entered. Provide safe defaults anyway so module import is hermetic.
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

// ---- Supabase admin mock -------------------------------------------------
function makeAdminMock() {
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") {
        return { insert: vi.fn(async () => ({ data: null, error: null })) };
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

// ---- The 6 new info-routing noise categories (20260616b seed) ------------
const INFO_ROUTING_CATEGORY_KEYS = [
  "automated_security_report",
  "cold_sales_outreach",
  "marketing_newsletter",
  "auto_dealer_spam",
  "unsolicited_job_application",
  "survey_feedback_invite",
] as const;

const INFO_ROUTING_CATEGORIES = [
  {
    swarm_type: "info-routing",
    category_key: "automated_security_report",
    display_label: "Automated Security / System Report",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 70,
    enabled: true,
  },
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
  {
    swarm_type: "info-routing",
    category_key: "marketing_newsletter",
    display_label: "Marketing Newsletter",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 72,
    enabled: true,
  },
  {
    swarm_type: "info-routing",
    category_key: "auto_dealer_spam",
    display_label: "Auto-Dealer / Vehicle Spam",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 73,
    enabled: true,
  },
  {
    swarm_type: "info-routing",
    category_key: "unsolicited_job_application",
    display_label: "Unsolicited Job Application",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 74,
    enabled: true,
  },
  {
    swarm_type: "info-routing",
    category_key: "survey_feedback_invite",
    display_label: "Survey / Feedback Invite",
    outlook_label: "Spam",
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 75,
    enabled: true,
  },
];

// info-routing has NO Stage-1 regex module — every email reaches the LLM
// Pass-2 (the decisive fact for this test).
const INFO_ROUTING_SWARM_ROW = {
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
};

const infoEvent = (entity = "smeba") => ({
  id: `evt-info-${entity}`,
  name: "classifier/screen.requested",
  data: {
    automation_run_id: "ar-info-1",
    email_id: "email-info-1",
    message_id: "msg-info-1",
    source_mailbox: "info@smeba.nl",
    subject: "We noticed a vulnerability in your website",
    body_text: "Cold outreach body that the regex cannot classify.",
    swarm_type: "info-routing",
    entity,
  },
});

describe("Phase 130 Task 2 — info-routing categories reach the LLM closed list", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    loadSwarmMock.mockResolvedValue(INFO_ROUTING_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(INFO_ROUTING_CATEGORIES);
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    invokeOrqAgentMock.mockReset();
    // The LLM returns one of the closed-list keys — content is irrelevant to
    // this test; what matters is the `categories` argument it was CALLED with.
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

  it("passes all 6 info-routing category_keys to stage-1-category-classifier", async () => {
    const cache: StepCache = new Map();
    await handler({ event: infoEvent(), step: makeStepStub(cache) });

    // The LLM must have been invoked (info-routing has no regex Pass 1).
    expect(invokeOrqAgentMock).toHaveBeenCalledTimes(1);
    const [agentKey, payload] = invokeOrqAgentMock.mock.calls[0] as [
      string,
      { categories: { category_key: string; display_label: string }[] },
    ];
    expect(agentKey).toBe("stage-1-category-classifier");

    const passedKeys = payload.categories.map((c) => c.category_key);
    for (const key of INFO_ROUTING_CATEGORY_KEYS) {
      expect(passedKeys).toContain(key);
    }
  });

  it("drops no key — the closed list contains exactly the 6 enabled info-routing keys", async () => {
    const cache: StepCache = new Map();
    await handler({ event: infoEvent("fire-control"), step: makeStepStub(cache) });

    const [, payload] = invokeOrqAgentMock.mock.calls[0] as [
      string,
      { categories: { category_key: string; display_label: string }[] },
    ];
    const passedKeys = new Set(payload.categories.map((c) => c.category_key));

    // Every registered key flows through (registry→LLM link). If any of the 6
    // were dropped from the closed list, this set comparison fails — guarding
    // the NOISE-01 invariant that registry rows actually reach the LLM.
    expect(passedKeys.size).toBe(INFO_ROUTING_CATEGORY_KEYS.length);
    for (const key of INFO_ROUTING_CATEGORY_KEYS) {
      expect(passedKeys.has(key)).toBe(true);
    }
  });

  it("carries each key's display_label alongside the key (call-time closed list shape)", async () => {
    const cache: StepCache = new Map();
    await handler({ event: infoEvent(), step: makeStepStub(cache) });

    const [, payload] = invokeOrqAgentMock.mock.calls[0] as [
      string,
      { categories: { category_key: string; display_label: string }[] },
    ];
    const byKey = new Map(
      payload.categories.map((c) => [c.category_key, c.display_label]),
    );
    expect(byKey.get("survey_feedback_invite")).toBe("Survey / Feedback Invite");
    expect(byKey.get("automated_security_report")).toBe(
      "Automated Security / System Report",
    );
  });
});
