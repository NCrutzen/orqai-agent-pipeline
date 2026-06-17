/**
 * Phase 131 Plan 03 Task 2 (ROUTE-04) — the additive Stage-3 ROUTING capability
 * in the SHARED coordinator persists a 6-field verdict to
 * coordinator_runs.decision_details.routing AND dual-writes a TELE-01
 * pipeline_events row (decision=bucket), keyed off the replay-safe run_id.
 *
 * Contract pinned here:
 *   - routing runs IFF loadRoutingDestinations returns rows (info-routing).
 *   - the verdict carries all 6 fields (bucket, brand, target_mailbox,
 *     confidence, dedup{status,matched_layer}, unrouted).
 *   - emitPipelineEvent fires with stage=3, decision=verdict.bucket.
 *   - the routing agent is invoked via invokeOrqAgent(stage3AgentKey, …) — the
 *     intent ranked-list path (invokeIntentAgent) is NOT called for a routing
 *     swarm.
 *   - debtor (no routing_destinations → []) is byte-neutral: the intent path
 *     runs, the routing path is skipped.
 *
 * Mock posture mirrors coordinator-stage3-routing-gate.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { INTENT_VERSION_V3 } from "@/lib/automations/debtor-email/coordinator/types";

// ---- Inngest mock ---------------------------------------------------------
const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));

// ---- Supabase mock — records coordinator_runs updates ---------------------
let recordedUpdates: Array<Record<string, unknown>> = [];
function makeSupabaseMock() {
  const fromImpl = (_table: string) => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn(async () => ({ data: null, error: null }));
    builder.update = vi.fn((patch: Record<string, unknown>) => {
      recordedUpdates.push(patch);
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
    channel: vi.fn(() => ({ send: vi.fn().mockResolvedValue(undefined) })),
    removeChannel: vi.fn().mockResolvedValue(undefined),
  };
}
let supabaseMock = makeSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => supabaseMock),
}));

// ---- intent invoke (the ranked-list path) — must NOT fire for routing ------
const invokeIntentMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/coordinator/invoke-intent", () => ({
  invokeIntentAgent: (...args: unknown[]) => invokeIntentMock(...args),
}));

const findCachedMock = vi.fn();
vi.mock("@/lib/automations/debtor-email/coordinator/agent-runs", () => ({
  findCachedOutput: (...args: unknown[]) => findCachedMock(...args),
  mergeToolOutputs: vi.fn().mockResolvedValue(undefined),
  updateRun: vi.fn().mockResolvedValue(undefined),
  createRun: vi.fn().mockResolvedValue("agent-run-id-fresh"),
}));

// ---- routing agent transport ----------------------------------------------
const invokeOrqMock = vi.fn();
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: (...args: unknown[]) => invokeOrqMock(...args),
}));

// ---- registry: loadSwarm + loadRoutingDestinations ------------------------
const loadSwarmMock = vi.fn();
const loadRoutingDestinationsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadRoutingDestinations: (...args: unknown[]) => loadRoutingDestinationsMock(...args),
  loadSwarmNoiseCategories: vi.fn().mockResolvedValue([]),
  loadSwarmIntents: vi.fn().mockResolvedValue([]),
  // The verdict builder imports resolveRoutingDestination from the registry —
  // keep the REAL pure resolver so the (bucket×brand) match is exercised.
  resolveRoutingDestination: (
    destinations: Array<{ destination_key: string; brand: string; target_mailbox: string | null }>,
    bucket: string,
    brand: string | null,
  ) => destinations.find((d) => d.destination_key === bucket && d.brand === brand)?.target_mailbox ?? null,
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));

// Record TELE-01 emits.
const emitPipelineEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: (...args: unknown[]) => emitPipelineEventMock(...args),
}));

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

const INFO_ROUTING_DESTINATIONS = [
  { destination_key: "order_entry", brand: "smeba", target_mailbox: "order@smeba.nl", outlook_category: "Order-entry", active: true },
  { destination_key: "inspecties", brand: "fire-control", target_mailbox: "planning@fire-control.nl", outlook_category: "Inspecties", active: true },
];

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-test",
    name: "pipeline/coordinator.requested",
    data: {
      swarm_type: (overrides.swarm_type as string) ?? "info-routing",
      email_id: "email-1",
      subject: "Nieuwe order",
      body_text: "Graag een order plaatsen",
      sender_email: "klant@example.com",
      sender_domain: "example.com",
      mailbox: "info@smeba.nl",
      entity: "smeba",
      received_at: "2026-06-17T10:00:00Z",
      run_id: "run-1",
      automation_run_id: "ar-1",
      budget_run_id: "budget-1",
      agent_run_id: "agent-run-given",
      ...overrides,
    },
  };
}

function decisionDetailsRouting(): Record<string, unknown> | undefined {
  for (const u of recordedUpdates) {
    const dd = (u as { decision_details?: { routing?: Record<string, unknown> } }).decision_details;
    if (dd?.routing) return dd.routing;
  }
  return undefined;
}

describe("Phase 131 Plan 03 — coordinator routing verdict (ROUTE-04)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    recordedUpdates = [];
    findCachedMock.mockResolvedValue(null);
    loadRoutingDestinationsMock.mockResolvedValue([]);
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (mod.debtorEmailCoordinator as unknown as { handler: typeof handler }).handler;
  });

  it("info-routing → persists a 6-field verdict + TELE-01 emit (decision=bucket); intent path NOT called", async () => {
    loadRoutingDestinationsMock.mockResolvedValue(INFO_ROUTING_DESTINATIONS);
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: { stage_3_routing: true },
      resolution_config: { routing_unrouted_threshold: 0.6 },
    });
    invokeOrqMock.mockResolvedValue({
      raw: { bucket: "order_entry", brand: "smeba", confidence: "high", reasoning: "order" },
      agent: {},
      usage: {},
    });

    const res = (await handler({ event: buildEvent(), step: stepStub })) as { decision: string };

    // routing agent invoked with the resolved registry key.
    expect(invokeOrqMock).toHaveBeenCalledTimes(1);
    expect(invokeOrqMock.mock.calls[0][0]).toBe("info-routing-coordinator");
    // intent ranked-list path NOT taken for a routing swarm.
    expect(invokeIntentMock).not.toHaveBeenCalled();

    // verdict carries all 6 fields.
    const routing = decisionDetailsRouting();
    expect(routing).toBeDefined();
    expect(routing!.bucket).toBe("order_entry");
    expect(routing!.brand).toBe("smeba");
    expect(routing!.target_mailbox).toBe("order@smeba.nl");
    expect(routing!.confidence).toBe("high");
    expect(routing!.dedup).toEqual({ status: "routable", matched_layer: null });
    expect(routing!.unrouted).toBe(false);

    // TELE-01 dual-write: stage=3, decision=bucket.
    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
    const tele = emitPipelineEventMock.mock.calls[0][1] as {
      stage: number;
      decision: string;
      decision_details: { routing?: unknown };
    };
    expect(tele.stage).toBe(3);
    expect(tele.decision).toBe("order_entry");
    expect(tele.decision_details.routing).toBeDefined();

    // ROUTE-07 held: no predicted emit, decision=predicted_held.
    expect(res.decision).toBe("predicted_held");
    expect(
      inngestSend.mock.calls.filter(
        (c) => (c[0] as { name?: string })?.name === "pipeline/predicted",
      ),
    ).toHaveLength(0);
  });

  it("cross-brand: agent picks inspecties/fire-control at info@smeba → fire-control mailbox in the verdict", async () => {
    loadRoutingDestinationsMock.mockResolvedValue(INFO_ROUTING_DESTINATIONS);
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: { stage_3_routing: true },
      resolution_config: { routing_unrouted_threshold: 0.6 },
    });
    invokeOrqMock.mockResolvedValue({
      raw: { bucket: "inspecties", brand: "fire-control", confidence: "high", reasoning: "fc" },
      agent: {},
      usage: {},
    });

    await handler({ event: buildEvent(), step: stepStub });

    const routing = decisionDetailsRouting();
    expect(routing!.bucket).toBe("inspecties");
    expect(routing!.brand).toBe("fire-control");
    expect(routing!.target_mailbox).toBe("planning@fire-control.nl");
  });

  it("invalid agent output → unrouted verdict (no throw), still persisted + TELE-01", async () => {
    loadRoutingDestinationsMock.mockResolvedValue(INFO_ROUTING_DESTINATIONS);
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: { stage_3_routing: true },
      resolution_config: { routing_unrouted_threshold: 0.6 },
    });
    invokeOrqMock.mockResolvedValue({ raw: { garbage: true }, agent: {}, usage: {} });

    const res = (await handler({ event: buildEvent(), step: stepStub })) as { decision: string };

    const routing = decisionDetailsRouting();
    expect(routing!.unrouted).toBe(true);
    expect(routing!.bucket).toBe("unrouted");
    expect(routing!.target_mailbox).toBeNull();
    expect(emitPipelineEventMock).toHaveBeenCalledTimes(1);
    expect(res.decision).toBe("predicted_held");
  });

  it("debtor (no routing_destinations → []) is byte-neutral: routing skipped, intent path runs", async () => {
    loadRoutingDestinationsMock.mockResolvedValue([]); // debtor has no rows
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      stage3_coordinator_agent_key: "debtor-intent-agent",
      dry_run_config: { stage_3_routing: false },
    });
    invokeIntentMock.mockResolvedValue({
      output: {
        ranked: [{ intent: "copy_document_request", confidence: "high", document_reference: null, sub_type: null, reasoning: "r" }],
        language: "nl",
        urgency: "normal",
        intent_version: INTENT_VERSION_V3,
        intent_proposal: null,
        proposal_reason: null,
      },
      raw: "",
    });

    await handler({
      event: buildEvent({ swarm_type: "debtor-email", mailbox: "debiteuren@smeba.nl" }),
      step: stepStub,
    });

    // routing path skipped, intent path ran.
    expect(invokeOrqMock).not.toHaveBeenCalled();
    expect(invokeIntentMock).toHaveBeenCalledTimes(1);
    // no decision_details.routing written.
    expect(decisionDetailsRouting()).toBeUndefined();
  });
});
