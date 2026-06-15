/**
 * Phase 117 Plan 02 Task 1 (D-2, OUTLOOK-CAT-01) — the swarm-agnostic
 * `pipeline/intent-label.requested` emit from the SHARED coordinator.
 *
 * Contract pinned here:
 *   OPEN path (stage_3_routing=false)  → the intent-label event fires (after the
 *       byte-unchanged emit-predicted) with {swarm_type, email_id, intent_key=
 *       ranked[0].intent, source_mailbox, run_id}. emit-predicted STILL fires
 *       (the new emit is ADDITIVE, debtor neutrality).
 *   GATED/held path (stage_3_routing=true) → the intent-label event STILL fires
 *       (the category WRITE gate is independent of the routing gate), even though
 *       NO predicted emit fires and decision="predicted_held".
 *   EMPTY ranked → NO intent-label event (nothing to label).
 *   Swarm-agnostic → a second swarm flows the same path and emits the same event
 *       with its own swarm_type (no literal branch).
 *
 * Mock posture mirrors coordinator-stage3-routing-gate.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { INTENT_VERSION_V3 } from "@/lib/automations/debtor-email/coordinator/types";

// ---- Inngest mock — capture all emits -------------------------------------
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

const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: vi.fn().mockResolvedValue([]),
  loadSwarmIntents: vi.fn().mockResolvedValue([]),
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

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-test",
    name: "pipeline/coordinator.requested",
    data: {
      swarm_type: (overrides.swarm_type as string) ?? "debtor-email",
      email_id: "email-1",
      subject: "Offerte",
      body_text: "Graag offerte",
      sender_email: "test@example.com",
      sender_domain: "example.com",
      mailbox: "verkoop@smeba.nl",
      entity: "smeba",
      received_at: "2026-06-05T10:00:00Z",
      run_id: "run-1",
      automation_run_id: "ar-1",
      budget_run_id: "budget-1",
      agent_run_id: "agent-run-given",
      ...overrides,
    },
  };
}

function rankedOutput(rankedIntents: Array<{ intent: string }>) {
  return {
    output: {
      ranked: rankedIntents.map((r) => ({
        intent: r.intent,
        confidence: "high",
        document_reference: null,
        sub_type: null,
        reasoning: "r",
      })),
      language: "nl",
      urgency: "normal",
      intent_version: INTENT_VERSION_V3,
      intent_proposal: null,
      proposal_reason: null,
    },
    raw: "",
  };
}

/** All emitted `pipeline/intent-label.requested` payloads. */
function intentLabelEmits(): Array<Record<string, unknown>> {
  return inngestSend.mock.calls
    .map((c) => c[0] as { name?: string; data?: Record<string, unknown> })
    .filter((c) => c?.name === "pipeline/intent-label.requested")
    .map((c) => c.data as Record<string, unknown>);
}

function predictedEmitCount(): number {
  return inngestSend.mock.calls
    .map((c) => c[0] as { name?: string })
    .filter((c) => c?.name === "pipeline/predicted").length;
}

describe("Phase 117 Plan 02 — coordinator intent-label emit", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    findCachedMock.mockResolvedValue(null);
    invokeIntentMock.mockResolvedValue(rankedOutput([{ intent: "copy_document_request" }]));
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (
      mod.debtorEmailCoordinator as unknown as { handler: typeof handler }
    ).handler;
  });

  it("OPEN path → emits intent-label with top-1 intent + still emits predicted (additive)", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      stage3_coordinator_agent_key: "debtor-intent-agent",
      dry_run_config: { stage_3_routing: false },
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "debtor-email" }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted");
    expect(predictedEmitCount()).toBe(1); // emit-predicted unchanged
    const labels = intentLabelEmits();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      swarm_type: "debtor-email",
      email_id: "email-1",
      intent_key: "copy_document_request",
      source_mailbox: "verkoop@smeba.nl",
      run_id: "run-1",
    });
  });

  it("GATED/held path → STILL emits intent-label (write gate independent of routing) but NO predicted", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-intent-agent",
      dry_run_config: { stage_3_routing: true },
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "sales-email", entity: null }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted_held");
    expect(predictedEmitCount()).toBe(0); // routing held → no predicted
    const labels = intentLabelEmits();
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({
      swarm_type: "sales-email",
      email_id: "email-1",
      intent_key: "copy_document_request",
    });
  });

  it("EMPTY ranked → NO intent-label event (nothing to label)", async () => {
    invokeIntentMock.mockResolvedValue(rankedOutput([]));
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      stage3_coordinator_agent_key: "debtor-intent-agent",
      dry_run_config: { stage_3_routing: false },
    });

    // ranked[0] is undefined → the back-compat hoist (output.ranked[0].intent)
    // would throw; the coordinator's classify step accesses top.intent. Guard:
    // an empty ranked array means no verdict — assert no intent-label emit even
    // if the run errors out before the open path.
    await handler({
      event: buildEvent({ swarm_type: "debtor-email" }),
      step: stepStub,
    }).catch(() => undefined);

    expect(intentLabelEmits()).toHaveLength(0);
  });

  it("second swarm → same code path, emits intent-label with its own swarm_type", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "info-routing",
      stage3_coordinator_agent_key: "info-intent-agent",
      dry_run_config: { stage_3_routing: false },
    });

    await handler({
      event: buildEvent({ swarm_type: "info-routing", entity: null }),
      step: stepStub,
    });

    const labels = intentLabelEmits();
    expect(labels).toHaveLength(1);
    expect(labels[0].swarm_type).toBe("info-routing");
  });
});
