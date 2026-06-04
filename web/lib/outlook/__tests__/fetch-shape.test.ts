// Phase 114-03 Task 2 (D-14). Regression guard for the ingest-gap fix:
//   - fetchMessageBody/getMessageMeta surface `hasAttachments` from Graph.
//   - sender extraction prefers `from`, falls back to Graph `sender` when
//     `from` is empty/absent (drafts / delegated / shared-mailbox sends).
//   - neither `from` nor `sender` → empty string (ingest then writes null),
//     documenting the residual gap.

import { describe, it, expect, vi, beforeEach } from "vitest";

type GraphEnvelope = Record<string, unknown>;

let nextEnvelope: GraphEnvelope = {};

const zapierFetchMock = vi.fn(async (_url: string, _opts: unknown) => {
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
import { fetchMessageBody, getMessageMeta } from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  nextEnvelope = {};
});

describe("fetchMessageBody — Phase 114-03 sender + attachment shape", () => {
  it("populated `from` → meta.from is that address; hasAttachments propagated", async () => {
    nextEnvelope = {
      body: { contentType: "text", content: "hi" },
      from: { emailAddress: { address: "buyer@klant.nl", name: "Buyer" } },
      hasAttachments: true,
    };
    const out = await fetchMessageBody("verkoop@smeba.nl", "m1");
    expect(out.from).toBe("buyer@klant.nl");
    expect(out.fromName).toBe("Buyer");
    expect(out.hasAttachments).toBe(true);
  });

  it("empty `from` but populated `sender` → sender address used (fallback)", async () => {
    nextEnvelope = {
      body: { contentType: "text", content: "hi" },
      from: { emailAddress: { address: "", name: "" } },
      sender: { emailAddress: { address: "delegate@smeba.nl", name: "Delegate" } },
      hasAttachments: false,
    };
    const out = await fetchMessageBody("verkoop@smeba.nl", "m2");
    expect(out.from).toBe("delegate@smeba.nl");
    expect(out.fromName).toBe("Delegate");
  });

  it("hasAttachments:true → out.hasAttachments === true", async () => {
    nextEnvelope = {
      body: { contentType: "text", content: "hi" },
      from: { emailAddress: { address: "x@y.nl" } },
      hasAttachments: true,
    };
    const out = await fetchMessageBody("verkoop@smeba.nl", "m3");
    expect(out.hasAttachments).toBe(true);
  });

  it("neither `from` nor `sender` → empty string (ingest writes null)", async () => {
    nextEnvelope = {
      body: { contentType: "text", content: "hi" },
      hasAttachments: false,
    };
    const out = await fetchMessageBody("verkoop@smeba.nl", "m4");
    expect(out.from).toBe("");
    expect(out.fromName).toBe("");
    expect(out.hasAttachments).toBe(false);
  });
});

describe("getMessageMeta — Phase 114-03 sender + attachment shape", () => {
  it("populated `from` → meta.from is that address; hasAttachments propagated", async () => {
    nextEnvelope = {
      subject: "Offerte aanvraag",
      from: { emailAddress: { address: "buyer@klant.nl", name: "Buyer" } },
      hasAttachments: true,
    };
    const out = await getMessageMeta("verkoop@smeba.nl", "m1");
    expect(out.from).toBe("buyer@klant.nl");
    expect(out.fromName).toBe("Buyer");
    expect(out.hasAttachments).toBe(true);
  });

  it("empty `from` but populated `sender` → sender address used (fallback)", async () => {
    nextEnvelope = {
      subject: "x",
      from: { emailAddress: { address: "" } },
      sender: { emailAddress: { address: "delegate@smeba.nl", name: "Delegate" } },
      hasAttachments: false,
    };
    const out = await getMessageMeta("verkoop@smeba.nl", "m2");
    expect(out.from).toBe("delegate@smeba.nl");
    expect(out.fromName).toBe("Delegate");
  });

  it("neither `from` nor `sender` → empty string (ingest writes null)", async () => {
    nextEnvelope = { subject: "x", hasAttachments: false };
    const out = await getMessageMeta("verkoop@smeba.nl", "m4");
    expect(out.from).toBe("");
    expect(out.fromName).toBe("");
    expect(out.hasAttachments).toBe(false);
  });

  it("widens $select to request from, sender, hasAttachments", async () => {
    nextEnvelope = { subject: "x", from: { emailAddress: { address: "a@b.nl" } } };
    await getMessageMeta("verkoop@smeba.nl", "m5");
    const url = zapierFetchMock.mock.calls[0]?.[0] as string;
    expect(url).toContain("sender");
    expect(url).toContain("hasAttachments");
  });
});
