// Phase 66 Plan 03 — VALIDATION row 46. Asserts that the label-resolver
// emits `debtor-email/coordinator.requested` with the Stage-2-resolved
// customer fields after `close-automation-run`. Mock-step pattern mirrors
// debtor-email-coordinator.test.ts (handler-extraction via mocked
// inngest.createFunction).
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

// ---- resolveDebtor mock --------------------------------------------------
const resolveDebtorMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/resolve-debtor", () => ({
  resolveDebtor: (...args: unknown[]) => resolveDebtorMock(...args),
}));

// ---- Phase 114-06 — loadStage2Resolver mock (generic / sales path) --------
// The generic (sales) Stage 2 path dispatches via loadStage2Resolver(path) and
// calls module.resolveEntity(args, config). Mocking it lets the test observe
// the args (CR-01: brand_id must be 'SB', not null) without hitting NXT. The
// resolveEntity spy is reset per-test; tests push their own implementation.
const resolveEntityMock = vi.fn();
const loadStage2ResolverMock = vi.fn(async () => ({
  resolveEntity: resolveEntityMock,
}));
vi.mock("@/lib/swarms/dynamic", () => ({
  loadStage2Resolver: (...args: unknown[]) =>
    (loadStage2ResolverMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

// ---- side-effects registry mock -----------------------------------------
// Phase 68 swap (SWRM-04): label-resolver routes the icontroller-tag emit
// through evaluateSideEffects(stage2_match_live). Mirror the production
// backfill so existing assertions (dry-run skip, unconfigured skip,
// unresolved skip) remain valid: a single inngest_event descriptor whose
// gate matches the prior literal AND-chain.
const ICONTROLLER_TAG_DESCRIPTOR = {
  kind: "inngest_event" as const,
  event: "debtor-email/stage-2.icontroller-label.requested",
  trigger: "stage2_match_live" as const,
  gate: {
    dry_run: false,
    customer_account_id_present: true,
    icontroller_company_present: true,
  },
  phase_origin: "67",
};
const evaluateSideEffectsMock = vi.fn(
  async (
    _admin: unknown,
    _swarmType: string,
    trigger: string,
    ctx: Record<string, unknown>,
  ) => {
    if (trigger !== "stage2_match_live") return [];
    const matches = Object.entries(ICONTROLLER_TAG_DESCRIPTOR.gate).every(
      ([k, v]) => ctx[k] === v,
    );
    return matches ? [ICONTROLLER_TAG_DESCRIPTOR] : [];
  },
);
vi.mock("@/lib/swarms/side-effects", () => ({
  evaluateSideEffects: (...args: unknown[]) =>
    (evaluateSideEffectsMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
//
// Exhaustive chain shape for the resolver's successful path:
//   admin.schema("email_pipeline").from("emails").select().eq().maybeSingle()
//   admin.schema("debtor").from("labeling_settings").select().eq().maybeSingle()
//   admin.schema("debtor").from("email_labels").insert(...)
//   admin.from("automation_runs").update(...).eq(...)
const EMAIL_ROW = {
  id: "email-uuid-1",
  conversation_id: "conv-1",
  subject: "Kopie factuur graag",
  body_text: "Mag ik een kopie?",
  sender_email: "klant@example.com",
  mailbox: "debiteuren@smeba.nl",
};
const SETTINGS_ROW = {
  dry_run: true,
  nxt_database: "smeba_prod",
  brand_id: "brand-1",
  entity: "smeba",
  icontroller_company: "smeba",
};

function makeAdminMock(overrides?: {
  settings?: typeof SETTINGS_ROW | null;
  insertedLabelId?: string;
  // Phase 116-05 — attachment rows returned for the email_pipeline
  // .email_attachments load inside the load-email step.
  attachmentRows?: Array<{
    attachment_id: string;
    extraction_status: string;
    extracted_text: string | null;
  }>;
}) {
  // Per-table builders — only need shapes used by the function.
  const settingsRow = overrides?.settings === undefined ? SETTINGS_ROW : overrides.settings;
  const insertedLabelId = overrides?.insertedLabelId ?? "label-uuid-stub";
  const attachmentRows = overrides?.attachmentRows ?? [];

  // Phase 70 — capture cross-table inserts so dual-write assertions can
  // distinguish email_labels from pipeline_events.
  const supabaseInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

  const emailLabelsInsertedRows: Array<Record<string, unknown>> = [];
  // Phase 67 — insert(...).select("id").single() chain
  const emailLabelsInsert = vi.fn((row: Record<string, unknown>) => {
    emailLabelsInsertedRows.push(row);
    supabaseInserts.push({ table: "email_labels", payload: row });
    return {
      select: vi.fn(() => ({
        single: vi.fn(async () => ({
          data: { id: insertedLabelId },
          error: null,
        })),
      })),
    };
  });
  // Phase 70 — admin.from("pipeline_events").insert(payload) sink
  const pipelineEventsInsert = vi.fn(async (row: Record<string, unknown>) => {
    supabaseInserts.push({ table: "pipeline_events", payload: row });
    return { data: null, error: null };
  });
  const automationRunUpdateEq = vi.fn(async () => ({ data: null, error: null }));
  const automationRunUpdate = vi.fn(() => ({ eq: automationRunUpdateEq }));

  // schema("email_pipeline").from("emails") chain
  // Phase 74 fix: production uses `.or("source_id.eq.X,internet_message_id.eq.X")`
  // to handle both outlook-zapier (source_id) and Graph-direct (internet_message_id)
  // ingestion paths. Capture the .or() filter so tests can assert the lookup
  // columns are correct.
  const emailsOrFilters: string[] = [];
  function emailsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.or = vi.fn((filter: string) => {
      emailsOrFilters.push(filter);
      return b;
    });
    // Return a FRESH copy so the worker's in-place body_text mutation
    // (Phase 116-05 attachment fold) does not leak into the shared EMAIL_ROW
    // constant across handler runs.
    b.maybeSingle = vi.fn(async () => ({ data: { ...EMAIL_ROW }, error: null }));
    return b;
  }
  function labelingSettingsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => ({ data: settingsRow, error: null }));
    return b;
  }
  function emailLabelsBuilder() {
    return { insert: emailLabelsInsert };
  }
  function automationRunsBuilder() {
    return { update: automationRunUpdate };
  }

  const schemaImpl = (schemaName: string) => ({
    from: vi.fn((table: string) => {
      if (schemaName === "email_pipeline" && table === "emails") {
        return emailsBuilder();
      }
      if (schemaName === "email_pipeline" && table === "email_attachments") {
        // .select(...).eq("email_id", id) → awaited directly ({ data, error }).
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.eq = vi.fn(async () => ({ data: attachmentRows, error: null }));
        return b;
      }
      if (schemaName === "debtor" && table === "labeling_settings") {
        return labelingSettingsBuilder();
      }
      if (schemaName === "debtor" && table === "email_labels") {
        return emailLabelsBuilder();
      }
      // default chain stub
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return b;
    }),
  });

  // Phase 110 Plan 04 — the resolver now reads the per-stage gate via
  // loadSwarm(admin, swarm_type) → admin.from("swarms").select("*").eq(...)
  // .eq(...).maybeSingle(). The resolver folds dry_run_config.stage_3_labeling
  // together with settingsRow.dry_run (blocks if EITHER blocks). These tests
  // use settingsRow.dry_run as their single live/dry control, so mirror it onto
  // stage_3_labeling: a test running LIVE (dry_run=false) gets stage_3_labeling=
  // false (live); a dry test gets true (gated). This keeps the single-control
  // model while still exercising the folded gate read.
  const stageLabelingBlocked = (settingsRow?.dry_run ?? true) !== false;
  function swarmsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => ({
      data: {
        swarm_type: "debtor-email",
        enabled: true,
        dry_run_config: {
          stage_1_archive: false,
          stage_1_cleanup: false,
          stage_3_labeling: stageLabelingBlocked,
          stage_4_handlers: { "invoice-copy": stageLabelingBlocked },
        },
      },
      error: null,
    }));
    return b;
  }

  const fromImpl = (table: string) => {
    if (table === "automation_runs") return automationRunsBuilder();
    if (table === "pipeline_events") return { insert: pipelineEventsInsert };
    if (table === "swarms") return swarmsBuilder();
    return { update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })) };
  };

  return {
    schema: vi.fn(schemaImpl),
    from: vi.fn(fromImpl),
    __captures: {
      emailLabelsInsert,
      emailLabelsInsertedRows,
      automationRunUpdate,
      automationRunUpdateEq,
      pipelineEventsInsert,
      supabaseInserts,
      emailsOrFilters,
    },
  };
}

