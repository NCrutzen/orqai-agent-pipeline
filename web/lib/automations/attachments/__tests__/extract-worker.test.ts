// Phase 116-04 Task 2 — pins the shared extractEmailAttachments helper.
//
// This helper OWNS the per-email download→store→extract→row-update loop so the
// Plan 06 backfill reuses the exact same implementation (no drift). It is
// swarm-agnostic (no === 'sales'/'debtor'), fail-soft per attachment (D-03),
// and replay-safe (deterministic storage keys, no randomUUID/Date.now in keys).
//
// Mocks: downloadAttachmentValue (Graph) + extractAttachment (pure service) +
// a Supabase admin double whose storage.upload and table .update are spies.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the Graph downloader ---------------------------------------------
const downloadAttachmentValueMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  downloadAttachmentValue: (...args: unknown[]) =>
    downloadAttachmentValueMock(...args),
}));

// ---- Mock the pure extraction service --------------------------------------
const extractAttachmentMock = vi.fn();
vi.mock("@/lib/automations/attachments/extract", () => ({
  extractAttachment: (...args: unknown[]) => extractAttachmentMock(...args),
}));

// Import AFTER mocks.
import { extractEmailAttachments } from "@/lib/automations/attachments/extract-worker";

// ---- Supabase admin double --------------------------------------------------
// Captures storage uploads + per-row table updates so tests can assert the
// deterministic key, the upsert flag, and the row patch (status/text/key).
interface UploadCall {
  key: string;
  opts?: { contentType?: string; upsert?: boolean };
}
interface UpdateCall {
  patch: Record<string, unknown>;
  eqColumn: string;
  eqValue: unknown;
}

function makeAdmin(opts: { uploadError?: { message: string } } = {}) {
  const uploads: UploadCall[] = [];
  const updates: UpdateCall[] = [];

  const upload = vi.fn(
    (key: string, _buf: unknown, o?: { contentType?: string; upsert?: boolean }) => {
      uploads.push({ key, opts: o });
      return Promise.resolve({ error: opts.uploadError ?? null });
    },
  );
  const storageFrom = vi.fn(() => ({ upload }));
  const storage = { from: storageFrom };

  // admin.schema("email_pipeline").from("email_attachments").update(patch).eq(col, val)
  const update = vi.fn((patch: Record<string, unknown>) => ({
    eq: vi.fn((eqColumn: string, eqValue: unknown) => {
      updates.push({ patch, eqColumn, eqValue });
      return Promise.resolve({ error: null });
    }),
  }));
  const tableFrom = vi.fn(() => ({ update }));
  const schema = vi.fn(() => ({ from: tableFrom }));

  return {
    admin: { storage, schema } as never,
    uploads,
    updates,
    upload,
    update,
    storageFrom,
    schema,
  };
}

const CAPS = {
  maxSizeBytes: 26214400,
  maxVisionPages: 15,
  maxExtractedChars: 200000,
  maxAttachmentsPerMail: 20,
};

function pendingRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "att-row-1",
    attachment_id: "graph-att-1",
    filename: "po.pdf",
    content_type: "application/pdf",
    extraction_status: "pending",
    ...over,
  };
}

const BASE = {
  emailId: "email-uuid-1",
  mailbox: "verkoop@smeba.nl",
  messageId: "msg-1",
  caps: CAPS,
};

beforeEach(() => {
  downloadAttachmentValueMock.mockReset();
  extractAttachmentMock.mockReset();
});

