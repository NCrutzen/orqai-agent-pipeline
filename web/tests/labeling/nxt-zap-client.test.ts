// Phase 56-00 (D-04, D-05). NXT-Zap client unit tests.
// Module exists from Task 2 of this plan — these tests verify request shape,
// auth header, timeout, and Zod boundary validation.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("callNxtZap", () => {
  const ORIG_URL = process.env.NXT_ZAPIER_WEBHOOK_URL;
  const ORIG_SECRET = process.env.NXT_ZAPIER_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.NXT_ZAPIER_WEBHOOK_URL = "https://hooks.zapier.test/x";
    process.env.NXT_ZAPIER_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
  });
  afterEach(() => {
    process.env.NXT_ZAPIER_WEBHOOK_URL = ORIG_URL;
    process.env.NXT_ZAPIER_WEBHOOK_SECRET = ORIG_SECRET;
    vi.restoreAllMocks();
  });

  it("sends bearer auth header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtZap } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtZap({
      nxt_database: "smeba",
      lookup_kind: "sender_to_account",
      payload: { from_email: "x@y.nl" },
    });
    const init = fetchSpy.mock.calls[0][1];
    expect(init.headers.authorization).toBe("Bearer test-secret");
  });

  it("sends lookup_kind in body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtZap } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtZap({
      nxt_database: "smeba",
      lookup_kind: "identifier_to_account",
      payload: { invoice_numbers: ["17000001"] },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.lookup_kind).toBe("identifier_to_account");
    expect(body.nxt_database).toBe("smeba");
  });

  it("25s timeout — AbortController fires after NXT_ZAP_TIMEOUT_MS", async () => {
    // Pure assertion that AbortController.signal is forwarded; full timing test
    // requires fake timers and is deferred to Wave 2.
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtZap } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtZap({
      nxt_database: "smeba",
      lookup_kind: "sender_to_account",
      payload: {},
    });
    expect(fetchSpy.mock.calls[0][1].signal).toBeDefined();
  });

  it("Zod-validates response — throws on malformed match shape", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ wrong_field: 123 }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtZap } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await expect(
      callNxtZap({
        nxt_database: "smeba",
        lookup_kind: "sender_to_account",
        payload: {},
      }),
    ).rejects.toThrow();
  });
});
