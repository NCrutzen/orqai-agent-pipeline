// Phase 116-06 Task 1 — pins the gated corpus attachment-metadata backfill
// worker (SC-4 / ATTACH-04). It iterates the already-ingested corpus by
// source_id (the Graph message-id), writes attachment metadata rows for ALL
// mails (closing the has_attachments=false blind spot), and runs content
// extraction ONLY for the Stage-1-survivor slice (D-12) — REUSING the Plan 04
// extractEmailAttachments helper (no duplicated download→store→extract loop).
//
// The 6 behaviors:
//   1. dry-run mode: counts only, writes NOTHING (gated preview).
//   2. live mode: idempotent metadata upsert on (email_id, attachment_id).
//   3. Graph 404 → status='source_gone', run continues (fail-soft).
//   4. hard cap → fail-loud throw naming the corpus + cap (no silent truncation).
//   5. extraction runs ONLY for Stage-1-survivors, via the SHARED helper
//      (assert the helper is the call site; non-survivors get metadata only).
//   6. batching — bounded batches with an inter-batch delay step.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock ----------------------------------------------------------
// step.run runs the handler inline; step.sleep is a no-op spy (batch delay).
const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));

// ---- Registry mocks --------------------------------------------------------
const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...a: unknown[]) => loadSwarmMock(...a),
  loadSwarmNoiseCategories: (...a: unknown[]) => loadSwarmNoiseCategoriesMock(...a),
}));

// ---- Graph helper mock -----------------------------------------------------
const listAttachmentsMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  listAttachments: (...a: unknown[]) => listAttachmentsMock(...a),
}));

// ---- Shared extraction helper mock (Plan 04 — the assert-this call site) ----
const extractEmailAttachmentsMock = vi.fn();
vi.mock("@/lib/automations/attachments/extract-worker", () => ({
  extractEmailAttachments: (...a: unknown[]) => extractEmailAttachmentsMock(...a),
}));

// ---- retro-verdict reuse (Stage-1-survivor definition) ---------------------
const resolveVerdictsMock = vi.fn();
vi.mock("@/lib/automations/sales-email/backfill/resolve-verdicts", () => ({
  resolveVerdicts: (...a: unknown[]) => resolveVerdictsMock(...a),
}));

// ---- Supabase admin mock ---------------------------------------------------
const createAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const FILE_ATTACHMENT = "#microsoft.graph.fileAttachment";

// A configurable corpus-SELECT + upsert mock. Captures upsert calls so tests
// assert what WOULD be / WAS written.
function makeAdmin(opts: {
  corpus: Array<{ id: string; source_id: string | null; mailbox: string | null }>;
  upsertSpy?: (rows: unknown, cfg: unknown) => void;
  readCap?: number;
  upsertError?: { message: string } | null;
}) {
  const upsertSpy = vi.fn(opts.upsertSpy ?? (() => undefined));
  const readCap = opts.readCap;

  function emailsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    b.gte = vi.fn(() => b);
    b.lt = vi.fn(() => b);
    b.order = vi.fn(() => b);
    // limit() resolves the corpus (sliced to readCap if the test forces a
    // truncation scenario).
    const limitImpl = async (n: number) => {
      const rows = readCap != null ? opts.corpus.slice(0, n) : opts.corpus;
      return { data: rows, error: null };
    };
    b.limit = vi.fn(limitImpl);
    return b;
  }

  // Tracks the last upserted rows so the re-select (extraction slice) returns
  // them with a synthetic DB `id` — mirrors the live extractor's pending-row
  // load. select().eq().eq() resolves to these; update().eq() resolves empty.
  let lastUpserted: Array<Record<string, unknown>> = [];
  function attachmentsBuilder() {
    const b: Record<string, unknown> = {};
    let isSelect = false;
    b.upsert = vi.fn(async (rows: unknown, cfg: unknown) => {
      upsertSpy(rows, cfg);
      lastUpserted = (rows as Array<Record<string, unknown>>).map((r, i) => ({
        ...r,
        id: `row-${r.attachment_id}-${i}`,
      }));
      return { data: null, error: opts.upsertError ?? null };
    });
    b.select = vi.fn(() => {
      isSelect = true;
      return b;
    });
    b.update = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    // Thenable: select chain → pending rows; update chain → empty.
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve(
        isSelect
          ? { data: lastUpserted, error: null }
          : { data: null, error: null },
      );
    return b;
  }

  const schema = vi.fn(() => ({
    from: vi.fn((table: string) =>
      table === "emails" ? emailsBuilder() : attachmentsBuilder(),
    ),
  }));
  return { admin: { schema } as never, upsertSpy };
}

function makeStep() {
  return {
    run: vi.fn(async (_id: string, fn: () => unknown) => fn()),
    sleep: vi.fn(async () => undefined),
  };
}

// A swarm row with extraction ON + caps.
const SWARM_ROW = {
  attachment_config: {
    capture: true,
    extract: true,
    caps: { max_attachments_per_mail: 20 },
  },
};

// Two noise categories: 'auto_reply' auto-archives (action=categorize_archive),
// 'unknown' is manual_review (a survivor). buildAutoKeySet derives the auto set.
const NOISE_CATEGORIES = [
  { category_key: "auto_reply", action: "categorize_archive" },
  { category_key: "unknown", action: "manual_review" },
];

let handler: (ctx: { event: { data: unknown }; step: ReturnType<typeof makeStep> }) => Promise<unknown>;

beforeEach(async () => {
  vi.clearAllMocks();
  loadSwarmMock.mockResolvedValue(SWARM_ROW);
  loadSwarmNoiseCategoriesMock.mockResolvedValue(NOISE_CATEGORIES);
  resolveVerdictsMock.mockResolvedValue(new Map());
  listAttachmentsMock.mockResolvedValue([]);
  extractEmailAttachmentsMock.mockResolvedValue({ extracted: 0, failed: 0, source_gone: 0 });
  const mod = await import("../attachments-backfill");
  handler = (mod.attachmentsBackfill as unknown as { handler: typeof handler }).handler;
});