describe("extractEmailAttachments", () => {
  it("A1: one pending PDF → download → deterministic-key upload → extract → row updated extracted", async () => {
    const bytes = new ArrayBuffer(8);
    downloadAttachmentValueMock.mockResolvedValue(bytes);
    extractAttachmentMock.mockResolvedValue({ status: "extracted", text: "PO 12345" });
    const { admin, uploads, updates } = makeAdmin();

    const res = await extractEmailAttachments({
      admin,
      ...BASE,
      rows: [pendingRow()],
    });

    // Graph download called with (mailbox, messageId, attachment_id).
    expect(downloadAttachmentValueMock).toHaveBeenCalledWith(
      "verkoop@smeba.nl",
      "msg-1",
      "graph-att-1",
    );
    // Deterministic key ${email_id}/${attachment_id}.<ext>; upsert:true.
    expect(uploads).toHaveLength(1);
    expect(uploads[0].key).toBe("email-uuid-1/graph-att-1.pdf");
    expect(uploads[0].opts?.upsert).toBe(true);
    // extractAttachment called.
    expect(extractAttachmentMock).toHaveBeenCalledTimes(1);
    // Row updated: text + status + storage_key.
    expect(updates).toHaveLength(1);
    expect(updates[0].patch.extracted_text).toBe("PO 12345");
    expect(updates[0].patch.extraction_status).toBe("extracted");
    expect(updates[0].patch.storage_key).toBe("email-uuid-1/graph-att-1.pdf");
    expect(updates[0].eqValue).toBe("att-row-1");
    expect(res).toEqual({ extracted: 1, failed: 0, source_gone: 0 });
  });

  it("A2: extractAttachment returns extraction_failed → that row failed, OTHER rows still process (fail-soft)", async () => {
    downloadAttachmentValueMock.mockResolvedValue(new ArrayBuffer(8));
    extractAttachmentMock
      .mockResolvedValueOnce({ status: "extraction_failed", text: "" })
      .mockResolvedValueOnce({ status: "extracted", text: "ok" });
    const { admin, updates } = makeAdmin();

    const res = await extractEmailAttachments({
      admin,
      ...BASE,
      rows: [
        pendingRow({ id: "row-a", attachment_id: "att-a" }),
        pendingRow({ id: "row-b", attachment_id: "att-b" }),
      ],
    });

    expect(updates).toHaveLength(2);
    expect(updates[0].patch.extraction_status).toBe("extraction_failed");
    expect(updates[1].patch.extraction_status).toBe("extracted");
    expect(res).toEqual({ extracted: 1, failed: 1, source_gone: 0 });
  });

  it("A3: Graph 404 on download → row source_gone, loop continues", async () => {
    downloadAttachmentValueMock
      .mockRejectedValueOnce(new Error("attachment $value 404: Not Found"))
      .mockResolvedValueOnce(new ArrayBuffer(8));
    extractAttachmentMock.mockResolvedValue({ status: "extracted", text: "ok" });
    const { admin, updates } = makeAdmin();

    const res = await extractEmailAttachments({
      admin,
      ...BASE,
      rows: [
        pendingRow({ id: "row-a", attachment_id: "att-a" }),
        pendingRow({ id: "row-b", attachment_id: "att-b" }),
      ],
    });

    expect(updates[0].patch.extraction_status).toBe("source_gone");
    expect(updates[1].patch.extraction_status).toBe("extracted");
    expect(res).toEqual({ extracted: 1, failed: 0, source_gone: 1 });
  });

  it("A4: count is capped at caps.maxAttachmentsPerMail", async () => {
    downloadAttachmentValueMock.mockResolvedValue(new ArrayBuffer(8));
    extractAttachmentMock.mockResolvedValue({ status: "extracted", text: "ok" });
    const { admin } = makeAdmin();

    const rows = Array.from({ length: 5 }, (_, i) =>
      pendingRow({ id: `row-${i}`, attachment_id: `att-${i}` }),
    );

    const res = await extractEmailAttachments({
      admin,
      ...BASE,
      caps: { ...CAPS, maxAttachmentsPerMail: 2 },
      rows,
    });

    // Only 2 processed.
    expect(downloadAttachmentValueMock).toHaveBeenCalledTimes(2);
    expect(res.extracted).toBe(2);
  });

  it("never returns extracted text (only ids/counts) — DoS guard T-116-11", async () => {
    downloadAttachmentValueMock.mockResolvedValue(new ArrayBuffer(8));
    extractAttachmentMock.mockResolvedValue({ status: "extracted", text: "a".repeat(5000) });
    const { admin } = makeAdmin();
    const res = await extractEmailAttachments({ admin, ...BASE, rows: [pendingRow()] });
    expect(JSON.stringify(res)).not.toContain("aaaa");
  });
});
