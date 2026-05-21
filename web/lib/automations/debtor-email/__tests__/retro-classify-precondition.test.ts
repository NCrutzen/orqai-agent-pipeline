/**
 * Phase 87 Plan 04 Task 1 — RED guard: R-04 precondition gate.
 *
 * From 87-CONTEXT.md R-04: "Open-set surface still empty at 7 days post-85
 * deploy. Mitigation: extend the live window before running Phase 87 — don't
 * run on insufficient data."
 *
 * Operational form: the function refuses to start if
 *  - `intent_proposal_clusters` has < 5 rows for `debtor-email`, OR
 *  - `max(refreshed_at)` is older than 7 days.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { createFunctionMock, sendMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
  sendMock: vi.fn().mockResolvedValue({ ids: ["evt-retro"] }),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: sendMock,
  },
}));

const { invokeIntentAgentMock } = vi.hoisted(() => ({
  invokeIntentAgentMock: vi.fn(async () => ({
    output: {
      intent_version: "2026-05-19.v3",
      ranked: [
        {
          intent: "payment_dispute",
          confidence: "high",
          document_reference: null,
          sub_type: null,
          reasoning: "stub",
        },
      ],
      language: "nl",
      urgency: "normal",
      intent_proposal: null,
      proposal_reason: null,
    },
    raw: "{}",
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  })),
}));

vi.mock("@/lib/automations/debtor-email/coordinator/invoke-intent", () => ({
  invokeIntentAgent: invokeIntentAgentMock,
}));

vi.mock("@/lib/automations/debtor-email/retro/select-candidates", () => ({
  selectCandidates: vi.fn(async () => []),
  STAGE_3_RETRO_HARD_CAP: 5000,
}));

vi.mock("@/lib/automations/debtor-email/retro/reconstruct-input", () => ({
  reconstructInput: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/retro/aggregate-baseline", () => ({
  aggregateBaseline: vi.fn(async () => ({ closed_list_rows: 0, proposal_rows: 0 })),
}));

// Tunable cluster state per test (hoisted so vi.mock factory can see it)
const { state } = vi.hoisted(() => ({
  state: { clusterRows: [] as Array<{ refreshed_at: string }> },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.gte = () => builder;
      builder.lt = () => builder;
      builder.lte = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.insert = vi.fn(async () => ({ data: null, error: null }));
      builder.upsert = vi.fn(async () => ({ data: null, error: null }));
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
        if (table.endsWith("intent_proposal_clusters")) {
          return resolve({ data: state.clusterRows, error: null });
        }
        return resolve({ data: [], error: null });
      };
      return builder;
    }),
  }),
}));

import { debtorEmailStage3RetroClassify } from "../../../inngest/functions/debtor-email-stage-3-retro-classify";

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
  };
}

function getHandler() {
  return (debtorEmailStage3RetroClassify as unknown as {
    handler: (ctx: { event: { data: unknown }; step: ReturnType<typeof makeStep> }) => Promise<unknown>;
  }).handler;
}

const EVENT = {
  data: {
    swarm_type: "debtor-email" as const,
    since: "2026-05-01",
    until: "2026-05-31",
  },
};

describe("Phase 87 retro-classify — R-04 precondition gate", () => {
  beforeEach(() => {
    state.clusterRows = [];
    sendMock.mockClear();
    invokeIntentAgentMock.mockClear();
  });

  it("throws when zero clusters exist (need ≥5)", async () => {
    state.clusterRows = [];
    await expect(
      getHandler()({ event: EVENT, step: makeStep() }),
    ).rejects.toThrow(/Phase 87 precondition.*need [≥>=]+\s*5/i);
  });

  it("throws when clusters are stale (max refreshed_at older than 7 days)", async () => {
    const staleDate = new Date(Date.now() - 8 * 86400_000).toISOString();
    state.clusterRows = Array.from({ length: 6 }, () => ({ refreshed_at: staleDate }));
    await expect(
      getHandler()({ event: EVENT, step: makeStep() }),
    ).rejects.toThrow(/Phase 87 precondition.*need [≥>=]+\s*7\s*days/i);
  });

  it("passes when ≥5 clusters and max refreshed_at within 7 days", async () => {
    const freshDate = new Date().toISOString();
    state.clusterRows = Array.from({ length: 5 }, () => ({ refreshed_at: freshDate }));
    const result = await getHandler()({ event: EVENT, step: makeStep() });
    expect(result).toBeDefined();
    // selectCandidates mock returns [] so loop never runs; result.processed = 0.
    expect((result as { processed: number }).processed).toBe(0);
  });

  it("short-circuits — invokeIntentAgent NOT called when precondition fails", async () => {
    state.clusterRows = [];
    await expect(
      getHandler()({ event: EVENT, step: makeStep() }),
    ).rejects.toThrow(/Phase 87 precondition/);
    expect(invokeIntentAgentMock).not.toHaveBeenCalled();
  });
});
