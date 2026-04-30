// Phase 56-02 wave 3 part 2: tests for classifier-invoice-copy-handler.
//
// The handler is registry-driven (orq_agents) and orchestrates two HTTP
// routes (/fetch-document, /create-draft) plus a Supabase audit insert.
// Tests stub all I/O and invoke the handler directly via the test-only
// __handler escape hatch attached by the inngest mock.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Admin client mock — supports both top-level (.from) and schema-prefixed
// (.schema(s).from(t)) chains, plus .select().eq().maybeSingle() for reads
// and .insert() / .update().eq() for writes.
// ---------------------------------------------------------------------------

type Op = {
  schema: string | null;
  table: string;
  op: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  filterCol?: string;
  filterVal?: unknown;
};

const ops: Op[] = [];

// Per-test programmable read responses keyed on `${schema ?? ''}.${table}`.
let readResponses: Record<string, unknown> = {};

function makeReadChain(schema: string | null, table: string) {
  const filter: { col: string | null; val: unknown } = { col: null, val: null };
  const chain = {
    select: (_cols: string) => chain,
    eq: (col: string, val: unknown) => {
      filter.col = col;
      filter.val = val;
      return chain;
    },
    maybeSingle: async () => {
      ops.push({
        schema,
        table,
        op: "select",
        filterCol: filter.col ?? undefined,
        filterVal: filter.val,
      });
      const key = `${schema ?? ""}.${table}`;
      const data = readResponses[key];
      return { data: data ?? null, error: null };
    },
  };
  return chain;
}

function makeTable(schema: string | null, table: string) {
  return {
    select: (cols: string) => makeReadChain(schema, table).select(cols),
    insert: async (payload: Record<string, unknown>) => {
      ops.push({ schema, table, op: "insert", payload });
      return { error: null };
    },
    update: (payload: Record<string, unknown>) => ({
      eq: async (col: string, val: unknown) => {
        ops.push({
          schema,
          table,
          op: "update",
          payload,
          filterCol: col,
          filterVal: val,
        });
        return { error: null };
      },
    }),
  };
}

const adminClient = {
  from: (table: string) => makeTable(null, table),
  schema: (s: string) => ({ from: (t: string) => makeTable(s, t) }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClient,
}));

const emitStaleMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: (...args: unknown[]) => emitStaleMock(...args),
}));

const invokeOrqAgentMock = vi.fn();
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: (...args: unknown[]) => invokeOrqAgentMock(...args),
}));

const detectEmotionMock = vi.fn((..._args: unknown[]) => ({ match: false }));
vi.mock("@/lib/automations/debtor-email/triage/detect-emotion", () => ({
  detectEmotion: (...args: unknown[]) => detectEmotionMock(...args),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (
      _config: unknown,
      _trigger: unknown,
      handler: (ctx: unknown) => Promise<unknown>,
    ) => ({ __handler: handler }),
    send: vi.fn(),
  },
}));

// Import AFTER mocks are wired.
import { classifierInvoiceCopyHandler } from "@/lib/inngest/functions/classifier-invoice-copy-handler";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EventData = {
  automation_run_id: string;
  swarm_type: string;
  category_key: string;
  message_id: string;
  source_mailbox: string;
};

async function invokeHandler(data: EventData, eventId = "evt-1") {
  const stepRun = async <T>(_name: string, fn: () => Promise<T> | T): Promise<T> =>
    Promise.resolve(fn());
  const handler = (classifierInvoiceCopyHandler as unknown as {
    __handler: (ctx: {
      event: { id?: string; data: EventData };
      step: { run: typeof stepRun };
    }) => Promise<unknown>;
  }).__handler;
  return handler({ event: { id: eventId, data }, step: { run: stepRun } });
}

function baseEvent(overrides: Partial<EventData> = {}): EventData {
  return {
    automation_run_id: "run-1",
    swarm_type: "debtor-email",
    category_key: "invoice_copy_request",
    message_id: "<msg-1@smeba.nl>",
    source_mailbox: "debiteuren@smeba.nl",
    ...overrides,
  };
}

const FETCH_OK_RESPONSE = {
  found: true,
  pdf: { base64: "JVBERi0xLjQK", filename: "20260420_nl-invoice-33052208.pdf" },
  metadata: {
    invoice_id: "inv-uuid-1",
    document_type: "invoice",
    created_on: "2026-04-20T08:49:19Z",
  },
};

const DRAFT_OK_RESPONSE = {
  success: true,
  draftUrl: "https://icontroller/drafts/123",
  screenshots: { beforeSave: "url://before", afterSave: "url://after" },
};

