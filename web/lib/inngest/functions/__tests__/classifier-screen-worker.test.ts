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

// ---- Regex module mock — debtor-email's classify ------------------------
// The worker dynamically imports swarmRow.stage1_regex_module at runtime.
// We mock that module path so our regex outcome is deterministic per test.
const classifyMock = vi.fn();
vi.mock("@/lib/debtor-email/classify", () => ({
  classify: (...args: unknown[]) => classifyMock(...args),
}));

// ---- Phase 82.2 Plan 06 — dispatch deps mocks ----------------------------
// The Stage 1 worker now owns the debtor-email dispatch logic (auto-action +
// bulk-review automation_runs writes) that used to live in the synchronous
// ingest route. Default mocks below keep the pre-existing 12 tests passing
// (settings=null → dispatch short-circuits → existing emit-verdict path).
// The new "Phase 82.2 D-A — category dispatch" describe block per-test
// overrides these to exercise the new branches.
const readWhitelistMock = vi.fn().mockResolvedValue(new Set<string>());
vi.mock("@/lib/classifier/cache", () => ({
  readWhitelist: (...args: unknown[]) => readWhitelistMock(...args),
}));

const categorizeEmailMock = vi
  .fn()
  .mockResolvedValue({ success: true, error: null });
const archiveEmailMock = vi
  .fn()
  .mockResolvedValue({ success: true, error: null });
const getMessageMetaMock = vi.fn().mockResolvedValue({
  subject: "",
  from: "",
  fromName: "",
  receivedAt: "",
  categories: [] as string[],
});
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: (...args: unknown[]) => categorizeEmailMock(...args),
  archiveEmail: (...args: unknown[]) => archiveEmailMock(...args),
  getMessageMeta: (...args: unknown[]) => getMessageMetaMock(...args),
}));

const emitAutomationRunStaleMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) =>
    emitAutomationRunStaleMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
