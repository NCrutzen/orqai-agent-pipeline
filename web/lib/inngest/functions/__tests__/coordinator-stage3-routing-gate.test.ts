/**
 * Phase 113 Plan 05 (D-08 / D-09) — the swarm-agnostic Stage-3 ROUTING gate in
 * the SHARED coordinator, BEFORE the predicted-emit.
 *
 * Contract pinned here:
 *   GATED (dry_run_config.stage_3_routing=true)  → persist-ranked runs (verdict
 *       visible in Bulk Review) but flip-status-predicted + emit-predicted are
 *       WITHHELD: the dispatcher never fires, routing held in dry-run
 *       observation. The coordinator returns decision="predicted_held" and
 *       stamps coordinator_runs.decision_details.routing_held=true.
 *   OPEN  (stage_3_routing=false)                → emit `<swarm>/predicted` as
 *       today; decision="predicted".
 *   DEBTOR NON-REGRESSION                          → debtor is seeded
 *       stage_3_routing=false (OPEN), so its predicted-emit STILL fires exactly
 *       as today. This is the T-113-10 debtor-neutrality guard: the gate must
 *       not silently start holding debtor's emit.
 *   MISSING flag (fail-closed)                     → held (no emit).
 *
 * Source guards:
 *   - the SHARED dispatcher (stage-3-dispatcher.ts) is BYTE-UNCHANGED (the gate
 *     is NOT in the dispatcher — it lives in the coordinator).
 *   - the coordinator names NO swarm around the gate (no `swarm_type === "..."`,
 *     no `sales-email` literal) — the gate is a pure registry read.
 *
 * Mock posture mirrors coordinator-agent-key-dispatch.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTENT_VERSION_V3 } from "@/lib/automations/debtor-email/coordinator/types";

// ---- Inngest mock — capture predicted emits -------------------------------
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

// ---- invoke-intent mock — return a valid V3 output ------------------------
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
  // Phase 131 — debtor/sales have no routing_destinations → [] → routing block
  // skipped (this test exercises the intent ranked-list path, not routing).
  loadRoutingDestinations: vi.fn().mockResolvedValue([]),
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

const debtorOutput = {
  output: {
    ranked: [
      {
        intent: "copy_document_request",
        confidence: "high",
        document_reference: null,
        sub_type: null,
        reasoning: "r",
      },
    ],
    language: "nl",
    urgency: "normal",
    intent_version: INTENT_VERSION_V3,
    intent_proposal: null,
    proposal_reason: null,
  },
  raw: "",
};

/** Did the coordinator emit a `<swarm>/predicted` event? */
// Canonical event name is now the swarm-agnostic `pipeline/predicted`; the
// swarm discriminator moved into the payload. Return the emitted swarm_type so
// the routing-gate assertions still verify WHICH swarm's predicted fired.
function predictedEmits(): string[] {
  return inngestSend.mock.calls
    .map((c) => c[0] as { name?: string; data?: { swarm_type?: string } })
    .filter((c) => c?.name === "pipeline/predicted")
    .map((c) => c.data?.swarm_type ?? "");
}

describe("Phase 113 Plan 05 — Stage-3 routing gate (held vs emit)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    recordedUpdates = [];
    findCachedMock.mockResolvedValue(null);
    invokeIntentMock.mockResolvedValue(debtorOutput);
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (
      mod.debtorEmailCoordinator as unknown as { handler: typeof handler }
    ).handler;
  });

  it("GATED (sales, stage_3_routing=true) → verdict persisted, NO predicted emit, decision=predicted_held", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-intent-agent",
      gating_config: { stage_3_routing: true },
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "sales-email", entity: null }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted_held");
    expect(predictedEmits()).toEqual([]); // dispatcher never fires
    // verdict was persisted (persist-ranked ran) AND the held marker stamped
    expect(
      recordedUpdates.some((u) => (u as { ranked_intents?: unknown }).ranked_intents),
    ).toBe(true);
    expect(
      recordedUpdates.some(
        (u) =>
          (u as { decision_details?: { routing_held?: boolean } }).decision_details
            ?.routing_held === true,
      ),
    ).toBe(true);
  });

  it("OPEN (sales, stage_3_routing=false) → emits sales-email/predicted, decision=predicted", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-intent-agent",
      gating_config: { stage_3_routing: false },
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "sales-email", entity: null }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted");
    expect(predictedEmits()).toEqual(["sales-email"]);
  });

  it("DEBTOR NON-REGRESSION (stage_3_routing=false seeded) → emits debtor-email/predicted exactly as today", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      stage3_coordinator_agent_key: "debtor-intent-agent",
      gating_config: {
        // mirrors the seed migration: routing OPEN, labeling GATED. The gate
        // must read stage_3_routing (false → emit), NOT stage_3_labeling.
        stage_3_routing: false,
        stage_3_labeling: true,
      },
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "debtor-email" }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted");
    expect(predictedEmits()).toEqual(["debtor-email"]);
  });

  it("MISSING flag → fail-closed → held (no emit)", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-intent-agent",
      gating_config: {}, // no stage_3_routing → fail-closed
    });

    const res = (await handler({
      event: buildEvent({ swarm_type: "sales-email", entity: null }),
      step: stepStub,
    })) as { decision: string };

    expect(res.decision).toBe("predicted_held");
    expect(predictedEmits()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Source guards — dispatcher byte-unchanged + no swarm literal around the gate.
// ---------------------------------------------------------------------------
describe("Phase 113 Plan 05 — source guards (dispatcher untouched, no literal branch)", () => {
  const COORD = resolve(__dirname, "../debtor-email-coordinator.ts");

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

  it("stage-3-dispatcher.ts carries NO Stage-3 routing-gate logic", () => {
    // The routing gate must NOT live in the shared dispatcher (it belongs in the
    // coordinator). A byte-unchanged-vs-HEAD guard was too broad — it also
    // blocked the legitimate canonical-event trigger fix (`*/predicted` →
    // `pipeline/predicted`). Assert semantically instead: no dry-run/routing-gate
    // tokens appear in the dispatcher source.
    const DISPATCHER = resolve(__dirname, "../stage-3-dispatcher.ts");
    const code = stripComments(readFileSync(DISPATCHER, "utf8"));
    for (const token of ["stage_3_routing", "isStageBlocked", "routing_held"]) {
      expect(code.includes(token)).toBe(false);
    }
  });

  it("coordinator gate carries no `swarm_type === \"...\"` branch and no sales-email literal", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    expect(code).not.toMatch(/swarm_type\s*===\s*['"]/);
    expect(code).not.toContain("sales-email");
  });

  it("coordinator consults the dry-run routing gate before the emit", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    expect(code).toMatch(/isStage3RoutingGated|stage_3_routing|routingGated/);
  });
});
