// Phase 56-02 (revised 2026-04-29): async-callback registry client.
// Verifies callNxtTool inserts a pending row, POSTs the Zap with
// requestId+callback_url+secret, waits for the row to flip to 'complete'
// via Realtime, and Zod-parses result.matches at the boundary.
//
// All Supabase + fetch + Realtime are mocked — no live DB or network.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const TOOL_ROWS = [
  {
    tool_id: "nxt.contact_lookup",
    backend: "nxt",
    pattern: "async_callback",
    target_url: "https://hooks.zapier.test/x",
    auth_method: "body_field",
    auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
    auth_field_name: "auth",
    callback_route: "/api/automations/debtor/nxt-lookup/callback",
    enabled: true,
  },
  {
    tool_id: "nxt.identifier_lookup",
    backend: "nxt",
    pattern: "async_callback",
    target_url: "https://hooks.zapier.test/x",
    auth_method: "body_field",
    auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
    auth_field_name: "auth",
    callback_route: "/api/automations/debtor/nxt-lookup/callback",
    enabled: true,
  },
  {
    tool_id: "nxt.legacy_sync",
    backend: "nxt",
    pattern: "sync",
    target_url: "https://hooks.zapier.test/x",
    auth_method: "body_field",
    auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
    auth_field_name: "auth",
    callback_route: null,
    enabled: true,
  },
];

type SubscribeCb = (status: string) => void;
type ChangeHandler = (payload: { new: unknown }) => void;

/**
 * Mock admin client with two surfaces:
 *   - .from('zapier_tools').select(...).eq('enabled', true) → registry rows
 *   - .schema('debtor').from('nxt_lookup_requests') → insert/update/select
 *   - .channel(...).on(...).subscribe(...)         → Realtime
 *
 * The Realtime stub captures the change handler so the test can fire a
 * fake UPDATE payload that resolves waitForLookupRequest.
 */
function buildMockAdmin(opts: {
  initialRow?: { id: string; status: string; result: unknown; error: string | null } | null;
}) {
  let captured: { handler: ChangeHandler | null; subscribeCb: SubscribeCb | null } = {
    handler: null,
    subscribeCb: null,
  };

  const admin = {
    from: (table: string) => {
      if (table === "zapier_tools") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: TOOL_ROWS, error: null }),
          }),
        };
      }
      throw new Error(`unexpected from(${table}) on root client`);
    },
    schema: (_schema: string) => ({
      from: (_table: string) => ({
        insert: (_row: unknown) => Promise.resolve({ error: null }),
        update: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: { id: "x" }, error: null }),
            }),
          }),
        }),
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: opts.initialRow ?? null, error: null }),
          }),
        }),
      }),
    }),
    channel: (_name: string) => {
      const chain = {
        on: (_event: string, _opts: unknown, handler: ChangeHandler) => {
          captured.handler = handler;
          return chain;
        },
        subscribe: (cb: SubscribeCb) => {
          captured.subscribeCb = cb;
          // Fire SUBSCRIBED async so consumer sees it after the await tick.
          queueMicrotask(() => cb("SUBSCRIBED"));
          return chain;
        },
      };
      return chain;
    },
    removeChannel: () => Promise.resolve(),
    __captured: captured,
  };

  return admin as unknown as ReturnType<typeof Object>;
}

describe("callNxtTool (async_callback)", () => {
  const ORIG_SECRET = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;
  const ORIG_APP_URL = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.DEBTOR_FETCH_WEBHOOK_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://example.test";
    vi.resetModules();
  });
  afterEach(() => {
    process.env.DEBTOR_FETCH_WEBHOOK_SECRET = ORIG_SECRET;
    process.env.NEXT_PUBLIC_APP_URL = ORIG_APP_URL;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("POSTs Zap with requestId, callback_url, and body_field auth", async () => {
    const adminInstance = buildMockAdmin({ initialRow: null });

    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminInstance,
    }));

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );

    // Fire the call; resolve via fake Realtime UPDATE shortly after.
    const promise = callNxtTool("nxt.contact_lookup", {
      nxt_database: "nxt_benelux_prod",
      sender_email: "x@y.nl",
    });

    // Wait one tick so the subscribe + initial-select races settle, then
    // simulate the Zap callback updating the row.
    await Promise.resolve();
    setTimeout(() => {
      const captured = (adminInstance as unknown as { __captured: { handler: ChangeHandler | null } }).__captured;
      captured.handler?.({
        new: {
          id: "fake",
          status: "complete",
          result: {
            matches: [
              {
                contact_id: "c1",
                top_level_customer_id: "506909",
                top_level_customer_name: "Vos",
                depth: 0,
              },
            ],
          },
          error: null,
        },
      });
    }, 0);

    const out = await promise;
    expect(out.matches[0].top_level_customer_id).toBe("506909");

    const init = fetchSpy.mock.calls[0][1];
    const body = JSON.parse(init.body as string);
    expect(body.auth).toBe("test-secret");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.callback_url).toBe(
      "https://example.test/api/automations/debtor/nxt-lookup/callback",
    );
    expect(body.lookup_kind).toBe("sender_to_account");
    expect(body.tool_id).toBe("nxt.contact_lookup");
    expect(body.nxt_database).toBe("nxt_benelux_prod");
    expect(body.payload.sender_email).toBe("x@y.nl");
    expect(init.headers["content-type"]).toBe("application/json");
  });

  it("rejects when registry tool has pattern='sync' (mismatch with this client)", async () => {
    const adminInstance = buildMockAdmin({ initialRow: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminInstance,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const clientMod = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    // Force the test to hit the sync row by calling internal callNxtTool with
    // a synthetic id. Use type cast — the production NxtToolId union
    // intentionally excludes legacy_sync.
    await expect(
      (clientMod.callNxtTool as unknown as (id: string, input: unknown) => Promise<unknown>)(
        "nxt.legacy_sync",
        { nxt_database: "nxt_benelux_prod", sender_email: "x@y.nl" },
      ),
    ).rejects.toThrow(/pattern=sync, expected async_callback/);
  });

  it("throws when DEBTOR_FETCH_WEBHOOK_SECRET is unset", async () => {
    delete process.env.DEBTOR_FETCH_WEBHOOK_SECRET;
    const adminInstance = buildMockAdmin({ initialRow: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminInstance,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

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

  it("throws when NEXT_PUBLIC_APP_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const adminInstance = buildMockAdmin({ initialRow: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminInstance,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    await expect(
      callNxtTool("nxt.contact_lookup", {
        nxt_database: "nxt_benelux_prod",
        sender_email: "x@y.nl",
      }),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("Zod-rejects malformed match (top_level_customer_id missing)", async () => {
    const adminInstance = buildMockAdmin({ initialRow: null });
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => adminInstance,
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { callNxtTool } = await import(
      "@/lib/automations/debtor-email/nxt-zap-client"
    );
    const promise = callNxtTool("nxt.contact_lookup", {
      nxt_database: "nxt_benelux_prod",
      sender_email: "x@y.nl",
    });

    await Promise.resolve();
    setTimeout(() => {
      const captured = (adminInstance as unknown as { __captured: { handler: ChangeHandler | null } }).__captured;
      captured.handler?.({
        new: {
          id: "fake",
          status: "complete",
          result: { matches: [{ wrong_field: 123 }] },
          error: null,
        },
      });
    }, 0);

    await expect(promise).rejects.toThrow();
  });
});
