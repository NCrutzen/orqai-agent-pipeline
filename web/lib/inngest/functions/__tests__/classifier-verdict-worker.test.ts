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
// Phase 112 Plan 02: named handles so the sales-live tests below can assert
// the inline categorize/archive call counts (0 when the gate is BLOCKED).
const categorizeEmailMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
const archiveEmailMock = vi.fn(async (..._args: unknown[]) => ({ success: true }));
vi.mock("@/lib/outlook", () => ({
  categorizeEmail: (...args: unknown[]) => categorizeEmailMock(...args),
  archiveEmail: (...args: unknown[]) => archiveEmailMock(...args),
}));

// ---- Registry mocks ------------------------------------------------------
const loadCategoriesMock = vi.fn();
// Phase 111 Finding 1: verdict-worker now loads the full swarm row to read
// dry_run_config for the stage_1_archive gate. These tests assert the
// registry side-effect dispatch (independent of the inline Outlook gate), so
// loadSwarm returns a LIVE stage_1_archive — preserving the pre-111 behavior
// where the inline categorize/archive fire.
const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...args: unknown[]) => loadCategoriesMock(...args),
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

const evaluateSideEffectsMock = vi.fn();
vi.mock("@/lib/swarms/side-effects", () => ({
  evaluateSideEffects: (...args: unknown[]) => evaluateSideEffectsMock(...args),
}));

// Phase 111 WR-01: spy on the Stage-4 telemetry emit so we can assert it is
// SKIPPED when the inline archive is dry-run-blocked (archiveLive === false).
const emitPipelineEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: (...args: unknown[]) => emitPipelineEventMock(...args),
}));