let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

// ---- Step stub -----------------------------------------------------------
const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

// ---- Helpers -------------------------------------------------------------
function buildEvent() {
  return {
    id: "evt-test",
    name: "debtor-email/stage-2.customer-resolve.requested",
    data: {
      automation_run_id: "ar-uuid-1",
      message_id: "msg-graph-1",
      source_mailbox: "debiteuren@smeba.nl",
      category_key: "unknown",
      swarm_type: "debtor-email",
    },
  };
}

// ---- Tests ---------------------------------------------------------------
describe("stage-2-customer-resolver — Phase 66 D-03 emit", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    handler = (mod.stage2CustomerResolver as unknown as {
      handler: typeof handler;
    }).handler;
  });

  it("emits debtor-email/coordinator.requested after close-automation-run with Stage-2-resolved customer fields", async () => {
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "cust-acc-42",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await handler({ event: buildEvent(), step: stepStub });

    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "pipeline/coordinator.requested",
        data: expect.objectContaining({
          swarm_type: "debtor-email",
          email_id: expect.any(String),
          automation_run_id: expect.any(String),
          customer_account_id: expect.anything(),
          mailbox: expect.any(String),
          subject: expect.any(String),
          body_text: expect.any(String),
          sender_email: expect.any(String),
          received_at: expect.any(String),
        }),
      }),
    );

    // Concrete data values — assert the resolved customer fields actually
    // flow through (not just type-shaped).
    const emitCall = inngestSend.mock.calls.find(
      (c) =>
        (c[0] as { name: string }).name === "pipeline/coordinator.requested",
    );
    expect(emitCall).toBeDefined();
    const data = (emitCall![0] as { data: Record<string, unknown> }).data;
    expect(data.email_id).toBe(EMAIL_ROW.id);
    expect(data.automation_run_id).toBe("ar-uuid-1");
    expect(data.customer_account_id).toBe("cust-acc-42");
    expect(data.customer_name).toBe("Klant BV");
    expect(data.mailbox).toBe(EMAIL_ROW.mailbox);
    expect(data.subject).toBe(EMAIL_ROW.subject);
    expect(data.body_text).toBe(EMAIL_ROW.body_text);
    expect(data.sender_email).toBe(EMAIL_ROW.sender_email);
    expect(data.entity).toBe(SETTINGS_ROW.entity);
    expect(data.graph_message_id).toBe("msg-graph-1");
  });
});

