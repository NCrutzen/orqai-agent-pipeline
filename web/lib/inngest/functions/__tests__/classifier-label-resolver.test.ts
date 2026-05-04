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

function makeAdminMock() {
  // Per-table builders — only need shapes used by the function.
  const emailLabelsInsert = vi.fn(async () => ({ data: null, error: null }));
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
    b.maybeSingle = vi.fn(async () => ({ data: SETTINGS_ROW, error: null }));
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
    return { update: vi.fn(() => ({ eq: vi.fn(async () => ({})) })) };
  };

  return {
    schema: vi.fn(schemaImpl),
    from: vi.fn(fromImpl),
    __captures: {
      emailLabelsInsert,
      automationRunUpdate,
      automationRunUpdateEq,
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
