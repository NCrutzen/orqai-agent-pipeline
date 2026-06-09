/**
 * Phase 113 Plan 03 Task 1 — bootstrap-gate behavior for the sales-email
 * Stage 3 retro-classify function.
 *
 * Covers the four cases of the bounded bootstrap bypass (T-113-11):
 *   (a) bypass-when-empty: bootstrap=true + swarm_intents count = 0 → the
 *       cluster precondition gate is SKIPPED and the run proceeds.
 *   (b) refuse-when-seeded: bootstrap=true + swarm_intents count > 0 → THROWS
 *       a clear "already seeded" error (bootstrap must not silently re-run).
 *   (c) tag-on-bootstrap: rows written under a bootstrap run carry the
 *       run_type='bootstrap' marker in ranked_intents; a normal-gate run
 *       carries run_type='normal'.
 *   (d) normal-gate-intact: bootstrap falsy + clusters < 5 → the precondition
 *       gate BLOCKS as before.
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

const { selectCandidatesMock, reconstructInputMock, invokeSalesIntentMock } =
  vi.hoisted(() => ({
    selectCandidatesMock: vi.fn(),
    reconstructInputMock: vi.fn(),
    invokeSalesIntentMock: vi.fn(),
  }));

vi.mock("@/lib/automations/sales-email/retro/select-candidates", () => ({
  selectCandidates: selectCandidatesMock,
  STAGE_1_RETRO_HARD_CAP: 40000,
}));
vi.mock("@/lib/automations/sales-email/retro/reconstruct-input", () => ({
  reconstructInput: reconstructInputMock,
}));
vi.mock("@/lib/automations/sales-email/coordinator/invoke-intent", () => ({
  invokeSalesIntentAgent: invokeSalesIntentMock,
}));

// Mock admin client. `from("swarm_intents")` is a count head-query;
// `from("intent_proposal_clusters")` is a select returning rows;
// `from("stage_3_retro_runs")` captures the upsert rows.
const { state } = vi.hoisted(() => ({
  state: {
    upserts: [] as Array<{ table: string; row: unknown; opts: unknown }>,
    intentCount: 0,
    clusterRows: [] as Array<{ refreshed_at: string | null }>,
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      if (table === "swarm_intents") {
        // .select("*", { count, head }).eq(...) → resolves to { count, error }.
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () =>
          Promise.resolve({ count: state.intentCount, error: null });
        return builder;
      }
      if (table === "intent_proposal_clusters") {
        // .select("refreshed_at").eq(...) → resolves to { data, error }.
        const builder: Record<string, unknown> = {};
        builder.select = () => builder;
        builder.eq = () =>
          Promise.resolve({ data: state.clusterRows, error: null });
        return builder;
      }
      // stage_3_retro_runs
      const builder: Record<string, unknown> = {};
      builder.upsert = vi.fn(async (row: unknown, opts: unknown) => {
        state.upserts.push({ table, row, opts });
        return { data: null, error: null };
      });
      return builder;
    }),
    schema: vi.fn(() => ({ from: vi.fn() })),
  }),
}));

import { salesEmailStage3RetroClassify } from "../sales-email-stage-3-retro-classify";

function makeStep() {
  return { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };
}

function getHandler() {
  return (
    salesEmailStage3RetroClassify as unknown as {
      handler: (ctx: {
        event: { data: unknown };
        step: ReturnType<typeof makeStep>;
      }) => Promise<unknown>;
    }
  ).handler;
}

function candidate(id: string) {
  return { email_id: id };
}

function salesVerdict() {
  return {
    output: {
      ranked: [{ intent: "offerte_aanvraag", confidence: "high", reasoning: "r" }],
      language: "nl",
      urgency: "normal",
      intent_version: "2026-06-05.v1",
      intent_proposal: "spoed_levering",
      proposal_reason: "klant vraagt om spoed",
      entity_relationship: null,
    },
    raw: "{}",
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

const BASE_DATA = {
  swarm_type: "sales-email" as const,
  since: "2026-03-01T00:00:00Z",
  until: "2026-04-01T00:00:00Z",
};

function freshClusters(n: number) {
  const now = new Date().toISOString();
  return Array.from({ length: n }, () => ({ refreshed_at: now }));
}

describe("Phase 113 sales-stage-3-retro bootstrap gate", () => {
  beforeEach(() => {
    state.upserts.length = 0;
    state.intentCount = 0;
    state.clusterRows = [];
    selectCandidatesMock.mockReset();
    reconstructInputMock.mockReset();
    invokeSalesIntentMock.mockReset();
    reconstructInputMock.mockResolvedValue({ email_id: "x" });
    invokeSalesIntentMock.mockResolvedValue(salesVerdict());
  });

  it("(a) bypass-when-empty: bootstrap=true + swarm_intents empty → runs, skipping the cluster gate", async () => {
    state.intentCount = 0;
    state.clusterRows = []; // cluster surface empty — would block the normal gate
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111"),
    ]);

    const result = (await getHandler()({
      event: { data: { ...BASE_DATA, bootstrap: true } },
      step: makeStep(),
    })) as { processed: number; run_type: string };

    expect(result.processed).toBe(1);
    expect(result.run_type).toBe("bootstrap");
    expect(
      state.upserts.filter((u) => u.table === "stage_3_retro_runs"),
    ).toHaveLength(1);
  });

  it("(b) refuse-when-seeded: bootstrap=true + swarm_intents non-empty → THROWS", async () => {
    state.intentCount = 7; // vocabulary already seeded
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111"),
    ]);

    await expect(
      getHandler()({
        event: { data: { ...BASE_DATA, bootstrap: true } },
        step: makeStep(),
      }),
    ).rejects.toThrow(/already seeded/i);

    // No rows written — refused before the per-email loop.
    expect(
      state.upserts.filter((u) => u.table === "stage_3_retro_runs"),
    ).toHaveLength(0);
  });

  it("(c) tag-on-bootstrap: bootstrap rows carry run_type='bootstrap'; normal rows carry 'normal'", async () => {
    // Bootstrap run.
    state.intentCount = 0;
    state.clusterRows = [];
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111"),
    ]);
    await getHandler()({
      event: { data: { ...BASE_DATA, bootstrap: true } },
      step: makeStep(),
    });
    const bootstrapRow = state.upserts.find(
      (u) => u.table === "stage_3_retro_runs",
    )?.row as { ranked_intents: { _meta?: { run_type?: string } } };
    expect(bootstrapRow.ranked_intents._meta?.run_type).toBe("bootstrap");

    // Normal run (clusters seeded + fresh so the normal gate passes).
    state.upserts.length = 0;
    state.intentCount = 9; // seeded — bootstrap would refuse, but this is normal
    state.clusterRows = freshClusters(6);
    selectCandidatesMock.mockResolvedValue([
      candidate("22222222-2222-2222-2222-222222222222"),
    ]);
    await getHandler()({
      event: { data: { ...BASE_DATA } },
      step: makeStep(),
    });
    const normalRow = state.upserts.find(
      (u) => u.table === "stage_3_retro_runs",
    )?.row as { ranked_intents: { _meta?: { run_type?: string } } };
    expect(normalRow.ranked_intents._meta?.run_type).toBe("normal");
  });

  it("(d) normal-gate-intact: bootstrap falsy + clusters < 5 → BLOCKS (throws)", async () => {
    state.intentCount = 0;
    state.clusterRows = freshClusters(3); // < PRECONDITION_MIN_CLUSTERS
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111"),
    ]);

    await expect(
      getHandler()({
        event: { data: { ...BASE_DATA } },
        step: makeStep(),
      }),
    ).rejects.toThrow(/precondition gate failed/i);

    expect(
      state.upserts.filter((u) => u.table === "stage_3_retro_runs"),
    ).toHaveLength(0);
  });
});