// Phase 67 (D-01, D-09, D-10, R-02) — second emit (icontroller-tag) tests.
describe("Phase 67 — second emit (icontroller-tag)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  async function loadHandlerWithSettings(
    settings: typeof SETTINGS_ROW | null,
  ): Promise<{
    handler: typeof handler;
    captures: ReturnType<typeof makeAdminMock>["__captures"];
  }> {
    vi.clearAllMocks();
    adminMock = makeAdminMock({ settings, insertedLabelId: "label-uuid-stub" });
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return {
      handler: (mod.stage2CustomerResolver as unknown as {
        handler: typeof handler;
      }).handler,
      captures: (adminMock as unknown as { __captures: ReturnType<typeof makeAdminMock>["__captures"] }).__captures,
    };
  }

  it("matched + dry_run=true → does NOT emit icontroller-tag; INSERT carries skipped_dry_run", async () => {
    const { handler: h, captures } = await loadHandlerWithSettings({
      ...SETTINGS_ROW,
      dry_run: true,
    });
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await h({ event: buildEvent(), step: stepStub });

    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(0);

    expect(captures.emailLabelsInsertedRows.length).toBe(1);
    expect(
      (captures.emailLabelsInsertedRows[0] as { icontroller_tag_status: string })
        .icontroller_tag_status,
    ).toBe("skipped_dry_run");

    // Phase 70 — TELE-01 dual-write: pipeline_events row with decision='resolved'.
    const pipelineEventInsert = captures.supabaseInserts.find(
      (i) =>
        i.table === "pipeline_events" &&
        (i.payload as { stage?: number }).stage === 2 &&
        (i.payload as { decision?: string }).decision === "resolved",
    );
    expect(pipelineEventInsert).toBeTruthy();
    expect(pipelineEventInsert!.payload).toMatchObject({
      swarm_type: "debtor-email",
      email_id: EMAIL_ROW.id,
      triggered_by: "pipeline",
      decision_details: expect.objectContaining({
        customer_account_id: "506909",
        customer_name: "Klant BV",
        method: "sender_match",
      }),
    });
  });

  it("matched + live + icontroller_company set → emits icontroller-tag with mailbox-list URL + email_label_id; INSERT carries pending", async () => {
    const { handler: h, captures } = await loadHandlerWithSettings({
      ...SETTINGS_ROW,
      dry_run: false,
      icontroller_company: "smebabrandbeveiliging",
      entity: "smeba",
    });
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await h({ event: buildEvent(), step: stepStub });

    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(1);
    const tagData = (tagCalls[0]![0] as { data: Record<string, unknown> }).data;
    expect(tagData.email_label_id).toBe("label-uuid-stub");
    expect(tagData.email_id).toBe(EMAIL_ROW.id);
    expect(tagData.customer_account_id).toBe("506909");
    expect(tagData.customer_name).toBe("Klant BV");
    expect(tagData.icontroller_mailbox_id).toBe(4); // smeba
    expect(tagData.icontroller_company).toBe("smebabrandbeveiliging");
    expect(tagData.entity).toBe("smeba");
    expect(tagData.source_mailbox).toBe("debiteuren@smeba.nl");
    expect(tagData.sender_email).toBe(EMAIL_ROW.sender_email);
    expect(tagData.subject).toBe(EMAIL_ROW.subject);
    expect(typeof tagData.received_at).toBe("string");
    expect(tagData.icontroller_message_url).toContain(
      "/messages/index/mailbox/4",
    );

    expect(
      (captures.emailLabelsInsertedRows[0] as { icontroller_tag_status: string })
        .icontroller_tag_status,
    ).toBe("pending");
  });

  it("matched + live + icontroller_company=null → does NOT emit; INSERT carries skipped_unconfigured", async () => {
    const { handler: h, captures } = await loadHandlerWithSettings({
      ...SETTINGS_ROW,
      dry_run: false,
      icontroller_company: null as unknown as string,
    });
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await h({ event: buildEvent(), step: stepStub });

    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(0);

    expect(
      (captures.emailLabelsInsertedRows[0] as { icontroller_tag_status: string })
        .icontroller_tag_status,
    ).toBe("skipped_unconfigured");
  });

  it("unresolved (customer_account_id=null) + live → does NOT emit icontroller-tag", async () => {
    const { handler: h, captures } = await loadHandlerWithSettings({
      ...SETTINGS_ROW,
      dry_run: false,
      icontroller_company: "smebabrandbeveiliging",
    });
    resolveDebtorMock.mockResolvedValueOnce({
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: 0,
    });

    await h({ event: buildEvent(), step: stepStub });

    // Phase 70 — TELE-01 dual-write: pipeline_events row with stage:2,
    // decision='unresolved'.
    const pipelineEventInsert = captures.supabaseInserts.find(
      (i) => i.table === "pipeline_events" && (i.payload as { stage?: number }).stage === 2,
    );
    expect(pipelineEventInsert).toBeTruthy();
    expect(pipelineEventInsert!.payload).toMatchObject({
      stage: 2,
      decision: "unresolved",
      swarm_type: "debtor-email",
      email_id: EMAIL_ROW.id,
      triggered_by: "pipeline",
    });

    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(0);
  });
});

