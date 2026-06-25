// Quick task 260625-9ll (Task 1). Pins the pure folder-id resolve/cache seam of
// moveMessageToFolder:
//   - resolveFolderId looks up by display name, creates the folder when absent,
//     and memoises (mailbox, folderName) → folderId so a second resolve issues
//     ZERO Graph calls.
//   - moveMessageToFolder POSTs /messages/{id}/move with the resolved
//     destinationId, and NEVER throws (returns OutlookActionResult).

import { describe, it, expect, vi, beforeEach } from "vitest";

type GraphCall = { url: string; opts: { method: string; body?: unknown } };

let calls: GraphCall[] = [];
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
import { resolveFolderId, moveMessageToFolder } from "@/lib/outlook/client";

beforeEach(() => {
  zapierFetchMock.mockClear();
  calls = [];
  responseQueue = [];
});

describe("resolveFolderId — lookup / create / cache", () => {
  it("returns an existing folder id and caches it (second resolve issues no Graph call)", async () => {
    // Use a unique folder name so the module-level cache is cold for this test.
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [{ id: "folder-existing", displayName: folder }] } },
    ];

    const first = await resolveFolderId("info@smeba.nl", folder);
    expect(first).toBe("folder-existing");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain("/mailFolders?$filter=");
    expect(calls[0].opts.method).toBe("GET");

    // Second resolve hits the cache → no further Graph call.
    calls = [];
    responseQueue = [];
    const second = await resolveFolderId("info@smeba.nl", folder);
    expect(second).toBe("folder-existing");
    expect(calls).toHaveLength(0);
  });

  it("creates the folder when the display-name lookup returns no match", async () => {
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [] } }, // lookup: empty
      { ok: true, status: 201, json: { id: "folder-created" } }, // create
    ];

    const id = await resolveFolderId("info@smeba.nl", folder);
    expect(id).toBe("folder-created");
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain("/mailFolders");
    expect(calls[1].opts.method).toBe("POST");
    expect(calls[1].opts.body).toEqual({ displayName: folder });
  });

  it("returns null when neither lookup nor create yields an id", async () => {
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [] } }, // lookup: empty
      { ok: false, status: 403, text: "Forbidden" }, // create fails
    ];
    const id = await resolveFolderId("info@smeba.nl", folder);
    expect(id).toBeNull();
  });
});

describe("moveMessageToFolder — best-effort move", () => {
  it("POSTs /move with the resolved destinationId and returns {success:true}", async () => {
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [{ id: "dest-1", displayName: folder }] } }, // resolve
      { ok: true, status: 201, json: {} }, // move
    ];

    const res = await moveMessageToFolder({
      mailbox: "info@smeba.nl",
      messageId: "msg-1",
      folderName: folder,
    });

    expect(res).toEqual({ success: true });
    const moveCall = calls.find((c) => c.url.includes("/move"));
    expect(moveCall).toBeDefined();
    expect(moveCall!.opts.method).toBe("POST");
    expect(moveCall!.opts.body).toEqual({ destinationId: "dest-1" });
  });

  it("returns {success:false} (never throws) when the folder cannot be resolved", async () => {
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [] } }, // lookup empty
      { ok: false, status: 500, text: "boom" }, // create fails
    ];
    const res = await moveMessageToFolder({
      mailbox: "info@smeba.nl",
      messageId: "msg-2",
      folderName: folder,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("Could not resolve or create folder");
  });

  it("returns {success:false} on a non-ok move response", async () => {
    const folder = `AI handled ${Math.random().toString(36).slice(2)}`;
    responseQueue = [
      { ok: true, status: 200, json: { value: [{ id: "dest-2", displayName: folder }] } }, // resolve
      { ok: false, status: 404, text: "not found" }, // move fails
    ];
    const res = await moveMessageToFolder({
      mailbox: "info@smeba.nl",
      messageId: "msg-3",
      folderName: folder,
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain("move 404");
  });
});