const agentRunsInserts: Record<string, unknown>[] = [];
const automationRunsInserts: Record<string, unknown>[] = [];
// Per-test override for the debtor.labeling_settings row. Default null (no
// settings row) keeps existing tests on the verdict.recorded path (the
// dispatch block bails out when settings is null).
let labelingSettingsRow: Record<string, unknown> | null = null;
function makeAdminMock() {
  const agentRunsInsertFn = vi.fn(async (row: Record<string, unknown>) => {
    agentRunsInserts.push(row);
    return { data: null, error: null };
  });
  // automation_runs supports both plain .insert() and .insert().select("id").single()
  // because the post-Plan-07 thin ingest pattern uses the latter for stage-0
  // placeholder rows.
  const automationRunsInsertFn = vi.fn((row: Record<string, unknown>) => {
    automationRunsInserts.push(row);
    const baseResult = { data: { id: `ar-mock-${automationRunsInserts.length}` }, error: null };
    const thenable = {
      then: (resolve: (v: unknown) => unknown) => resolve(baseResult),
      select: () => ({
        single: async () => baseResult,
      }),
    };
    return thenable;
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "agent_runs") {
        return { insert: agentRunsInsertFn };
      }
      if (table === "automation_runs") {
        return { insert: automationRunsInsertFn };
      }
      return {
        insert: vi.fn(async () => ({ data: null, error: null })),
      };
    }),
    // Phase 82.2 Plan 06 — `debtor.labeling_settings` is loaded via the
    // schema().from().select().eq().maybeSingle() chain. Default behavior
    // returns labelingSettingsRow (which defaults to null).
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: async () => ({ data: labelingSettingsRow, error: null }),
          })),
        })),
      })),
    })),
    __agentRunsInsertFn: agentRunsInsertFn,
    __automationRunsInsertFn: automationRunsInsertFn,
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
    body_full_text: string | null;
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
    // Phase 83 Plan 06b — Stage 1 reads body_full_text with body_text
    // fallback. Tests can pass null/undefined to exercise the fallback,
    // or a distinct string to verify the wider-input substitution.
    body_full_text:
      overrides.body_full_text === undefined ? null : overrides.body_full_text,
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
    automationRunsInserts.length = 0;
    labelingSettingsRow = null;
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    invokeOrqAgentMock.mockReset();
    classifyMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    readWhitelistMock.mockReset();
    readWhitelistMock.mockResolvedValue(new Set<string>());
    categorizeEmailMock.mockReset();
    categorizeEmailMock.mockResolvedValue({ success: true, error: null });
    archiveEmailMock.mockReset();
    archiveEmailMock.mockResolvedValue({ success: true, error: null });
    getMessageMetaMock.mockReset();
    getMessageMetaMock.mockResolvedValue({
      subject: "",
      from: "",
      fromName: "",
      receivedAt: "",
      categories: [] as string[],
    });
    emitAutomationRunStaleMock.mockReset();
    emitAutomationRunStaleMock.mockResolvedValue(undefined);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
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

  it("Phase 83 Plan 06b D-06 / regex bodySnippet prefers body_full_text over body_text (wider-input substitution)", async () => {
    // When the event carries BOTH body_full_text (full thread) and body_text
    // (legacy unique-only), the regex engine must see the full thread. This
    // is the whole point of Phase 83: forwards/replies are classified on
    // the entire conversation, not just the new fragment.
    loadSwarmMock.mockResolvedValue(DEBTOR_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: null,
    });
    // Stub LLM 2nd-pass so the unknown path doesn't blow up; the assertion
    // we care about is on `classify` (the regex engine) being fed the wider
    // input. The LLM forward assertion is covered below.
    invokeOrqAgentMock.mockResolvedValue({
      raw: { category_key: "unknown", confidence: "high", reasoning: null },
      agent: { agent_key: "stage-1-category-classifier" },
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({
        body_full_text: "FULL THREAD",
        body_text: "NEW ONLY",
      }),
      step: makeStepStub(cache),
    });

    // Regex engine fed the FULL thread, not the unique-only fragment.
    expect(classifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ bodySnippet: "FULL THREAD" }),
    );
    // LLM 2nd-pass on `unknown` also receives the full thread (D-10).
    expect(invokeOrqAgentMock).toHaveBeenCalledWith(
      "stage-1-category-classifier",
      expect.objectContaining({ body_text: "FULL THREAD" }),
    );
  });

  it("REQ-3 / sales-email no-regex → LLM-only path", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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

  it("REQ-4 / LLM low confidence → predicted category preserved; gate routes to classifier/screen.requires_review (Phase 999.8 D-01 supersedes prior low→unknown coercion)", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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
    // Phase 999.8 D-01/D-10: low confidence on a non-'unknown' category
    // emits requires_review (NOT verdict.recorded). The auto-archive
    // path is gated until a human reviews.
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "classifier/screen.requires_review",
        data: expect.objectContaining({
          llm_confidence: "low",
          llm_category_key: "auto_reply",
          final_category_key: "auto_reply",
        }),
      }),
    );
  });

  it("REQ-4 / LLM medium confidence → category_key passes through; gate routes to classifier/screen.requires_review (Phase 999.8 D-01)", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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
    // Phase 999.8 D-01/D-10: medium confidence on a non-'unknown' category
    // emits requires_review (NOT verdict.recorded).
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "classifier/screen.requires_review",
        data: expect.objectContaining({
          llm_confidence: "medium",
          final_category_key: "ooo_temporary",
        }),
      }),
    );
  });

  it("D-11 / LLM throws → agent_runs status='failed', error_message set, verdict still emits with predicted_category='unknown'", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue(DEBTOR_CATEGORIES);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);
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
    loadSwarmNoiseCategoriesMock.mockResolvedValue([]); // empty registry result

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

