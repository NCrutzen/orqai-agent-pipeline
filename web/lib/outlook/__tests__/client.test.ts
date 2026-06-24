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

// Per-method/URL routing override. When set, the mock consults this resolver
// first (used by the masterCategories tests, which need GET vs POST awareness).
// Falls back to `nextEnvelope` when the resolver returns undefined.
type GraphHandler = (
  url: string,
  opts: { method?: string; body?: string },
) => GraphEnvelope | undefined;
let graphHandler: GraphHandler | null = null;

const zapierFetchMock = vi.fn(async (url: string, opts: unknown) => {
  lastRequestedUrl = url;
  const o = (opts ?? {}) as { method?: string; body?: string };
  const routed = graphHandler ? graphHandler(url, o) : undefined;
  const payload = routed ?? nextEnvelope;
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  } as unknown as Response;
});

vi.mock("@zapier/zapier-sdk", () => ({
  createZapierSdk: () => ({ fetch: zapierFetchMock }),
}));

// Import AFTER mocks.
import {
  fetchMessageBody,
  ensureRoutingMasterCategories,
  ROUTING_CATEGORY_PRESET_COLOR,
} from "@/lib/outlook/client";
import { buildRoutingCategory } from "@/lib/outlook/routing-category";

beforeEach(() => {
  zapierFetchMock.mockClear();
  lastRequestedUrl = "";
  graphHandler = null;
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

// ---------------------------------------------------------------------------
// Phase 132.1 Plan 02 (D-03): ensureRoutingMasterCategories — provision ONE
// non-grey Outlook preset colour for ALL routing master categories so operators
// distinguish routing labels from the grey `AI:` intent labels at a glance.
// Idempotent: GET existing masterCategories, POST only the MISSING routing names.
// ---------------------------------------------------------------------------

describe("ensureRoutingMasterCategories (D-03 non-grey colour provisioning)", () => {
  const MAILBOX = "info@smeba.nl";
  const BUCKETS = ["storingen", "facturen"];

  // The full desired routing display-name set sourced from buildRoutingCategory
  // (NOT hard-coded literals) — static labels + per-bucket variants.
  function desiredRoutingNames(buckets: string[]): string[] {
    const names: string[] = [
      buildRoutingCategory("triage"),
      buildRoutingCategory("algemeen"),
    ];
    for (const b of buckets) {
      names.push(buildRoutingCategory("held", b));
      names.push(buildRoutingCategory("forwarded", b));
      names.push(buildRoutingCategory("dedup", b));
    }
    return names;
  }

  // Capture every POST body the ensure-call issues, GET returns `existing`.
  function capturePosts(existing: Array<{ displayName: string; color?: string }>) {
    const posted: Array<{ displayName: string; color: string }> = [];
    graphHandler = (url, opts) => {
      if (!url.includes("/outlook/masterCategories")) return undefined;
      const method = (opts.method ?? "GET").toUpperCase();
      if (method === "GET") {
        return { value: existing };
      }
      if (method === "POST") {
        const body = JSON.parse(opts.body ?? "{}") as {
          displayName: string;
          color: string;
        };
        posted.push(body);
        return { id: `cat-${posted.length}`, ...body };
      }
      return undefined;
    };
    return posted;
  }

  it("preset colour is non-grey (not preset0)", () => {
    expect(ROUTING_CATEGORY_PRESET_COLOR).not.toBe("preset0");
    expect(ROUTING_CATEGORY_PRESET_COLOR).toMatch(/^preset([1-9]|1\d|2[0-4])$/);
  });

  it("empty existing → POSTs once per routing display name, each with the SAME non-grey preset", async () => {
    const posted = capturePosts([]);
    await ensureRoutingMasterCategories(MAILBOX, BUCKETS);

    const expectedNames = desiredRoutingNames(BUCKETS);
    expect(posted).toHaveLength(expectedNames.length);
    for (const p of posted) {
      expect(p.color).toBe(ROUTING_CATEGORY_PRESET_COLOR);
      expect(p.color).not.toBe("preset0");
    }
    expect(new Set(posted.map((p) => p.displayName))).toEqual(
      new Set(expectedNames),
    );
  });

  it("display names match buildRoutingCategory exactly for a bucket + the static labels", async () => {
    const posted = capturePosts([]);
    await ensureRoutingMasterCategories(MAILBOX, ["storingen"]);
    const names = new Set(posted.map((p) => p.displayName));
    expect(names.has(buildRoutingCategory("triage"))).toBe(true);
    expect(names.has(buildRoutingCategory("algemeen"))).toBe(true);
    expect(names.has(buildRoutingCategory("held", "storingen"))).toBe(true);
    expect(names.has(buildRoutingCategory("forwarded", "storingen"))).toBe(true);
    expect(names.has(buildRoutingCategory("dedup", "storingen"))).toBe(true);
  });

  it("idempotent — all routing categories already present → zero POSTs", async () => {
    const existing = desiredRoutingNames(BUCKETS).map((displayName) => ({
      displayName,
      color: ROUTING_CATEGORY_PRESET_COLOR,
    }));
    const posted = capturePosts(existing);
    await ensureRoutingMasterCategories(MAILBOX, BUCKETS);
    expect(posted).toHaveLength(0);
  });

  it("only POSTs the MISSING routing names (partial existing)", async () => {
    const all = desiredRoutingNames(BUCKETS);
    const existing = all.slice(0, 2).map((displayName) => ({
      displayName,
      color: ROUTING_CATEGORY_PRESET_COLOR,
    }));
    const posted = capturePosts(existing);
    await ensureRoutingMasterCategories(MAILBOX, BUCKETS);
    expect(posted.map((p) => p.displayName).sort()).toEqual(all.slice(2).sort());
  });

  it("never POSTs a grey/intent `AI:` category — only routing labels, never recolours the grey one", async () => {
    // Existing mailbox already has a grey intent label; the ensure-call must
    // ignore it (never re-POST it, never recolour it).
    const existing = [{ displayName: "AI: payment_dispute", color: "preset0" }];
    const posted = capturePosts(existing);
    await ensureRoutingMasterCategories(MAILBOX, ["storingen"]);
    for (const p of posted) {
      expect(p.displayName).not.toBe("AI: payment_dispute");
      expect(p.color).toBe(ROUTING_CATEGORY_PRESET_COLOR);
    }
    expect(posted.some((p) => p.color === "preset0")).toBe(false);
  });
});
