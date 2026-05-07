// Phase 65 Plan 04 Task 2 — coordinator-orchestrator Inngest function tests.
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

// Phase 68 (SWRM-02) — registry resolves intent → handler_event. Phase 76
// switches the orchestrator to read the FULL swarm_intents row via
// loadSwarmIntents so handler_status (registered | placeholder) is
// available for the defensive Kanban check.
type IntentRow = {
  swarm_type: string;
  intent_key: string;
  handler_agent_key: string | null;
  handler_event: string;
  handler_status: "registered" | "placeholder";
  requires_orchestration: boolean;
  created_at: string;
  updated_at: string;
};
const defaultIntentRow = (intent: string): IntentRow => ({
  swarm_type: "debtor-email",
  intent_key: intent,
  handler_agent_key: null,
  handler_event: `debtor-email/${intent}.requested`,
  handler_status: "registered",
  requires_orchestration: false,
  created_at: "2026-05-07T00:00:00Z",
  updated_at: "2026-05-07T00:00:00Z",
});
const loadSwarmIntentsMock = vi.fn(
  async (_admin: unknown, _swarmType: string): Promise<IntentRow[]> => [
    defaultIntentRow("copy_document_request"),
    defaultIntentRow("address_change"),
    defaultIntentRow("credit_request"),
    defaultIntentRow("payment_dispute"),
    defaultIntentRow("general_inquiry"),
  ],
);
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmIntents: (...args: unknown[]) =>
    (loadSwarmIntentsMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

// Build a chainable supabase admin stub. .from(...).select(...).eq(...).maybeSingle()
// for selects; .from(...).update(...).eq(...) for updates.
const supabaseCalls: Array<{ kind: string; args: unknown[] }> = [];

vi.mock("@/lib/supabase/admin", () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn((cols: string) => {
      supabaseCalls.push({ kind: "select", args: [cols] });
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      supabaseCalls.push({ kind: "eq", args: [col, val] });
      return chain;
    });
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: { run_id: "run-1" }, error: null }),
    );
    chain.single = vi.fn(() =>
      Promise.resolve({ data: { run_id: "run-1" }, error: null }),
    );
    chain.update = vi.fn((patch: Record<string, unknown>) => {
      supabaseCalls.push({ kind: "update", args: [patch] });
      return chain;
    });
    chain.insert = vi.fn((row: unknown) => {
      supabaseCalls.push({ kind: "insert", args: [row] });
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  const from = vi.fn((table: string) => {
    supabaseCalls.push({ kind: "from", args: [table] });
    return makeChain();
  });
  return {
    createAdminClient: vi.fn(() => ({ from })),
  };
});

import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { inngest } from "@/lib/inngest/client";
import { coordinatorOrchestrator } from "../coordinator-orchestrator";

const mockInvoke = invokeOrqAgent as unknown as ReturnType<typeof vi.fn>;
const mockSend = inngest.send as unknown as ReturnType<typeof vi.fn>;

function makeStep() {
  const callOrder: string[] = [];
  return {
    callOrder,
    step: {
      run: vi.fn(async (name: string, fn: () => unknown) => {
        callOrder.push(name);
        return fn();
      }),
    },
  };
}

function getHandler() {
  return (coordinatorOrchestrator as unknown as { handler: (ctx: unknown) => Promise<unknown> }).handler;
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockSend.mockReset();
  mockSend.mockResolvedValue({ ids: ["evt"] });
  supabaseCalls.length = 0;
  loadSwarmIntentsMock.mockReset();
  loadSwarmIntentsMock.mockImplementation(
    async (_admin: unknown, _swarmType: string) => [
      defaultIntentRow("copy_document_request"),
      defaultIntentRow("address_change"),
      defaultIntentRow("credit_request"),
      defaultIntentRow("payment_dispute"),
      defaultIntentRow("general_inquiry"),
    ],
  );
});

const baseEventData = {
  run_id: "run-1",
  email_id: "em-1",
  automation_run_id: "ar-1",
  ranked: [
    { intent: "copy_document_request", confidence: "high" },
    { intent: "address_change", confidence: "medium" },
  ],
  language: "nl",
  urgency: "normal",
  escalation_reason: "high_intent_count",
  budget_run_id: "br-1",
};

