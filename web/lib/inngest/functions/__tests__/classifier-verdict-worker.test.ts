// Phase 68 Plan 03 (SWRM-04). Asserts the verdict-worker dispatches
// stage1_categorize_archive side-effects via the registry — no
// swarm_type literal gate remains. Mock-step pattern mirrors
// classifier-label-resolver.test.ts.
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

// ---- emit helper mock ----------------------------------------------------
const emitStaleMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));

// ---- Outlook helpers (no real Graph calls) -------------------------------
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: vi.fn(async () => ({ success: true })),
  archiveEmail: vi.fn(async () => ({ success: true })),
}));

// ---- Registry mocks ------------------------------------------------------
const loadCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...args: unknown[]) => loadCategoriesMock(...args),
}));

const evaluateSideEffectsMock = vi.fn();
vi.mock("@/lib/swarms/side-effects", () => ({
  evaluateSideEffects: (...args: unknown[]) => evaluateSideEffectsMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
type Insert = Record<string, unknown>;
type Update = Record<string, unknown>;
const automationRunsInserts: Insert[] = [];
const automationRunsUpdates: Update[] = [];

function makeAdmin() {
  const insertFn = vi.fn(async (row: Insert) => {
    automationRunsInserts.push(row);
    return { data: null, error: null };
  });
  const updateEqFn = vi.fn(async () => ({ data: null, error: null }));
  const updateFn = vi.fn((row: Update) => {
    automationRunsUpdates.push(row);
    return { eq: updateEqFn };
  });
  return {
    from: vi.fn((table: string) => {
      if (table === "automation_runs") {
        return { insert: insertFn, update: updateFn };
      }
      return {
        insert: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
      };
    }),
  };
}

let adminMock = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub -----------------------------------------------------------
const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

const baseEvent = (
  overrides: Partial<{
    swarm_type: string;
    decision: string;
    predicted_category: string;
  }> = {},
) => ({
  id: "evt-1",
  name: "classifier/verdict.recorded",
  data: {
    automation_run_id: "ar-uuid-1",
    swarm_type: overrides.swarm_type ?? "debtor-email",
    decision: overrides.decision ?? "approve",
    message_id: "msg-graph-1",
    source_mailbox: "debiteuren@smeba.nl",
    predicted_category: overrides.predicted_category ?? "payment",
    override_category: null,
  },
});

const cleanupDescriptor = {
  kind: "automation_run_insert",
  automation: "debtor-email-cleanup",
  trigger: "stage1_categorize_archive",
  gate: { category_action: "categorize_archive" },
  result_template: { stage: "icontroller_delete", icontroller: "pending" },
  phase_origin: "56.7",
};

describe("classifier-verdict-worker — Phase 68 SWRM-04 registry dispatch", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    automationRunsInserts.length = 0;
    automationRunsUpdates.length = 0;
    adminMock = makeAdmin();
    loadCategoriesMock.mockReset();
    evaluateSideEffectsMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../classifier-verdict-worker");
    handler = (mod.classifierVerdictWorker as unknown as {
      handler: typeof handler;
    }).handler;
  });

  it("INSERTs deferred automation_runs row when registry returns the cleanup descriptor", async () => {
    loadCategoriesMock.mockResolvedValueOnce([
      {
        swarm_type: "debtor-email",
        category_key: "payment",
        display_label: "Payment",
        outlook_label: "Payment",
        action: "categorize_archive",
        swarm_dispatch: null,
        display_order: 10,
        enabled: true,
      },
    ]);
    evaluateSideEffectsMock.mockResolvedValueOnce([cleanupDescriptor]);

    await handler({ event: baseEvent(), step: stepStub });

    const inserted = automationRunsInserts.find(
      (r) => r.automation === "debtor-email-cleanup",
    );
    expect(inserted).toBeDefined();
    expect(inserted!.status).toBe("deferred");
    const result = inserted!.result as Record<string, unknown>;
    expect(result.icontroller).toBe("pending");
    expect(result.stage).toBe("icontroller_delete");
    // Caller-owned runtime fields preserved over the template.
    expect(result.source_automation_run_id).toBe("ar-uuid-1");
    expect(result.message_id).toBe("msg-graph-1");
    expect(result.source_mailbox).toBe("debiteuren@smeba.nl");
  });

  it("does NOT INSERT a deferred automation_runs row when registry returns []", async () => {
    loadCategoriesMock.mockResolvedValueOnce([
      {
        swarm_type: "debtor-email",
        category_key: "payment",
        display_label: "Payment",
        outlook_label: "Payment",
        action: "categorize_archive",
        swarm_dispatch: null,
        display_order: 10,
        enabled: true,
      },
    ]);
    evaluateSideEffectsMock.mockResolvedValueOnce([]);

    await handler({ event: baseEvent(), step: stepStub });

    const cleanupRow = automationRunsInserts.find(
      (r) => r.automation === "debtor-email-cleanup",
    );
    expect(cleanupRow).toBeUndefined();
  });

  it("dispatches inngest_event descriptors via inngest.send", async () => {
    loadCategoriesMock.mockResolvedValueOnce([
      {
        swarm_type: "sales-email",
        category_key: "lead",
        display_label: "Lead",
        outlook_label: null,
        action: "categorize_archive",
        swarm_dispatch: null,
        display_order: 10,
        enabled: true,
      },
    ]);
    evaluateSideEffectsMock.mockResolvedValueOnce([
      {
        kind: "inngest_event",
        event: "sales-email/qualified.requested",
        trigger: "stage1_categorize_archive",
        gate: {},
        phase_origin: "test",
      },
    ]);

    await handler({
      event: baseEvent({ swarm_type: "sales-email", predicted_category: "lead" }),
      step: stepStub,
    });

    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "sales-email/qualified.requested" }),
    );
  });
});
