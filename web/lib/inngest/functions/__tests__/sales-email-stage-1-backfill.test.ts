// Phase 112 Plan 01 Task 2 — RED tests for the sales-email Stage-1 backfill
// sweeper. Implementation file: ../sales-email-stage-1-backfill.ts (GREEN).
//
// Behaviour map (PLAN.md Task 2):
//   1  replay-safe — runId minted via step.run("resolve-run-id", ...) first
//   2  report mode — selection+disposition+live-presence count, ZERO Graph
//      writes, ZERO pipeline_events inserts, ZERO automation_runs inserts
//   3  idempotency (ledger) — pre-batch pipeline_events SELECT (stage=4) skips
//   4  idempotency (emit no-op) — 23505 on emit is swallowed
//   5  Graph-id — archive/categorize called with source_id, never internet_message_id
//   6  already-archived no-op — archiveEmail 404/ErrorItemNotFound = success
//   7  auto vs queue — auto → archive + emit(stage=4); ambiguous → predicted insert, no archive
//   8  loopback skip — neither archive nor predicted insert

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

// ---- Inngest client mock -------------------------------------------------
const { createFunctionMock } = vi.hoisted(() => ({
  createFunctionMock: vi.fn((cfg, trigger, handler) => ({
    __config: cfg,
    __trigger: trigger,
    handler,
  })),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: createFunctionMock,
    send: vi.fn().mockResolvedValue({ ids: ["evt"] }),
  },
}));

// ---- Graph helper mocks --------------------------------------------------
const archiveEmail = vi.fn(async () => ({ success: true }) as { success: boolean; error?: string });
const categorizeEmail = vi.fn(async () => ({ success: true }) as { success: boolean; error?: string });
const getMessageMeta = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  archiveEmail: (m: string, id: string) => archiveEmail(m, id),
  categorizeEmail: (m: string, id: string, label: string) => categorizeEmail(m, id, label),
  getMessageMeta: (m: string, id: string) => getMessageMeta(m, id),
}));

// ---- Registry mock -------------------------------------------------------
const loadSwarmNoiseCategories = vi.fn(async (): Promise<SwarmNoiseCategoryRow[]> => REGISTRY);
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarmNoiseCategories: () => loadSwarmNoiseCategories(),
}));

// ---- emit mock -----------------------------------------------------------
const emitPipelineEvent = vi.fn(async () => undefined);
vi.mock("@/lib/pipeline-events/emit", () => ({
  emitPipelineEvent: (admin: unknown, payload: unknown) => emitPipelineEvent(admin, payload),
}));

// ---- Candidate selection mock --------------------------------------------
type BackfillCandidate = {
  email_id: string;
  source: string;
  mailbox: string | null;
  normalized_direction: "inbound" | "outbound";
  subject: string | null;
  body: string | null;
  sender_email: string | null;
  received_at: string | null;
  source_id: string | null;
  internet_message_id: string | null;
  // test-only hint: the disposition the worker should compute for this row,
  // injected via the classifier verdict the worker reads.
  predicted_category_key: string;
  confidence: "low" | "medium" | "high";
};

const candidatesReturn: { rows: BackfillCandidate[] } = { rows: [] };
const selectBackfillCandidates = vi.fn(async () => candidatesReturn.rows);
vi.mock("@/lib/automations/sales-email/backfill/select-backfill-candidates", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/automations/sales-email/backfill/select-backfill-candidates")
  >("@/lib/automations/sales-email/backfill/select-backfill-candidates");
  return {
    ...actual,
    selectBackfillCandidates: () => selectBackfillCandidates(),
    SALES_OUTLOOK_MAILBOX: "verkoop@smeba.nl",
  };
});

// The worker reads a per-email verdict to know predicted_category/confidence.
// We mock the verdict resolver so the test injects the disposition directly.
const resolveVerdicts = vi.fn(async (rows: BackfillCandidate[]) =>
  new Map(rows.map((r) => [r.email_id, { predicted_category_key: r.predicted_category_key, confidence: r.confidence }])),
);
vi.mock("@/lib/automations/sales-email/backfill/resolve-verdicts", () => ({
  resolveVerdicts: (rows: BackfillCandidate[]) => resolveVerdicts(rows),
}));

// ---- Supabase admin mock -------------------------------------------------
const dbState: {
  ledgerExisting: Array<{ email_id: string; swarm_type: string }>;
  predictedExisting: Array<{ id: string }>;
  automationInserts: Array<Record<string, unknown>>;
} = { ledgerExisting: [], predictedExisting: [], automationInserts: [] };