// Phase 68 (SWRM-04) — registry-driven dispatch path.
describe("Phase 68 — registry-driven Stage-2 dispatch", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminMock = makeAdminMock({
      settings: {
        ...SETTINGS_ROW,
        dry_run: false,
        icontroller_company: "smebabrandbeveiliging",
      },
      insertedLabelId: "label-uuid-stub",
    });
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    handler = (mod.stage2CustomerResolver as unknown as {
      handler: typeof handler;
    }).handler;
  });

  it("emits the descriptor's event name (registry-sourced, not literal) with the full Phase 67 payload", async () => {
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await handler({ event: buildEvent(), step: stepStub });

    // evaluateSideEffects MUST have been called with the correct trigger + ctx.
    expect(evaluateSideEffectsMock).toHaveBeenCalledWith(
      expect.anything(),
      "debtor-email",
      "stage2_match_live",
      expect.objectContaining({
        dry_run: false,
        customer_account_id_present: true,
        icontroller_company_present: true,
      }),
    );

    // Event name comes from the descriptor returned by the registry mock.
    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(1);
  });

  it("unknown mailbox short-circuits before evaluateSideEffects is called (call-site guard)", async () => {
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    const event = buildEvent();
    event.data.source_mailbox = "no-such-mailbox@example.com";

    await handler({ event, step: stepStub });

    expect(evaluateSideEffectsMock).not.toHaveBeenCalled();
    const tagCalls = inngestSend.mock.calls.filter(
      (c) =>
        (c[0] as { name: string }).name ===
        "debtor-email/stage-2.icontroller-label.requested",
    );
    expect(tagCalls.length).toBe(0);
  });
});

