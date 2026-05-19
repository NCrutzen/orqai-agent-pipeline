// Phase 83-02 (D-01 + D-02). Pins the fetchMessageBody full-thread contract:
//   - bodyText derives from Graph body.content (FULL THREAD), not uniqueBody.
//   - bodyUniqueText derives from uniqueBody.content (NEW ONLY).
//   - bodyHtml is the raw HTML of body.content.
//   - rawJson is the verbatim Graph message envelope.
//   - $select widens to body,uniqueBody,internetMessageId,conversationId,from,toRecipients,ccRecipients.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock the Zapier SDK so graphFetch is fully controlled. ----------------

type GraphEnvelope = Record<string, unknown>;

let nextEnvelope: GraphEnvelope = {};
let lastRequestedUrl = "";

const zapierFetchMock = vi.fn(async (url: string, _opts: unknown) => {
  lastRequestedUrl = url;
  return {
    ok: true,
    status: 200,
    async json() {
      return nextEnvelope;
    },
    async text() {
      return JSON.stringify(nextEnvelope);
    },
  } as unknown as Response;
});

vi.mock("@zapier/zapier-sdk", () => ({
  createZapierSdk: () => ({ fetch: zapierFetchMock }),
}));

// Import AFTER mocks.
import { fetchMessageBody } from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  lastRequestedUrl = "";
  nextEnvelope = {
    body: {
      contentType: "html",
      content: "<p>FULL THREAD: original debtor msg + Elger reply</p>",
    },
    uniqueBody: {
      contentType: "html",
      content: "<p>NEW ONLY: Elger reply</p>",
    },
    internetMessageId: "<msg@test>",
    conversationId: "AAQk-test-conv",
    from: { emailAddress: { address: "elger@smeba-fire.be" } },
    toRecipients: [],
    ccRecipients: [],
  };
});

describe("fetchMessageBody", () => {
  it("prefers body.content over uniqueBody.content for bodyText (FULL THREAD wins)", async () => {
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-1");
    expect(out.bodyText).toContain("FULL THREAD");
    expect(out.bodyText).not.toContain("NEW ONLY");
  });

  it("exposes uniqueBody.content via bodyUniqueText (NEW ONLY)", async () => {
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-1");
    expect(out.bodyUniqueText).toContain("NEW ONLY");
    expect(out.bodyUniqueText).not.toContain("FULL THREAD");
  });

  it("returns raw HTML of body.content in bodyHtml when contentType is html", async () => {
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-1");
    expect(out.bodyHtml).toBe(
      "<p>FULL THREAD: original debtor msg + Elger reply</p>",
    );
  });

  it("returns the verbatim Graph envelope in rawJson", async () => {
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-1");
    expect(out.rawJson).toBeDefined();
    expect((out.rawJson as Record<string, unknown>).conversationId).toBe(
      "AAQk-test-conv",
    );
    expect((out.rawJson as Record<string, unknown>).internetMessageId).toBe(
      "<msg@test>",
    );
    expect((out.rawJson as Record<string, unknown>).body).toEqual({
      contentType: "html",
      content: "<p>FULL THREAD: original debtor msg + Elger reply</p>",
    });
    expect((out.rawJson as Record<string, unknown>).uniqueBody).toEqual({
      contentType: "html",
      content: "<p>NEW ONLY: Elger reply</p>",
    });
    expect((out.rawJson as Record<string, unknown>).from).toEqual({
      emailAddress: { address: "elger@smeba-fire.be" },
    });
  });

  it("falls back to bodyUniqueText='' when uniqueBody is missing, bodyText still from body", async () => {
    nextEnvelope = {
      body: { contentType: "text", content: "FULL THREAD only — no uniqueBody" },
      internetMessageId: "<msg2@test>",
      conversationId: "AAQk-test-conv-2",
      from: { emailAddress: { address: "x@y.nl" } },
      toRecipients: [],
      ccRecipients: [],
    };
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-2");
    expect(out.bodyText).toContain("FULL THREAD");
    expect(out.bodyUniqueText).toBe("");
  });

  it("strips HTML for both bodyText and bodyUniqueText; bodyHtml is raw HTML of body", async () => {
    nextEnvelope = {
      body: {
        contentType: "html",
        content:
          "<p>FULL THREAD: <b>original</b> + reply</p><script>alert('x')</script>",
      },
      uniqueBody: {
        contentType: "html",
        content: "<p>NEW ONLY: <i>reply</i></p>",
      },
      internetMessageId: "<msg3@test>",
      conversationId: "AAQk-test-conv-3",
      from: { emailAddress: { address: "x@y.nl" } },
      toRecipients: [],
      ccRecipients: [],
    };
    const out = await fetchMessageBody("info@smeba.nl", "msg-id-3");
    // Stripped plain text
    expect(out.bodyText).toContain("FULL THREAD");
    expect(out.bodyText).not.toContain("<b>");
    expect(out.bodyText).not.toContain("<script>");
    expect(out.bodyUniqueText).toContain("NEW ONLY");
    expect(out.bodyUniqueText).not.toContain("<i>");
    // Raw HTML of body preserved (script stays in raw — only stripping strips it)
    expect(out.bodyHtml).toContain("<p>FULL THREAD");
    expect(out.bodyHtml).toContain("<b>original</b>");
  });

  it("widens the Graph $select to include conversationId + internetMessageId + uniqueBody + body", async () => {
    await fetchMessageBody("info@smeba.nl", "msg-id-1");
    expect(lastRequestedUrl).toContain("$select=");
    expect(lastRequestedUrl).toContain("body");
    expect(lastRequestedUrl).toContain("uniqueBody");
    expect(lastRequestedUrl).toContain("conversationId");
    expect(lastRequestedUrl).toContain("internetMessageId");
  });
});
