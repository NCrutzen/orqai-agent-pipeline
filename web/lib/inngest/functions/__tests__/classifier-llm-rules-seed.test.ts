// Phase 89 (Plan 03). Unit harness for classifier-llm-rules-seed.ts.
//
// Hard-separation discipline (RFC docs/agentic-pipeline/stage-1-regex.md):
// these tests cover pure Stage 1 noise-filter seeding. swarm_intents
// (Stage 3) MUST NOT contribute to the llm:*:high rule_key namespace —
// the seed function never reads that table.
//
// Mock harness mirrors classifier-screen-worker.gate.test.ts:25-124.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Hoisted mock state --------------------------------------------------
// `vi.mock` factories are hoisted above imports; any variable referenced
// inside them must be defined via `vi.hoisted()` to be safely accessible.
const h = vi.hoisted(() => {
  return {
    inngestSend: (..._args: unknown[]) => Promise.resolve({ ids: ["evt"] }),
    // Queue of category lists returned in order per-swarm by
    // loadSwarmNoiseCategories. Each test pushes onto this array.
    catsQueue: [] as Array<
      Array<{ category_key: string; enabled?: boolean }>
    >,
    classifierUpserts: [] as {
      row: Record<string, unknown>;
      opts: Record<string, unknown>;
    }[],
    swarmsData: [] as { swarm_type: string }[],
    adminMock: null as unknown,
  };
});

// ---- Inngest mock --------------------------------------------------------
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => h.inngestSend(...args),
    createFunction: vi.fn((cfg, _trigger, handler) => ({
      __config: cfg,
      handler,
    })),
  },
}));

// ---- Registry mock -------------------------------------------------------
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: async (..._args: unknown[]) => {
    return h.catsQueue.shift() ?? [];
  },
}));

// ---- Supabase admin mock -------------------------------------------------
function makeAdminMock() {
  h.classifierUpserts.length = 0;
  const upsertFn = vi.fn(
    async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
      h.classifierUpserts.push({ row, opts });
      return { error: null };
    },
  );
  return {
    from: vi.fn((table: string) => {
      if (table === "swarms") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: h.swarmsData, error: null })),
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
h.adminMock = makeAdminMock();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => h.adminMock),
}));

function makeStepStub() {
  return {
    run: async (_name: string, fn: () => Promise<unknown>) => fn(),
  };
}

beforeEach(() => {
  h.adminMock = makeAdminMock();
  h.swarmsData = [];
  h.catsQueue = [];
});

import { classifierLLMRulesSeed } from "../classifier-llm-rules-seed";

describe("classifier-llm-rules-seed", () => {
  it("seeds llm:{cat}:high for every (swarm × enabled cat != unknown)", async () => {
    h.swarmsData = [{ swarm_type: "debtor-email" }];
    h.catsQueue.push([
      { category_key: "auto_reply", enabled: true },
      { category_key: "payment_admittance", enabled: true },
      { category_key: "unknown", enabled: true },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const keys = h.classifierUpserts.map((u) => u.row.rule_key);
    expect(keys.slice().sort()).toEqual([
      "llm:auto_reply:high",
      "llm:payment_admittance:high",
    ]);
    expect(keys).not.toContain("llm:unknown:high");
  });

  it("every upsert uses onConflict: swarm_type,rule_key", async () => {
    h.swarmsData = [{ swarm_type: "debtor-email" }];
    h.catsQueue.push([{ category_key: "auto_reply", enabled: true }]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    expect(h.classifierUpserts.length).toBeGreaterThan(0);
    for (const call of h.classifierUpserts) {
      expect(call.opts).toEqual({ onConflict: "swarm_type,rule_key" });
    }
  });

  it("walks every enabled swarm", async () => {
    h.swarmsData = [
      { swarm_type: "debtor-email" },
      { swarm_type: "sales-email" },
    ];
    h.catsQueue.push([{ category_key: "auto_reply", enabled: true }]);
    h.catsQueue.push([{ category_key: "spam", enabled: true }]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const bySwarm = new Map<string, string[]>();
    for (const u of h.classifierUpserts) {
      const sw = u.row.swarm_type as string;
      const arr = bySwarm.get(sw) ?? [];
      arr.push(u.row.rule_key as string);
      bySwarm.set(sw, arr);
    }
    expect(bySwarm.get("debtor-email")).toEqual(["llm:auto_reply:high"]);
    expect(bySwarm.get("sales-email")).toEqual(["llm:spam:high"]);
  });

  it("upsert payload uses kind=agent_intent, status=candidate, zeroed metrics", async () => {
    h.swarmsData = [{ swarm_type: "debtor-email" }];
    h.catsQueue.push([{ category_key: "auto_reply", enabled: true }]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    expect(h.classifierUpserts[0].row).toMatchObject({
      kind: "agent_intent",
      status: "candidate",
      n: 0,
      agree: 0,
      ci_lo: null,
    });
  });

  it("skips disabled categories", async () => {
    h.swarmsData = [{ swarm_type: "debtor-email" }];
    h.catsQueue.push([
      { category_key: "auto_reply", enabled: true },
      { category_key: "deprecated_cat", enabled: false },
    ]);
    // @ts-expect-error mock handler shape
    await classifierLLMRulesSeed.handler({ step: makeStepStub() });
    const keys = h.classifierUpserts.map((u) => u.row.rule_key);
    expect(keys).toEqual(["llm:auto_reply:high"]);
  });
});
