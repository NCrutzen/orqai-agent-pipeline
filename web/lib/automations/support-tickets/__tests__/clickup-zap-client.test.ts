// Plan 04-07 — clickup-zap-client.ts tests (async_callback rework).
//
// Mirrors the nxt-zap-client.ts async_callback test pattern.
//
// EIGHT behaviors covered:
//   Z1 - tool not in registry → throws Error("zapier_tools: tool_id ... not found")
//   Z2 - intent not in allowed_for_intents → throws ToolNotAllowedForIntentError
//   Z3 - target_url starts with 'TODO_' → throws ClickupZapNotConfiguredError (before insert/fetch)
//   Z4 - auth_secret_env unset → throws ClickupZapNotConfiguredError
//   Z5 - happy path → inserts pending row, POSTs with requestId + auth + callback_url, waits via
//        Realtime, resolves { clickup_task_id, clickup_task_url } from callback row
//   Z6 - Zap POST returns non-2xx → throws Error("zapier_tools call clickup-create-task failed: HTTP 500")
//   Z7 - Realtime wait times out → throws Error containing 'timed out'
//   Z8 - callback row has bad shape → throws Error containing 'missing clickup_task_id'

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  callClickupCreateTask,
  ClickupZapNotConfiguredError,
  __resetClickupZapToolCacheForTests,
} from "../clickup-zap-client";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TOOL_ROW_BASE = {
  tool_id: "clickup-create-task",
  backend: "zapier",
  pattern: "async_callback",
  target_url: "https://hooks.zapier.com/hooks/catch/123/abc",
  auth_method: "body_field",
  auth_secret_env: "SUPPORT_CLICKUP_ZAP_SECRET",
  auth_field_name: "auth",
  callback_route: "/api/automations/support-tickets/clickup-create/callback",
  enabled: true,
  allowed_for_intents: ["clickup-escalate"],
};

const INPUT_BASE = {
  list_id: "list-999",
  assignee_user_id: "user-42",
  name: "[iController] PDF export crash on large data sets",
  description: "AI Summary: user reports PDF crash\n\nTranscript: transcript here",
  submission_id: "sub-aaaabbbb",
  submitter_email: "danny.vaessens.cb@moyneroberts.com",
};

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

/**
 * Build a Supabase admin mock that handles:
 *   - zapier_tools registry read (from("zapier_tools").select(...).eq(...))
 *   - support_clickup_create_requests insert (from(...).insert(...))
 *   - Realtime channel subscription
 *
 * `realtimeRow`: when non-null, simulates the row returned by the race-guard
 * poll after subscription. Pass null to trigger the timeout path instead.
 */