// Phase 82.9 (Plan 02) — Stage 2 decision_details.inputs persistence.
// Verifies the writer passes the discriminated `inputs` field through on the
// success path and OMITS it on the resolver-error path (D-04 legacy fallback).
describe("Stage 2 decision_details — Phase 82.9", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  async function loadHandler(): Promise<{
    handler: typeof handler;
    captures: ReturnType<typeof makeAdminMock>["__captures"];
  }> {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return {
      handler: (mod.stage2CustomerResolver as unknown as {
        handler: typeof handler;
      }).handler,
      captures: (adminMock as unknown as {
        __captures: ReturnType<typeof makeAdminMock>["__captures"];
      }).__captures,
    };
  }

  function findStage2PipelineEvent(
    captures: ReturnType<typeof makeAdminMock>["__captures"],
  ) {
    return captures.supabaseInserts.find(
      (i) =>
        i.table === "pipeline_events" &&
        (i.payload as { stage?: number }).stage === 2,
    );
  }

  it("thread_inheritance success → decision_details.inputs.kind = 'thread_inheritance'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "thread_inheritance",
      customer_account_id: "cust-99",
      customer_name: "Klant Holding",
      confidence: "high",
      candidates_considered: undefined,
      inputs: {
        kind: "thread_inheritance",
        prior_email_label_id: "label-prev-uuid",
        conversation_id: "conv-1",
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    expect(pe!.payload).toMatchObject({
      decision_details: expect.objectContaining({
        inputs: expect.objectContaining({
          kind: "thread_inheritance",
          prior_email_label_id: "label-prev-uuid",
          conversation_id: "conv-1",
        }),
      }),
    });
  });

  it("sender_match success → decision_details.inputs.kind = 'sender_match'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "cust-123",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "sender_match",
        sender_email: "klant@example.com",
        candidates: [
          {
            id: "cust-123",
            name: "Klant BV",
            contact_person: "Jan",
            recent_invoices: ["INV-1"],
          },
        ],
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    expect(pe!.payload).toMatchObject({
      decision_details: expect.objectContaining({
        method: "sender_match",
        customer_account_id: "cust-123",
        inputs: expect.objectContaining({
          kind: "sender_match",
          sender_email: "klant@example.com",
        }),
      }),
    });
  });

  it("identifier_match success → decision_details.inputs.kind = 'identifier_match'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "identifier_match",
      customer_account_id: "cust-777",
      customer_name: "Identifier Klant",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "identifier_match",
        matched_identifiers: ["INV-1111"],
        candidates: [
          {
            id: "cust-777",
            name: "Identifier Klant",
            contact_person: null,
            recent_invoices: ["INV-1111"],
          },
        ],
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    expect(pe!.payload).toMatchObject({
      decision_details: expect.objectContaining({
        inputs: expect.objectContaining({
          kind: "identifier_match",
          matched_identifiers: ["INV-1111"],
        }),
      }),
    });
  });

  it("llm_tiebreaker success → decision_details.inputs.kind = 'llm_tiebreaker' with llm_reason", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "llm_tiebreaker",
      customer_account_id: "cust-A",
      customer_name: "Klant A",
      confidence: "medium",
      candidates_considered: 2,
      reason: "subject mentions Klant A",
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: "klant@example.com",
        matched_identifiers: ["INV-2222", "INV-3333"],
        candidates: [
          { id: "cust-A", name: "Klant A", contact_person: null, recent_invoices: [] },
          { id: "cust-B", name: "Klant B", contact_person: null, recent_invoices: [] },
        ],
        llm_reason: "subject mentions Klant A",
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    expect(pe!.payload).toMatchObject({
      decision_details: expect.objectContaining({
        inputs: expect.objectContaining({
          kind: "llm_tiebreaker",
          llm_reason: "subject mentions Klant A",
        }),
      }),
    });
  });

  it("unresolved success → decision_details.inputs.kind = 'unresolved'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      candidates_considered: 0,
      inputs: {
        kind: "unresolved",
        sender_email: "ghost@example.com",
        matched_identifiers: [],
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    expect(pe!.payload).toMatchObject({
      decision_details: expect.objectContaining({
        inputs: expect.objectContaining({
          kind: "unresolved",
        }),
      }),
    });
  });

  it("resolverError path → decision_details has NO inputs key (D-04 legacy fallback)", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockRejectedValueOnce(new Error("nxt timeout"));

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    const details = (pe!.payload as { decision_details: Record<string, unknown> })
      .decision_details;
    expect(details.failure_reason).toBe("nxt timeout");
    expect(details).not.toHaveProperty("inputs");
  });
});

// Phase 70 — TELE-01 Stage 2 dual-write coverage.
describe("Phase 70 — TELE-01 Stage 2 dual-write", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  async function loadHandler(): Promise<{
    handler: typeof handler;
    captures: ReturnType<typeof makeAdminMock>["__captures"];
  }> {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return {
      handler: (mod.stage2CustomerResolver as unknown as {
        handler: typeof handler;
      }).handler,
      captures: (adminMock as unknown as {
        __captures: ReturnType<typeof makeAdminMock>["__captures"];
      }).__captures,
    };
  }

  it("resolver error → emits pipeline_events row with decision='unresolved' and decision_details.failure_reason", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockRejectedValueOnce(new Error("nxt timeout"));

    await h({ event: buildEvent(), step: stepStub });

    const pipelineEventInsert = captures.supabaseInserts.find(
      (i) =>
        i.table === "pipeline_events" &&
        (i.payload as { stage?: number }).stage === 2,
    );
    expect(pipelineEventInsert).toBeTruthy();
    expect(pipelineEventInsert!.payload).toMatchObject({
      stage: 2,
      decision: "unresolved",
      confidence: null,
      decision_details: expect.objectContaining({
        failure_reason: "nxt timeout",
      }),
    });
  });

  it("email lookup uses source_id OR internet_message_id (Phase 74 regression — outlook-zapier writes Graph id to source_id)", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await h({ event: buildEvent(), step: stepStub });

    // Must query both columns so the resolver finds the email row regardless
    // of which ingestion path populated email_pipeline.emails. Single-column
    // .eq("internet_message_id", …) was the Phase 74 dispatch-break bug.
    expect(captures.emailsOrFilters.length).toBeGreaterThan(0);
    const filter = captures.emailsOrFilters[0];
    expect(filter).toContain("source_id.eq.msg-graph-1");
    expect(filter).toContain("internet_message_id.eq.msg-graph-1");
  });

  it("numericConfidence: 'high' → 0.9 in pipeline_events row", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "506909",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
    });

    await h({ event: buildEvent(), step: stepStub });

    const pipelineEventInsert = captures.supabaseInserts.find(
      (i) =>
        i.table === "pipeline_events" &&
        (i.payload as { stage?: number }).stage === 2 &&
        (i.payload as { decision?: string }).decision === "resolved",
    );
    expect(pipelineEventInsert).toBeTruthy();
    expect((pipelineEventInsert!.payload as { confidence?: number }).confidence).toBe(0.9);
  });
});

