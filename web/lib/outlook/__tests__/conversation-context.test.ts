// Phase 83-04 (D-04). Pins the fetchConversationMessages helper contract:
//   - Filters by Graph conversationId; orders newest-first; excludes the current
//     message id; caps to topN.
//   - HTML body content is stripped to plain text in `bodyText`.
//   - Empty/null conversationId throws TypeError (callers must guard).
//   - Each returned object has { sourceMessageId, senderEmail, subject, receivedAt, bodyText }.

import { describe, it, expect, vi, beforeEach } from "vitest";

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
import { fetchConversationMessages } from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  lastRequestedUrl = "";
  nextEnvelope = {
    value: [
      {
        id: "A",
        subject: "Re: invoice 123",
        from: { emailAddress: { address: "current@x.com" } },
        receivedDateTime: "2026-05-19T10:00:00Z",
        body: { contentType: "text", content: "current" },
      },
      {
        id: "B",
        subject: "Re: invoice 123",
        from: { emailAddress: { address: "elger@smeba-fire.be" } },
        receivedDateTime: "2026-05-18T09:00:00Z",
        body: { contentType: "html", content: "<p>elger reply</p>" },
      },
      {
        id: "C",
        subject: "invoice 123",
        from: { emailAddress: { address: "debtor@cbre.com" } },
        receivedDateTime: "2026-05-17T08:00:00Z",
        body: { contentType: "html", content: "<p>original debtor msg</p>" },
      },
    ],
  };
});

describe("fetchConversationMessages", () => {
  it("excludes current message and returns next 2 newest-first", async () => {
    const out = await fetchConversationMessages(
      "info@smeba.nl",
      "cid-X",
      "A",
      2,
    );
    expect(out).toHaveLength(2);
    expect(out[0].sourceMessageId).toBe("B");
    expect(out[1].sourceMessageId).toBe("C");
  });

  it("strips HTML body content to plain text in bodyText", async () => {
    const out = await fetchConversationMessages(
      "info@smeba.nl",
      "cid-X",
      "A",
      2,
    );
    expect(out[0].bodyText).toContain("elger reply");
    expect(out[0].bodyText).not.toContain("<p>");
    expect(out[1].bodyText).toContain("original debtor msg");
    expect(out[1].bodyText).not.toContain("<p>");
  });

  it("returns [] when only the current message exists", async () => {
    nextEnvelope = {
      value: [
        {
          id: "A",
          subject: "Re: invoice 123",
          from: { emailAddress: { address: "current@x.com" } },
          receivedDateTime: "2026-05-19T10:00:00Z",
          body: { contentType: "text", content: "current" },
        },
      ],
    };
    const out = await fetchConversationMessages(
      "info@smeba.nl",
      "cid-X",
      "A",
      2,
    );
    expect(out).toEqual([]);
  });

  it("throws TypeError when conversationId is empty string", async () => {
    await expect(
      fetchConversationMessages("info@smeba.nl", "", "A", 2),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("each returned object has the expected shape", async () => {
    const out = await fetchConversationMessages(
      "info@smeba.nl",
      "cid-X",
      "A",
      2,
    );
    for (const p of out) {
      expect(p).toHaveProperty("sourceMessageId");
      expect(p).toHaveProperty("senderEmail");
      expect(p).toHaveProperty("subject");
      expect(p).toHaveProperty("receivedAt");
      expect(p).toHaveProperty("bodyText");
    }
    expect(out[0].senderEmail).toBe("elger@smeba-fire.be");
    expect(out[0].subject).toBe("Re: invoice 123");
    expect(out[0].receivedAt).toBe("2026-05-18T09:00:00Z");
  });

  it("respects the topN cap (5 priors, topN=2 -> returns 2)", async () => {
    nextEnvelope = {
      value: [
        {
          id: "A",
          subject: "current",
          from: { emailAddress: { address: "current@x.com" } },
          receivedDateTime: "2026-05-19T10:00:00Z",
          body: { contentType: "text", content: "current" },
        },
        {
          id: "P1",
          subject: "p1",
          from: { emailAddress: { address: "a@x.com" } },
          receivedDateTime: "2026-05-18T10:00:00Z",
          body: { contentType: "text", content: "p1" },
        },
        {
          id: "P2",
          subject: "p2",
          from: { emailAddress: { address: "b@x.com" } },
          receivedDateTime: "2026-05-17T10:00:00Z",
          body: { contentType: "text", content: "p2" },
        },
        {
          id: "P3",
          subject: "p3",
          from: { emailAddress: { address: "c@x.com" } },
          receivedDateTime: "2026-05-16T10:00:00Z",
          body: { contentType: "text", content: "p3" },
        },
        {
          id: "P4",
          subject: "p4",
          from: { emailAddress: { address: "d@x.com" } },
          receivedDateTime: "2026-05-15T10:00:00Z",
          body: { contentType: "text", content: "p4" },
        },
        {
          id: "P5",
          subject: "p5",
          from: { emailAddress: { address: "e@x.com" } },
          receivedDateTime: "2026-05-14T10:00:00Z",
          body: { contentType: "text", content: "p5" },
        },
      ],
    };
    const out = await fetchConversationMessages(
      "info@smeba.nl",
      "cid-X",
      "A",
      2,
    );
    expect(out).toHaveLength(2);
    expect(out[0].sourceMessageId).toBe("P1");
    expect(out[1].sourceMessageId).toBe("P2");
  });

  it("issues a Graph $filter=conversationId eq query without $orderby (Phase 83 hot-fix — InefficientFilter sidestep, sort client-side)", async () => {
    await fetchConversationMessages("info@smeba.nl", "cid-X", "A", 2);
    expect(lastRequestedUrl).toContain("conversationId%20eq%20'cid-X'");
    expect(lastRequestedUrl).not.toContain("$orderby");
  });
});
