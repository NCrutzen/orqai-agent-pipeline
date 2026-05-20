// Phase 89 (Plan 03). Unit harness for classifier-llm-rules-seed.ts.
//
// Hard-separation discipline (RFC docs/agentic-pipeline/stage-1-regex.md):
// these tests cover pure Stage 1 noise-filter seeding. swarm_intents
// (Stage 3) MUST NOT contribute to the llm:*:high rule_key namespace —
// the seed function never reads that table.
//
// Mock harness mirrors classifier-screen-worker.gate.test.ts:25-124.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock --------------------------------------------------------
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

// ---- Registry mock -------------------------------------------------------
const loadSwarmNoiseCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
}));

// ---- Supabase admin mock -------------------------------------------------
const classifierUpserts: {
  row: Record<string, unknown>;
  opts: Record<string, unknown>;
}[] = [];
let swarmsData: { swarm_type: string }[] = [];

function makeAdminMock() {
  classifierUpserts.length = 0;
  const upsertFn = vi.fn(
    async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
      classifierUpserts.push({ row, opts });
      return { error: null };
    },
  );
  return {
    from: vi.fn((table: string) => {
      if (table === "swarms") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: swarmsData, error: null })),
          })),
        };
      }
      if (table === "classifier_rules") {
        return { upsert: upsertFn };
      }
      return {};
    }),
  };
}
let adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock),
}));

function makeStepStub() {
  return {
    run: async (_name: string, fn: () => Promise<unknown>) => fn(),
  };
}

beforeEach(() => {
  adminMock = makeAdminMock();
  loadSwarmNoiseCategoriesMock.mockReset();
  swarmsData = [];
});

import { classifierLLMRulesSeed } from "../classifier-llm-rules-seed";

describe("classifier-llm-rules-seed", () => {
  it("seeds llm:{cat}:high for every (swarm × enabled cat != unknown)", async () => {
    swarmsData = [{ swarm_type: "debtor-email" }];
    loadSwarmNoiseCategoriesMock.mockResolvedValueOnce([
      { category_key: "auto_reply", enabled: true },
      { category_key: "payment_admittance", enabled: true },
      { category_key: "unknown", enabled: true },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const keys = classifierUpserts.map((u) => u.row.rule_key);
    expect(keys.slice().sort()).toEqual([
      "llm:auto_reply:high",
      "llm:payment_admittance:high",
    ]);
    expect(keys).not.toContain("llm:unknown:high");
  });

  it("every upsert uses onConflict: swarm_type,rule_key", async () => {
    swarmsData = [{ swarm_type: "debtor-email" }];
    loadSwarmNoiseCategoriesMock.mockResolvedValueOnce([
      { category_key: "auto_reply", enabled: true },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    expect(classifierUpserts.length).toBeGreaterThan(0);
    for (const call of classifierUpserts) {
      expect(call.opts).toEqual({ onConflict: "swarm_type,rule_key" });
    }
  });

  it("walks every enabled swarm", async () => {
    swarmsData = [
      { swarm_type: "debtor-email" },
      { swarm_type: "sales-email" },
    ];
    loadSwarmNoiseCategoriesMock
      .mockResolvedValueOnce([{ category_key: "auto_reply", enabled: true }])
      .mockResolvedValueOnce([{ category_key: "spam", enabled: true }]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const bySwarm = new Map<string, string[]>();
    for (const u of classifierUpserts) {
      const sw = u.row.swarm_type as string;
      const arr = bySwarm.get(sw) ?? [];
      arr.push(u.row.rule_key as string);
      bySwarm.set(sw, arr);
    }
    expect(bySwarm.get("debtor-email")).toEqual(["llm:auto_reply:high"]);
    expect(bySwarm.get("sales-email")).toEqual(["llm:spam:high"]);
  });

  it("upsert payload uses kind=agent_intent, status=candidate, zeroed metrics", async () => {
    swarmsData = [{ swarm_type: "debtor-email" }];
    loadSwarmNoiseCategoriesMock.mockResolvedValueOnce([
      { category_key: "auto_reply", enabled: true },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    expect(classifierUpserts[0].row).toMatchObject({
      kind: "agent_intent",
      status: "candidate",
      n: 0,
      agree: 0,
      ci_lo: null,
    });
  });

  it("skips disabled categories", async () => {
    swarmsData = [{ swarm_type: "debtor-email" }];
    loadSwarmNoiseCategoriesMock.mockResolvedValueOnce([
      { category_key: "auto_reply", enabled: true },
      { category_key: "deprecated_cat", enabled: false },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const keys = classifierUpserts.map((u) => u.row.rule_key);
    expect(keys).toEqual(["llm:auto_reply:high"]);
  });
});
