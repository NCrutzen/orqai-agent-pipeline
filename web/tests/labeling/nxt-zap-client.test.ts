// Phase 56-01b registry refactor.
// Verifies callNxtTool resolves URL + auth from public.zapier_tools rather
// than env vars, formats the request per the row's auth_method, applies the
// tool's response-shape Zod schema at the boundary.
//
// The Supabase admin client is mocked so the test does NOT hit the live DB.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TOOL_ROWS = [
  {
    tool_id: "nxt.contact_lookup",
    backend: "nxt",
    pattern: "sync",
    target_url: "https://hooks.zapier.test/x",
    auth_method: "body_field",
    auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
    auth_field_name: "auth",
    enabled: true,
  },
  {
    tool_id: "nxt.identifier_lookup",
    backend: "nxt",
    pattern: "sync",
    target_url: "https://hooks.zapier.test/x",
    auth_method: "body_field",
    auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
    auth_field_name: "auth",
    enabled: true,
  },
];

function mockAdmin() {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: TOOL_ROWS, error: null }),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdmin(),
}));

describe("callNxtTool (zapier_tools registry)", () => {
  const ORIG_SECRET = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.DEBTOR_FETCH_WEBHOOK_SECRET = "test-secret";
    vi.resetModules();
  });
  afterEach(() => {
    process.env.DEBTOR_FETCH_WEBHOOK_SECRET = ORIG_SECRET;
    vi.restoreAllMocks();
  });

  it("body_field auth: secret in body, not header", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        matches: [
          {
            contact_id: "c1",
            top_level_customer_id: "506909",
            top_level_customer_name: "Vos",
            depth: 0,
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtTool("nxt.contact_lookup", {
      nxt_database: "nxt_benelux_prod",
      sender_email: "x@y.nl",
    });
    const init = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body.auth).toBe("test-secret");
    expect(init.headers.authorization).toBeUndefined();
  });

  it("sends lookup_kind + tool_id + nxt_database in body envelope", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtTool("nxt.identifier_lookup", {
      nxt_database: "nxt_benelux_prod",
      invoice_numbers: ["18800004"],
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.lookup_kind).toBe("identifier_to_account");
    expect(body.tool_id).toBe("nxt.identifier_lookup");
    expect(body.nxt_database).toBe("nxt_benelux_prod");
    expect(body.payload.invoice_numbers).toEqual(["18800004"]);
  });

  it("AbortController.signal is forwarded to fetch (timeout enforcement)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await callNxtTool("nxt.contact_lookup", {
      nxt_database: "nxt_benelux_prod",
      sender_email: "x@y.nl",
    });
    expect(fetchSpy.mock.calls[0][1].signal).toBeDefined();
  });

  it("Zod-validates response — throws on malformed match shape", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ matches: [{ wrong_field: 123 }] }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await expect(
      callNxtTool("nxt.contact_lookup", {
        nxt_database: "nxt_benelux_prod",
        sender_email: "x@y.nl",
      }),
    ).rejects.toThrow();
  });

  it("throws when auth_secret_env points at unset env var", async () => {
    delete process.env.DEBTOR_FETCH_WEBHOOK_SECRET;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ matches: [] }) }),
    );
    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await expect(
      callNxtTool("nxt.contact_lookup", {
        nxt_database: "nxt_benelux_prod",
        sender_email: "x@y.nl",
      }),
    ).rejects.toThrow(/DEBTOR_FETCH_WEBHOOK_SECRET/);
  });
});
