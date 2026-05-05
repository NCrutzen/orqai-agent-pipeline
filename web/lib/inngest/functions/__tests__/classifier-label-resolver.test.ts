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

// ---- side-effects registry mock -----------------------------------------
// Phase 68 swap (SWRM-04): label-resolver routes the icontroller-tag emit
// through evaluateSideEffects(stage2_match_live). Mirror the production
// backfill so existing assertions (dry-run skip, unconfigured skip,
// unresolved skip) remain valid: a single inngest_event descriptor whose
// gate matches the prior literal AND-chain.
const ICONTROLLER_TAG_DESCRIPTOR = {
  kind: "inngest_event" as const,
  event: "debtor-email/icontroller-tag.requested",
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
}) {
  // Per-table builders — only need shapes used by the function.
  const settingsRow = overrides?.settings === undefined ? SETTINGS_ROW : overrides.settings;
  const insertedLabelId = overrides?.insertedLabelId ?? "label-uuid-stub";

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
  function emailsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => ({ data: EMAIL_ROW, error: null }));
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

  const fromImpl = (table: string) => {
    if (table === "automation_runs") return automationRunsBuilder();
    if (table === "pipeline_events") return { insert: pipelineEventsInsert };
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
    name: "debtor-email/label-resolve.requested",
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
describe("classifier-label-resolver — Phase 66 D-03 emit", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    adminMock = makeAdminMock();
    resolveDebtorMock.mockReset();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    vi.resetModules();
    const mod = await import("../classifier-label-resolver");
    handler = (mod.classifierLabelResolver as unknown as {
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
        name: "debtor-email/coordinator.requested",
        data: expect.objectContaining({
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
        (c[0] as { name: string }).name ===
        "debtor-email/coordinator.requested",
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
    const mod = await import("../classifier-label-resolver");
    return {
      handler: (mod.classifierLabelResolver as unknown as {
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
        "debtor-email/icontroller-tag.requested",
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
        "debtor-email/icontroller-tag.requested",
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
        "debtor-email/icontroller-tag.requested",
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
        "debtor-email/icontroller-tag.requested",
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
    const mod = await import("../classifier-label-resolver");
    handler = (mod.classifierLabelResolver as unknown as {
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
        "debtor-email/icontroller-tag.requested",
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
        "debtor-email/icontroller-tag.requested",
    );
    expect(tagCalls.length).toBe(0);
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
    const mod = await import("../classifier-label-resolver");
    return {
      handler: (mod.classifierLabelResolver as unknown as {
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
