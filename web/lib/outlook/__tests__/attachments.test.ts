// Phase 116-02 Task 1 — pins the listAttachments + downloadAttachmentValue
// Graph helpers. Both route through the single graphFetch credential boundary
// (mocked at the Zapier SDK level, matching the existing outlook client tests).
//
// Contract:
//   - listAttachments builds /attachments?$select=... (metadata only, NO
//     contentBytes), zod-validates the value[] payload, throws on non-OK.
//   - downloadAttachmentValue builds /attachments/{id}/$value, returns raw
//     bytes via res.arrayBuffer(), throws on non-OK.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the Zapier SDK so graphFetch is fully controlled. ----------------

type GraphEnvelope = Record<string, unknown>;

let nextJson: GraphEnvelope = {};
let nextBytes: ArrayBuffer = new ArrayBuffer(0);
let nextOk = true;
let nextStatus = 200;
let lastRequestedUrl = "";

const zapierFetchMock = vi.fn(async (url: string, _opts: unknown) => {
  lastRequestedUrl = url;
  return {
    ok: nextOk,
    status: nextStatus,
    async json() {
      return nextJson;
    },
    async text() {
      return JSON.stringify(nextJson);
    },
    async arrayBuffer() {
      return nextBytes;
    },
  } as unknown as Response;
});

vi.mock("@zapier/zapier-sdk", () => ({
  createZapierSdk: () => ({ fetch: zapierFetchMock }),
}));

// Import AFTER mocks.
import {
  listAttachments,
  downloadAttachmentValue,
} from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  lastRequestedUrl = "";
  nextJson = {};
  nextBytes = new ArrayBuffer(0);
  nextOk = true;
  nextStatus = 200;
});

describe("listAttachments", () => {
  it("builds the metadata $select URL (encoded) and returns value[]", async () => {
    nextJson = {
      value: [
        {
          id: "att-1",
          name: "quote.pdf",
          contentType: "application/pdf",
          size: 12345,
          isInline: false,
          "@odata.type": "#microsoft.graph.fileAttachment",
        },
      ],
    };

    const out = await listAttachments("verkoop@smeba.nl", "msg-123");

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("att-1");
    expect(out[0].name).toBe("quote.pdf");
    expect(out[0].contentType).toBe("application/pdf");

    // mailbox + messageId encoded
    expect(lastRequestedUrl).toContain(
      `/users/${encodeURIComponent("verkoop@smeba.nl")}/messages/${encodeURIComponent("msg-123")}/attachments`,
    );
    // metadata projection, NEVER contentBytes
    expect(lastRequestedUrl).toContain("$select=");
    expect(lastRequestedUrl).not.toContain("contentBytes");
    // Graph 400s if @odata.type is in $select — it is returned by default, so it
    // must NOT be selected (regression guard: selecting it broke every capture).
    expect(lastRequestedUrl).not.toContain("@odata.type");
  });

  it("throws on a non-OK response with the status in the message", async () => {
    nextOk = false;
    nextStatus = 502;
    nextJson = { error: "boom" };

    await expect(
      listAttachments("verkoop@smeba.nl", "msg-err"),
    ).rejects.toThrow(/502/);
  });
});

describe("downloadAttachmentValue", () => {
  it("builds the /$value URL (encoded) and returns the raw bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    nextBytes = bytes;

    const out = await downloadAttachmentValue(
      "verkoop@smeba.nl",
      "msg-123",
      "att-1",
    );

    expect(out).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3, 4]));

    expect(lastRequestedUrl).toContain(
      `/users/${encodeURIComponent("verkoop@smeba.nl")}/messages/${encodeURIComponent("msg-123")}/attachments/${encodeURIComponent("att-1")}/$value`,
    );
  });

  it("throws on a non-OK response with the status in the message", async () => {
    nextOk = false;
    nextStatus = 404;

    await expect(
      downloadAttachmentValue("verkoop@smeba.nl", "msg-x", "att-x"),
    ).rejects.toThrow(/404/);
  });
});
