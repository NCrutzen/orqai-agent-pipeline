// Phase 116-04 Task 2 — pins the stage-1.5 attachment extractor funnel worker.
//
// The worker sits between the Stage 1 verdict and the Stage 2 request. It is
// triggered by the registry event 'sales-email/attachments.extract.requested'
// (the sales 'unknown' swarm_dispatch, rewired in 20260605c). It:
//   1. loads the email + its 'pending' email_attachments rows + the swarm row,
//   2. resolves the downstream event name from the REGISTRY
//      (attachment_config.stage2_dispatch_event — never a code literal),
//   3. if extract is ON and there are pending rows → runs extractEmailAttachments,
//   4. ALWAYS re-emits the registry Stage 2 event afterwards (never a dead-end).
//
// extract OFF (debtor / any swarm whose dispatch points here but extract=OFF) →
// pure pass-through: helper called ZERO times, Stage 2 emitted immediately.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Inngest mock ----------------------------------------------------------
const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt"] });
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSend,
    createFunction: vi.fn((cfg, _trigger, handler) => ({ __config: cfg, handler })),
  },
}));

// ---- Registry mock ---------------------------------------------------------
const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

// ---- Shared helper mock ----------------------------------------------------
const extractEmailAttachmentsMock = vi.fn();
vi.mock("@/lib/automations/attachments/extract-worker", () => ({
  extractEmailAttachments: (...args: unknown[]) =>
    extractEmailAttachmentsMock(...args),
}));

// ---- Supabase admin mock ---------------------------------------------------
const createAdminClientMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const EMAIL_ROW = { id: "email-uuid-1" };

function makeAdmin(opts: {
  emailRow?: { id: string } | null;
  pendingRows?: Array<Record<string, unknown>>;
} = {}) {
  const emailRow = opts.emailRow === undefined ? EMAIL_ROW : opts.emailRow;
  const pendingRows = opts.pendingRows ?? [];

  // schema("email_pipeline").from("emails").select().or().maybeSingle()
  function emailsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.or = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => ({ data: emailRow, error: null }));
    return b;
  }
  // schema("email_pipeline").from("email_attachments").select().eq().eq()
  function attachmentsBuilder() {
    const b: Record<string, unknown> = {};
    b.select = vi.fn(() => b);
    b.eq = vi.fn(() => b);
    // Resolves to the pending rows after the chained .eq() calls. The builder
    // is thenable so `await query` yields the rows.
    b.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: pendingRows, error: null });
    return b;
  }

  const schema = vi.fn(() => ({
    from: vi.fn((table: string) =>
      table === "emails" ? emailsBuilder() : attachmentsBuilder(),
    ),
  }));
  return { schema } as never;
}

const stepStub = {
  run: async (_name: string, fn: () => Promise<unknown>) => fn(),
};

function buildEvent(swarmType = "sales-email") {
  return {
    id: "evt-test",
    name: "sales-email/attachments.extract.requested",
    data: {
      automation_run_id: "ar-uuid-1",
      swarm_type: swarmType,
      category_key: "unknown",
      message_id: "msg-graph-1",
      source_mailbox: "verkoop@smeba.nl",
    },
  };
}

const SALES_SWARM = {
  swarm_type: "sales-email",
  attachment_config: {
    capture: true,
    extract: true,
    stage2_dispatch_event: "sales-email/stage-2.customer-resolve.requested",
    caps: {
      max_size_bytes: 26214400,
      max_attachments_per_mail: 20,
      max_vision_pages: 15,
      max_extracted_chars: 200000,
    },
  },
};

