// Phase 64-01 Task 3 (RED). BUDG-02 — default-deny intent allowlist on nxt-zap-client.
// Today the module does NOT export ToolNotAllowedForIntentError and callNxtTool
// does NOT accept an `intent` parameter. Plan 03 ships both. RED state by design.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase admin so loadTool returns a controllable row.
vi.mock("@/lib/supabase/admin", () => {
  const eq = vi.fn();
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    createAdminClient: vi.fn(() => ({ from })),
    __mocks__: { from, select, eq },
  };
});

// Mock global fetch to swallow downstream POSTs (we only care about the
// pre-POST allowlist guard).
const originalFetch = globalThis.fetch;

import * as adminMod from "@/lib/supabase/admin";
import {
  callNxtTool,
  ToolNotAllowedForIntentError,
} from "../nxt-zap-client";

const adminMocks = (adminMod as unknown as { __mocks__: any }).__mocks__;

function setRegistryRow(row: Record<string, unknown>) {
  // The registry SELECT in loadTool returns { data: [...], error: null } from
  // .eq('enabled', true). Make .eq resolve to the supplied row.
  adminMocks.eq.mockResolvedValue({ data: [row], error: null });
}

const BASE_INPUT = {
  nxt_database: "nxt_benelux_prod",
  brand_id: "BE",
  invoice_numbers: ["123"],
};

beforeEach(() => {
  adminMocks.from.mockClear();
  adminMocks.select.mockClear();
  adminMocks.eq.mockReset();

  // Reset fetch — most tests will short-circuit on the allowlist check before
  // any HTTP call. For the happy-path test we install a stub.
  globalThis.fetch = originalFetch;

  process.env.DEBTOR_FETCH_WEBHOOK_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
});

describe("BUDG-02: ToolNotAllowedForIntentError is a named export", () => {
  it("exports the error class so callers can type-guard", () => {
    expect(typeof ToolNotAllowedForIntentError).toBe("function");
    const err = new ToolNotAllowedForIntentError("nxt.invoice_fetch", "x");
    expect(err).toBeInstanceOf(Error);
    expect(err.tool_id).toBe("nxt.invoice_fetch");
    expect(err.intent).toBe("x");
  });
});

describe("BUDG-02: default-deny when allowed_for_intents is NULL", () => {
  it("throws ToolNotAllowedForIntentError when the registry row has NULL allowed_for_intents", async () => {
    setRegistryRow({
      tool_id: "nxt.invoice_fetch",
      backend: "nxt",
      pattern: "async_callback",
      target_url: "https://hooks.zapier.com/x",
      auth_method: "body_field",
      auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
      auth_field_name: "auth",
      callback_route: "/api/cb",
      enabled: true,
      allowed_for_intents: null,
    });

    await expect(
      callNxtTool(
        "nxt.identifier_lookup",
        BASE_INPUT,
        "invoice_copy_request",
      ),
    ).rejects.toThrow(ToolNotAllowedForIntentError);
  });
});

describe("BUDG-02: default-deny when allowed_for_intents is empty array", () => {
  it("throws ToolNotAllowedForIntentError when allowed_for_intents = []", async () => {
    setRegistryRow({
      tool_id: "nxt.identifier_lookup",
      backend: "nxt",
      pattern: "async_callback",
      target_url: "https://hooks.zapier.com/x",
      auth_method: "body_field",
      auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
      auth_field_name: "auth",
      callback_route: "/api/cb",
      enabled: true,
      allowed_for_intents: [],
    });

    await expect(
      callNxtTool(
        "nxt.identifier_lookup",
        BASE_INPUT,
        "invoice_copy_request",
      ),
    ).rejects.toThrow(ToolNotAllowedForIntentError);
  });
});

describe("BUDG-02: deny when intent NOT in allowlist", () => {
  it("throws ToolNotAllowedForIntentError for an unlisted intent", async () => {
    setRegistryRow({
      tool_id: "nxt.identifier_lookup",
      backend: "nxt",
      pattern: "async_callback",
      target_url: "https://hooks.zapier.com/x",
      auth_method: "body_field",
      auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
      auth_field_name: "auth",
      callback_route: "/api/cb",
      enabled: true,
      allowed_for_intents: ["invoice_copy_request"],
    });

    await expect(
      callNxtTool(
        "nxt.identifier_lookup",
        BASE_INPUT,
        "payment_status_question",
      ),
    ).rejects.toThrow(ToolNotAllowedForIntentError);
  });
});

describe("BUDG-02: allow happy path — does NOT throw allowlist error", () => {
  it("does not throw ToolNotAllowedForIntentError when intent is in the allowlist (downstream may still fail)", async () => {
    setRegistryRow({
      tool_id: "nxt.identifier_lookup",
      backend: "nxt",
      pattern: "async_callback",
      target_url: "https://hooks.zapier.com/x",
      auth_method: "body_field",
      auth_secret_env: "DEBTOR_FETCH_WEBHOOK_SECRET",
      auth_field_name: "auth",
      callback_route: "/api/cb",
      enabled: true,
      allowed_for_intents: ["invoice_copy_request"],
    });

    // Stub fetch + Supabase row insert/update so the downstream path doesn't
    // hit the network. We don't care if the downstream layer succeeds — only
    // that the allowlist guard was passed.
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    ) as unknown as typeof fetch;

    let caught: unknown = null;
    try {
      await callNxtTool(
        "nxt.identifier_lookup",
        BASE_INPUT,
        "invoice_copy_request",
      );
    } catch (err) {
      caught = err;
    }

    // It is acceptable for the call to throw a downstream error (timeout,
    // missing realtime channel, etc.) — but it MUST NOT be the allowlist error.
    expect(caught).not.toBeInstanceOf(ToolNotAllowedForIntentError);
  });
});
