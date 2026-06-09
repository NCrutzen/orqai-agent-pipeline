/**
 * Phase 113 Plan 02 (Q1 seam) — the shared Stage 3 coordinator dispatches to
 * the correct per-swarm Orq agent + output schema through a SINGLE parameterized
 * invoke path, with NO literal swarm string and the debtor path byte-neutral.
 *
 * Groups:
 *   C. coordinator + swarm_type="debtor-email" → resolves "debtor-intent-agent"
 *      (registry default) + the debtor schema (INTENT_SCHEMA_BY_SWARM).
 *   D. coordinator + swarm_type="sales-email" with a swarm row carrying
 *      stage3_coordinator_agent_key="sales-intent-agent" → resolves
 *      "sales-intent-agent" + the sales schema through the SAME single invoke.
 *   E. source guard — the coordinator source contains zero `sales-email`
 *      literals and zero `swarm_type === "..."` branches.
 *
 * The invokeIntentAgent parameterization itself (URL + gate swap) is covered by
 * lib/automations/debtor-email/coordinator/__tests__/invoke-intent-agent-key.test.ts
 * (that file uses the REAL invoke; this file mocks it to capture the options the
 * coordinator passes).
 *
 * Schema identity note: the coordinator is re-imported under vi.resetModules,
 * so it resolves a FRESH instance of the schema-registry module. A `.toBe`
 * reference compare against this file's top-level import would spuriously fail.
 * We therefore assert the schema BEHAVIOURALLY — it must accept its own swarm's
 * payload and reject the other swarm's — which is the property that actually
 * matters at the seam.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { INTENT_VERSION_V3 } from "@/lib/automations/debtor-email/coordinator/types";

// ---------------------------------------------------------------------------
// Coordinator resolves key + schema by registry/map.
// Mock posture mirrors debtor-email-coordinator.test.ts.
// ---------------------------------------------------------------------------
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

function makeSupabaseMock() {
  const fromImpl = () => {
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
    builder.single = vi.fn(async () => ({
      data: { id: "agent-run-id" },
      error: null,
    }));
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

// Capture the invoke args so we can assert the agent_key + schema the
// coordinator passed.
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

// Real schema-registry import so we can BEHAVIOURALLY identify the schema the
// coordinator passed (reference identity is unreliable under vi.resetModules).
import { intentSchemaForSwarm } from "@/lib/automations/debtor-email/coordinator/intent-schema-registry";
import type { ZodTypeAny } from "zod";

// Sample payloads that each per-swarm schema accepts (and the other rejects).
const DEBTOR_SAMPLE = {
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
};
const SALES_SAMPLE = {
  ranked: [{ intent: "other", confidence: "high", reasoning: "r" }],
  language: "nl",
  urgency: "normal",
  intent_version: "2026-06-05.v1",
  intent_proposal: null,
  proposal_reason: null,
  entity_relationship: null,
};

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt-test",
    name: `${(overrides.swarm_type as string) ?? "debtor-email"}/coordinator.requested`,
    data: {
      email_id: "email-1",
      subject: "Kopie factuur",
      body_text: "Mag ik een kopie?",
      sender_email: "test@example.com",
      sender_domain: "example.com",
      mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
      received_at: "2026-05-03T10:00:00Z",
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

describe("Phase 113 coordinator — per-swarm key + schema dispatch (single invoke)", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    supabaseMock = makeSupabaseMock();
    findCachedMock.mockResolvedValue(null);
    invokeIntentMock.mockResolvedValue(debtorOutput);
    vi.resetModules();
    const mod = await import("../debtor-email-coordinator");
    handler = (
      mod.debtorEmailCoordinator as unknown as { handler: typeof handler }
    ).handler;
  });

  it("C: debtor → invoke called once with agent_key='debtor-intent-agent' + the debtor schema", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      stage3_coordinator_agent_key: "debtor-intent-agent",
    });

    await handler({
      event: buildEvent({ swarm_type: "debtor-email" }),
      step: stepStub,
    });

    expect(invokeIntentMock).toHaveBeenCalledTimes(1);
    const opts = invokeIntentMock.mock.calls[0][1] as {
      agent_key: string;
      schema: ZodTypeAny;
    };
    expect(opts.agent_key).toBe("debtor-intent-agent");
    // Behavioural identity: the debtor schema accepts the debtor sample and
    // rejects the sales sample.
    expect(opts.schema.safeParse(DEBTOR_SAMPLE).success).toBe(true);
    expect(opts.schema.safeParse(SALES_SAMPLE).success).toBe(false);
  });

  it("D: sales → invoke called once with agent_key='sales-intent-agent' + the sales schema (SAME single call)", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-intent-agent",
    });

    await handler({
      event: buildEvent({ swarm_type: "sales-email", entity: null }),
      step: stepStub,
    });

    expect(invokeIntentMock).toHaveBeenCalledTimes(1);
    const opts = invokeIntentMock.mock.calls[0][1] as {
      agent_key: string;
      schema: ZodTypeAny;
    };
    expect(opts.agent_key).toBe("sales-intent-agent");
    // Behavioural identity: the sales schema accepts the sales sample and
    // rejects the debtor sample — the gate genuinely swapped per-swarm.
    expect(opts.schema.safeParse(SALES_SAMPLE).success).toBe(true);
    expect(opts.schema.safeParse(DEBTOR_SAMPLE).success).toBe(false);
  });

  it("D: fail-safe — an unknown swarm resolves to the debtor schema (misconfig safety)", () => {
    // The registry helper fail-safes an unknown swarm to the debtor schema:
    // it accepts the debtor sample, rejects the sales sample.
    const fallback = intentSchemaForSwarm("nonexistent-swarm");
    expect(fallback.safeParse(DEBTOR_SAMPLE).success).toBe(true);
    expect(fallback.safeParse(SALES_SAMPLE).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Group E — source guard: the coordinator names NO swarm.
// ---------------------------------------------------------------------------
describe("Phase 113 source guard — coordinator carries no literal swarm branch", () => {
  const COORD = resolve(
    __dirname,
    "../debtor-email-coordinator.ts",
  );

  /** Strip comment lines so the header doc cannot self-trip the grep. */
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

  it("contains zero 'sales-email' literals in code", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    expect(code.length).toBeGreaterThan(0);
    expect(code).not.toContain("sales-email");
  });

  it("contains zero `swarm_type === \"...\"` branches in code", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    expect(code).not.toMatch(/swarm_type\s*===\s*['"]/);
  });

  it("does NOT import the sales invoke wrapper", () => {
    const code = stripComments(readFileSync(COORD, "utf8"));
    expect(code).not.toContain("invokeSalesIntentAgent");
  });
});
