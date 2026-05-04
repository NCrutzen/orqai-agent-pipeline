// Phase 65 Plan 04 Task 2 — coordinator-synthesis Inngest function tests.
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

vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: vi.fn(),
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/automations/debtor-email/handlers/output-adapter", () => ({
  loadHandlerOutputsForRun: vi.fn(),
}));

// Supabase admin: build a mutable mock chain so we can program responses per call.
const supabaseUpdates: Array<Record<string, unknown>> = [];
const coordinatorRunsRowState: { current: Record<string, unknown> | null } = { current: null };

vi.mock("@/lib/supabase/admin", () => {
  function makeSelectChain(rowResolver: () => unknown) {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: rowResolver(), error: null }));
    chain.single = vi.fn(() => Promise.resolve({ data: rowResolver(), error: null }));
    return chain;
  }
  function makeUpdateChain(patch: Record<string, unknown>) {
    supabaseUpdates.push(patch);
    return { eq: vi.fn(() => Promise.resolve({ data: null, error: null })) };
  }
  const from = vi.fn((_table: string) => {
    return {
      select: vi.fn(() => makeSelectChain(() => coordinatorRunsRowState.current)),
      update: vi.fn((patch: Record<string, unknown>) => makeUpdateChain(patch)),
    };
  });
  return {
    createAdminClient: vi.fn(() => ({ from })),
  };
});

import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { loadHandlerOutputsForRun } from "@/lib/automations/debtor-email/handlers/output-adapter";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { coordinatorSynthesis } from "../coordinator-synthesis";

const mockInvoke = invokeOrqAgent as unknown as ReturnType<typeof vi.fn>;
const mockLoadOutputs = loadHandlerOutputsForRun as unknown as ReturnType<typeof vi.fn>;
const mockStale = emitAutomationRunStale as unknown as ReturnType<typeof vi.fn>;

const fetchMock = vi.fn();
(globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

function makeStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
  };
}

function getHandler() {
  return (coordinatorSynthesis as unknown as { handler: (ctx: unknown) => Promise<unknown> }).handler;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockLoadOutputs.mockReset();
  mockStale.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve("") });
  supabaseUpdates.length = 0;
  coordinatorRunsRowState.current = null;
});

const validSynthesisOutput = {
  body_html: "<p>Combined draft body.</p>",
  detected_tone: "neutral",
  synthesis_version: "2026-05-01.v1",
};

const sampleHandlerOutput = {
  handler_key: "debtor-copy-document-body-agent",
  intent: "copy_document_request",
  content_kind: "draft_body",
  content: "<p>x</p>",
  language: "nl",
  tone: "neutral",
  references: ["INV-1"],
  confidence: "medium",
};

