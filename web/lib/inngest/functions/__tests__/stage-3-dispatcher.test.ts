// Phase 80 Plan 01 Wave 0 — RED test scaffold for stage-3-dispatcher.
//
// Target file `@/lib/inngest/functions/stage-3-dispatcher` does NOT exist yet
// (Wave 1 / plan 80-02 builds it). The module-not-found import is the
// expected RED state — these tests describe the contract Wave 1 must satisfy.
//
// Hard-separation rule (RFC, docs/agentic-pipeline/stage-3-coordinator.md):
//   dispatcher consumes `swarm_intents` only; never `swarm_noise_categories`.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      __trigger: _trigger,
      handler,
    })),
  },
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// swarm_intents row shape + inline helpers (per 80-PATTERNS.md — no separate
// fixtures module; RESEARCH Q9 prefers inline).
// ---------------------------------------------------------------------------
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

function placeholderRow(intent: string, swarm_type = "debtor-email"): IntentRow {
  return {
    swarm_type,
    intent_key: intent,
    handler_agent_key: null,
    handler_event: `${swarm_type}/${intent}.requested`,
    handler_status: "placeholder",
    requires_orchestration: false,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
  };
}

function registeredRow(
  intent: string,
  handler_event: string,
  swarm_type = "debtor-email",
): IntentRow {
  return {
    swarm_type,
    intent_key: intent,
    handler_agent_key: `${swarm_type}-${intent}-handler`,
    handler_event,
    handler_status: "registered",
    requires_orchestration: false,
    created_at: "2026-05-08T00:00:00Z",
    updated_at: "2026-05-08T00:00:00Z",
  };
}

const loadSwarmIntentsMock = vi.fn(
  async (_admin: unknown, _swarmType: string): Promise<IntentRow[]> => [
    registeredRow(
      "copy_document_request",
      "debtor-email/copy_document_request.requested",
    ),
  ],
);
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmIntents: (...args: unknown[]) =>
    (loadSwarmIntentsMock as unknown as (...a: unknown[]) => unknown)(...args),
}));

// ---------------------------------------------------------------------------
// Chainable Supabase admin mock — captures .from / .select / .eq / .single /
// .update / .insert. Per-test override of the agent_runs.status precondition
// `single()` result drives idempotency/replay tests.
// ---------------------------------------------------------------------------
const supabaseCalls: Array<{ kind: string; args: unknown[] }> = [];

// Per-test override for the agent_runs.status precondition. Default: row
// exists with status='predicted' (happy path — dispatcher should proceed).
let agentRunsStatusSingle: { data: { status: string } | null; error: unknown } = {
  data: { status: "predicted" },
  error: null,
};

vi.mock("@/lib/supabase/admin", () => {
  function makeChain() {
    const chain: Record<string, unknown> = {};
    let currentTable: string | null = null;
    chain.__setTable = (t: string) => {
      currentTable = t;
    };
    chain.select = vi.fn((cols: string) => {
      supabaseCalls.push({ kind: "select", args: [cols] });
      return chain;
    });
    chain.eq = vi.fn((col: string, val: unknown) => {
      supabaseCalls.push({ kind: "eq", args: [col, val] });
      return chain;
    });
    chain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: null }),
    );
    chain.single = vi.fn(() => {
      // Route precondition reads on agent_runs through the override.
      if (currentTable === "agent_runs") {
        return Promise.resolve(agentRunsStatusSingle);
      }
      return Promise.resolve({ data: null, error: null });
    });
    chain.update = vi.fn((patch: Record<string, unknown>) => {
      supabaseCalls.push({ kind: "update", args: [patch, { table: currentTable }] });
      return chain;
    });
    chain.insert = vi.fn((row: unknown) => {
      supabaseCalls.push({ kind: "insert", args: [row, { table: currentTable }] });
      return Promise.resolve({ data: null, error: null });
    });
    return chain;
  }
  const from = vi.fn((table: string) => {
    supabaseCalls.push({ kind: "from", args: [table] });
    const chain = makeChain() as Record<string, unknown> & {
      __setTable: (t: string) => void;
    };
    chain.__setTable(table);
    return chain;
  });
  return {
    createAdminClient: vi.fn(() => ({ from })),
  };
});

// ---------------------------------------------------------------------------
// Import target — DOES NOT EXIST YET. RED state expected.
// Wave 1 / plan 80-02 lands web/lib/inngest/functions/stage-3-dispatcher.ts.
// ---------------------------------------------------------------------------
import { inngest } from "@/lib/inngest/client";
// @ts-expect-error — module not yet implemented; see Wave 1 / plan 80-02.
import { stage3Dispatcher } from "../stage-3-dispatcher";

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
  return (stage3Dispatcher as unknown as { handler: (ctx: unknown) => Promise<unknown> })
    .handler;
}

const baseEventData = {
  swarm_type: "debtor-email",
  run_id: "run-1",
  agent_run_id: "ar-1",
  email_id: "em-1",
  automation_run_id: "arun-1",
  budget_run_id: "br-1",
  ranked: [
    { intent: "copy_document_request", confidence: "high" },
    { intent: "address_change", confidence: "medium" },
  ],
  language: "nl",
  urgency: "normal",
  entity: "smeba",
};

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({ ids: ["evt"] });
  supabaseCalls.length = 0;
  loadSwarmIntentsMock.mockReset();
  loadSwarmIntentsMock.mockImplementation(async () => [
    registeredRow(
      "copy_document_request",
      "debtor-email/copy_document_request.requested",
    ),
  ]);
  agentRunsStatusSingle = { data: { status: "predicted" }, error: null };
});