const isStageBlockedMock = vi.fn();
vi.mock("@/lib/pipeline-gating/dry-run-gate", () => ({
  isStageBlocked: (...args: unknown[]) => isStageBlockedMock(...args),
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
  // Phase 88.2-04: verdict-worker now reads email_pipeline.emails via
  // .schema("email_pipeline").from("emails").select(...).eq(...).maybeSingle()
  // for cleanup-descriptor and dispatch paths. A minimal read chain that
  // resolves to { data: null, error: null } is enough — the cleanup path
  // exits early when the email row is null, and the dispatch path treats a
  // missing id as a no-op (the test doesn't assert on the side-effect of
  // the lookup, only on inngest.send + automation_runs writes).
  const makeReadChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    chain.single = vi.fn(async () => ({ data: null, error: null }));
    // `.limit()` terminates as a thenable returning { data: [], error: null }
    // — used by the dedup check on automation_runs.
    (chain as { then?: unknown }).then = (
      onF: (r: { data: unknown[]; error: unknown }) => unknown,
    ) => Promise.resolve(onF({ data: [], error: null }));
    return chain;
  };
  const schemaProxy = (_schema: string) => ({
    from: vi.fn((_t: string) => makeReadChain()),
  });
  return {
    schema: vi.fn(schemaProxy),
    from: vi.fn((table: string) => {
      if (table === "automation_runs") {
        // Phase 88.2-04: verdict-worker now also reads automation_runs to
        // de-dupe pending dispatches (.select("id").eq().eq().limit().maybeSingle()).
        // Return empty/null so the dispatch path always treats it as new.
        return {
          insert: insertFn,
          update: updateFn,
          select: vi.fn(() => makeReadChain()),
        };
      }
      return {
        insert: vi.fn(async () => ({ data: null, error: null })),
        update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
        select: vi.fn(() => makeReadChain()),
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
    loadSwarmMock.mockReset();
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      dry_run_config: { stage_1_archive: false },
    });
    evaluateSideEffectsMock.mockReset();
    emitPipelineEventMock.mockReset();
    emitPipelineEventMock.mockResolvedValue(undefined);
    isStageBlockedMock.mockReset();
    // Default: archive stage is LIVE (not blocked) — preserves pre-111
    // behavior for the registry-dispatch tests below.
    isStageBlockedMock.mockReturnValue(false);
    categorizeEmailMock.mockReset();
    categorizeEmailMock.mockResolvedValue({ success: true });
    archiveEmailMock.mockReset();
    archiveEmailMock.mockResolvedValue({ success: true });
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

  // Phase 111 WR-01 ------------------------------------------------------
  // The Stage-4 "auto_archived_noise" telemetry emit must be gated on the
  // SAME archive-live predicate as the inline Outlook archive. A dry-run-
  // blocked verdict (sales) must NOT write a phantom archive row.
  function adminWithEmailId(emailId: string) {
    const base = makeAdmin();
    const origSchema = base.schema;
    // Override the email_pipeline read chain so the Stage-4 id-lookup
    // resolves a real id (the default makeAdmin returns null → emit skips
    // even when live, which wouldn't isolate the gate).
    base.schema = vi.fn((schema: string) => {
      if (schema === "email_pipeline") {
        const chain: Record<string, unknown> = {};
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.or = vi.fn(() => chain);
        chain.limit = vi.fn(() => chain);
        chain.maybeSingle = vi.fn(async () => ({
          data: { id: emailId, sender_email: null, subject: null, received_at: null },
          error: null,
        }));
        return { from: vi.fn(() => chain) };
      }
      return (origSchema as (s: string) => unknown)(schema);
    }) as typeof base.schema;
    return base;
  }

  const categorizeArchiveCategories = () => [
    {
      swarm_type: "sales-email",
      category_key: "auto_reply",
      display_label: "Auto-Reply",
      outlook_label: "Auto-Reply",
      action: "categorize_archive",
      swarm_dispatch: null,
      display_order: 10,
      enabled: true,
    },
  ];

  it("WR-01: emits Stage-4 auto_archived_noise when archive is LIVE", async () => {
    adminMock = adminWithEmailId("email-uuid-live");
    loadCategoriesMock.mockResolvedValueOnce(categorizeArchiveCategories());
    evaluateSideEffectsMock.mockResolvedValueOnce([]);
    isStageBlockedMock.mockReturnValue(false); // LIVE

    await handler({
      event: baseEvent({ swarm_type: "sales-email", predicted_category: "auto_reply" }),
      step: stepStub,
    });

    expect(emitPipelineEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        stage: 4,
        decision: "auto_archived_noise",
        email_id: "email-uuid-live",
      }),
    );
  });

  it("WR-01: does NOT emit Stage-4 telemetry when archive is dry-run BLOCKED", async () => {
    adminMock = adminWithEmailId("email-uuid-blocked");
    loadCategoriesMock.mockResolvedValueOnce(categorizeArchiveCategories());
    evaluateSideEffectsMock.mockResolvedValueOnce([]);
    isStageBlockedMock.mockReturnValue(true); // BLOCKED (sales dry-run)

    await handler({
      event: baseEvent({ swarm_type: "sales-email", predicted_category: "auto_reply" }),
      step: stepStub,
    });

    // No phantom archive telemetry row when nothing was actually archived.
    expect(emitPipelineEventMock).not.toHaveBeenCalled();
  });

  // Phase 112 Plan 02 (CLEANUP-01 / D-03) — sales-email inline live-archive gate.
  // VERIFY-ONLY: classifier-verdict-worker.ts is NOT edited. These tests prove
  // the already-correct inline path fires the Outlook archive (and the Stage-4
  // telemetry) ONLY when stage_1_archive is LIVE for sales — i.e. the go-live
  // flip migration (20260603x_sales_stage1_archive_golive.sql) is the SOLE
  // activation trigger, no code change. 111 regression lesson: loadSwarm +
  // isStageBlocked MUST be mocked or sales stays inert and the test false-passes.

  it("D-03: sales inline archive FIRES (categorize+archive+Stage-4) when gate OPEN", async () => {
    adminMock = adminWithEmailId("email-uuid-sales-live");
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_1_archive: false },
    });
    loadCategoriesMock.mockResolvedValueOnce(categorizeArchiveCategories());
    evaluateSideEffectsMock.mockResolvedValueOnce([]);
    isStageBlockedMock.mockReturnValue(false); // LIVE — flip applied

    await handler({
      event: baseEvent({ swarm_type: "sales-email", predicted_category: "auto_reply" }),
      step: stepStub,
    });

    expect(categorizeEmailMock).toHaveBeenCalledTimes(1);
    expect(archiveEmailMock).toHaveBeenCalledTimes(1);
    expect(emitPipelineEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        stage: 4,
        decision: "auto_archived_noise",
        email_id: "email-uuid-sales-live",
      }),
    );
  });

  it("D-03/WR-01: sales inline archive is INERT when gate BLOCKED (0 archive + 0 Stage-4)", async () => {
    adminMock = adminWithEmailId("email-uuid-sales-blocked");
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_1_archive: true },
    });
    loadCategoriesMock.mockResolvedValueOnce(categorizeArchiveCategories());
    evaluateSideEffectsMock.mockResolvedValueOnce([]);
    isStageBlockedMock.mockReturnValue(true); // BLOCKED — flip not applied

    await handler({
      event: baseEvent({ swarm_type: "sales-email", predicted_category: "auto_reply" }),
      step: stepStub,
    });

    // No live Outlook write and no phantom Stage-4 telemetry (WR-01).
    expect(categorizeEmailMock).not.toHaveBeenCalled();
    expect(archiveEmailMock).not.toHaveBeenCalled();
    expect(emitPipelineEventMock).not.toHaveBeenCalled();
  });

  it("D-08: Stage-4 emit unique-violation (23505) is swallowed (idempotent no-op)", async () => {
    adminMock = adminWithEmailId("email-uuid-sales-dup");
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      dry_run_config: { stage_1_archive: false },
    });
    loadCategoriesMock.mockResolvedValueOnce(categorizeArchiveCategories());
    evaluateSideEffectsMock.mockResolvedValueOnce([]);
    isStageBlockedMock.mockReturnValue(false); // LIVE
    // Re-run on an already-archived email → unique index violation on the
    // pipeline_events Stage-4 ledger row. Must be swallowed, not thrown.
    emitPipelineEventMock.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value violates unique constraint \"pipeline_events_one_per_stage_email\""), {
        code: "23505",
      }),
    );

    await expect(
      handler({
        event: baseEvent({ swarm_type: "sales-email", predicted_category: "auto_reply" }),
        step: stepStub,
      }),
    ).resolves.toMatchObject({ ok: true });

    // The archive still fired; the duplicate ledger write was a no-op.
    expect(archiveEmailMock).toHaveBeenCalledTimes(1);
    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
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