function makeSupabaseMock(opts: {
  toolRow: typeof TOOL_ROW_BASE | null;
  realtimeRow?: { status: string; clickup_task_id: string | null; clickup_task_url: string | null; error: string | null } | null;
  insertError?: { message: string } | null;
}) {
  const { toolRow, realtimeRow = null, insertError = null } = opts;

  // Registry read: from("zapier_tools").select(...).eq("enabled", true)
  const registrySelectEq = vi.fn().mockResolvedValue({
    data: toolRow ? [toolRow] : [],
    error: null,
  });
  const registrySelect = vi.fn().mockReturnValue({ eq: registrySelectEq });

  // Insert pending row: from("support_clickup_create_requests").insert(...)
  const insertFn = vi.fn().mockResolvedValue({ error: insertError ?? null });

  // Realtime channel subscription mock
  // We simulate the race-guard poll path: after subscribe fires SUBSCRIBED,
  // maybeSingle returns the realtimeRow (or null for timeout).
  const maybeSingleFn = vi.fn().mockResolvedValue({
    data: realtimeRow,
    error: null,
  });
  const eqForPoll = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFn });
  const selectForPoll = vi.fn().mockReturnValue({ eq: eqForPoll });

  // Realtime channel object
  const onFn = vi.fn().mockReturnThis();
  let subscribeCallback: ((status: string) => void) | null = null;
  const subscribeFn = vi.fn().mockImplementation((cb: (status: string) => void) => {
    subscribeCallback = cb;
    // Fire SUBSCRIBED on next tick so the Promise has time to set up
    Promise.resolve().then(() => subscribeCallback?.("SUBSCRIBED"));
    return {};
  });
  const channelObj = { on: onFn, subscribe: subscribeFn };
  const channelFn = vi.fn().mockReturnValue(channelObj);
  const removeChannelFn = vi.fn().mockResolvedValue(undefined);

  // Track which from() table is being called
  let selectCallCount = 0;
  const fromFn = vi.fn().mockImplementation((table: string) => {
    if (table === "zapier_tools") {
      return { select: registrySelect };
    }
    if (table === "support_clickup_create_requests") {
      selectCallCount++;
      if (selectCallCount === 1) {
        // First select = the race-guard poll after subscription
        return { select: selectForPoll };
      }
      return { insert: insertFn, select: selectForPoll };
    }
    return { insert: insertFn, select: selectForPoll };
  });

  const admin = {
    from: fromFn,
    channel: channelFn,
    removeChannel: removeChannelFn,
  };

  // Override from for insert path:
  // We need insert to be callable on support_clickup_create_requests
  // Reconfigure so insert works properly
  fromFn.mockImplementation((table: string) => {
    if (table === "zapier_tools") {
      return { select: registrySelect };
    }
    // support_clickup_create_requests: support insert + select
    return {
      insert: insertFn,
      select: selectForPoll,
    };
  });

  return { admin, insertFn, channelFn, channelObj, maybeSingleFn };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("callClickupCreateTask (async_callback)", () => {
  beforeEach(() => {
    __resetClickupZapToolCacheForTests();
    vi.resetAllMocks();
    process.env.SUPPORT_CLICKUP_ZAP_SECRET = "test-secret-abc";
    process.env.NEXT_PUBLIC_APP_URL = "https://agent.example.com";
  });

  afterEach(() => {
    delete process.env.SUPPORT_CLICKUP_ZAP_SECRET;
    delete process.env.NEXT_PUBLIC_APP_URL;
    vi.restoreAllMocks();
  });

  it("Z1: tool not in registry → throws Error(tool_id not found)", async () => {
    const { admin } = makeSupabaseMock({ toolRow: null });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /zapier_tools.*tool_id.*not found/i,
    );
  });

  it("Z2: intent not in allowed_for_intents → throws ToolNotAllowedForIntentError", async () => {
    const { ToolNotAllowedForIntentError: ErrorClass } = await import("../clickup-zap-client");
    const { admin } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "duplicate")).rejects.toBeInstanceOf(ErrorClass);
  });

  it("Z3: target_url starts with 'TODO_' → throws ClickupZapNotConfiguredError before any insert/fetch", async () => {
    const todoRow = { ...TOOL_ROW_BASE, target_url: "TODO_set_from_zapier_dashboard" };
    const { admin, insertFn } = makeSupabaseMock({ toolRow: todoRow });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toBeInstanceOf(
      ClickupZapNotConfiguredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("Z4: auth_secret_env unset → throws ClickupZapNotConfiguredError", async () => {
    delete process.env.SUPPORT_CLICKUP_ZAP_SECRET;
    const { admin, insertFn } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toBeInstanceOf(
      ClickupZapNotConfiguredError,
    );
    expect(insertFn).not.toHaveBeenCalled();
  });

  it("Z5: happy path → inserts pending row, POSTs with requestId+auth+callback_url, resolves from callback row", async () => {
    const realtimeRow = {
      status: "done",
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
      error: null,
    };
    const { admin, insertFn } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE, realtimeRow });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await callClickupCreateTask(INPUT_BASE, "clickup-escalate");

    expect(result).toEqual({
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
    });

    // Pending row was inserted
    expect(insertFn).toHaveBeenCalledOnce();
    const insertArg = insertFn.mock.calls[0][0];
    expect(insertArg.status).toBe("pending");
    expect(insertArg.submission_id).toBe(INPUT_BASE.submission_id);

    // POST was made to the Zap with required fields
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(TOOL_ROW_BASE.target_url);
    const body = JSON.parse(options.body);
    expect(body.auth).toBe("test-secret-abc");
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(body.callback_url).toBe("https://agent.example.com/api/automations/support-tickets/clickup-create/callback");
    expect(body.submission_id).toBe(INPUT_BASE.submission_id);
    expect(body.list_id).toBe(INPUT_BASE.list_id);
    expect(body.assignee_user_id).toBe(INPUT_BASE.assignee_user_id);
    expect(body.name).toBe(INPUT_BASE.name);
    expect(body.description).toBe(INPUT_BASE.description);
    expect(body.submitter_email).toBe(INPUT_BASE.submitter_email);
    expect(body.custom_fields).toMatchObject({ submission_id: INPUT_BASE.submission_id });
  });

  it("Z6: Zap POST returns non-2xx → throws Error containing 'HTTP 500'", async () => {
    const { admin } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("Z7: Realtime wait times out → throws Error containing 'timed out'", async () => {
    // realtimeRow=null means the race-guard poll returns null (no row yet) → triggers timeout.
    // We use fake timers so the 50s WAIT_TIMEOUT_MS fires immediately.
    const { admin } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE, realtimeRow: null });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      // Attach rejection handler immediately to avoid unhandled rejection
      const callPromise = callClickupCreateTask(INPUT_BASE, "clickup-escalate");
      const caught = callPromise.catch((e: Error) => e);
      // Advance past ZAP_POST_TIMEOUT_MS (10s) first (AbortController), then WAIT_TIMEOUT_MS (50s)
      await vi.advanceTimersByTimeAsync(65_000);
      const err = await caught;
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it("Z8: callback row has bad shape (missing clickup_task_id) → throws Error containing 'missing clickup_task_id'", async () => {
    // Row exists but clickup_task_id is null/empty
    const realtimeRow = {
      status: "done",
      clickup_task_id: null,
      clickup_task_url: null,
      error: null,
    };
    const { admin } = makeSupabaseMock({ toolRow: TOOL_ROW_BASE, realtimeRow });
    vi.mocked(createAdminClient).mockReturnValue(admin as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /missing clickup_task_id/,
    );
  });
});