// Phase 04.1 — Plan 02 (P4.1-D-01 / P4.1-D-02). Side-channel resolver-step
// trace + winner is forward-emitted into decision_details for every NEW
// Stage 2 write. Historic rows lack the fields and render the empty state
// via the hydrator's null gate (Plan 04).
describe("Phase 04.1 — steps trace", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  async function loadHandler(): Promise<{
    handler: typeof handler;
    captures: ReturnType<typeof makeAdminMock>["__captures"];
  }> {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return {
      handler: (mod.stage2CustomerResolver as unknown as {
        handler: typeof handler;
      }).handler,
      captures: (adminMock as unknown as {
        __captures: ReturnType<typeof makeAdminMock>["__captures"];
      }).__captures,
    };
  }

  function findStage2PipelineEvent(
    captures: ReturnType<typeof makeAdminMock>["__captures"],
  ) {
    return captures.supabaseInserts.find(
      (i) =>
        i.table === "pipeline_events" &&
        (i.payload as { stage?: number }).stage === 2,
    );
  }

  it("thread_inheritance → decision_details.steps has length 4 and winner === 1", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "thread_inheritance",
      customer_account_id: "cust-99",
      customer_name: "Klant Holding",
      confidence: "high",
      inputs: {
        kind: "thread_inheritance",
        prior_email_label_id: "label-prev",
        conversation_id: "conv-1",
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    expect(pe).toBeTruthy();
    const dd = (pe!.payload as { decision_details: Record<string, unknown> })
      .decision_details;
    expect(Array.isArray(dd.steps)).toBe(true);
    expect((dd.steps as unknown[]).length).toBe(4);
    expect(dd.winner).toBe(1);
  });

  it("sender_match → winner === 2 and steps[1].status === 'matched'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "sender_match",
      customer_account_id: "cust-123",
      customer_name: "Klant BV",
      confidence: "high",
      candidates_considered: 1,
      inputs: {
        kind: "sender_match",
        sender_email: "klant@example.com",
        candidates: [
          {
            id: "cust-123",
            name: "Klant BV",
            contact_person: "Jan",
            recent_invoices: [],
          },
        ],
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    const dd = (pe!.payload as { decision_details: Record<string, unknown> })
      .decision_details;
    expect(dd.winner).toBe(2);
    const steps = dd.steps as Array<{ idx: number; status: string }>;
    const step2 = steps.find((s) => s.idx === 2);
    expect(step2?.status).toBe("matched");
  });

  it("llm_tiebreaker → winner === 4 and steps[3].status === 'picked'", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockResolvedValueOnce({
      method: "llm_tiebreaker",
      customer_account_id: "cust-A",
      customer_name: "Klant A",
      confidence: "medium",
      candidates_considered: 2,
      reason: "explicit",
      inputs: {
        kind: "llm_tiebreaker",
        sender_email: "klant@example.com",
        matched_identifiers: ["INV-2222"],
        candidates: [
          { id: "cust-A", name: "Klant A", contact_person: null, recent_invoices: [] },
          { id: "cust-B", name: "Klant B", contact_person: null, recent_invoices: [] },
        ],
        llm_reason: "explicit",
        picked_account_id: "cust-A",
      },
    });

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    const dd = (pe!.payload as { decision_details: Record<string, unknown> })
      .decision_details;
    expect(dd.winner).toBe(4);
    const steps = dd.steps as Array<{ idx: number; status: string }>;
    const step4 = steps.find((s) => s.idx === 4);
    expect(step4?.status).toBe("picked");
  });

  it("resolverError path → decision_details.steps still populated from unresolved fallback (winner null)", async () => {
    const { handler: h, captures } = await loadHandler();
    resolveDebtorMock.mockRejectedValueOnce(new Error("nxt timeout"));

    await h({ event: buildEvent(), step: stepStub });

    const pe = findStage2PipelineEvent(captures);
    const dd = (pe!.payload as { decision_details: Record<string, unknown> })
      .decision_details;
    expect(Array.isArray(dd.steps)).toBe(true);
    expect((dd.steps as unknown[]).length).toBe(4);
    expect(dd.winner).toBeNull();
    expect(dd.failure_reason).toBe("nxt timeout");
  });
});