function makeAdmin() {
  const from = vi.fn((table: string) => {
    if (table === "pipeline_events") {
      const chain = {
        in: vi.fn(() => chain),
        eq: vi.fn(async () => ({ data: dbState.ledgerExisting, error: null })),
      };
      return { select: vi.fn(() => chain) };
    }
    // automation_runs: existence check (.select.eq.eq.limit) + insert
    const selChain = {
      eq: vi.fn(() => selChain),
      limit: vi.fn(async () => ({ data: dbState.predictedExisting, error: null })),
    };
    return {
      select: vi.fn(() => selChain),
      insert: vi.fn(async (row: Record<string, unknown>) => {
        dbState.automationInserts.push(row);
        return { data: null, error: null };
      }),
    };
  });
  return { from, schema: vi.fn(() => ({ from })) };
}
let adminInstance = makeAdmin();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminInstance),
}));

// ---- Registry fixture ----------------------------------------------------
function cat(key: string, action: SwarmNoiseCategoryRow["action"]): SwarmNoiseCategoryRow {
  return {
    swarm_type: "sales-email",
    category_key: key,
    display_label: key,
    outlook_label: action === "categorize_archive" ? "Noise" : null,
    action,
    swarm_dispatch: null,
    display_order: 0,
    enabled: true,
  };
}
const REGISTRY: SwarmNoiseCategoryRow[] = [
  cat("auto_reply", "categorize_archive"),
  cat("ooo_temporary", "categorize_archive"),
  cat("own_outbound_invoice_loopback", "categorize_archive"),
  cat("payment_admittance", "manual_review"),
  cat("unknown", "manual_review"),
];

function candidate(over: Partial<BackfillCandidate>): BackfillCandidate {
  return {
    email_id: "e-x",
    source: "outlook",
    mailbox: "verkoop@smeba.nl",
    normalized_direction: "inbound",
    subject: "s",
    body: "b",
    sender_email: "a@b.com",
    received_at: "2026-05-01T00:00:00Z",
    source_id: "AAMkGraphX",
    internet_message_id: "<rfc-x@smeba.nl>",
    predicted_category_key: "auto_reply",
    confidence: "high",
    ...over,
  };
}

// ---- Step stub -----------------------------------------------------------
function makeStep() {
  const calls: Array<{ id: string }> = [];
  const run = vi.fn(async (id: string, fn: () => unknown) => {
    calls.push({ id });
    return await fn();
  });
  return { run, calls };
}

import { salesEmailStage1Backfill } from "../sales-email-stage-1-backfill";
type Ctx = { step: { run: ReturnType<typeof vi.fn>; calls?: Array<{ id: string }> }; event?: { data?: Record<string, unknown> } };
type Handler = (ctx: Ctx) => Promise<Record<string, unknown>>;
function getHandler(): Handler {
  return (salesEmailStage1Backfill as unknown as { handler: Handler }).handler;
}

beforeEach(() => {
  vi.clearAllMocks();
  candidatesReturn.rows = [];
  dbState.ledgerExisting = [];
  dbState.predictedExisting = [];
  dbState.automationInserts = [];
  adminInstance = makeAdmin();
  archiveEmail.mockResolvedValue({ success: true });
  categorizeEmail.mockResolvedValue({ success: true });
  emitPipelineEvent.mockResolvedValue(undefined);
  loadSwarmNoiseCategories.mockResolvedValue(REGISTRY);
});