describe("stage-1_5-attachment-extractor", () => {
  let handler: (ctx: unknown) => Promise<unknown>;

  beforeEach(async () => {
    vi.clearAllMocks();
    inngestSend.mockReset();
    inngestSend.mockResolvedValue({ ids: ["evt"] });
    loadSwarmMock.mockReset();
    extractEmailAttachmentsMock.mockReset();
    extractEmailAttachmentsMock.mockResolvedValue({ extracted: 1, failed: 0, skipped: 0, source_gone: 0 });
    createAdminClientMock.mockReset();
    vi.resetModules();
    const mod = await import("../stage-1_5-attachment-extractor");
    handler = (
      mod.stage1_5AttachmentExtractor as unknown as { handler: typeof handler }
    ).handler;
  });

  it("Test 1 (WR-03): cached extract=false but PENDING rows present → STILL extracts (pending rows are authoritative)", async () => {
    // Review WR-03: capture seeds 'pending' from the extract switch read at
    // INGEST time. If an operator flips extract OFF after ingest, this worker's
    // 60s-cached registry read can be stale-false. Gating on the cached flag
    // would strand the already-seeded 'pending' rows forever. The pending rows
    // ALREADY encode the capture-time extract=true decision, so they drive
    // extraction regardless of the (possibly stale) cached switch.
    loadSwarmMock.mockResolvedValue({
      ...SALES_SWARM,
      attachment_config: { ...SALES_SWARM.attachment_config, extract: false },
    });
    createAdminClientMock.mockReturnValue(
      makeAdmin({ pendingRows: [{ id: "r1", attachment_id: "a1" }] }),
    );

    await handler({ event: buildEvent(), step: stepStub });

    expect(extractEmailAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales-email/stage-2.customer-resolve.requested",
      }),
    );
  });

  it("Test 1b: extract OFF AND no pending rows → pure pass-through, helper called 0 times", async () => {
    // extract=false at capture seeds 'not_requested' (no pending rows), so this
    // is the genuine OFF path: nothing to extract, Stage 2 emitted immediately.
    loadSwarmMock.mockResolvedValue({
      ...SALES_SWARM,
      attachment_config: { ...SALES_SWARM.attachment_config, extract: false },
    });
    createAdminClientMock.mockReturnValue(makeAdmin({ pendingRows: [] }));

    await handler({ event: buildEvent(), step: stepStub });

    expect(extractEmailAttachmentsMock).not.toHaveBeenCalled();
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales-email/stage-2.customer-resolve.requested",
      }),
    );
  });

  it("Test 2: extract ON, no pending rows → emits Stage 2, helper does no extraction", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM);
    createAdminClientMock.mockReturnValue(makeAdmin({ pendingRows: [] }));

    await handler({ event: buildEvent(), step: stepStub });

    expect(extractEmailAttachmentsMock).not.toHaveBeenCalled();
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales-email/stage-2.customer-resolve.requested",
      }),
    );
  });

  it("Test 3: extract ON + pending rows → calls extractEmailAttachments once → then emits Stage 2", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM);
    createAdminClientMock.mockReturnValue(
      makeAdmin({ pendingRows: [{ id: "r1", attachment_id: "a1" }] }),
    );

    await handler({ event: buildEvent(), step: stepStub });

    expect(extractEmailAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales-email/stage-2.customer-resolve.requested",
      }),
    );
  });

  it("Test 4: helper throws → worker still emits the Stage 2 event (never a dead-end, D-03)", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM);
    createAdminClientMock.mockReturnValue(
      makeAdmin({ pendingRows: [{ id: "r1", attachment_id: "a1" }] }),
    );
    extractEmailAttachmentsMock.mockRejectedValue(new Error("boom"));

    await handler({ event: buildEvent(), step: stepStub });

    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "sales-email/stage-2.customer-resolve.requested",
      }),
    );
  });

  it("Test 5: re-emitted event name is the REGISTRY stage2_dispatch_event (sentinel), not a hardcoded literal", async () => {
    const SENTINEL = "totally-different-swarm/stage-2.sentinel.requested";
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      attachment_config: {
        ...SALES_SWARM.attachment_config,
        stage2_dispatch_event: SENTINEL,
      },
    });
    createAdminClientMock.mockReturnValue(
      makeAdmin({ pendingRows: [{ id: "r1", attachment_id: "a1" }] }),
    );

    await handler({ event: buildEvent(), step: stepStub });

    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: SENTINEL }),
    );
    // And NOT the hardcoded sales literal.
    const emittedNames = inngestSend.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(emittedNames).not.toContain(
      "sales-email/stage-2.customer-resolve.requested",
    );
  });

  it("Test 6: missing stage2_dispatch_event in registry → fail-loud naming the swarm (no code-literal fallback)", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "sales-email",
      attachment_config: { capture: true, extract: true }, // no stage2_dispatch_event
    });
    createAdminClientMock.mockReturnValue(makeAdmin({ pendingRows: [] }));

    await expect(handler({ event: buildEvent(), step: stepStub })).rejects.toThrow(
      /sales-email/,
    );
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("emits with the same data shape the verdict worker emits", async () => {
    loadSwarmMock.mockResolvedValue(SALES_SWARM);
    createAdminClientMock.mockReturnValue(makeAdmin({ pendingRows: [] }));

    await handler({ event: buildEvent(), step: stepStub });

    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          automation_run_id: "ar-uuid-1",
          swarm_type: "sales-email",
          category_key: "unknown",
          message_id: "msg-graph-1",
          source_mailbox: "verkoop@smeba.nl",
        }),
      }),
    );
  });
});
