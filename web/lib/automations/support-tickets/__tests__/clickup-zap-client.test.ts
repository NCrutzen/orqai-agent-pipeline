// Plan 04-05 Task 1 — clickup-zap-client.ts tests (RED → GREEN).
//
// Tests the callClickupCreateTask function + ClickupZapNotConfiguredError.
//
// SEVEN behaviors covered:
//   Z1 - tool not in registry → throws Error("zapier_tools: tool_id ... not found")
//   Z2 - intent not in allowed_for_intents → throws ToolNotAllowedForIntentError
//   Z3 - target_url starts with 'TODO_' → throws ClickupZapNotConfiguredError (before fetch)
//   Z4 - auth_secret_env unset → throws ClickupZapNotConfiguredError
//   Z5 - happy path → POSTs with auth body field, returns { clickup_task_id, clickup_task_url }
//   Z6 - Zap returns non-2xx → throws Error("zapier_tools call clickup-create-task failed: HTTP 500")
//   Z7 - Zap returns 2xx but no clickup_task_id → throws Error("clickup create task: zap returned 200 but missing clickup_task_id")

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

const TOOL_ROW_BASE = {
  tool_id: "clickup-create-task",
  backend: "zapier",
  pattern: "sync",
  target_url: "https://hooks.zapier.com/hooks/catch/123/abc",
  auth_method: "body_field",
  auth_secret_env: "SUPPORT_CLICKUP_ZAP_SECRET",
  auth_field_name: "auth",
  callback_route: null,
  enabled: true,
  allowed_for_intents: ["clickup-escalate"],
};

const INPUT_BASE = {
  list_id: "list-999",
  assignee_user_id: "user-42",
  name: "[iController] PDF export crash on large data sets",
  description: "AI Summary: user reports PDF crash\n\nTranscript: transcript here",
  submission_id: "sub-aaaabbbb",
};

function makeSupabaseMock(toolRow: typeof TOOL_ROW_BASE | null) {
  const mockSelect = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({
      data: toolRow ? [toolRow] : [],
      error: null,
    }),
  });
  return {
    from: vi.fn().mockReturnValue({ select: mockSelect }),
  };
}

describe("callClickupCreateTask", () => {
  beforeEach(() => {
    __resetClickupZapToolCacheForTests();
    vi.resetAllMocks();
    process.env.SUPPORT_CLICKUP_ZAP_SECRET = "test-secret-abc";
  });

  afterEach(() => {
    delete process.env.SUPPORT_CLICKUP_ZAP_SECRET;
    vi.restoreAllMocks();
  });

  it("Z1: tool not in registry → throws Error(tool_id not found)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(null) as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /zapier_tools.*tool_id.*not found/i,
    );
  });

  it("Z2: intent not in allowed_for_intents → throws ToolNotAllowedForIntentError", async () => {
    const { ToolNotAllowedForIntentError: ErrorClass } = await import("../clickup-zap-client");
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(TOOL_ROW_BASE) as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "duplicate")).rejects.toBeInstanceOf(ErrorClass);
  });

  it("Z3: target_url starts with 'TODO_' → throws ClickupZapNotConfiguredError before any fetch", async () => {
    const todoRow = { ...TOOL_ROW_BASE, target_url: "TODO_set_from_zapier_dashboard" };
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(todoRow) as unknown as ReturnType<typeof createAdminClient>);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toBeInstanceOf(
      ClickupZapNotConfiguredError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Z4: auth_secret_env unset → throws ClickupZapNotConfiguredError", async () => {
    delete process.env.SUPPORT_CLICKUP_ZAP_SECRET;
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(TOOL_ROW_BASE) as unknown as ReturnType<typeof createAdminClient>);

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toBeInstanceOf(
      ClickupZapNotConfiguredError,
    );
  });

  it("Z5: happy path → POSTs with body_field auth, returns { clickup_task_id, clickup_task_url }", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(TOOL_ROW_BASE) as unknown as ReturnType<typeof createAdminClient>);

    const zapResponse = {
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(zapResponse), { status: 200 }),
    );

    const result = await callClickupCreateTask(INPUT_BASE, "clickup-escalate");

    expect(result).toEqual({
      clickup_task_id: "CU-12345",
      clickup_task_url: "https://app.clickup.com/t/CU-12345",
    });

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, options] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe(TOOL_ROW_BASE.target_url);
    const body = JSON.parse(options.body);
    expect(body.auth).toBe("test-secret-abc");
    expect(body.submission_id).toBe(INPUT_BASE.submission_id);
    expect(body.list_id).toBe(INPUT_BASE.list_id);
    expect(body.assignee_user_id).toBe(INPUT_BASE.assignee_user_id);
    expect(body.name).toBe(INPUT_BASE.name);
    expect(body.description).toBe(INPUT_BASE.description);
    expect(body.custom_fields).toMatchObject({ submission_id: INPUT_BASE.submission_id });
  });

  it("Z6: Zap returns non-2xx → throws Error containing 'HTTP 500'", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(TOOL_ROW_BASE) as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /HTTP 500/,
    );
  });

  it("Z7: Zap returns 2xx but missing clickup_task_id → throws with 'missing clickup_task_id'", async () => {
    vi.mocked(createAdminClient).mockReturnValue(makeSupabaseMock(TOOL_ROW_BASE) as unknown as ReturnType<typeof createAdminClient>);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );

    await expect(callClickupCreateTask(INPUT_BASE, "clickup-escalate")).rejects.toThrow(
      /missing clickup_task_id/,
    );
  });
});