describe("sales-email Stage-1 backfill", () => {
  it("1: mints runId inside step.run('resolve-run-id') before any batch step", async () => {
    candidatesReturn.rows = [candidate({ email_id: "e-1" })];
    const step = makeStep();
    await getHandler()({ event: { data: { mode: "report" } }, step });
    const ids = step.calls.map((c) => c.id);
    expect(ids[0]).toBe("resolve-run-id");
    const firstBatch = ids.findIndex((i) => i.startsWith("backfill-batch-"));
    expect(ids.indexOf("resolve-run-id")).toBeLessThan(firstBatch === -1 ? Infinity : firstBatch);
  });

  it("2: report mode performs zero Graph writes and zero inserts", async () => {
    candidatesReturn.rows = [
      candidate({ email_id: "e-1", predicted_category_key: "auto_reply", confidence: "high" }),
      candidate({ email_id: "e-2", predicted_category_key: "payment_admittance", confidence: "high" }),
      candidate({ email_id: "e-3", predicted_category_key: "own_outbound_invoice_loopback", confidence: "high" }),
    ];
    const ret = await getHandler()({ event: { data: { mode: "report" } }, step: makeStep() });
    expect(archiveEmail).toHaveBeenCalledTimes(0);
    expect(categorizeEmail).toHaveBeenCalledTimes(0);
    expect(emitPipelineEvent).toHaveBeenCalledTimes(0);
    expect(dbState.automationInserts).toHaveLength(0);
    expect(ret).toMatchObject({
      mode: "report",
      would_auto: 1,
      would_queue: 1,
      would_skip_loopback: 1,
    });
  });

  it("3: ledger dedup — candidate already in pipeline_events(stage=4) is skipped", async () => {
    candidatesReturn.rows = [candidate({ email_id: "e-1", predicted_category_key: "auto_reply", confidence: "high" })];
    dbState.ledgerExisting = [{ email_id: "e-1", swarm_type: "sales-email" }];
    await getHandler()({ event: { data: { mode: "full" } }, step: makeStep() });
    expect(archiveEmail).toHaveBeenCalledTimes(0);
  });

  it("4: emit 23505 unique-violation is swallowed (no throw)", async () => {
    candidatesReturn.rows = [candidate({ email_id: "e-1", predicted_category_key: "auto_reply", confidence: "high" })];
    emitPipelineEvent.mockRejectedValueOnce(
      Object.assign(new Error("duplicate key value violates pipeline_events_one_per_stage_email"), { code: "23505" }),
    );
    await expect(
      getHandler()({ event: { data: { mode: "full" } }, step: makeStep() }),
    ).resolves.toBeTruthy();
    expect(archiveEmail).toHaveBeenCalledTimes(1);
  });

  it("5: archive/categorize called with source_id (Graph id), never internet_message_id", async () => {
    candidatesReturn.rows = [
      candidate({ email_id: "e-1", source_id: "AAMkGraph-5", internet_message_id: "<rfc-5@x>", predicted_category_key: "auto_reply", confidence: "high" }),
    ];
    await getHandler()({ event: { data: { mode: "full" } }, step: makeStep() });
    expect(archiveEmail).toHaveBeenCalledWith("verkoop@smeba.nl", "AAMkGraph-5");
    expect(categorizeEmail).toHaveBeenCalledWith("verkoop@smeba.nl", "AAMkGraph-5", expect.any(String));
    expect(archiveEmail).not.toHaveBeenCalledWith("verkoop@smeba.nl", "<rfc-5@x>");
  });

  it("6: already-archived (404/ErrorItemNotFound) treated as success, no throw", async () => {
    candidatesReturn.rows = [candidate({ email_id: "e-1", predicted_category_key: "auto_reply", confidence: "high" })];
    archiveEmail.mockResolvedValue({ success: false, error: "Failed to archive: 404 ErrorItemNotFound" });
    await expect(
      getHandler()({ event: { data: { mode: "full" } }, step: makeStep() }),
    ).resolves.toBeTruthy();
    // emit still fires (treated as archived)
    expect(emitPipelineEvent).toHaveBeenCalledTimes(1);
  });

  it("7: auto → archive + emit(stage=4); ambiguous → predicted insert, no archive", async () => {
    candidatesReturn.rows = [
      candidate({ email_id: "e-auto", predicted_category_key: "auto_reply", confidence: "high" }),
      candidate({ email_id: "e-amb", predicted_category_key: "payment_admittance", confidence: "high", source_id: "AAMkAmb" }),
    ];
    await getHandler()({ event: { data: { mode: "full" } }, step: makeStep() });
    expect(archiveEmail).toHaveBeenCalledTimes(1);
    expect(emitPipelineEvent).toHaveBeenCalledTimes(1);
    const emitPayload = emitPipelineEvent.mock.calls[0][1] as Record<string, unknown>;
    expect(emitPayload.stage).toBe(4);
    expect(dbState.automationInserts).toHaveLength(1);
    const ins = dbState.automationInserts[0];
    expect(ins.status).toBe("predicted");
    const res = ins.result as Record<string, unknown>;
    expect(res.message_id).toBe("AAMkAmb");
    expect(res.predicted_category).toBe("payment_admittance");
  });

  it("8: loopback → neither archive nor predicted insert", async () => {
    candidatesReturn.rows = [
      candidate({ email_id: "e-lb", predicted_category_key: "own_outbound_invoice_loopback", confidence: "high" }),
    ];
    await getHandler()({ event: { data: { mode: "full" } }, step: makeStep() });
    expect(archiveEmail).toHaveBeenCalledTimes(0);
    expect(dbState.automationInserts).toHaveLength(0);
    expect(emitPipelineEvent).toHaveBeenCalledTimes(0);
  });

  it("config: concurrency limit 1 + retries 1", () => {
    const cfg = (salesEmailStage1Backfill as unknown as { __config: Record<string, unknown> }).__config;
    expect(cfg.concurrency).toMatchObject({ limit: 1 });
    expect(cfg.retries).toBe(1);
  });
});
