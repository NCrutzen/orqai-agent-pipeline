/**
 * Phase 132 Plan 02 Task 2 (FWD-01..FWD-07, D-03 / RESEARCH A4) — the coordinator
 * forward-request emit.
 *
 * Contract pinned here:
 *   forwardable verdict (routable, non-null target, dedup routable) + bucket
 *     RELEASED  → emits `pipeline/forward.requested` { swarm_type, run_id, email_id }.
 *   bucket HELD (released=false / missing)  → NO forward.requested emit.
 *   unrouted / null-target / already_addressed verdict → NO forward.requested emit.
 *   stage_3_routing stays HELD regardless → decision="predicted_held" (the forward
 *     emit is ADDITIVE, the intent-dispatch path stays held — RESEARCH A4 / Pitfall 5).
 *
 * Mock posture mirrors coordinator-stage3-routing-gate.test.ts but drives the
 * Phase-131 ROUTING block (loadRoutingDestinations returns a row).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock — capture emits -----------------------------------------
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

// ---- Supabase mock --------------------------------------------------------
function makeSupabaseMock() {
  const fromImpl = (_table: string) => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn(async () => ({ data: null, error: null }));
    builder.update = vi.fn(() => {
      const chain: Record<string, unknown> = {};
      chain.eq = vi.fn(() => chain);
      chain.then = (
        res: (v: { data: null; error: null }) => unknown,
        rej?: (e: unknown) => unknown,
      ) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return chain;
    });
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.single = vi.fn(async () => ({ data: { id: "agent-run-id" }, error: null }));
    return builder;
  };
  return {
    from: vi.fn(fromImpl),
    // coordinator re-fetches email content via supabase.schema("email_pipeline").from(...)
    schema: vi.fn(() => ({ from: vi.fn(fromImpl) })),
    channel: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };
}
let supabaseMock = makeSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => supabaseMock),
}));

// ---- registry mock — info-routing has a routing destination ---------------
const loadSwarmMock = vi.fn();
const resolveRoutingDestinationMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: vi.fn().mockResolvedValue([]),
  loadSwarmIntents: vi.fn().mockResolvedValue([]),
  loadRoutingDestinations: vi
    .fn()
    .mockResolvedValue([
      { destination_key: "storingen", brand: "smeba", target_mailbox: "storingen@smeba.nl" },
    ]),
  resolveRoutingDestination: (...args: unknown[]) =>
    resolveRoutingDestinationMock(...args),
}));

// ---- routing classifier + verdict mocks -----------------------------------
const parseMock = vi.fn();
vi.mock("@/lib/automations/info-routing/coordinator-schema", () => ({
  parseAgentOutputOrUnrouted: (...args: unknown[]) => parseMock(...args),
  unroutedFromError: vi.fn(() => ({ unrouted: true })),
}));
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: vi.fn().mockResolvedValue({ raw: "{}" }),
}));
const buildVerdictMock = vi.fn();
vi.mock("@/lib/automations/info-routing/verdict", () => ({
  buildRoutingVerdict: (...args: unknown[]) => buildVerdictMock(...args),
}));
vi.mock("@/lib/automations/info-routing/dedup", () => ({
  checkDuplicateDelivery: vi
    .fn()
    .mockResolvedValue({ status: "routable", matched_layer: null }),
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/automations/debtor-email/coordinator/agent-runs", () => ({
  findCachedOutput: vi.fn().mockResolvedValue(null),
  mergeToolOutputs: vi.fn().mockResolvedValue(undefined),
  updateRun: vi.fn().mockResolvedValue(undefined),
  createRun: vi.fn().mockResolvedValue("agent-run-id-fresh"),
}));

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-test",
    name: "pipeline/coordinator.requested",
    data: {
      swarm_type: "info-routing",
      email_id: "email-1",
      subject: "Storing",
      body_text: "Er is een storing",
      sender_email: "klant@example.com",
      sender_domain: "example.com",
      mailbox: "info@smeba.nl",
      entity: null,
      received_at: "2026-06-18T10:00:00Z",
      run_id: "run-1",
      automation_run_id: "ar-1",
      budget_run_id: "budget-1",
      agent_run_id: "agent-run-given",
      ...overrides,
    },
  };
}

function routableVerdict(overrides: Record<string, unknown> = {}) {
  return {
    bucket: "storingen",
    brand: "smeba",
    target_mailbox: "storingen@smeba.nl",
    confidence: "high",
    dedup: { status: "routable", matched_layer: null },
    unrouted: false,
    routing_version: "2026-06-17.v1",
    ...overrides,
  };
}

function forwardRequests() {
  return inngestSend.mock.calls
    .map((c) => c[0] as { name?: string; data?: Record<string, unknown> })
    .filter((c) => c?.name === "pipeline/forward.requested");
}

describe("Phase 132 Plan 02 — coordinator forward-request emit", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    parseMock.mockReturnValue({
      unrouted: false,
      value: { bucket: "storingen", brand: "smeba", confidence: "high" },
    });
    resolveRoutingDestinationMock.mockReturnValue({
      matched: true,
      target_mailbox: "storingen@smeba.nl",
    });
    buildVerdictMock.mockReturnValue(routableVerdict());
    // info-routing: stage_3_routing HELD (true) + bucket released.
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: {
        stage_3_routing: true,
        stage_4_forward_buckets: { storingen: true },
      },
    });
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (
      mod.debtorEmailCoordinator as unknown as { handler: typeof handler }
    ).handler;
  });

  it("forwardable verdict + released bucket → emits pipeline/forward.requested with swarm_type/run_id/email_id; decision stays predicted_held", async () => {
    const res = (await handler({ event: buildEvent(), step: stepStub })) as {
      decision: string;
    };
    expect(res.decision).toBe("predicted_held");
    const reqs = forwardRequests();
    expect(reqs).toHaveLength(1);
    expect(reqs[0].data).toEqual({
      swarm_type: "info-routing",
      run_id: "run-1",
      email_id: "email-1",
    });
  });

  it("held bucket (released=false) → NO pipeline/forward.requested emit", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: {
        stage_3_routing: true,
        stage_4_forward_buckets: { storingen: false },
      },
    });
    await handler({ event: buildEvent(), step: stepStub });
    expect(forwardRequests()).toHaveLength(0);
  });

  it("non-forwardable verdict (already_addressed) → NO pipeline/forward.requested emit even when bucket released", async () => {
    buildVerdictMock.mockReturnValue(
      routableVerdict({
        dedup: { status: "already_addressed", matched_layer: "to_cc" },
      }),
    );
    await handler({ event: buildEvent(), step: stepStub });
    expect(forwardRequests()).toHaveLength(0);
  });

  it("unrouted verdict → NO pipeline/forward.requested emit", async () => {
    buildVerdictMock.mockReturnValue(
      routableVerdict({ unrouted: true, target_mailbox: null }),
    );
    await handler({ event: buildEvent(), step: stepStub });
    expect(forwardRequests()).toHaveLength(0);
  });
});
