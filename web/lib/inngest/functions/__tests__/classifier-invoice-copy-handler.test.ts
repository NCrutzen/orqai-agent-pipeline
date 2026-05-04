// Phase 65 Plan 04 Task 3 — focused regression test for the orchestrator
// fan-in wiring on classifier-invoice-copy-handler.
// Asserts ONLY the new code paths: notify-coordinator-complete + persist-handler-output.
// Existing single-shot behaviour (no from_orchestrator flag) is exercised in production
// today — this test does not re-cover it.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/extract-invoices", () => ({
  extractInvoiceCandidates: vi.fn(() => ({ candidates: ["INV-1"] })),
}));

vi.mock("@/lib/automations/debtor-email/coordinator/detect-emotion", () => ({
  detectEmotion: vi.fn(async () => ({ match: false })),
}));

vi.mock("@/lib/automations/debtor-email/coordinator/coordinator-complete", () => ({
  notifyCoordinatorComplete: vi.fn().mockResolvedValue({ completed: 1, expected: 1, claim_synthesis: false }),
}));

// Build a chainable supabase admin stub that programs per-invocation responses.
const supabaseInserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const supabaseUpdates: Array<{ table: string; patch: Record<string, unknown> }> = [];
const agentRunsInsertId = "ar-handler-1";

// Phase 69 — five-brand registry shape served by the swarms-table mock so
// loadBrandRegister can resolve a single brand per invocation.
const FIVE_BRANDS = [
  { code: "smeba", display_name: "Smeba", register_language: "nl", register_dialect: "nl-NL", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "smeba", icontroller_company: "smeba" },
  { code: "smeba-fire", display_name: "Smeba-Fire", register_language: "nl", register_dialect: "nl-BE", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "smeba-fire", icontroller_company: "smeba-fire" },
  { code: "sicli-noord", display_name: "Sicli-Noord", register_language: "nl", register_dialect: "nl-BE", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "sicli-noord", icontroller_company: "sicli-noord" },
  { code: "sicli-sud", display_name: "Sicli-Sud", register_language: "fr", register_dialect: "fr-BE", signoff_phrase: "Cordialement", formal_address: "vous", nxt_database_alias: "sicli-sud", icontroller_company: "sicli-sud" },
  { code: "berki", display_name: "Berki", register_language: "nl", register_dialect: "nl-NL", signoff_phrase: "Met vriendelijke groet", formal_address: "u", nxt_database_alias: "berki", icontroller_company: "berki" },
];

vi.mock("@/lib/supabase/admin", () => {
  function makeChainForTable(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.or = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => {
      if (table === "emails") {
        return Promise.resolve({
          data: {
            id: "email-uuid-1",
            conversation_id: "conv-1",
            subject: "Please send copy of invoice INV-1",
            body_text: "Body",
            sender_email: "x@y.com",
            sender_name: "X Doe",
            mailbox: "inbox",
          },
          error: null,
        });
      }
      if (table === "labeling_settings") {
        return Promise.resolve({
          data: { dry_run: true, entity: "smeba", icontroller_company: null },
          error: null,
        });
      }
      if (table === "swarms") {
        return Promise.resolve({
          data: {
            swarm_type: "debtor-email",
            entity_brand: FIVE_BRANDS,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.single = vi.fn(() =>
      Promise.resolve({ data: { id: agentRunsInsertId }, error: null }),
    );
    chain.insert = vi.fn((row: Record<string, unknown>) => {
      supabaseInserts.push({ table, row });
      // chain.insert(...).select(...).single() pattern — return a chainable.
      return chain;
    });
    chain.update = vi.fn((patch: Record<string, unknown>) => {
      supabaseUpdates.push({ table, patch });
      return chain;
    });
    return chain;
  }
  const from = vi.fn((table: string) => makeChainForTable(table));
  const schema = vi.fn(() => ({ from }));
  return {
    createAdminClient: vi.fn(() => ({ from, schema })),
  };
});

import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { notifyCoordinatorComplete } from "@/lib/automations/debtor-email/coordinator/coordinator-complete";
import { classifierInvoiceCopyHandler } from "../classifier-invoice-copy-handler";

const mockInvoke = invokeOrqAgent as unknown as ReturnType<typeof vi.fn>;
const mockNotify = notifyCoordinatorComplete as unknown as ReturnType<typeof vi.fn>;

const fetchMock = vi.fn();
(globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

function makeStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
  };
}
function getHandler() {
  return (classifierInvoiceCopyHandler as unknown as { handler: (ctx: unknown) => Promise<unknown> }).handler;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockNotify.mockReset();
  mockNotify.mockResolvedValue({ completed: 1, expected: 1, claim_synthesis: false });
  fetchMock.mockReset();
  // fetch-document → returns hydrated PDF; create-draft → success.
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("fetch-document")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          found: true,
          pdf: { base64: "AAA", filename: "inv.pdf" },
          metadata: { invoice_id: "INV-1", document_type: "invoice", created_on: "2026-01-01" },
        }),
        text: async () => "",
      };
    }
    if (url.includes("create-draft")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, draftUrl: "https://x" }),
        text: async () => "",
      };
    }
    return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
  });
  supabaseInserts.length = 0;
  supabaseUpdates.length = 0;
  // Default body-agent response is valid.
  mockInvoke.mockResolvedValue({
    raw: {
      body_html: "<p>Hier is uw kopie van factuur INV-1, in bijlage. Met vriendelijke groet.</p>",
      detected_tone: "neutral",
      body_version: "2026-05-04.v2",
    },
    agent: {} as unknown,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    billing: { total_cost: 0 },
    cost_cents: 0,
  });
});

