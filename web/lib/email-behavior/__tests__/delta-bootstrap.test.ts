/**
 * Phase 112.5 Plan 03 Task 3 — tests voor de swarm-agnostische delta-client.
 *
 * deltaPage() pagineert één per-folder delta-stroom via @odata.nextLink ->
 * @odata.deltaLink (Pattern 1) en suppress't signalen op de bootstrap-sync én op
 * een 410-resync (Pitfall 2). bucketForFolderPath() bucket't ancestry-aware: een
 * pad waarvan ÉÉN segment op 'afgehandeld' matcht erft de afgehandeld-bucket
 * (112.5-01 empirische fix: jaar-submappen onder Inbox/afgehandeld).
 *
 * graphFetch wordt gemockt — geen netwerk.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const graphFetchMock = vi.fn();
vi.mock("@/lib/outlook/client", () => ({
  graphFetch: (...args: unknown[]) => graphFetchMock(...args),
}));

import { deltaPage, bucketForFolderPath } from "../delta-client";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  graphFetchMock.mockReset();
});

describe("deltaPage — bootstrap-pad", () => {
  it("(a) bootstrap (deltaLinkOrNull=null) zet wasBootstrap=true + geeft deltaLink terug", async () => {
    graphFetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: "m1", parentFolderId: "F-inbox" }],
        "@odata.deltaLink": "https://graph/delta?token=DELTA1",
      }),
    );

    const res = await deltaPage({
      mailbox: "verkoop@smeba.nl",
      folderId: "F-inbox",
      deltaLinkOrNull: null,
      prefer: 'IdType="ImmutableId", odata.maxpagesize=100',
    });

    expect(res.wasBootstrap).toBe(true);
    expect(res.deltaLink).toBe("https://graph/delta?token=DELTA1");
    expect(res.events).toHaveLength(1);
    // elk event draagt _folderId-context
    expect(res.events[0]._folderId).toBe("F-inbox");
    // graphFetch werd MET prefer aangeroepen
    expect(graphFetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ prefer: 'IdType="ImmutableId", odata.maxpagesize=100' }),
    );
  });

  it("pagineert via @odata.nextLink tot de deltaLink verschijnt", async () => {
    graphFetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "m1", parentFolderId: "F-inbox" }],
          "@odata.nextLink": "https://graph/delta?page=2",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "m2", parentFolderId: "F-inbox" }],
          "@odata.deltaLink": "https://graph/delta?token=DELTA2",
        }),
      );

    const res = await deltaPage({
      mailbox: "verkoop@smeba.nl",
      folderId: "F-inbox",
      deltaLinkOrNull: null,
      prefer: "x",
    });

    expect(res.events.map((e) => e.id)).toEqual(["m1", "m2"]);
    expect(res.deltaLink).toBe("https://graph/delta?token=DELTA2");
    expect(graphFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("deltaPage — vervolg-pad", () => {
  it("(b) start vanaf een bestaande deltaLink -> alleen changes, wasBootstrap=false", async () => {
    graphFetchMock.mockResolvedValueOnce(
      jsonResponse({
        value: [{ id: "m9", parentFolderId: "F-inbox" }],
        "@odata.deltaLink": "https://graph/delta?token=DELTA3",
      }),
    );

    const res = await deltaPage({
      mailbox: "verkoop@smeba.nl",
      folderId: "F-inbox",
      deltaLinkOrNull: "https://graph/delta?token=PREV",
      prefer: "x",
    });

    expect(res.wasBootstrap).toBe(false);
    expect(res.events).toHaveLength(1);
    expect(res.deltaLink).toBe("https://graph/delta?token=DELTA3");
    // begon vanaf de meegegeven deltaLink
    expect(graphFetchMock).toHaveBeenCalledWith(
      "https://graph/delta?token=PREV",
      expect.any(Object),
    );
  });
});

describe("deltaPage — 410-resync (Pitfall 2)", () => {
  it("(c) 410 resyncRequired gooit token weg, herstart als bootstrap, wasBootstrap=true", async () => {
    graphFetchMock
      // eerste call op de oude deltaLink -> 410
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: "resyncRequired" } }, false, 410),
      )
      // resync vanaf bootstrap-URL
      .mockResolvedValueOnce(
        jsonResponse({
          value: [{ id: "m10", parentFolderId: "F-inbox" }],
          "@odata.deltaLink": "https://graph/delta?token=DELTA4",
        }),
      );

    const res = await deltaPage({
      mailbox: "verkoop@smeba.nl",
      folderId: "F-inbox",
      deltaLinkOrNull: "https://graph/delta?token=STALE",
      prefer: "x",
    });

    expect(res.wasBootstrap).toBe(true);
    expect(res.deltaLink).toBe("https://graph/delta?token=DELTA4");
    expect(res.events.map((e) => e.id)).toEqual(["m10"]);
    expect(graphFetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("bucketForFolderPath — ancestry-aware (112.5-01 empirische fix)", () => {
  it("path met 'afgehandeld'-voorouder erft de afgehandeld-bucket", () => {
    expect(bucketForFolderPath("Inbox/afgehandeld/2024")).toBe("afgehandeld");
    expect(bucketForFolderPath("Inbox/afgehandeld/2025")).toBe("afgehandeld");
    expect(bucketForFolderPath("Postvak IN/afgehandeld 2022/sub")).toBe("afgehandeld");
  });

  it("top-level '2024' zonder afgehandeld-voorouder -> other", () => {
    expect(bucketForFolderPath("2024")).toBe("other");
  });

  it("valt terug op bucketForFolderName van het laatste segment", () => {
    expect(bucketForFolderPath("Inbox")).toBe("inbox");
    expect(bucketForFolderPath("Some/Nested/Archief")).toBe("archive");
    expect(bucketForFolderPath("Verzonden items")).toBe("sent");
  });
});
