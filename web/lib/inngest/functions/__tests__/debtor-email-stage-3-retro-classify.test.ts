/**
 * Phase 87 Plan 04 Task 2 — function spec for debtor-email-stage-3-retro-classify.
 *
 * Covers:
 *   1. Happy path: 3 fixture candidates → 3 upserts → aggregate → summary.
 *   2. Token-sum invariant (REQ-87-06).
 *   3. Idempotent re-run with same explicit run_id (upsert ignoreDuplicates).
 *   4. Precondition short-circuit: clusters=0 → invokeIntentAgent not called.
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

// Stubs for Plan 02 + Plan 03 helpers — the function is thin wiring.
// vi.mock factories are hoisted to top of file, before any `const`. Wrap the
// mock fns in vi.hoisted so they're initialised before the factories run.
const {
  selectCandidatesMock,
  reconstructInputMock,
  aggregateBaselineMock,
  invokeIntentAgentMock,
} = vi.hoisted(() => ({
  selectCandidatesMock: vi.fn(),
  reconstructInputMock: vi.fn(),
  aggregateBaselineMock: vi.fn(),
  invokeIntentAgentMock: vi.fn(),
}));

vi.mock("@/lib/automations/debtor-email/retro/select-candidates", () => ({
  selectCandidates: selectCandidatesMock,
  STAGE_3_RETRO_HARD_CAP: 5000,
}));
vi.mock("@/lib/automations/debtor-email/retro/reconstruct-input", () => ({
  reconstructInput: reconstructInputMock,
}));
vi.mock("@/lib/automations/debtor-email/retro/aggregate-baseline", () => ({
  aggregateBaseline: aggregateBaselineMock,
}));
vi.mock("@/lib/automations/debtor-email/coordinator/invoke-intent", () => ({
  invokeIntentAgent: invokeIntentAgentMock,
}));

// Supabase admin mock with controllable cluster state + upsert tracking.
// Hoist mutable state into vi.hoisted so the vi.mock factory sees it.
const { state } = vi.hoisted(() => ({
  state: {
    clusterRows: [] as Array<{ refreshed_at: string }>,
    upserts: [] as Array<{ row: unknown; opts: unknown }>,
  },
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
      builder.upsert = vi.fn(async (row: unknown, opts: unknown) => {
        if (table === "stage_3_retro_runs") {
          state.upserts.push({ row, opts });
        }
        return { data: null, error: null };
      });
      builder.insert = vi.fn(async () => ({ data: null, error: null }));
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

import { debtorEmailStage3RetroClassify } from "../debtor-email-stage-3-retro-classify";

function makeStep() {
  return { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };
}

function getHandler() {
  return (debtorEmailStage3RetroClassify as unknown as {
    handler: (ctx: { event: { data: unknown }; step: ReturnType<typeof makeStep> }) => Promise<unknown>;
  }).handler;
}

function freshClusters(n = 5) {
  const fresh = new Date().toISOString();
  state.clusterRows = Array.from({ length: n }, () => ({ refreshed_at: fresh }));
}

function v3Output(intent: string) {
  return {
    intent_version: "2026-05-19.v3",
    ranked: [
      {
        intent,
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
  };
}

const BASE_EVENT = {
  data: {
    swarm_type: "debtor-email" as const,
    since: "2026-05-01",
    until: "2026-05-31",
  },
};

describe("Phase 87 debtor-email-stage-3-retro-classify", () => {
  beforeEach(() => {
    state.clusterRows = [];
    state.upserts.length = 0;
    selectCandidatesMock.mockReset();
    reconstructInputMock.mockReset();
    aggregateBaselineMock.mockReset();
    invokeIntentAgentMock.mockReset();
    sendMock.mockClear();
  });

  it("happy path — 3 candidates → 3 upserts → aggregate → summary", async () => {
    freshClusters();
    selectCandidatesMock.mockResolvedValue([
      { email_id: "e1", original_top_intent: "general_inquiry", original_confidence: 0.7, created_at: "2026-05-10" },
      { email_id: "e2", original_top_intent: "payment_dispute", original_confidence: 0.9, created_at: "2026-05-11" },
      { email_id: "e3", original_top_intent: "other", original_confidence: 0.5, created_at: "2026-05-12" },
    ]);
    reconstructInputMock.mockResolvedValue({
      email_id: "stub",
      inngest_run_id: "run",
      subject: "s",
      body_text: "b",
      assembled_input: "<a/>",
      sender_email: "x@y.nl",
      sender_domain: "y.nl",
      mailbox: "debiteuren@smeba.nl",
      entity: "smeba",
      received_at: "2026-05-10",
    });
    invokeIntentAgentMock
      .mockResolvedValueOnce({ output: v3Output("payment_dispute"), raw: "{}", usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } })
      .mockResolvedValueOnce({ output: v3Output("copy_document_request"), raw: "{}", usage: { input_tokens: 110, output_tokens: 22, total_tokens: 132 } })
      .mockResolvedValueOnce({ output: v3Output("other"), raw: "{}", usage: { input_tokens: 90, output_tokens: 18, total_tokens: 108 } });
    aggregateBaselineMock.mockResolvedValue({ closed_list_rows: 3, proposal_rows: 0 });

    const result = await getHandler()({ event: BASE_EVENT, step: makeStep() }) as {
      run_id: string;
      processed: number;
      total_tokens: number;
      baseline_rows: { closed_list_rows: number; proposal_rows: number };
    };

    expect(result.processed).toBe(3);
    expect(result.total_tokens).toBe(120 + 132 + 108);
    expect(result.baseline_rows).toEqual({ closed_list_rows: 3, proposal_rows: 0 });
    expect(state.upserts).toHaveLength(3);
  });

  it("token-sum invariant: total_tokens = sum of usage.total_tokens", async () => {
    freshClusters();
    selectCandidatesMock.mockResolvedValue([
      { email_id: "e1", original_top_intent: "x", original_confidence: 0.5, created_at: "2026-05-10" },
      { email_id: "e2", original_top_intent: "x", original_confidence: 0.5, created_at: "2026-05-11" },
    ]);
    reconstructInputMock.mockResolvedValue({
      email_id: "stub", inngest_run_id: "r", subject: "s", body_text: "b",
      assembled_input: "<a/>", sender_email: "x@y", sender_domain: "y",
      mailbox: "m", entity: "smeba", received_at: "2026-05-10",
    });
    invokeIntentAgentMock
      .mockResolvedValueOnce({ output: v3Output("payment_dispute"), raw: "{}", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 777 } })
      .mockResolvedValueOnce({ output: v3Output("other"), raw: "{}", usage: { input_tokens: 1, output_tokens: 1, total_tokens: 223 } });
    aggregateBaselineMock.mockResolvedValue({ closed_list_rows: 2, proposal_rows: 0 });

    const result = await getHandler()({ event: BASE_EVENT, step: makeStep() }) as { total_tokens: number };
    expect(result.total_tokens).toBe(1000);
  });

  it("idempotent re-run — explicit run_id reused, upsert uses ignoreDuplicates", async () => {
    freshClusters();
    selectCandidatesMock.mockResolvedValue([
      { email_id: "e1", original_top_intent: "x", original_confidence: 0.5, created_at: "2026-05-10" },
    ]);
    reconstructInputMock.mockResolvedValue({
      email_id: "stub", inngest_run_id: "r", subject: "s", body_text: "b",
      assembled_input: "<a/>", sender_email: "x@y", sender_domain: "y",
      mailbox: "m", entity: "smeba", received_at: "2026-05-10",
    });
    invokeIntentAgentMock.mockResolvedValue({
      output: v3Output("other"), raw: "{}",
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 50 },
    });
    aggregateBaselineMock.mockResolvedValue({ closed_list_rows: 1, proposal_rows: 0 });

    const RUN_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
    const result = await getHandler()({
      event: { data: { ...BASE_EVENT.data, run_id: RUN_ID } },
      step: makeStep(),
    }) as { run_id: string };

    expect(result.run_id).toBe(RUN_ID);
    expect(state.upserts).toHaveLength(1);
    const opts = state.upserts[0].opts as { onConflict?: string; ignoreDuplicates?: boolean };
    expect(opts?.onConflict).toBe("run_id,email_id");
    expect(opts?.ignoreDuplicates).toBe(true);
  });

  it("precondition short-circuit — 0 clusters → invokeIntentAgent NOT called", async () => {
    state.clusterRows = [];
    selectCandidatesMock.mockResolvedValue([]);

    await expect(
      getHandler()({ event: BASE_EVENT, step: makeStep() }),
    ).rejects.toThrow(/Phase 87 precondition/);

    expect(invokeIntentAgentMock).not.toHaveBeenCalled();
    expect(selectCandidatesMock).not.toHaveBeenCalled();
    expect(state.upserts).toHaveLength(0);
  });
});
