// Phase 132 Plan 01 (Task 2, D-01). Pins the forwardMessage 2-call draft flow:
//   - createForward (POST) → send (POST), both via graphFetch (conn 56014785).
//   - NO replyTo PATCH: Exchange strips replyTo on send for the shared mailbox
//     (2026-06-18 smoke), so the original sender is conveyed in the forward
//     COMMENT instead (D-01 sender-in-comment fallback).
//   - createForward body carries ONLY message.toRecipients + comment — never
//     message.body alongside comment (Pitfall 1).
//   - NEVER throws: any non-ok Graph response returns {success:false}.

import { describe, it, expect, vi, beforeEach } from "vitest";

type GraphCall = { url: string; opts: { method: string; body?: unknown } };

let calls: GraphCall[] = [];
// Queue of canned responses, consumed FIFO per call.
let responseQueue: Array<{ ok: boolean; status: number; json?: unknown; text?: string }> = [];

const zapierFetchMock = vi.fn(
  async (url: string, opts: { method: string; body?: string }) => {
    calls.push({
      url,
      opts: {
        method: opts.method,
        body: opts.body ? JSON.parse(opts.body) : undefined,
      },
    });
    const r = responseQueue.shift() ?? { ok: true, status: 200, json: {} };
    return {
      ok: r.ok,
      status: r.status,
      async json() {
        return r.json ?? {};
      },
      async text() {
        return r.text ?? JSON.stringify(r.json ?? {});
      },
    } as unknown as Response;
  },
);

vi.mock("@zapier/zapier-sdk", () => ({
  createZapierSdk: () => ({ fetch: zapierFetchMock }),
}));

// Import AFTER mocks.
import { forwardMessage } from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  calls = [];
  responseQueue = [];
});

describe("forwardMessage — 2-call draft flow (D-01)", () => {
  it("issues createForward then send (exactly 2 Graph calls, no replyTo PATCH)", async () => {
    responseQueue = [
      { ok: true, status: 201, json: { id: "draft-1", isDraft: true } }, // createForward
      { ok: true, status: 202, json: {} }, // send
    ];

    const res = await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "msg-abc",
      toMailbox: "storingen@smeba.nl",
      originalSender: "klant@example.com",
    });

    expect(res).toEqual({ success: true });
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/messages/msg-abc/createForward");
    expect(calls[0].opts.method).toBe("POST");
    expect(calls[1].url).toContain("/messages/draft-1/send");
    expect(calls[1].opts.method).toBe("POST");
    // No PATCH anywhere (replyTo is a silent no-op for the shared mailbox).
    expect(calls.some((c) => c.opts.method === "PATCH")).toBe(false);
  });

  it("issues both calls against the SOURCE mailbox (Pitfall 3), toMailbox only in toRecipients, no message.body (Pitfall 1)", async () => {
    responseQueue = [
      { ok: true, status: 201, json: { id: "draft-2" } },
      { ok: true, status: 202, json: {} },
    ];

    await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "msg-xyz",
      toMailbox: "verkoop@smeba.nl",
      originalSender: "klant@example.com",
    });

    expect(calls[0].url).toContain("/users/info%40smeba.nl/");
    expect(calls[1].url).toContain("/users/info%40smeba.nl/");
    const body = calls[0].opts.body as {
      message: {
        toRecipients: Array<{ emailAddress: { address: string } }>;
        body?: unknown;
      };
      comment: string;
    };
    expect(body.message.toRecipients).toEqual([
      { emailAddress: { address: "verkoop@smeba.nl" } },
    ]);
    // Pitfall 1: never both comment and message.body.
    expect(body.message.body).toBeUndefined();
    expect(typeof body.comment).toBe("string");
  });

  it("embeds the original sender in the forward comment, and appends an optional extra comment", async () => {
    responseQueue = [
      { ok: true, status: 201, json: { id: "draft-3" } },
      { ok: true, status: 202, json: {} },
    ];

    await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "msg-1",
      toMailbox: "storingen@smeba.nl",
      originalSender: "verzender@klant.nl",
      comment: "Spoed.",
    });

    const body = calls[0].opts.body as { comment: string };
    expect(body.comment).toContain("verzender@klant.nl");
    expect(body.comment).toContain("oorspronkelijke afzender");
    expect(body.comment).toContain("Spoed.");
  });

  it("returns {success:false} (never throws) on createForward non-ok, missing draft id, or send non-ok", async () => {
    // createForward 403 → no send attempted
    responseQueue = [{ ok: false, status: 403, text: "Forbidden" }];
    const r1 = await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "m1",
      toMailbox: "storingen@smeba.nl",
      originalSender: "x@y.nl",
    });
    expect(r1.success).toBe(false);
    expect(r1.error).toContain("createForward 403");
    expect(calls).toHaveLength(1);

    // createForward ok but draft id missing → no send attempted
    calls = [];
    responseQueue = [{ ok: true, status: 200, json: {} }];
    const r2 = await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "m2",
      toMailbox: "storingen@smeba.nl",
      originalSender: "x@y.nl",
    });
    expect(r2.success).toBe(false);
    expect(r2.error).toContain("draft id missing");
    expect(calls).toHaveLength(1);

    // send non-ok → {success:false}
    calls = [];
    responseQueue = [
      { ok: true, status: 201, json: { id: "draft-5" } },
      { ok: false, status: 500, text: "boom" },
    ];
    const r3 = await forwardMessage({
      mailbox: "info@smeba.nl",
      messageId: "m3",
      toMailbox: "storingen@smeba.nl",
      originalSender: "x@y.nl",
    });
    expect(r3.success).toBe(false);
    expect(r3.error).toContain("send 500");
  });
});