// Phase 114-06 — gap closure. The generic (sales) Stage 2 path. Proves:
//   CR-01: a non-null brand_id ('SB', from resolution_config.scope.brand_scope)
//          reaches resolver.resolveEntity — sender_match + factuur_match become
//          reachable (they were permanently dead with the always-null debtor
//          labeling_settings brand_id).
//   CR-02: entity_brand is normalized to a scalar code for BOTH registry shapes
//          (string-array ['SB'] and object-array [{code:'SB'}]) on the Stage 2→3
//          coordinator.requested hand-off — never '[object Object]', never an object.
describe("sales generic path — gap closure (Phase 114-06)", () => {
  const SALES_EMAIL_ROW = {
    id: "sales-email-uuid-1",
    conversation_id: "sales-conv-1",
    subject: "Offerte aanvraag",
    body_text: "Graag een offerte",
    sender_email: "prospect@bedrijf.nl",
    mailbox: "verkoop@smeba.nl",
  };

  // Sales swarm gate carrying the registry data that drives usesGenericPath.
  // entity_brand shape is parameterized per-test.
  function makeSalesAdminMock(entityBrand: unknown) {
    const auditInserts: Array<Record<string, unknown>> = [];
    const automationRunUpdateEq = vi.fn(async () => ({ data: null, error: null }));
    const automationRunUpdate = vi.fn(() => ({ eq: automationRunUpdateEq }));

    function emailsBuilder() {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.or = vi.fn(() => b);
      b.maybeSingle = vi.fn(async () => ({ data: SALES_EMAIL_ROW, error: null }));
      return b;
    }
    function labelingSettingsBuilder() {
      // No labeling_settings row exists for verkoop@smeba.nl — this is the
      // root cause CR-01 fixes (brand_id was always null on this path).
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      return b;
    }
    function resolutionAuditBuilder() {
      return {
        insert: vi.fn(async (row: Record<string, unknown>) => {
          auditInserts.push(row);
          return { error: null };
        }),
      };
    }

    const schemaImpl = (schemaName: string) => ({
      from: vi.fn((table: string) => {
        if (schemaName === "email_pipeline" && table === "emails") {
          return emailsBuilder();
        }
        if (schemaName === "email_pipeline" && table === "resolution_audit") {
          return resolutionAuditBuilder();
        }
        if (schemaName === "debtor" && table === "labeling_settings") {
          return labelingSettingsBuilder();
        }
        const b: Record<string, unknown> = {};
        b.select = vi.fn(() => b);
        b.eq = vi.fn(() => b);
        b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
        return b;
      }),
    });

    function swarmsBuilder() {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.maybeSingle = vi.fn(async () => ({
        data: {
          swarm_type: "sales-email",
          enabled: true,
          stage2_entity_resolver:
            "@/lib/automations/sales-email/resolve-customer",
          entity_brand: entityBrand,
          resolution_config: {
            version: "2026-06-04.v1",
            source: { kind: "nxt", resolver_tool_id: "nxt.rest_proxy" },
            scope: {
              environment_id: "BX",
              brand_mode: "tiebreaker",
              brand_scope: ["SB"],
            },
            precedence: ["sender_match", "offerte_match", "factuur_match"],
          },
          dry_run_config: {
            stage_2_resolution: true,
            stage_3_labeling: true,
          },
        },
        error: null,
      }));
      return b;
    }

    const pipelineEventsInsert = vi.fn(async () => ({ data: null, error: null }));
    const fromImpl = (table: string) => {
      if (table === "automation_runs") return { update: automationRunUpdate };
      if (table === "pipeline_events") return { insert: pipelineEventsInsert };
      if (table === "swarms") return swarmsBuilder();
      return { update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })) };
    };

    return {
      schema: vi.fn(schemaImpl),
      from: vi.fn(fromImpl),
      __captures: { auditInserts },
    };
  }

  function buildSalesEvent() {
    return {
      id: "evt-sales-test",
      name: "sales-email/stage-2.customer-resolve.requested",
      data: {
        automation_run_id: "sales-ar-1",
        message_id: "sales-msg-1",
        source_mailbox: "verkoop@smeba.nl",
        category_key: "unknown",
        swarm_type: "sales-email",
      },
    };
  }

  async function loadSalesHandler(entityBrand: unknown) {
    vi.clearAllMocks();
    adminMock = makeSalesAdminMock(entityBrand) as unknown as typeof adminMock;
    resolveDebtorMock.mockReset();
    resolveEntityMock.mockReset();
    loadStage2ResolverMock.mockClear();
    loadStage2ResolverMock.mockResolvedValue({ resolveEntity: resolveEntityMock });
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return (mod.stage2CustomerResolver as unknown as {
      handler: (ctx: unknown) => Promise<unknown>;
    }).handler;
  }

  const UNRESOLVED_RESULT = {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
    inputs: { kind: "unresolved", sender_email: null, matched_identifiers: [] },
  };

  it("Test A (CR-01): non-null brand_id 'SB' from config reaches resolveEntity", async () => {
    const handler = await loadSalesHandler(["SB"]);
    resolveEntityMock.mockResolvedValueOnce(UNRESOLVED_RESULT);

    await handler({ event: buildSalesEvent(), step: stepStub });

    expect(resolveEntityMock).toHaveBeenCalledTimes(1);
    const args = resolveEntityMock.mock.calls[0][0] as { brand_id: unknown };
    expect(args.brand_id).toBe("SB");
    expect(args.brand_id).not.toBeNull();
  });

  it("Test B (CR-02 string shape): entity_brand ['SB'] → coordinator.requested entity_brand === 'SB'", async () => {
    const handler = await loadSalesHandler(["SB"]);
    resolveEntityMock.mockResolvedValueOnce(UNRESOLVED_RESULT);

    await handler({ event: buildSalesEvent(), step: stepStub });

    const emit = inngestSend.mock.calls.find((c) =>
      (c[0] as { name: string }).name.endsWith("/coordinator.requested"),
    );
    expect(emit).toBeDefined();
    const data = (emit![0] as { data: Record<string, unknown> }).data;
    expect(data.entity_brand).toBe("SB");
    expect(typeof data.entity_brand).toBe("string");
    expect(data.entity).toBe("SB");
  });

  it("Test C (CR-02 object shape): entity_brand [{code:'SB'}] → coordinator.requested entity_brand === 'SB' (never '[object Object]')", async () => {
    const handler = await loadSalesHandler([{ code: "SB", display_name: "Smeba" }]);
    resolveEntityMock.mockResolvedValueOnce(UNRESOLVED_RESULT);

    await handler({ event: buildSalesEvent(), step: stepStub });

    const emit = inngestSend.mock.calls.find((c) =>
      (c[0] as { name: string }).name.endsWith("/coordinator.requested"),
    );
    expect(emit).toBeDefined();
    const data = (emit![0] as { data: Record<string, unknown> }).data;
    expect(data.entity_brand).toBe("SB");
    expect(typeof data.entity_brand).toBe("string");
    expect(data.entity_brand).not.toBe("[object Object]");
  });
});