describe("CORD-03 coordinator-orchestrator function", () => {
  it("retries:0 + concurrency by run_id limit 1 in function config", () => {
    const cfg = (coordinatorOrchestrator as unknown as { __config: { retries: number; concurrency: Array<{ key: string; limit: number }>; id: string } }).__config;
    expect(cfg.id).toBe("automations/debtor-email-orchestrator");
    expect(cfg.retries).toBe(0);
    expect(cfg.concurrency[0].key).toBe("event.data.run_id");
    expect(cfg.concurrency[0].limit).toBe(1);
  });

  it("plan.handlers.length=2 → 2 inngest.send calls + UPDATE expected_handlers=2 BEFORE fan-out", async () => {
    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "h1", intent: "copy_document_request", context_payload: {} },
          { handler_key: "h2", intent: "address_change", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step, callOrder } = makeStep();
    await getHandler()({ event: { data: baseEventData }, step });

    // 2 inngest.send calls with template-literal event names.
    expect(mockSend).toHaveBeenCalledTimes(2);
    const sentNames = mockSend.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(sentNames).toEqual([
      "debtor-email/copy_document_request.requested",
      "debtor-email/address_change.requested",
    ]);
    // Each emit carries from_orchestrator=true + run_id.
    for (const call of mockSend.mock.calls) {
      const payload = call[0] as { data: Record<string, unknown> };
      expect(payload.data.from_orchestrator).toBe(true);
      expect(payload.data.run_id).toBe("run-1");
    }
    // UPDATE expected_handlers = 2 was issued.
    const updateCall = supabaseCalls.find(
      (c) => c.kind === "update" && (c.args[0] as Record<string, unknown>).expected_handlers === 2,
    );
    expect(updateCall).toBeDefined();
    // Phase 68 — step names are per-intent. Phase 76 renamed the resolve
    // step to resolve-intent-{intent} (it now returns the full swarm_intents
    // row, not just handler_event).
    const idxUpdate = callOrder.indexOf("update-expected-count");
    const firstFanoutIdx = callOrder.findIndex((n) => n.startsWith("fan-out-"));
    expect(idxUpdate).toBeGreaterThan(-1);
    expect(firstFanoutIdx).toBeGreaterThan(idxUpdate);
    expect(callOrder).toContain("resolve-intent-copy_document_request");
    expect(callOrder).toContain("fan-out-copy_document_request");
  });

  it("rejects malformed plan via zod and runs mark-failed", async () => {
    mockInvoke.mockResolvedValue({
      raw: { handlers: [], ordering: "parallel" }, // empty array — min(1) fails
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step, callOrder } = makeStep();
    await expect(getHandler()({ event: { data: baseEventData }, step })).rejects.toThrow(
      /schema mismatch/i,
    );
    expect(callOrder).toContain("mark-failed");
    // No fan-out events emitted.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("5-handler max plan → 5 inngest.send calls", async () => {
    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "a", intent: "copy_document_request", context_payload: {} },
          { handler_key: "b", intent: "address_change", context_payload: {} },
          { handler_key: "c", intent: "credit_request", context_payload: {} },
          { handler_key: "d", intent: "payment_dispute", context_payload: {} },
          { handler_key: "e", intent: "general_inquiry", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step } = makeStep();
    await getHandler()({ event: { data: baseEventData }, step });
    expect(mockSend).toHaveBeenCalledTimes(5);
  });
});

// Phase 68 (SWRM-02) — registry-driven fan-out. Phase 76 reads the full
// swarm_intents row via loadSwarmIntents.
describe("Phase 68 / 76 — registry-driven handler resolution", () => {
  it("uses the row's handler_event from swarm_intents (not a literal)", async () => {
    loadSwarmIntentsMock.mockResolvedValueOnce([
      {
        ...defaultIntentRow("copy_document_request"),
        handler_event: "debtor-email/custom-handler.requested",
      },
    ]);

    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "h1", intent: "copy_document_request", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step } = makeStep();
    await getHandler()({ event: { data: baseEventData }, step });

    expect(loadSwarmIntentsMock).toHaveBeenCalledWith(
      expect.anything(),
      "debtor-email",
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect((mockSend.mock.calls[0]![0] as { name: string }).name).toBe(
      "debtor-email/custom-handler.requested",
    );
  });

  it("throws structured error when swarm_intents row is missing (D-12, no fallback)", async () => {
    loadSwarmIntentsMock.mockResolvedValueOnce([]);
    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "h1", intent: "copy_document_request", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step, callOrder } = makeStep();
    await expect(
      getHandler()({ event: { data: baseEventData }, step }),
    ).rejects.toThrow(/no handler for intent "copy_document_request" in swarm "debtor-email"/);
    expect(mockSend).not.toHaveBeenCalled();
    expect(callOrder).toContain("mark-failed");
  });

  it("loadSwarmIntents runs inside step.run for replay-safety", async () => {
    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "h1", intent: "copy_document_request", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step, callOrder } = makeStep();
    await getHandler()({ event: { data: baseEventData }, step });

    expect(callOrder).toContain("resolve-intent-copy_document_request");
    const idxResolve = callOrder.indexOf("resolve-intent-copy_document_request");
    const idxFanout = callOrder.indexOf("fan-out-copy_document_request");
    expect(idxResolve).toBeLessThan(idxFanout);
  });
});

// Phase 76 — defensive handler_status check inside fan-out loop (R-5/Pitfall 6).
describe("Phase 76 — defensive handler_status check in fan-out", () => {
  it("writes Kanban no_handler row + does NOT inngest.send when handler_status='placeholder'", async () => {
    loadSwarmIntentsMock.mockResolvedValueOnce([
      {
        ...defaultIntentRow("address_change"),
        handler_status: "placeholder",
      },
    ]);
    mockInvoke.mockResolvedValue({
      raw: {
        handlers: [
          { handler_key: "h1", intent: "address_change", context_payload: {} },
        ],
        ordering: "parallel",
      },
      agent: {} as unknown,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      billing: { total_cost: 0 },
      cost_cents: 0,
    });

    const { step, callOrder } = makeStep();
    await getHandler()({ event: { data: baseEventData }, step });

    expect(mockSend).not.toHaveBeenCalled();
    expect(callOrder).toContain("kanban-no-handler-address_change");
    const kanban = supabaseCalls.find(
      (c) =>
        c.kind === "insert" &&
        ((c.args[0] as { result?: { kanban_reason?: string } }).result
          ?.kanban_reason === "no_handler"),
    );
    expect(kanban).toBeDefined();
    const row = kanban!.args[0] as Record<string, unknown>;
    expect(row.automation).toBe("debtor-email-kanban");
    expect(row.triggered_by).toBe("stage-3-no-handler-fanout");
    const result = row.result as Record<string, unknown>;
    expect(result.via).toBe("orchestrator-fanout");
  });
});