describe("stage-3-dispatcher", () => {
  it("placeholder routes to kanban + flips agent_runs.status='routed_human_queue'", async () => {
    loadSwarmIntentsMock.mockResolvedValueOnce([placeholderRow("copy_document_request")]);

    const { step, callOrder } = makeStep();
    await getHandler()({
      event: { name: "debtor-email/predicted", data: baseEventData },
      step,
    });

    // Single atomic dispatch step (consolidated per RESEARCH §"Replay safety").
    expect(callOrder.filter((n) => n === "dispatch-placeholder")).toHaveLength(1);

    // automation_runs INSERT for the kanban row with kanban_reason='no_handler'.
    const kanbanInsert = supabaseCalls.find(
      (c) =>
        c.kind === "insert" &&
        ((c.args[0] as { automation?: string }).automation ===
          "debtor-email-kanban") &&
        ((c.args[0] as { result?: { kanban_reason?: string } }).result
          ?.kanban_reason === "no_handler"),
    );
    expect(kanbanInsert).toBeDefined();

    // agent_runs.status flipped to routed_human_queue.
    const flipUpdate = supabaseCalls.find(
      (c) =>
        c.kind === "update" &&
        (c.args[0] as { status?: string }).status === "routed_human_queue" &&
        (c.args[1] as { table?: string }).table === "agent_runs",
    );
    expect(flipUpdate).toBeDefined();

    // Placeholder branch must NOT emit a downstream handler event.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("registered emits handler_event from swarm_intents (does NOT flip agent_runs.status)", async () => {
    loadSwarmIntentsMock.mockResolvedValueOnce([
      registeredRow(
        "copy_document_request",
        "debtor-email/copy-document.requested",
      ),
    ]);

    const { step } = makeStep();
    await getHandler()({
      event: { name: "debtor-email/predicted", data: baseEventData },
      step,
    });

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect((mockSend.mock.calls[0]![0] as { name: string }).name).toBe(
      "debtor-email/copy-document.requested",
    );

    // No status flip in the registered branch — Stage 4 handler owns it.
    const flipUpdate = supabaseCalls.find(
      (c) =>
        c.kind === "update" &&
        (c.args[0] as { status?: string }).status === "routed_human_queue" &&
        (c.args[1] as { table?: string }).table === "agent_runs",
    );
    expect(flipUpdate).toBeUndefined();
  });

  it("wildcard routes sales-email/predicted via event.name discrimination", async () => {
    // Cross-swarm: dispatcher infers swarm_type from event.name (or payload)
    // — never from a hardcoded constant. must_have #6 (cross-swarm).
    loadSwarmIntentsMock.mockResolvedValueOnce([
      registeredRow(
        "lead_qualification",
        "sales-email/lead-qualification.requested",
        "sales-email",
      ),
    ]);

    const salesEvent = {
      ...baseEventData,
      swarm_type: "sales-email",
      ranked: [{ intent: "lead_qualification", confidence: "high" }],
    };

    const { step } = makeStep();
    await getHandler()({
      event: { name: "sales-email/predicted", data: salesEvent },
      step,
    });

    // loadSwarmIntents must have been called with sales-email (NOT debtor-email).
    expect(loadSwarmIntentsMock).toHaveBeenCalledWith(
      expect.anything(),
      "sales-email",
    );

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect((mockSend.mock.calls[0]![0] as { name: string }).name).toBe(
      "sales-email/lead-qualification.requested",
    );
  });

  it("duplicate */predicted event for same agent_run_id is no-op (idempotency)", async () => {
    // Precondition: agent_runs.status is already 'routed_human_queue'
    // (a previous dispatcher invocation completed). The duplicate event
    // must NOT insert another kanban row, NOT update, NOT inngest.send.
    agentRunsStatusSingle = {
      data: { status: "routed_human_queue" },
      error: null,
    };
    loadSwarmIntentsMock.mockResolvedValueOnce([placeholderRow("copy_document_request")]);

    const { step } = makeStep();
    await getHandler()({
      event: { name: "debtor-email/predicted", data: baseEventData },
      step,
    });

    const inserts = supabaseCalls.filter((c) => c.kind === "insert");
    expect(inserts).toHaveLength(0);

    const flipUpdates = supabaseCalls.filter(
      (c) =>
        c.kind === "update" &&
        (c.args[1] as { table?: string }).table === "agent_runs",
    );
    expect(flipUpdates).toHaveLength(0);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it("replay does not duplicate kanban (status precondition gates entire step.run)", async () => {
    loadSwarmIntentsMock.mockResolvedValue([placeholderRow("copy_document_request")]);

    // First invocation: status='predicted' → kanban INSERT happens.
    agentRunsStatusSingle = { data: { status: "predicted" }, error: null };
    const first = makeStep();
    await getHandler()({
      event: { name: "debtor-email/predicted", data: baseEventData },
      step: first.step,
    });

    // Second invocation (replay): status flipped to routed_human_queue
    // by the previous run → precondition guards the atomic step.run.
    agentRunsStatusSingle = {
      data: { status: "routed_human_queue" },
      error: null,
    };
    const second = makeStep();
    await getHandler()({
      event: { name: "debtor-email/predicted", data: baseEventData },
      step: second.step,
    });

    const kanbanInserts = supabaseCalls.filter(
      (c) =>
        c.kind === "insert" &&
        ((c.args[0] as { automation?: string }).automation ===
          "debtor-email-kanban"),
    );
    // Across the two invocations, kanban INSERT must run exactly once.
    expect(kanbanInserts).toHaveLength(1);
  });
});