describe("attachments-backfill worker", () => {
  it("test 1 — dry-run: counts attachments that WOULD be written, writes nothing", async () => {
    const { admin, upsertSpy } = makeAdmin({
      corpus: [{ id: "e1", source_id: "g1", mailbox: "verkoop@smeba.nl" }],
    });
    createAdminClientMock.mockReturnValue(admin);
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "po.pdf", contentType: "application/pdf", size: 100, isInline: false, "@odata.type": FILE_ATTACHMENT },
    ]);

    const step = makeStep();
    const res = (await handler({ event: { data: { dry_run: true, limit: 50 } }, step })) as Record<string, number | boolean>;

    expect(res.mails_scanned).toBe(1);
    expect(res.attachments_found).toBe(1);
    expect(res.metadata_rows_written).toBe(0);
    expect(res.dry_run).toBe(true);
    expect(upsertSpy).not.toHaveBeenCalled();
  });

  it("test 2 — live: idempotent metadata upsert on (email_id, attachment_id)", async () => {
    const { admin, upsertSpy } = makeAdmin({
      corpus: [{ id: "e1", source_id: "g1", mailbox: "verkoop@smeba.nl" }],
    });
    createAdminClientMock.mockReturnValue(admin);
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "po.pdf", contentType: "application/pdf", size: 100, isInline: false, "@odata.type": FILE_ATTACHMENT },
    ]);

    const step = makeStep();
    const res = (await handler({ event: { data: { limit: 50 } }, step })) as Record<string, number>;

    expect(res.metadata_rows_written).toBe(1);
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const [rows, cfg] = upsertSpy.mock.calls[0];
    expect((rows as Array<Record<string, unknown>>)[0]).toMatchObject({
      email_id: "e1",
      attachment_id: "a1",
    });
    expect(cfg).toMatchObject({ onConflict: "email_id,attachment_id" });
  });

  it("test 3 — Graph 404 → source_gone, run continues", async () => {
    const { admin } = makeAdmin({
      corpus: [
        { id: "e1", source_id: "gone", mailbox: "verkoop@smeba.nl" },
        { id: "e2", source_id: "g2", mailbox: "verkoop@smeba.nl" },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);
    listAttachmentsMock.mockImplementation(async (_mbx: string, msgId: string) => {
      if (msgId === "gone") throw new Error("listAttachments 404: not found");
      return [
        { id: "a2", name: "x.pdf", contentType: "application/pdf", size: 1, isInline: false, "@odata.type": FILE_ATTACHMENT },
      ];
    });

    const step = makeStep();
    const res = (await handler({ event: { data: {} }, step })) as Record<string, number>;

    expect(res.source_gone).toBe(1);
    expect(res.mails_scanned).toBe(2);
    expect(res.attachments_found).toBe(1); // only e2's attachment
  });

  it("test 4 — hard cap → fail-loud throw naming the corpus + cap", async () => {
    // corpus length === readCap (cap+1) → truncation sentinel trips.
    const corpus = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      source_id: `g${i}`,
      mailbox: "verkoop@smeba.nl",
    }));
    const { admin } = makeAdmin({ corpus, readCap: 5 });
    createAdminClientMock.mockReturnValue(admin);

    const step = makeStep();
    await expect(
      handler({ event: { data: { cap: 5 } }, step }),
    ).rejects.toThrow(/corpus truncated|cap/i);
  });

  it("test 5 — extraction runs ONLY for Stage-1-survivors, via the SHARED helper", async () => {
    // e1 = survivor (no verdict → unknown/low → queue → survivor)
    // e2 = noise auto-archived (auto_reply / high → 'auto' → NOT a survivor)
    const { admin } = makeAdmin({
      corpus: [
        { id: "e1", source_id: "g1", mailbox: "verkoop@smeba.nl" },
        { id: "e2", source_id: "g2", mailbox: "verkoop@smeba.nl" },
      ],
    });
    createAdminClientMock.mockReturnValue(admin);
    resolveVerdictsMock.mockResolvedValue(
      new Map([["e2", { predicted_category_key: "auto_reply", confidence: "high" }]]),
    );
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "po.pdf", contentType: "application/pdf", size: 1, isInline: false, "@odata.type": FILE_ATTACHMENT },
    ]);

    const step = makeStep();
    await handler({ event: { data: {} }, step });

    // The shared helper is the extraction call site — invoked for e1 only.
    expect(extractEmailAttachmentsMock).toHaveBeenCalledTimes(1);
    const callArg = extractEmailAttachmentsMock.mock.calls[0][0] as { emailId: string };
    expect(callArg.emailId).toBe("e1");
  });

  it("test 6 — batching: bounded batches with an inter-batch delay step", async () => {
    const corpus = Array.from({ length: 5 }, (_, i) => ({
      id: `e${i}`,
      source_id: `g${i}`,
      mailbox: "verkoop@smeba.nl",
    }));
    const { admin } = makeAdmin({ corpus });
    createAdminClientMock.mockReturnValue(admin);

    const step = makeStep();
    // batch_size=2 → 3 batches → 2 inter-batch sleeps.
    await handler({ event: { data: { batch_size: 2 } }, step });

    // At least one batch step ran and the inter-batch delay was used.
    const batchRuns = step.run.mock.calls.filter((c) => String(c[0]).includes("batch"));
    expect(batchRuns.length).toBeGreaterThanOrEqual(2);
    expect(step.sleep).toHaveBeenCalled();
  });
});
