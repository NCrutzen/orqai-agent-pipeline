/**
 * Phase 113 Plan 04 Task 1 — 'other' residual routes to Kanban, not a throw
 * (T-113-08 / STAGE3-03 dead-letter guard).
 *
 * Given a swarm_intents fixture containing ('sales-email','other',
 * handler_status='placeholder'), the shared Stage 3.5 dispatcher must resolve
 * intent_key='other' to the PLACEHOLDER branch (Kanban human-lane insert +
 * agent_runs.status='routed_human_queue') and must NOT throw
 * "no swarm_intents row". Without the seeded 'other' row the dispatcher's
 * `!intentRow` guard throws → silent dead-letter; this test proves the seed
 * closes that hole.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createFunctionMock, sendMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
  sendMock: vi.fn().mockResolvedValue({ ids: ["evt"] }),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: createFunctionMock, send: sendMock },
}));

// loadSwarmIntents returns the sales registry fixture (with the seeded 'other').
const { loadSwarmIntentsMock } = vi.hoisted(() => ({
  loadSwarmIntentsMock: vi.fn(),
}));
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmIntents: loadSwarmIntentsMock,
}));

// Escalation gate is a no-op collapse-to-dispatch in current behavior.
vi.mock("@/lib/automations/debtor-email/coordinator/escalation-gate", () => ({
  evaluateEscalationGate: vi.fn(() => ({ kind: "dispatch" })),
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

// Admin client: agent_runs read returns status='predicted' (so the placeholder
// branch proceeds); automation_runs/agent_runs/coordinator_runs writes captured.
const { state } = vi.hoisted(() => ({
  state: {
    inserts: [] as Array<{ table: string; row: unknown }>,
    updates: [] as Array<{ table: string; patch: unknown }>,
    agentRunStatus: "predicted" as string,
  },
}));

function makeWriteBuilder(table: string) {
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn(async (row: unknown) => {
    state.inserts.push({ table, row });
    return { data: null, error: null };
  });
  builder.update = vi.fn((patch: unknown) => {
    state.updates.push({ table, patch });
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    // terminal: the last .eq() in the dispatcher is awaited
    (chain as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      res({ data: null, error: null });
    return chain;
  });
  builder.select = () => {
    const chain: Record<string, unknown> = {};
    chain.eq = () => chain;
    chain.single = async () => {
      if (table === "agent_runs") {
        return { data: { status: state.agentRunStatus }, error: null };
      }
      if (table === "coordinator_runs") {
        return { data: { completed_at: null }, error: null };
      }
      return { data: null, error: null };
    };
    return chain;
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => makeWriteBuilder(table)),
  }),
}));

import { stage3Dispatcher } from "../stage-3-dispatcher";

function makeStep() {
  return { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };
}

function getHandler() {
  return (
    stage3Dispatcher as unknown as {
      handler: (ctx: {
        event: { name: string; data: unknown };
        step: ReturnType<typeof makeStep>;
      }) => Promise<unknown>;
    }
  ).handler;
}

// The sales registry fixture — the 'other' residual seeded as placeholder.
const SALES_INTENTS = [
  {
    swarm_type: "sales-email",
    intent_key: "other",
    handler_agent_key: null,
    handler_event: "sales-email/other.requested",
    requires_orchestration: false,
    handler_status: "placeholder",
  },
];

const EVENT = {
  name: "sales-email/predicted",
  data: {
    swarm_type: "sales-email",
    run_id: "run-1",
    agent_run_id: "ar-1",
    email_id: "em-1",
    automation_run_id: null,
    budget_run_id: null,
    ranked: [{ intent: "other", confidence: "low" }],
    language: "nl",
    urgency: "normal",
    entity: null,
  },
};

describe("Phase 113 sales Stage 3 — 'other' routes to Kanban (no dead-letter)", () => {
  beforeEach(() => {
    state.inserts.length = 0;
    state.updates.length = 0;
    state.agentRunStatus = "predicted";
    loadSwarmIntentsMock.mockReset();
    loadSwarmIntentsMock.mockResolvedValue(SALES_INTENTS);
  });

  it("resolves intent_key='other' to the placeholder branch and does NOT throw", async () => {
    const result = (await getHandler()({
      event: EVENT,
      step: makeStep(),
    })) as { kind: string; swarm_type: string };

    expect(result.kind).toBe("placeholder");
    expect(result.swarm_type).toBe("sales-email");

    // Kanban human-lane insert happened (status='pending', no_handler reason).
    const kanban = state.inserts.find((i) => i.table === "automation_runs");
    expect(kanban).toBeDefined();
    const row = kanban!.row as {
      status: string;
      result: { kanban_reason: string; intent: string };
    };
    expect(row.status).toBe("pending");
    expect(row.result.kanban_reason).toBe("no_handler");
    expect(row.result.intent).toBe("other");

    // agent_runs flipped to routed_human_queue.
    const flip = state.updates.find(
      (u) =>
        u.table === "agent_runs" &&
        (u.patch as { status?: string }).status === "routed_human_queue",
    );
    expect(flip).toBeDefined();
  });

  it("throws (dead-letter) ONLY when 'other' is ABSENT from the registry", async () => {
    // Simulate the pre-seed state: no 'other' row → the dispatcher's !intentRow
    // guard throws. This is exactly what the seed migration prevents.
    loadSwarmIntentsMock.mockResolvedValue([]);

    await expect(
      getHandler()({ event: EVENT, step: makeStep() }),
    ).rejects.toThrow(/no swarm_intents row/i);
  });
});