// Phase 116-05 Task 1 (TDD) — extracted attachment text is folded into the
// body_text passed to the resolver (STAGE2-01-safe: engine signature unchanged,
// attachment text is *just more body text*, D-11). We observe via the
// resolveDebtor spy (legacy debtor path) — the load-email step mutates
// emailRow.body_text in place, so every resolveEntity/resolveDebtor call site
// sees the combined value. Debtor having no `extracted` rows is the zero-diff
// case (tests 2 + 3).
describe("Phase 116-05 — attachment text folded into body_text", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  async function loadHandlerWithAttachments(
    attachmentRows: Array<{
      attachment_id: string;
      extraction_status: string;
      extracted_text: string | null;
    }>,
  ): Promise<typeof handler> {
    vi.clearAllMocks();
    adminMock = makeAdminMock({ attachmentRows });
    resolveDebtorMock.mockReset();
    resolveDebtorMock.mockResolvedValue({
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
      inputs: { kind: "unresolved", sender_email: null, matched_identifiers: [] },
    });
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../stage-2-customer-resolver");
    return (mod.stage2CustomerResolver as unknown as {
      handler: typeof handler;
    }).handler;
  }

  function bodyTextSeenByResolver(): string {
    expect(resolveDebtorMock).toHaveBeenCalled();
    const arg = resolveDebtorMock.mock.calls[0]![0] as { body_text: string };
    return arg.body_text;
  }

  it("Test 1: one extracted attachment → body = original + separator + attachment text", async () => {
    handler = await loadHandlerWithAttachments([
      {
        attachment_id: "att-1",
        extraction_status: "extracted",
        extracted_text: "OFFERTE SB-12345",
      },
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    // Review WR-01 — the fold-in now labels the region UNTRUSTED DATA so the
    // downstream LLM treats it as reference text, not instructions.
    const body = bodyTextSeenByResolver();
    expect(body.startsWith(EMAIL_ROW.body_text)).toBe(true);
    expect(body).toContain("ATTACHMENTS (UNTRUSTED DATA");
    expect(body).toContain("OFFERTE SB-12345");
  });

  it("Test 2: attachment rows present but none extracted → body unchanged (no separator)", async () => {
    handler = await loadHandlerWithAttachments([
      {
        attachment_id: "att-1",
        extraction_status: "skipped_cap",
        extracted_text: null,
      },
      {
        attachment_id: "att-2",
        extraction_status: "extraction_failed",
        extracted_text: null,
      },
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    const body = bodyTextSeenByResolver();
    expect(body).toBe(EMAIL_ROW.body_text);
    expect(body).not.toContain("ATTACHMENTS");
  });

  it("Test 3: no attachment rows → body unchanged", async () => {
    handler = await loadHandlerWithAttachments([]);

    await handler({ event: buildEvent(), step: stepStub });

    const body = bodyTextSeenByResolver();
    expect(body).toBe(EMAIL_ROW.body_text);
    expect(body).not.toContain("--- ATTACHMENTS ---");
  });

  it("Test 4: multiple extracted attachments → texts joined with \\n\\n in row order", async () => {
    handler = await loadHandlerWithAttachments([
      {
        attachment_id: "att-1",
        extraction_status: "extracted",
        extracted_text: "FIRST DOC",
      },
      {
        attachment_id: "att-2",
        extraction_status: "skipped_cap",
        extracted_text: null,
      },
      {
        attachment_id: "att-3",
        extraction_status: "extracted",
        extracted_text: "THIRD DOC",
      },
    ]);

    await handler({ event: buildEvent(), step: stepStub });

    // Joined in row order, under the UNTRUSTED-DATA label (WR-01).
    const body = bodyTextSeenByResolver();
    expect(body.startsWith(EMAIL_ROW.body_text)).toBe(true);
    expect(body).toContain("ATTACHMENTS (UNTRUSTED DATA");
    expect(body.indexOf("FIRST DOC")).toBeLessThan(body.indexOf("THIRD DOC"));
  });
});