describe("CORD-03 classifier-invoice-copy-handler orchestrator wiring", () => {
  it("from_orchestrator=true success path → creates agent_runs row + persists handler_output + notify p_failed=false", async () => {
    const step = makeStep();
    await getHandler()({
      event: {
        id: "evt-1",
        data: {
          automation_run_id: "ar-1",
          message_id: "msg-1",
          source_mailbox: "inbox",
          category_key: "invoice_copy_request",
          swarm_type: "debtor-email",
          from_orchestrator: true,
          run_id: "coord-run-1",
          intent: "copy_document_request",
        },
      },
      step,
    });

    // 1) agent_runs row was inserted with coordinator_run_id.
    const agentRunsInsert = supabaseInserts.find(
      (i) => i.table === "agent_runs" && i.row.coordinator_run_id === "coord-run-1",
    );
    expect(agentRunsInsert).toBeDefined();
    expect(agentRunsInsert!.row.intent).toBe("copy_document_request");
    expect(agentRunsInsert!.row.swarm_type).toBe("debtor-email");

    // 2) tool_outputs.handler_output was persisted via UPDATE on agent_runs.
    const handlerOutputUpdate = supabaseUpdates.find(
      (u) =>
        u.table === "agent_runs" &&
        (u.patch.tool_outputs as { handler_output?: unknown } | undefined)?.handler_output,
    );
    expect(handlerOutputUpdate).toBeDefined();
    const persistedOutput = (handlerOutputUpdate!.patch.tool_outputs as { handler_output: { content_kind: string; content: string; tone: string } }).handler_output;
    expect(persistedOutput.content_kind).toBe("draft_body");
    expect(persistedOutput.tone).toBe("neutral");
    expect(persistedOutput.content).toContain("Hier is uw kopie");

    // 3) notifyCoordinatorComplete called with p_failed=false on success.
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), "coord-run-1", false);
  });

  it("from_orchestrator=true failure path → notify p_failed=true and original error re-throws", async () => {
    // Make the body-agent invocation throw → catch in wrapper → notify(failed=true) → re-throw.
    mockInvoke.mockRejectedValueOnce(new Error("Orq invoke debtor-copy-document-body-agent failed: boom"));

    const step = makeStep();
    await expect(
      getHandler()({
        event: {
          id: "evt-2",
          data: {
            automation_run_id: "ar-2",
            message_id: "msg-2",
            source_mailbox: "inbox",
            category_key: "invoice_copy_request",
            swarm_type: "debtor-email",
            from_orchestrator: true,
            run_id: "coord-run-2",
            intent: "copy_document_request",
          },
        },
        step,
      }),
    ).rejects.toThrow(/boom/);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(expect.anything(), "coord-run-2", true);
  });

  it("single-shot path (from_orchestrator absent) → notifyCoordinatorComplete NOT called", async () => {
    const step = makeStep();
    await getHandler()({
      event: {
        id: "evt-3",
        data: {
          automation_run_id: "ar-3",
          message_id: "msg-3",
          source_mailbox: "inbox",
          category_key: "invoice_copy_request",
          swarm_type: "debtor-email",
          // no from_orchestrator, no run_id
        },
      },
      step,
    });
    expect(mockNotify).not.toHaveBeenCalled();
    // No agent_runs insert in single-shot path.
    const agentRunsInsert = supabaseInserts.find((i) => i.table === "agent_runs");
    expect(agentRunsInsert).toBeUndefined();
  });
});

// Phase 69 / CANO-01 / Wave 4 — assert the body-agent invocation uses the
// canonical input shape (entity_brand + brand_register), not the legacy
// email_entity / email_language fields.
describe("CANO-01 classifier-invoice-copy-handler canonical input shape", () => {
  it("body agent receives entity_brand + brand_register; no email_entity/email_language", async () => {
    const step = makeStep();
    await getHandler()({
      event: {
        id: "evt-cano-1",
        data: {
          automation_run_id: "ar-cano-1",
          message_id: "msg-cano-1",
          source_mailbox: "inbox",
          category_key: "invoice_copy_request",
          swarm_type: "debtor-email",
        },
      },
      step,
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      "debtor-copy-document-body-agent",
      expect.objectContaining({
        entity_brand: "smeba",
        language: "nl",
        customer_id: expect.any(String),
        context_version: 1,
        body_version: "2026-05-04.v2",
        brand_register: expect.objectContaining({
          code: "smeba",
          register_language: "nl",
          signoff_phrase: "Met vriendelijke groet",
          formal_address: "u",
        }),
      }),
      expect.objectContaining({ jsonSchemaName: "debtor_copy_document_body_result" }),
    );

    // Legacy fields must not appear in the inputs.
    expect(mockInvoke).toHaveBeenCalledWith(
      "debtor-copy-document-body-agent",
      expect.not.objectContaining({ email_entity: expect.anything() }),
      expect.anything(),
    );
    expect(mockInvoke).toHaveBeenCalledWith(
      "debtor-copy-document-body-agent",
      expect.not.objectContaining({ email_language: expect.anything() }),
      expect.anything(),
    );
  });
});