const BODY_AGENT_OK = {
  body_html:
    '<p>Beste Jan,</p><p>Hartelijk dank voor uw bericht. Hierbij treft u in de bijlage een kopie aan van factuur 33052208.</p><p>Heeft u vragen? Dan hoor ik het graag.<br>Team Debiteuren Smeba</p><hr style="border:none;border-top:1px solid #ccc;margin:20px 0 8px"><div style="font-family:monospace;font-size:11px;color:#888">🤖 auto-generated · intent: copy_document_request · confidence: high · ref: 33052208 · body_version: 2026-04-23.v1 · email_id: e-1</div>',
  detected_tone: "neutral" as const,
  body_version: "2026-04-23.v1" as const,
};

beforeEach(() => {
  ops.length = 0;
  readResponses = {};
  emitStaleMock.mockClear();
  invokeOrqAgentMock.mockReset();
  detectEmotionMock.mockClear();
  detectEmotionMock.mockImplementation(() => ({ match: false }));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("classifier-invoice-copy-handler", () => {
  it("happy path: fetches PDF, drafts via body agent, writes invoice_copy_drafted label, closes run as predicted", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-1",
      conversation_id: "conv-1",
      subject: "Kopie factuur 33052208",
      body_text: "Beste, kunt u mij een kopie sturen van factuur 33052208?",
      sender_email: "jan@example.nl",
      sender_first_name: "Jan",
      mailbox: "debiteuren@smeba.nl",
    };
    readResponses["debtor.labeling_settings"] = {
      dry_run: false,
      entity: "smeba",
      icontroller_company: "smebabrandbeveiliging",
    };

    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => FETCH_OK_RESPONSE,
    });
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => DRAFT_OK_RESPONSE,
    });
    vi.stubGlobal("fetch", fetchSpy);

    invokeOrqAgentMock.mockResolvedValue({ raw: BODY_AGENT_OK, agent: {} });

    const result = (await invokeHandler(baseEvent())) as {
      ok: boolean;
      invoice_reference: string;
      detected_tone: string;
    };

    expect(result.ok).toBe(true);
    expect(result.invoice_reference).toBe("33052208");
    expect(result.detected_tone).toBe("neutral");

    // Both HTTP routes were called.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain("/fetch-document");
    expect(fetchSpy.mock.calls[1][0]).toContain("/create-draft");

    const fetchBody = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(fetchBody).toEqual({
      docType: "invoice",
      reference: "33052208",
      entity: "smeba",
    });
    const draftBody = JSON.parse(fetchSpy.mock.calls[1][1].body as string);
    expect(draftBody.mode).toBe("reply");
    expect(draftBody.messageId).toBe("<msg-1@smeba.nl>");
    expect(draftBody.bodyHtml).toContain("factuur 33052208");
    expect(draftBody.env).toBe("production"); // dry_run=false → production

    // Body agent invoked via registry with correct key + sample inputs.
    expect(invokeOrqAgentMock).toHaveBeenCalledTimes(1);
    expect(invokeOrqAgentMock.mock.calls[0][0]).toBe(
      "debtor-copy-document-body-agent",
    );
    const inputs = invokeOrqAgentMock.mock.calls[0][1] as Record<string, unknown>;
    expect(inputs.email_id).toBe("e-1");
    expect(inputs.email_entity).toBe("smeba");
    expect(inputs.email_language).toBe("nl");
    expect(inputs.intent_result_document_reference).toBe("33052208");
    expect(inputs.intent_result_intent).toBe("copy_document_request");
    expect(inputs.emotion_trigger_match).toBe(false);

    // email_labels insert with method=invoice_copy_drafted.
    const labelInsert = ops.find(
      (o) => o.schema === "debtor" && o.table === "email_labels" && o.op === "insert",
    );
    expect(labelInsert).toBeDefined();
    expect(labelInsert!.payload).toMatchObject({
      email_id: "e-1",
      source_mailbox: "debiteuren@smeba.nl",
      method: "invoice_copy_drafted",
      confidence: "high",
      status: "labeled", // dry_run=false
    });

    // automation_runs closed as predicted.
    const runUpdate = ops.find(
      (o) =>
        o.table === "automation_runs" &&
        o.op === "update" &&
        (o.payload as { status?: string }).status === "predicted",
    );
    expect(runUpdate).toBeDefined();
    expect(runUpdate!.filterVal).toBe("run-1");
  });

  it("no invoice references in subject/body → writes unresolved label, closes run as predicted", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-2",
      conversation_id: "conv-2",
      subject: "Kunt u me iets toesturen",
      body_text: "Hallo, kunt u mij een kopie sturen alstublieft?",
      sender_email: "x@y.nl",
      sender_first_name: null,
      mailbox: "debiteuren@smeba.nl",
    };
    readResponses["debtor.labeling_settings"] = {
      dry_run: true,
      entity: "smeba",
    };

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = (await invokeHandler(baseEvent({ automation_run_id: "run-2" }))) as {
      ok: boolean;
      reason: string;
    };
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("no_invoice_reference");

    // Neither HTTP route nor the body agent was called.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invokeOrqAgentMock).not.toHaveBeenCalled();

    const labelInsert = ops.find(
      (o) => o.schema === "debtor" && o.table === "email_labels" && o.op === "insert",
    );
    expect(labelInsert).toBeDefined();
    expect(labelInsert!.payload).toMatchObject({
      email_id: "e-2",
      method: "unresolved",
      confidence: "none",
      status: "dry_run", // dry_run=true
    });

    const runUpdate = ops.find(
      (o) =>
        o.table === "automation_runs" &&
        o.op === "update" &&
        (o.payload as { status?: string }).status === "predicted",
    );
    expect(runUpdate).toBeDefined();
  });

  it("missing entity in labeling_settings → marks automation_runs failed", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-3",
      conversation_id: null,
      subject: "Factuur 33052208",
      body_text: "kopie aub",
      sender_email: "x@y.nl",
      sender_first_name: null,
      mailbox: "debiteuren@smeba.nl",
    };
    readResponses["debtor.labeling_settings"] = { dry_run: true, entity: null };

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = (await invokeHandler(
      baseEvent({ automation_run_id: "run-3" }),
    )) as { ok: boolean; reason: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/entity not configured/);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invokeOrqAgentMock).not.toHaveBeenCalled();

    const failed = ops.find(
      (o) =>
        o.table === "automation_runs" &&
        o.op === "update" &&
        (o.payload as { status?: string }).status === "failed",
    );
    expect(failed).toBeDefined();
    expect((failed!.payload as { error_message?: string }).error_message).toMatch(
      /entity not configured/,
    );
  });

  it("fetch-document failure throws so the run is left in pending and the kanban retry button is the recovery path", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-4",
      conversation_id: null,
      subject: "Factuur 33052208",
      body_text: "kopie aub",
      sender_email: "x@y.nl",
      sender_first_name: null,
      mailbox: "debiteuren@smeba.nl",
    };
    readResponses["debtor.labeling_settings"] = { dry_run: true, entity: "smeba" };

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ found: false, reason: "timeout" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      invokeHandler(baseEvent({ automation_run_id: "run-4" })),
    ).rejects.toThrow(/fetch-document failed: timeout/);

    expect(invokeOrqAgentMock).not.toHaveBeenCalled();
    // No email_labels insert, no run-status update beyond what step.run already did.
    const labelInsert = ops.find(
      (o) => o.schema === "debtor" && o.table === "email_labels" && o.op === "insert",
    );
    expect(labelInsert).toBeUndefined();
  });

  it("create-draft failure (e.g. login_failed) propagates as a thrown error", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-5",
      conversation_id: null,
      subject: "Factuur 33052208",
      body_text: "kopie aub",
      sender_email: "x@y.nl",
      sender_first_name: null,
      mailbox: "debiteuren@smeba.nl",
    };
    readResponses["debtor.labeling_settings"] = { dry_run: true, entity: "smeba" };

    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => FETCH_OK_RESPONSE,
    });
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, reason: "login_failed" }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    invokeOrqAgentMock.mockResolvedValue({ raw: BODY_AGENT_OK, agent: {} });

    await expect(
      invokeHandler(baseEvent({ automation_run_id: "run-5" })),
    ).rejects.toThrow(/create-draft failed: login_failed/);

    // Body agent was called before draft attempt.
    expect(invokeOrqAgentMock).toHaveBeenCalledTimes(1);

    // No email_labels insert (insert happens AFTER successful draft).
    const labelInsert = ops.find(
      (o) => o.schema === "debtor" && o.table === "email_labels" && o.op === "insert",
    );
    expect(labelInsert).toBeUndefined();
  });

  it("sicli-sud entity uses fr language for the body agent", async () => {
    readResponses["email_pipeline.emails"] = {
      id: "e-6",
      conversation_id: null,
      subject: "Copie facture 33048721",
      body_text: "Bonjour, pourriez-vous me renvoyer la facture 33048721?",
      sender_email: "client@example.fr",
      sender_first_name: null,
      mailbox: "facturations@sicli-sud.be",
    };
    readResponses["debtor.labeling_settings"] = {
      dry_run: true,
      entity: "sicli-sud",
    };

    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => FETCH_OK_RESPONSE });
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => DRAFT_OK_RESPONSE });
    vi.stubGlobal("fetch", fetchSpy);
    invokeOrqAgentMock.mockResolvedValue({ raw: BODY_AGENT_OK, agent: {} });

    await invokeHandler(
      baseEvent({
        automation_run_id: "run-6",
        source_mailbox: "facturations@sicli-sud.be",
      }),
    );

    const inputs = invokeOrqAgentMock.mock.calls[0][1] as Record<string, unknown>;
    expect(inputs.email_entity).toBe("sicli-sud");
    expect(inputs.email_language).toBe("fr");
  });
});
