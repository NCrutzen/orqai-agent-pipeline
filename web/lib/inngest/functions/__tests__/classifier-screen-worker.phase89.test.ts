// Phase 89 Plan 02 — RED test stubs for LLM-path rule_key + effectiveMatchedRule.
//
// Asserts the contract Plan 02 Task 2 will implement on
// classifier-screen-worker.ts:
//   (Test 1) LLM success path writes agent_runs.rule_key='llm:{cat}:{conf}'
//   (Test 2) LLM failure path writes agent_runs.rule_key='llm:unknown:low'
//   (Test 3) Regex hit preserves matchedRule — no llm:* substitution
//            (Pitfall 2 regression guard)
//   (Test 4) Promoted llm:auto_reply:high in whitelist → dispatch="labeled"
//            (SC-89-04 mechanism)
//   (Test 5) DECISION-01=NO — skipped. See 089-WAVE0-PROBE.md: the
//            automation_runs.rule_key column does not exist on the DB.
//
// Hard-separation discipline: pure Stage 1 noise-filter mechanics. No
// swarm_intents / Stage 3 crossings.
//
// Mock harness mirrors classifier-screen-worker.gate.test.ts.

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

// ---- Whitelist mock — returns the live Set so the worker's Array.from
// + new Set(...) reconstruction picks up whatever each test arranges.
let whitelistSet: Set<string> = new Set<string>();
vi.mock("@/lib/classifier/cache", () => ({
  readWhitelist: vi.fn(async () => whitelistSet),
}));

// ---- Outlook + emit-stale stubs (no-ops for these tests) -----------------
const categorizeEmailMock = vi.fn().mockResolvedValue({ success: true, error: null });
const archiveEmailMock = vi.fn().mockResolvedValue({ success: true, error: null });
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: (...args: unknown[]) => categorizeEmailMock(...args),
  archiveEmail: (...args: unknown[]) => archiveEmailMock(...args),
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
const automationRunsInserts: Record<string, unknown>[] = [];
// Default debtor labeling settings — present so the dispatch block runs.
let debtorLabelingSettings: Record<string, unknown> | null = {
  source_mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
  icontroller_company: "smebabrandbeveiliging",
  ingest_enabled: true,
  auto_label_enabled: true,
  triage_shadow_mode: false,
};

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
      if (table === "automation_runs") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            automationRunsInserts.push(row);
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
            maybeSingle: async () => ({
              data: debtorLabelingSettings,
              error: null,
            }),
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
const baseEvent = () => ({
  id: "evt-phase89-1",
  name: "classifier/screen.requested",
  data: {
    automation_run_id: "ar-uuid-phase89-1",
    email_id: "email-uuid-phase89-1",
    message_id: "msg-graph-phase89-1",
    source_mailbox: "debiteuren@smeba.nl",
    subject: "Test subject",
    body_text: "Test body",
    swarm_type: "debtor-email",
    entity: "smeba",
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

describe("classifier-screen-worker — Phase 89 rule_key + effectiveMatchedRule", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts.length = 0;
    automationRunsInserts.length = 0;
    whitelistSet = new Set<string>();
    debtorLabelingSettings = {
      source_mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
      icontroller_company: "smebabrandbeveiliging",
      ingest_enabled: true,
      auto_label_enabled: true,
      triage_shadow_mode: false,
    };
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
    categorizeEmailMock.mockClear();
    archiveEmailMock.mockClear();
    vi.resetModules();
    const mod = await import("../classifier-screen-worker");
    handler = (
      mod.classifierScreenWorker as unknown as {
        handler: typeof handler;
      }
    ).handler;
  });

  it("Test 1: LLM success path writes agent_runs.rule_key='llm:{cat}:{conf}'", async () => {
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "payment_admittance",
        confidence: "high",
        reasoning: "clear admit",
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const predicted = agentRunsInserts.find((r) => r.status === "predicted");
    expect(predicted).toBeDefined();
    expect(predicted?.rule_key).toBe("llm:payment_admittance:high");
  });

  it("Test 2: LLM failure path writes agent_runs.rule_key='llm:unknown:low'", async () => {
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });
    invokeOrqAgentMock.mockRejectedValue(new Error("orq agent timed out"));

    const cache: StepCache = new Map();
    await handler({ event: baseEvent(), step: makeStepStub(cache) });

    const failed = agentRunsInserts.find((r) => r.status === "failed");
    expect(failed).toBeDefined();
    expect(failed?.rule_key).toBe("llm:unknown:low");
  });

  it("Test 3 (Pitfall 2 regression guard): regex hit preserves matchedRule — no llm:* substitution", async () => {
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.9,
      matchedRule: "payment_subject",
    });
    // Prime whitelist so we can observe the .has(...) probe key. The
    // worker constructs `new Set(Array.from(readWhitelist(...)))`, so
    // tracking via the readWhitelist Proxy is insufficient. Instead, we
    // verify behavior end-to-end: a regex-hit payment_subject row that
    // matches a whitelist containing payment_subject should auto-archive
    // (dispatch="labeled"), and a row that matches a whitelist containing
    // ONLY an llm:* key should NOT. That dual probe pins matchedRule.
    whitelistSet = new Set<string>(["payment_subject"]);

    const cache: StepCache = new Map();
    const result = (await handler({
      event: baseEvent(),
      step: makeStepStub(cache),
    })) as { dispatch: string };

    // Regex hit + whitelisted regex key → auto-archive labeled.
    expect(result.dispatch).toBe("labeled");

    // Now flip: regex hit but whitelist contains only an llm:* key →
    // matchedRule must still be "payment_subject" (NOT llm:*) so the gate
    // does NOT auto-archive. If the worker incorrectly synthesized
    // matchedRule from a non-existent LLM verdict, the gate would compare
    // against "llm:..." and this dispatch would be different.
    whitelistSet = new Set<string>(["llm:payment_admittance:high"]);
    automationRunsInserts.length = 0;
    inngestSend.mockClear();
    const cache2: StepCache = new Map();
    const result2 = (await handler({
      event: baseEvent(),
      step: makeStepStub(cache2),
    })) as { dispatch: string };
    expect(result2.dispatch).not.toBe("labeled");
  });

  it("Test 4 (SC-89-04 mechanism): promoted llm:auto_reply:high in whitelist → dispatch='labeled'", async () => {
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });
    invokeOrqAgentMock.mockResolvedValue({
      raw: {
        category_key: "auto_reply",
        confidence: "high",
        reasoning: "OOO auto-reply detected",
      },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });
    whitelistSet = new Set<string>(["llm:auto_reply:high"]);

    const cache: StepCache = new Map();
    const result = (await handler({
      event: baseEvent(),
      step: makeStepStub(cache),
    })) as { dispatch: string };

    expect(result.dispatch).toBe("labeled");
  });

  it.skip("Test 5 (DECISION-01=NO): automation_runs.insert rule_key extension — deferred per 089-WAVE0-PROBE", async () => {
    // Skipped: the rule_key column does not exist on public.automation_runs.
    // See .planning/phases/089-stage-1-llm-2nd-pass-auto-action-promotion-track/089-WAVE0-PROBE.md
    // §"DECISION-01 — NO". Filed as separate latent-defect followup.
    expect(true).toBe(true);
  });
});
