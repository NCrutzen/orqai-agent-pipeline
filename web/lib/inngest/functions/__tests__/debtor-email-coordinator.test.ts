/**
 * Phase 65 Plan 03 — CORD-02 + CORD-04 debtor-email coordinator function.
 *
 * Mock-step shell mirrored from stage-0-safety-worker.test.ts. The Inngest
 * `inngest.send` and `createAdminClient` are mocked at module-import time so
 * the function body's side-effects can be inspected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { INTENT_VERSION_V2 } from "@/lib/automations/debtor-email/coordinator/types";

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

// ---- Supabase admin mock -------------------------------------------------
type CapturedUpdate = { table: string; patch: Record<string, unknown> };
type CapturedInsert = { table: string; row: Record<string, unknown> };
const captured = {
  inserts: [] as CapturedInsert[],
  updates: [] as CapturedUpdate[],
};

function makeSupabaseMock() {
  const channel = vi.fn(() => ({
    send: vi.fn().mockResolvedValue(undefined),
  }));
  const removeChannel = vi.fn().mockResolvedValue(undefined);

  const fromImpl = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn(async (row: Record<string, unknown>) => {
      captured.inserts.push({ table, row });
      return { data: null, error: null };
    });
    builder.update = vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(async () => {
        captured.updates.push({ table, patch });
        return { data: null, error: null };
      }),
    }));
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.not = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.single = vi.fn(async () => ({
      data: { id: "agent-run-id" },
      error: null,
    }));
    return builder;
  };
  return {
    from: vi.fn(fromImpl),
    channel,
    removeChannel,
  };
}

let supabaseMock = makeSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => supabaseMock),
}));

// ---- Module-under-test mocks --------------------------------------------
const invokeIntentMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/coordinator/invoke-intent", () => ({
  invokeIntentAgent: (...args: unknown[]) => invokeIntentMock(...args),
}));

const findCachedMock = vi.fn();
const mergeToolOutputsMock = vi.fn().mockResolvedValue(undefined);
const updateRunMock = vi.fn().mockResolvedValue(undefined);
const createRunMock = vi.fn().mockResolvedValue("agent-run-id-fresh");
vi.mock("@/lib/automations/debtor-email/coordinator/agent-runs", () => ({
  findCachedOutput: (...args: unknown[]) => findCachedMock(...args),
  mergeToolOutputs: (...args: unknown[]) => mergeToolOutputsMock(...args),
  updateRun: (...args: unknown[]) => updateRunMock(...args),
  createRun: (...args: unknown[]) => createRunMock(...args),
}));

const loadCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmCategories: (...args: unknown[]) => loadCategoriesMock(...args),
}));

const emitStaleMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));

// ---- Helpers -------------------------------------------------------------
function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-test",
    name: "debtor/email.received",
    data: {
      email_id: "email-1",
      graph_message_id: "graph-1",
      subject: "Kopie factuur",
      body_text: "Mag ik een kopie?",
      sender_email: "test@example.com",
      sender_domain: "example.com",
      mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
      received_at: "2026-05-03T10:00:00Z",
      run_id: "run-1",
      automation_run_id: "ar-1",
      budget_run_id: "budget-1",
      agent_run_id: "agent-run-given",
      ...overrides,
    },
  };
}

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildCategory(
  key: string,
  requires_orchestration: boolean,
  swarm_dispatch?: string,
) {
  return {
    swarm_type: "debtor-email",
    category_key: key,
    display_label: key,
    outlook_label: null,
    action: "swarm_dispatch" as const,
    swarm_dispatch: swarm_dispatch ?? `debtor-email/${key}.requested`,
    display_order: 0,
    enabled: true,
    requires_orchestration,
  };
}

const baseRanked = {
  document_reference: null,
  sub_type: null,
  reasoning: "r",
};

// ---- Tests ---------------------------------------------------------------
describe("CORD-02 + CORD-04 debtor-email coordinator", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    captured.inserts.length = 0;
    captured.updates.length = 0;
    supabaseMock = makeSupabaseMock();
    // Re-import the module so the mocked createFunction captures the new handler.
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (mod.debtorEmailCoordinator as unknown as { handler: typeof handler })
      .handler;
  });

  it("CORD-04 single-shot path: emits exactly one debtor-email/<intent>.requested via swarm_dispatch", async () => {
    invokeIntentMock.mockResolvedValueOnce({
      output: {
        ranked: [
          {
            intent: "copy_document_request",
            confidence: "high",
            ...baseRanked,
          },
        ],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V2,
      },
      raw: "",
    });
    findCachedMock.mockResolvedValue(null);
    loadCategoriesMock.mockResolvedValue([
      buildCategory("copy_document_request", false),
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    const sendNames = inngestSend.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(sendNames).toContain("debtor-email/copy_document_request.requested");
    expect(sendNames).not.toContain("debtor-email/orchestrator.requested");
    expect(sendNames.filter((n) => n.endsWith(".requested")).length).toBe(1);
  });

  it("CORD-02 escalation by requires_orchestration flag: emits orchestrator + reason='requires_orchestration_flag'", async () => {
    invokeIntentMock.mockResolvedValueOnce({
      output: {
        ranked: [
          { intent: "payment_dispute", confidence: "high", ...baseRanked },
        ],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V2,
      },
      raw: "",
    });
    findCachedMock.mockResolvedValue(null);
    loadCategoriesMock.mockResolvedValue([
      buildCategory("payment_dispute", true),
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    const orchEmits = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name === "debtor-email/orchestrator.requested",
    );
    expect(orchEmits.length).toBe(1);

    const reasonUpdate = captured.updates.find(
      (u) => u.table === "coordinator_runs" && "escalation_reason" in u.patch,
    );
    expect(reasonUpdate?.patch.escalation_reason).toBe(
      "requires_orchestration_flag",
    );
  });

  it("CORD-02 escalation by low confidence: emits orchestrator + reason='low_confidence'", async () => {
    invokeIntentMock.mockResolvedValueOnce({
      output: {
        ranked: [
          {
            intent: "copy_document_request",
            confidence: "low",
            ...baseRanked,
          },
        ],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V2,
      },
      raw: "",
    });
    findCachedMock.mockResolvedValue(null);
    loadCategoriesMock.mockResolvedValue([
      buildCategory("copy_document_request", false),
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    const orchEmits = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name === "debtor-email/orchestrator.requested",
    );
    expect(orchEmits.length).toBe(1);

    const reasonUpdate = captured.updates.find(
      (u) => u.table === "coordinator_runs" && "escalation_reason" in u.patch,
    );
    expect(reasonUpdate?.patch.escalation_reason).toBe("low_confidence");
  });

  it("CORD-04 cache hit: invokeIntentAgent NOT called; dispatch still happens", async () => {
    findCachedMock.mockResolvedValue({
      intent_first_pass: {
        ranked: [
          {
            intent: "copy_document_request",
            confidence: "high",
            ...baseRanked,
          },
        ],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V2,
      },
    });
    loadCategoriesMock.mockResolvedValue([
      buildCategory("copy_document_request", false),
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    expect(invokeIntentMock).not.toHaveBeenCalled();
    const sendNames = inngestSend.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(sendNames).toContain("debtor-email/copy_document_request.requested");
  });

  it("failure path: loadSwarmCategories throws → mark-failed runs + handler re-throws", async () => {
    invokeIntentMock.mockResolvedValueOnce({
      output: {
        ranked: [
          {
            intent: "copy_document_request",
            confidence: "high",
            ...baseRanked,
          },
        ],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V2,
      },
      raw: "",
    });
    findCachedMock.mockResolvedValue(null);
    loadCategoriesMock.mockRejectedValue(new Error("registry boom"));

    await expect(
      handler({ event: buildEvent(), step: stepStub }),
    ).rejects.toThrow(/registry boom/);

    const failedUpdate = captured.updates.find(
      (u) =>
        u.table === "automation_runs" && u.patch.status === "failed",
    );
    expect(failedUpdate).toBeDefined();
    expect(failedUpdate?.patch.error_message).toMatch(/registry boom/);
  });
});
