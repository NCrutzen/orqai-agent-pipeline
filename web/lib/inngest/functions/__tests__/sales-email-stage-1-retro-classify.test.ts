/**
 * Phase 111 Plan 03 Task 3 — function spec for sales-email-stage-1-retro-classify.
 *
 * Covers:
 *   1. Happy path: candidates → per-email upsert to stage_1_retro_runs → token sum.
 *   2. Token-sum invariant (sum of usage.total_tokens).
 *   3. Idempotent re-run: explicit run_id reused, upsert onConflict run_id,email_id + ignoreDuplicates.
 *   4. false_archive_suspect: a normalized-inbound mail predicted as a
 *      would-archive noise category is flagged.
 *   5. Side-channel isolation (source-grep guard): the harness writes ONLY
 *      stage_1_retro_runs — never automation_runs / agent_runs / pipeline_events.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

const {
  selectCandidatesMock,
  aggregateBaselineMock,
  invokeOrqAgentMock,
  loadNoiseCategoriesMock,
} = vi.hoisted(() => ({
  selectCandidatesMock: vi.fn(),
  aggregateBaselineMock: vi.fn(),
  invokeOrqAgentMock: vi.fn(),
  loadNoiseCategoriesMock: vi.fn(),
}));

vi.mock("@/lib/automations/sales-email/retro/select-candidates", () => ({
  selectCandidates: selectCandidatesMock,
  STAGE_1_RETRO_HARD_CAP: 40000,
  SALES_OUTLOOK_MAILBOX: "verkoop@smeba.nl",
  normalizeDirection: (d: string) =>
    d === "sent" || d === "outbound" ? "outbound" : "inbound",
}));
vi.mock("@/lib/automations/sales-email/retro/aggregate-baseline", () => ({
  aggregateBaseline: aggregateBaselineMock,
}));
vi.mock("@/lib/automations/orq-agents/client", () => ({
  invokeOrqAgent: invokeOrqAgentMock,
}));
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: loadNoiseCategoriesMock,
}));

const { state } = vi.hoisted(() => ({
  state: {
    upserts: [] as Array<{ table: string; row: unknown; opts: unknown }>,
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.upsert = vi.fn(async (row: unknown, opts: unknown) => {
        state.upserts.push({ table, row, opts });
        return { data: null, error: null };
      });
      builder.then = (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [], error: null });
      return builder;
    }),
    schema: vi.fn(() => ({ from: vi.fn() })),
  }),
}));

import { salesEmailStage1RetroClassify } from "../sales-email-stage-1-retro-classify";

function makeStep() {
  return { run: vi.fn(async (_id: string, fn: () => unknown) => fn()) };
}

function getHandler() {
  return (salesEmailStage1RetroClassify as unknown as {
    handler: (ctx: {
      event: { data: unknown };
      step: ReturnType<typeof makeStep>;
    }) => Promise<unknown>;
  }).handler;
}

const NOISE_CATEGORIES = [
  { category_key: "auto_reply", display_label: "Auto-Reply", action: "categorize_archive", enabled: true },
  { category_key: "ooo_temporary", display_label: "OoO — Temporary", action: "categorize_archive", enabled: true },
  { category_key: "payment_admittance", display_label: "Payment Admittance", action: "manual_review", enabled: true },
];

function candidate(id: string, dir: "inbound" | "outbound", source = "outlook") {
  return {
    email_id: id,
    source,
    mailbox: source === "outlook" ? "verkoop@smeba.nl" : "Bean Label",
    normalized_direction: dir,
    subject: "s",
    body: "b",
    sender_email: "x@y.nl",
    received_at: "2026-03-01T00:00:00Z",
  };
}

function llmVerdict(category_key: string, confidence = "high") {
  return {
    raw: { category_key, confidence, reasoning: "stub" },
    agent: { agent_key: "stage-1-category-classifier" },
    usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
  };
}

const BASE_EVENT = {
  data: {
    swarm_type: "sales-email" as const,
    since: "2026-01-01T00:00:00Z",
    until: "2026-12-31T00:00:00Z",
  },
};

describe("Phase 111 sales-email-stage-1-retro-classify", () => {
  beforeEach(() => {
    state.upserts.length = 0;
    selectCandidatesMock.mockReset();
    aggregateBaselineMock.mockReset();
    invokeOrqAgentMock.mockReset();
    loadNoiseCategoriesMock.mockReset();
    sendMock.mockClear();
    loadNoiseCategoriesMock.mockResolvedValue(NOISE_CATEGORIES);
    aggregateBaselineMock.mockResolvedValue({ total: 0, categories: [] });
  });

  it("happy path — 2 candidates → 2 upserts to stage_1_retro_runs", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
      candidate("22222222-2222-2222-2222-222222222222", "outbound"),
    ]);
    invokeOrqAgentMock
      .mockResolvedValueOnce(llmVerdict("unknown"))
      .mockResolvedValueOnce(llmVerdict("auto_reply"));

    const result = (await getHandler()({ event: BASE_EVENT, step: makeStep() })) as {
      processed: number;
      total_tokens: number;
    };

    expect(result.processed).toBe(2);
    const retroUpserts = state.upserts.filter((u) => u.table === "stage_1_retro_runs");
    expect(retroUpserts).toHaveLength(2);
  });

  it("token-sum invariant", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
      candidate("22222222-2222-2222-2222-222222222222", "inbound"),
    ]);
    invokeOrqAgentMock
      .mockResolvedValueOnce({ ...llmVerdict("unknown"), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 777 } })
      .mockResolvedValueOnce({ ...llmVerdict("auto_reply"), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 223 } });

    const result = (await getHandler()({ event: BASE_EVENT, step: makeStep() })) as {
      total_tokens: number;
    };
    expect(result.total_tokens).toBe(1000);
  });

  it("idempotent re-run — explicit run_id reused, upsert onConflict run_id,email_id + ignoreDuplicates", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
    ]);
    invokeOrqAgentMock.mockResolvedValue(llmVerdict("unknown"));

    const RUN_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
    const result = (await getHandler()({
      event: { data: { ...BASE_EVENT.data, run_id: RUN_ID } },
      step: makeStep(),
    })) as { run_id: string };

    expect(result.run_id).toBe(RUN_ID);
    const opts = state.upserts[0].opts as { onConflict?: string; ignoreDuplicates?: boolean };
    expect(opts?.onConflict).toBe("run_id,email_id");
    expect(opts?.ignoreDuplicates).toBe(true);
  });

  it("false_archive_suspect — inbound mail predicted as would-archive noise is flagged", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"), // inbound + auto_reply(archive) → suspect
      candidate("22222222-2222-2222-2222-222222222222", "outbound"), // outbound → not suspect
      candidate("33333333-3333-3333-3333-333333333333", "inbound"), // inbound + payment_admittance(manual_review) → not would_archive → not suspect
    ]);
    invokeOrqAgentMock
      .mockResolvedValueOnce(llmVerdict("auto_reply"))
      .mockResolvedValueOnce(llmVerdict("auto_reply"))
      .mockResolvedValueOnce(llmVerdict("payment_admittance"));

    await getHandler()({ event: BASE_EVENT, step: makeStep() });

    const byId = new Map(
      state.upserts
        .filter((u) => u.table === "stage_1_retro_runs")
        .map((u) => {
          const row = u.row as { email_id: string; false_archive_suspect: boolean; would_archive: boolean; is_noise: boolean };
          return [row.email_id, row];
        }),
    );
    expect(byId.get("11111111-1111-1111-1111-111111111111")?.false_archive_suspect).toBe(true);
    expect(byId.get("11111111-1111-1111-1111-111111111111")?.would_archive).toBe(true);
    expect(byId.get("22222222-2222-2222-2222-222222222222")?.false_archive_suspect).toBe(false);
    expect(byId.get("33333333-3333-3333-3333-333333333333")?.would_archive).toBe(false);
    expect(byId.get("33333333-3333-3333-3333-333333333333")?.false_archive_suspect).toBe(false);
    expect(byId.get("33333333-3333-3333-3333-333333333333")?.is_noise).toBe(true);
  });

  it("WR-03: would_archive uses the FIXED archive_reference_keys, not the live action map", async () => {
    // Live map: only auto_reply/ooo_* are categorize_archive (payment_admittance
    // is manual_review). Pass a reference that DROPS auto_reply and ADDS
    // payment_admittance — would_archive must follow the reference, proving it
    // is decoupled from the live action map (deterministic across the flip).
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"), // auto_reply
      candidate("22222222-2222-2222-2222-222222222222", "inbound"), // payment_admittance
    ]);
    invokeOrqAgentMock
      .mockResolvedValueOnce(llmVerdict("auto_reply"))
      .mockResolvedValueOnce(llmVerdict("payment_admittance"));

    const result = (await getHandler()({
      event: {
        data: {
          ...BASE_EVENT.data,
          archive_reference_keys: ["payment_admittance"],
        },
      },
      step: makeStep(),
    })) as { archive_snapshot: string; archive_reference_keys: string[] };

    expect(result.archive_snapshot).toBe("fixed_reference");
    expect(result.archive_reference_keys).toEqual(["payment_admittance"]);

    const byId = new Map(
      state.upserts
        .filter((u) => u.table === "stage_1_retro_runs")
        .map((u) => {
          const r = u.row as { email_id: string; would_archive: boolean };
          return [r.email_id, r.would_archive];
        }),
    );
    // auto_reply is categorize_archive LIVE but NOT in the reference → false.
    expect(byId.get("11111111-1111-1111-1111-111111111111")).toBe(false);
    // payment_admittance is manual_review LIVE but IS in the reference → true.
    expect(byId.get("22222222-2222-2222-2222-222222222222")).toBe(true);
  });

  it("WR-03: without a reference, falls back to live action map and stamps live_action_map", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
    ]);
    invokeOrqAgentMock.mockResolvedValueOnce(llmVerdict("auto_reply"));

    const result = (await getHandler()({
      event: BASE_EVENT,
      step: makeStep(),
    })) as { archive_snapshot: string; archive_reference_keys: string[] | null };

    expect(result.archive_snapshot).toBe("live_action_map");
    expect(result.archive_reference_keys).toBeNull();
    const row = state.upserts.find((u) => u.table === "stage_1_retro_runs")
      ?.row as { would_archive: boolean };
    // auto_reply IS categorize_archive in the live NOISE_CATEGORIES map.
    expect(row.would_archive).toBe(true);
  });

  it("WR-04: a malformed LLM verdict coerces to unknown/low instead of aborting the run", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
      candidate("22222222-2222-2222-2222-222222222222", "inbound"),
      candidate("33333333-3333-3333-3333-333333333333", "inbound"),
    ]);
    // Middle email returns a shape that fails Stage1OutputSchema.parse
    // (confidence not in the enum). It must NOT throw — coerce to unknown/low.
    invokeOrqAgentMock
      .mockResolvedValueOnce(llmVerdict("auto_reply"))
      .mockResolvedValueOnce({
        raw: { category_key: "auto_reply", confidence: "BOGUS", reasoning: null },
        agent: { agent_key: "stage-1-category-classifier" },
        usage: { total_tokens: 5 },
      })
      .mockResolvedValueOnce(llmVerdict("unknown"));

    const result = (await getHandler()({
      event: BASE_EVENT,
      step: makeStep(),
    })) as { processed: number };

    // All 3 candidates produced a row — the bad one did not abort the batch.
    expect(result.processed).toBe(3);
    const retroUpserts = state.upserts.filter(
      (u) => u.table === "stage_1_retro_runs",
    );
    expect(retroUpserts).toHaveLength(3);
    const bad = retroUpserts
      .map((u) => u.row as { email_id: string; predicted_category_key: string; confidence: string })
      .find((r) => r.email_id === "22222222-2222-2222-2222-222222222222");
    expect(bad?.predicted_category_key).toBe("unknown");
    expect(bad?.confidence).toBe("low");
  });

  it("WR-04: a thrown invokeOrqAgent error coerces to unknown/low (no run abort)", async () => {
    selectCandidatesMock.mockResolvedValue([
      candidate("11111111-1111-1111-1111-111111111111", "inbound"),
    ]);
    invokeOrqAgentMock.mockRejectedValueOnce(new Error("orq 500"));

    const result = (await getHandler()({
      event: BASE_EVENT,
      step: makeStep(),
    })) as { processed: number };

    expect(result.processed).toBe(1);
    const row = state.upserts.find(
      (u) => u.table === "stage_1_retro_runs",
    )?.row as { predicted_category_key: string; confidence: string };
    expect(row.predicted_category_key).toBe("unknown");
    expect(row.confidence).toBe("low");
  });

  it("side-channel isolation — source references only stage_1_retro_runs among write targets", () => {
    const src = readFileSync(
      join(__dirname, "../sales-email-stage-1-retro-classify.ts"),
      "utf8",
    );
    // Forbidden live-pipeline write targets must NOT appear as table names.
    expect(src).not.toMatch(/from\(["']automation_runs["']\)/);
    expect(src).not.toMatch(/from\(["']agent_runs["']\)/);
    expect(src).not.toMatch(/from\(["']pipeline_events["']\)/);
    // The ONLY write target is stage_1_retro_runs.
    expect(src).toMatch(/from\(["']stage_1_retro_runs["']\)/);
    // No downstream events emitted; inngest.send not destructured.
    expect(src).not.toMatch(/const\s+\{\s*send\s*\}\s*=\s*inngest/);
    expect(src).not.toMatch(/inngest\.send\(/);
    // run_id resolved inside step.run (replay-safe).
    expect(src).toMatch(/resolve-run-id/);
  });
});
