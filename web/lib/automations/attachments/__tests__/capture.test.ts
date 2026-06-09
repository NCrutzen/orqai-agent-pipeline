// Phase 116-03 Task 1 — pins the swarm-agnostic captureAttachmentMetadata helper.
//
// Registry-gated metadata capture at ingest. Reads attachment_config.capture /
// .extract off the loaded swarm row (NO swarm literal — SWARM-02); when capture
// is ON and the mail has attachments, lists attachments via Graph and upserts
// one email_pipeline.email_attachments row per real (non-inline, fileAttachment)
// attachment. Metadata only — no binary, no extraction (D-05). Fail-soft: any
// Graph/insert error returns { captured: 0 } so ingest never fails (D-03).
//
// Mocks: loadSwarm (registry) + listAttachments (Graph).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the registry loader ----------------------------------------------
const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

// ---- Mock the Graph attachment lister --------------------------------------
const listAttachmentsMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  listAttachments: (...args: unknown[]) => listAttachmentsMock(...args),
}));

// Import AFTER mocks.
import { captureAttachmentMetadata } from "@/lib/automations/attachments/capture";

// ---- Supabase admin double --------------------------------------------------
// Captures the rows passed to .upsert so tests can assert filtering + seeding.
interface UpsertCall {
  rows: Array<Record<string, unknown>>;
  onConflict?: string;
}

function makeAdmin(opts: { upsertError?: { message: string } } = {}) {
  const calls: UpsertCall[] = [];
  const upsert = vi.fn(
    (rows: Array<Record<string, unknown>>, options?: { onConflict?: string }) => {
      calls.push({ rows, onConflict: options?.onConflict });
      return Promise.resolve({ error: opts.upsertError ?? null });
    },
  );
  const from = vi.fn(() => ({ upsert }));
  const schema = vi.fn(() => ({ from }));
  return { admin: { schema } as never, calls, schema, from, upsert };
}

const FILE = "#microsoft.graph.fileAttachment";

function swarmRow(capture: boolean, extract: boolean) {
  return {
    swarm_type: "sales-email",
    attachment_config: { capture, extract },
  };
}

const BASE = {
  swarmType: "sales-email",
  mailbox: "verkoop@smeba.nl",
  messageId: "msg-1",
  emailId: "email-uuid-1",
};

beforeEach(() => {
  loadSwarmMock.mockReset();
  listAttachmentsMock.mockReset();
});

describe("captureAttachmentMetadata", () => {
  it("Test 1: capture OFF → no listAttachments, no rows, returns { captured: 0 }", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(false, false));
    const { admin, upsert } = makeAdmin();

    const res = await captureAttachmentMetadata({
      admin,
      ...BASE,
      hasAttachments: true,
    });

    expect(res).toEqual({ captured: 0 });
    expect(listAttachmentsMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("Test 2: capture ON + hasAttachments false → no listAttachments, returns { captured: 0 }", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    const { admin, upsert } = makeAdmin();

    const res = await captureAttachmentMetadata({
      admin,
      ...BASE,
      hasAttachments: false,
    });

    expect(res).toEqual({ captured: 0 });
    expect(listAttachmentsMock).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("Test 3: capture ON + hasAttachments true → one row per real attachment", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "offerte.pdf", contentType: "application/pdf", size: 1234, isInline: false, "@odata.type": FILE },
      { id: "a2", name: "order.pdf", contentType: "application/pdf", size: 5678, isInline: false, "@odata.type": FILE },
    ]);
    const { admin, calls, upsert } = makeAdmin();

    const res = await captureAttachmentMetadata({
      admin,
      ...BASE,
      hasAttachments: true,
    });

    expect(listAttachmentsMock).toHaveBeenCalledWith("verkoop@smeba.nl", "msg-1");
    expect(res).toEqual({ captured: 2 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(calls[0].rows).toHaveLength(2);
    const row = calls[0].rows[0];
    expect(row).toMatchObject({
      swarm_type: "sales-email",
      email_id: "email-uuid-1",
      attachment_id: "a1",
      filename: "offerte.pdf",
      content_type: "application/pdf",
      size_bytes: 1234,
      is_inline: false,
    });
  });

  it("Test 4: inline + non-fileAttachment @odata.type filtered out", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    listAttachmentsMock.mockResolvedValue([
      { id: "real", name: "doc.pdf", contentType: "application/pdf", size: 10, isInline: false, "@odata.type": FILE },
      { id: "sig", name: "logo.png", contentType: "image/png", size: 5, isInline: true, "@odata.type": FILE },
      { id: "ref", name: "link", contentType: null, size: 0, isInline: false, "@odata.type": "#microsoft.graph.referenceAttachment" },
      { id: "item", name: "fwd.eml", contentType: null, size: 0, isInline: false, "@odata.type": "#microsoft.graph.itemAttachment" },
    ]);
    const { admin, calls } = makeAdmin();

    const res = await captureAttachmentMetadata({
      admin,
      ...BASE,
      hasAttachments: true,
    });

    expect(res).toEqual({ captured: 1 });
    expect(calls[0].rows).toHaveLength(1);
    expect(calls[0].rows[0].attachment_id).toBe("real");
  });

  it("Test 5: extract switch seeds extraction_status (ON → pending, OFF → not_requested)", async () => {
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "doc.pdf", contentType: "application/pdf", size: 10, isInline: false, "@odata.type": FILE },
    ]);

    // extract ON (sales)
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    const on = makeAdmin();
    await captureAttachmentMetadata({ admin: on.admin, ...BASE, hasAttachments: true });
    expect(on.calls[0].rows[0].extraction_status).toBe("pending");

    // extract OFF (debtor — same code path, registry-only difference)
    loadSwarmMock.mockResolvedValue({
      swarm_type: "debtor-email",
      attachment_config: { capture: true, extract: false },
    });
    const off = makeAdmin();
    await captureAttachmentMetadata({
      admin: off.admin,
      ...BASE,
      swarmType: "debtor-email",
      hasAttachments: true,
    });
    expect(off.calls[0].rows[0].extraction_status).toBe("not_requested");
  });

  it("Test 6: upsert uses onConflict email_id,attachment_id (idempotent)", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "doc.pdf", contentType: "application/pdf", size: 10, isInline: false, "@odata.type": FILE },
    ]);
    const { admin, calls } = makeAdmin();

    await captureAttachmentMetadata({ admin, ...BASE, hasAttachments: true });

    expect(calls[0].onConflict).toBe("email_id,attachment_id");
  });

  it("fail-soft: Graph error → returns { captured: 0 } (ingest never breaks)", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    listAttachmentsMock.mockRejectedValue(new Error("listAttachments 503: boom"));
    const { admin, upsert } = makeAdmin();

    const res = await captureAttachmentMetadata({ admin, ...BASE, hasAttachments: true });

    expect(res).toEqual({ captured: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("fail-soft: upsert error → returns { captured: 0 }", async () => {
    loadSwarmMock.mockResolvedValue(swarmRow(true, true));
    listAttachmentsMock.mockResolvedValue([
      { id: "a1", name: "doc.pdf", contentType: "application/pdf", size: 10, isInline: false, "@odata.type": FILE },
    ]);
    const { admin } = makeAdmin({ upsertError: { message: "db down" } });

    const res = await captureAttachmentMetadata({ admin, ...BASE, hasAttachments: true });

    expect(res).toEqual({ captured: 0 });
  });
});
