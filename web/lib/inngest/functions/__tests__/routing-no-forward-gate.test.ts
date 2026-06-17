/**
 * Phase 131 Plan 03 Task 3 (ROUTE-07) — the routing capability is VERDICT-ONLY:
 * no Outlook Graph forward/move/sendMail and no Stage-2 resolver invocation is
 * reachable from the routing code path, and the held gate withholds the
 * predicted-emit so the Stage 3.5 dispatcher never fires (no Stage 4).
 *
 * Proven two ways:
 *   (1) STATIC / grep — the generic coordinator AND every non-test info-routing
 *       module carry NO Graph forward/move/sendMail token and NO Stage-2
 *       resolver invocation (resolveEntity / stage-2-customer-resolver /
 *       loadStage2Resolver) reachable from the routing path.
 *   (2) BEHAVIOUR — with info-routing seeded stage_3_routing=true (held), the
 *       coordinator persists the verdict but does NOT emit pipeline/predicted
 *       (the dispatcher trigger), returns decision='predicted_held', and the
 *       agent_runs row stays 'classifying' (no flip-status-predicted).
 *
 * Mirrors the Phase 113 held-path test discipline (coordinator-stage3-routing
 * -gate.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

// ===========================================================================
// (1) STATIC / grep gate — no forward/move/sendMail + no Stage-2 invoke.
// ===========================================================================
describe("ROUTE-07 static gate — no forward, no Stage-2 reachable from the routing path", () => {
  const COORD = resolve(__dirname, "../debtor-email-coordinator.ts");
  const INFO_ROUTING_DIR = resolve(__dirname, "../../../automations/info-routing");

  // Forbidden side-effect tokens. The routing path is verdict-only this phase.
  const FORWARD_TOKENS = ["sendMail", ".forward(", "/move"];
  // Stage-2 resolver invocation tokens — none may be reachable from routing.
  const STAGE2_TOKENS = [
    "resolveEntity",
    "loadStage2Resolver",
    "stage-2-customer-resolver",
  ];

  function stripComments(src: string): string {
    let inBlock = false;
    const out: string[] = [];
    for (const rawLine of src.split("\n")) {
      const trimmed = rawLine.trim();
      if (inBlock) {
        if (trimmed.includes("*/")) inBlock = false;
        continue;
      }
      if (trimmed.startsWith("/*")) {
        if (!trimmed.includes("*/")) inBlock = true;
        continue;
      }
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      out.push(rawLine);
    }
    return out.join("\n");
  }

  /** Recursively collect non-test .ts files under a dir. */
  function collectTsFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__") continue;
        out.push(...collectTsFiles(full));
      } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
        out.push(full);
      }
    }
    return out;
  }

  it("the generic coordinator carries NO Graph forward/move/sendMail token", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    for (const token of FORWARD_TOKENS) {
      expect(code.includes(token)).toBe(false);
    }
  });

  it("no info-routing (non-test) module carries a Graph forward/move/sendMail token", () => {
    for (const file of collectTsFiles(INFO_ROUTING_DIR)) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of FORWARD_TOKENS) {
        expect(code.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("no info-routing (non-test) module invokes the Stage-2 resolver", () => {
    for (const file of collectTsFiles(INFO_ROUTING_DIR)) {
      const code = stripComments(readFileSync(file, "utf8"));
      for (const token of STAGE2_TOKENS) {
        expect(code.includes(token), `${file} contains ${token}`).toBe(false);
      }
    }
  });

  it("the coordinator routing block does NOT invoke the Stage-2 resolver from the routing path", () => {
    // The coordinator legitimately has no Stage-2 resolver at all (Stage 2 is a
    // separate function). Assert the routing-specific tokens are absent so a
    // future edit can't reach a resolver from the routing block.
    const code = stripComments(readFileSync(COORD, "utf8"));
    for (const token of STAGE2_TOKENS) {
      expect(code.includes(token)).toBe(false);
    }
  });
});

// ===========================================================================
// (2) BEHAVIOUR gate — held path withholds the predicted-emit.
// ===========================================================================

const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));

let agentRunsStatusFlips: string[] = [];
function makeSupabaseMock() {
  const fromImpl = (table: string) => {
    const builder: Record<string, unknown> = {};
    builder.insert = vi.fn(async () => ({ data: null, error: null }));
    builder.update = vi.fn((patch: Record<string, unknown>) => {
      if (table === "agent_runs" && typeof patch.status === "string") {
        agentRunsStatusFlips.push(patch.status as string);
      }
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

const invokeOrqMock = vi.fn();
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: (...args: unknown[]) => invokeOrqMock(...args),
}));

const loadSwarmMock = vi.fn();
const loadRoutingDestinationsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadRoutingDestinations: (...args: unknown[]) => loadRoutingDestinationsMock(...args),
  loadSwarmNoiseCategories: vi.fn().mockResolvedValue([]),
  loadSwarmIntents: vi.fn().mockResolvedValue([]),
  resolveRoutingDestination: (
    destinations: Array<{ destination_key: string; brand: string; target_mailbox: string | null }>,
    bucket: string,
    brand: string | null,
  ) => destinations.find((d) => d.destination_key === bucket && d.brand === brand)?.target_mailbox ?? null,
}));

vi.mock("@/lib/automations/runs/emit", () => ({
  emitAutomationRunStale: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: vi.fn().mockResolvedValue(undefined),
}));

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildEvent() {
  return {
    id: "evt-test",
    name: "pipeline/coordinator.requested",
    data: {
      swarm_type: "info-routing",
      email_id: "email-1",
      subject: "Order",
      body_text: "Graag order",
      sender_email: "klant@example.com",
      sender_domain: "example.com",
      mailbox: "info@smeba.nl",
      entity: "smeba",
      received_at: "2026-06-17T10:00:00Z",
      run_id: "run-1",
      automation_run_id: "ar-1",
      budget_run_id: "budget-1",
      agent_run_id: "agent-run-given",
    },
  };
}

describe("ROUTE-07 behaviour gate — held path withholds the predicted-emit", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    agentRunsStatusFlips = [];
    findCachedMock.mockResolvedValue(null);
    loadRoutingDestinationsMock.mockResolvedValue([
      { destination_key: "order_entry", brand: "smeba", target_mailbox: "order@smeba.nl", outlook_category: "Order-entry", active: true },
    ]);
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-routing-coordinator",
      dry_run_config: { stage_3_routing: true }, // HELD (seeded Plan 01)
      resolution_config: { routing_unrouted_threshold: 0.6 },
    });
    invokeOrqMock.mockResolvedValue({
      raw: { bucket: "order_entry", brand: "smeba", confidence: "high", reasoning: "order" },
      agent: {},
      usage: {},
    });
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (mod.debtorEmailCoordinator as unknown as { handler: typeof handler }).handler;
  });

  it("info-routing held → verdict persisted, NO pipeline/predicted emit, decision=predicted_held, agent_runs stays classifying", async () => {
    const res = (await handler({ event: buildEvent(), step: stepStub })) as { decision: string };

    expect(res.decision).toBe("predicted_held");

    // No pipeline/predicted emit fires → the dispatcher never runs → no Stage 4.
    const predicted = inngestSend.mock.calls.filter(
      (c) => (c[0] as { name?: string })?.name === "pipeline/predicted",
    );
    expect(predicted).toHaveLength(0);

    // agent_runs is NEVER flipped to 'predicted' on the held path.
    expect(agentRunsStatusFlips).not.toContain("predicted");
  });
});