describe("CORD-03 coordinator-synthesis function", () => {
  it("retries:0 + concurrency by run_id limit 1 in function config", () => {
    const cfg = (coordinatorSynthesis as unknown as { __config: { retries: number; concurrency: Array<{ key: string; limit: number }>; id: string } }).__config;
    expect(cfg.id).toBe("automations/debtor-email-synthesis");
    expect(cfg.retries).toBe(0);
    expect(cfg.concurrency[0].key).toBe("event.data.run_id");
    expect(cfg.concurrency[0].limit).toBe(1);
  });

  it("happy path: failed=0, 2 outputs → synthesis invoked, draft fetched, partial_synthesis=false", async () => {
    coordinatorRunsRowState.current = {
      run_id: "run-h",
      email_id: "em-1",
      automation_run_id: "ar-1",
      failed_handlers: 0,
      ranked_intents: [
        { intent: "copy_document_request" },
        { intent: "address_change" },
      ],
    };
    mockLoadOutputs.mockResolvedValue([
      { ...sampleHandlerOutput, intent: "copy_document_request" },
      { ...sampleHandlerOutput, intent: "address_change" },
    ]);
    mockInvoke.mockResolvedValue({
      raw: validSynthesisOutput,
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const step = makeStep();
    const result = await getHandler()({ event: { data: { run_id: "run-h" } }, step });

    expect(mockInvoke).toHaveBeenCalledWith("synthesis-agent", expect.any(Object));
    // create-draft route called
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const fetchUrl = fetchMock.mock.calls[0][0] as string;
    expect(fetchUrl).toContain("/api/automations/debtor/create-draft");
    // partial_synthesis flag false on persist
    const persistPatch = supabaseUpdates.find((p) => "partial_synthesis" in p);
    expect(persistPatch?.partial_synthesis).toBe(false);
    expect(persistPatch?.completed_at).toBeDefined();
    // bulk-review revalidation broadcast
    expect(mockStale).toHaveBeenCalledWith(expect.anything(), "debtor-email-review");
    // result shape
    expect((result as { partial_synthesis: boolean; synthesised: boolean }).partial_synthesis).toBe(false);
    expect((result as { synthesised: boolean }).synthesised).toBe(true);
  });

  it("partial path (D-05): failed_handlers=1, 1 output → synthesis invoked, partial_synthesis=true", async () => {
    coordinatorRunsRowState.current = {
      run_id: "run-p",
      email_id: "em-2",
      automation_run_id: "ar-2",
      failed_handlers: 1,
      ranked_intents: [
        { intent: "copy_document_request" },
        { intent: "address_change" },
      ],
    };
    mockLoadOutputs.mockResolvedValue([
      { ...sampleHandlerOutput, intent: "copy_document_request" },
    ]);
    mockInvoke.mockResolvedValue({
      raw: validSynthesisOutput,
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const step = makeStep();
    await getHandler()({ event: { data: { run_id: "run-p" } }, step });

    expect(mockInvoke).toHaveBeenCalled();
    const persistPatch = supabaseUpdates.find((p) => "partial_synthesis" in p);
    expect(persistPatch?.partial_synthesis).toBe(true);
    // Synthesis input includes failed_intents = ['address_change']
    const invokePayload = mockInvoke.mock.calls[0][1] as { failed_intents: string[] };
    expect(invokePayload.failed_intents).toContain("address_change");
  });

  it("all-failed path: handlerOutputs=[] → synthesis NOT invoked, no draft fetch, partial_synthesis=true", async () => {
    coordinatorRunsRowState.current = {
      run_id: "run-af",
      email_id: "em-3",
      automation_run_id: "ar-3",
      failed_handlers: 2,
      ranked_intents: [{ intent: "copy_document_request" }, { intent: "address_change" }],
    };
    mockLoadOutputs.mockResolvedValue([]);

    const step = makeStep();
    await getHandler()({ event: { data: { run_id: "run-af" } }, step });

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    const persistPatch = supabaseUpdates.find((p) => "partial_synthesis" in p);
    expect(persistPatch?.partial_synthesis).toBe(true);
    expect(persistPatch?.completed_at).toBeDefined();
  });

  it("synthesis schema mismatch → mark-failed + handler throws", async () => {
    coordinatorRunsRowState.current = {
      run_id: "run-bad",
      email_id: "em-4",
      automation_run_id: "ar-4",
      failed_handlers: 0,
      ranked_intents: [{ intent: "copy_document_request" }],
    };
    mockLoadOutputs.mockResolvedValue([{ ...sampleHandlerOutput }]);
    mockInvoke.mockResolvedValue({
      raw: { body_html: "ok", detected_tone: "neutral", synthesis_version: "wrong-version" },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const step = makeStep();
    await expect(
      getHandler()({ event: { data: { run_id: "run-bad" } }, step }),
    ).rejects.toThrow(/synthesis-agent output schema mismatch/i);
    // mark-failed branch updated coordinator_runs.completed_at
    const completedAtPatch = supabaseUpdates.find((p) => "completed_at" in p && !("partial_synthesis" in p));
    expect(completedAtPatch).toBeDefined();
  });
});