// ---------------------------------------------------------------------------
// Phase 82.2 Plan 06 D-A — category dispatch moved from debtor-email/ingest
// route into the Stage 1 worker. Covers six outcomes (skipped_idempotent /
// skipped_unknown→predicted / skipped_not_whitelisted→predicted /
// skipped_disabled / labeled (auto-action) / replay-stable).
//
// RFC alignment: this is pure Stage 1 noise-filter dispatch — the whitelist
// is a subset of swarm_noise_categories.matchedRule keys (closed list per
// docs/agentic-pipeline/stage-1-regex.md). NO swarm_intents touched.
// ---------------------------------------------------------------------------

describe("Phase 82.2 D-A — category dispatch (moved from ingest)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  // Fully-populated settings row for the dispatch path. Tests override
  // auto_label_enabled per-case.
  const SETTINGS_BASE = {
    source_mailbox: "debiteuren@smeba.nl",
    entity: "smeba",
    icontroller_company: "smebabrandbeveiliging",
    ingest_enabled: true,
    auto_label_enabled: true,
    triage_shadow_mode: false,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts.length = 0;
    automationRunsInserts.length = 0;
    labelingSettingsRow = { ...SETTINGS_BASE };
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
    readWhitelistMock.mockReset();
    readWhitelistMock.mockResolvedValue(new Set<string>());
    categorizeEmailMock.mockReset();
    categorizeEmailMock.mockResolvedValue({ success: true, error: null });
    archiveEmailMock.mockReset();
    archiveEmailMock.mockResolvedValue({ success: true, error: null });
    getMessageMetaMock.mockReset();
    getMessageMetaMock.mockResolvedValue({
      subject: "",
      from: "",
      fromName: "",
      receivedAt: "",
      categories: [] as string[],
    });
    emitAutomationRunStaleMock.mockReset();
    emitAutomationRunStaleMock.mockResolvedValue(undefined);
    vi.resetModules();
    const mod = await import("../classifier-screen-worker");
    handler = (
      mod.classifierScreenWorker as unknown as { handler: typeof handler }
    ).handler;
  });

  // Build a debtor-email event carrying the Plan-07 passthrough fields so
  // the dispatch block doesn't need a DB lookup for from/subject/received_at.
  const debtorEvent = (
    overrides: Partial<{
      message_id: string;
      subject: string;
      body_text: string;
      from: string;
      receivedAt: string;
      mailbox_id: number | null;
    }> = {},
  ) => ({
    id: "evt-dispatch-1",
    name: "classifier/screen.requested",
    data: {
      automation_run_id: "ar-dispatch-1",
      email_id: "email-dispatch-1",
      message_id: overrides.message_id ?? "msg-dispatch-1",
      source_mailbox: "debiteuren@smeba.nl",
      subject: overrides.subject ?? "Test subject",
      body_text: overrides.body_text ?? "Test body",
      swarm_type: "debtor-email",
      entity: "smeba",
      mailbox_id: overrides.mailbox_id ?? 4,
      from: overrides.from ?? "sender@example.com",
      fromName: "Sender",
      receivedAt: overrides.receivedAt ?? "2026-05-12T10:00:00.000Z",
    },
  });

  it("Test A: unknown category → emit classifier/verdict.recorded with predicted_category='unknown' (Stage 2 handoff), no bulk-review row, no Outlook side-effects", async () => {
    // 82.2-06 regression fix (2026-05-19): `unknown` skips the bulk-review
    // branch AND the auto-action branch and emits the verdict directly so
    // the verdict-worker dispatches `swarm_noise_categories.unknown.action=
    // 'swarm_dispatch'` → `debtor-email/label-resolve.requested` (Stage 2).
    // Previously this test asserted a bulk-review `predicted` row, which
    // codified the bug (Phase 82.2-06 swallowed unknowns into bulk-review).
    classifyMock.mockReturnValue({
      category: "unknown",
      confidence: 0,
      matchedRule: "no_match",
    });

    const cache: StepCache = new Map();
    await handler({ event: debtorEvent(), step: makeStepStub(cache) });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();

    // No bulk-review predicted row should be written for unknown.
    const predicted = automationRunsInserts.find(
      (r) => r.status === "predicted",
    );
    expect(predicted).toBeUndefined();

    // verdict.recorded should be emitted with predicted_category='unknown'.
    const verdictCall = inngestSend.mock.calls.find(
      ([payload]) =>
        (payload as { name: string }).name === "classifier/verdict.recorded" &&
        ((payload as { data: { predicted_category: string } }).data
          .predicted_category === "unknown"),
    );
    expect(verdictCall).toBeDefined();
    expect((verdictCall![0] as { data: Record<string, unknown> }).data).toMatchObject(
      {
        decision: "approve",
        predicted_category: "unknown",
        override_category: null,
      },
    );
  });

  it("Test B: whitelist match + auto_label_enabled=true → categorize+archive called, 2 automation_runs rows (completed audit + pending cleanup)", async () => {
    readWhitelistMock.mockResolvedValue(new Set(["subject_paid_marker"]));
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.96,
      matchedRule: "subject_paid_marker",
    });

    const cache: StepCache = new Map();
    await handler({ event: debtorEvent(), step: makeStepStub(cache) });

    expect(categorizeEmailMock).toHaveBeenCalledTimes(1);
    expect(archiveEmailMock).toHaveBeenCalledTimes(1);
    const completed = automationRunsInserts.find(
      (r) => r.automation === "debtor-email-review" && r.status === "completed",
    );
    const cleanup = automationRunsInserts.find(
      (r) =>
        r.automation === "debtor-email-cleanup" && r.status === "pending",
    );
    expect(completed).toBeDefined();
    expect(cleanup).toBeDefined();
    expect((cleanup!.result as Record<string, unknown>).company).toBe(
      "smebabrandbeveiliging",
    );
  });

  it("Test C: whitelist match + auto_label_enabled=false → automation_runs status='predicted' with action='skipped_disabled'; no Outlook side-effects", async () => {
    labelingSettingsRow = { ...SETTINGS_BASE, auto_label_enabled: false };
    readWhitelistMock.mockResolvedValue(new Set(["subject_paid_marker"]));
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.96,
      matchedRule: "subject_paid_marker",
    });

    const cache: StepCache = new Map();
    await handler({ event: debtorEvent(), step: makeStepStub(cache) });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();
    const predicted = automationRunsInserts.find(
      (r) => r.status === "predicted",
    );
    expect(predicted).toBeDefined();
    expect((predicted!.result as Record<string, unknown>).action).toBe(
      "skipped_disabled",
    );
  });

  it("Test D: predicted non-unknown category without whitelist match → automation_runs status='predicted', topic=category, action='skipped_not_whitelisted'; no Outlook side-effects", async () => {
    classifyMock.mockReturnValue({
      category: "auto_reply",
      confidence: 0.95,
      matchedRule: "subject_autoreply",
    });

    const cache: StepCache = new Map();
    await handler({ event: debtorEvent(), step: makeStepStub(cache) });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    const predicted = automationRunsInserts.find(
      (r) => r.status === "predicted",
    );
    expect(predicted).toBeDefined();
    expect(predicted!.topic).toBe("auto_reply");
    expect((predicted!.result as Record<string, unknown>).action).toBe(
      "skipped_not_whitelisted",
    );
  });

  it("Test E: email already carries MR_LABEL → automation_runs action='skipped_idempotent', no Outlook side-effects", async () => {
    getMessageMetaMock.mockResolvedValue({
      subject: "Test",
      from: "x@y.z",
      fromName: "X",
      receivedAt: "2026-05-12T10:00:00.000Z",
      categories: ["Payment Admittance"], // MR_LABEL
    });
    readWhitelistMock.mockResolvedValue(new Set(["subject_paid_marker"]));
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.96,
      matchedRule: "subject_paid_marker",
    });

    const cache: StepCache = new Map();
    await handler({ event: debtorEvent(), step: makeStepStub(cache) });

    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();
    const idempotent = automationRunsInserts.find(
      (r) =>
        ((r.result as Record<string, unknown>)?.action ?? "") ===
        "skipped_idempotent",
    );
    expect(idempotent).toBeDefined();
  });

  it("Test F: replay safety — two invocations with the same event do NOT double-call Outlook", async () => {
    readWhitelistMock.mockResolvedValue(new Set(["subject_paid_marker"]));
    classifyMock.mockReturnValue({
      category: "payment_admittance",
      confidence: 0.96,
      matchedRule: "subject_paid_marker",
    });

    // Shared step cache simulates Inngest replay — step.run("categorize")
    // returns cached result on the 2nd handler call so the side-effect
    // body doesn't re-run.
    const cache: StepCache = new Map();
    const ev = debtorEvent();
    await handler({ event: ev, step: makeStepStub(cache) });
    await handler({ event: ev, step: makeStepStub(cache) });

    expect(categorizeEmailMock).toHaveBeenCalledTimes(1);
    expect(archiveEmailMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Phase 999.4 RED scaffold — failing imports gate Wave 1+ implementation. Do
// not fix by stubbing — implement the contract.
// Covers test-map ID T-B5 from RESEARCH.md.
// ---------------------------------------------------------------------------

import { OrqClientTimeoutError } from "@/lib/automations/orq-agents/client";

// Phase 999.4 ships Plans 02 + 04 only. Plan 03 (Router transport swap) was
// reverted 2026-05-07 after empirical evidence showed the queue-stuck issue
// isn't chronic. Stage 1 remains on invokeOrqAgent. The D-11 catch must
// still coerce category_key='unknown' on OrqClientTimeoutError from that
// path — which is what this test verifies.

describe("Phase 999.4 — Classifier screen worker — deadline triggers existing D-11 catch (T-B5)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    agentRunsInserts.length = 0;
    automationRunsInserts.length = 0;
    labelingSettingsRow = null;
    adminMock = makeAdminMock();
    loadSwarmMock.mockReset();
    loadSwarmNoiseCategoriesMock.mockReset();
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    invokeOrqAgentMock.mockReset();
    classifyMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    readWhitelistMock.mockReset();
    readWhitelistMock.mockResolvedValue(new Set<string>());
    categorizeEmailMock.mockReset();
    categorizeEmailMock.mockResolvedValue({ success: true, error: null });
    archiveEmailMock.mockReset();
    archiveEmailMock.mockResolvedValue({ success: true, error: null });
    getMessageMetaMock.mockReset();
    getMessageMetaMock.mockResolvedValue({
      subject: "",
      from: "",
      fromName: "",
      receivedAt: "",
      categories: [] as string[],
    });
    emitAutomationRunStaleMock.mockReset();
    emitAutomationRunStaleMock.mockResolvedValue(undefined);
    vi.resetModules();
    const mod = await import("../classifier-screen-worker");
    handler = (
      mod.classifierScreenWorker as unknown as {
        handler: typeof handler;
      }
    ).handler;
  });

  it("when invokeOrqAgent throws OrqClientTimeoutError, D-11 catch coerces to category_key='unknown', confidence='low'", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM_ROW);
    loadSwarmNoiseCategoriesMock.mockResolvedValue(SALES_CATEGORIES);

    const timeout = new OrqClientTimeoutError(
      "Orq client deadline exceeded after 45000ms",
    );
    invokeOrqAgentMock.mockRejectedValue(timeout);

    const cache: StepCache = new Map();
    await handler({
      event: baseEvent({ swarm_type: "sales-email", entity: null }),
      step: makeStepStub(cache),
    });

    // D-11 catch — agent_runs failure row written.
    expect(agentRunsInserts.length).toBe(1);
    const row = agentRunsInserts[0] as {
      status: string;
      confidence: string;
      tool_outputs: { error?: string };
    };
    expect(row.status).toBe("failed");
    expect(row.confidence).toBe("low");
    expect(row.tool_outputs.error).toContain("Orq client deadline exceeded");

    // Downstream verdict event carries category_key='unknown'.
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "classifier/verdict.recorded",
        data: expect.objectContaining({ predicted_category: "unknown" }),
      }),
    );
  });
});
