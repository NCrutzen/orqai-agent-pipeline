// Plan 05-02 Task 1 (TDD RED) — clickup-webhook route contract tests.
//
// Six behaviours locked per the plan:
//   1. 500 when SUPPORT_CLICKUP_WEBHOOK_SECRET is unset.
//   2. 400 on invalid JSON body.
//   3. 401 when body.auth does not constant-time-match the secret (no event).
//   4. 400 when normalized payload has no ClickUp task id (no event).
//   5. 200 + { action: "clickup_status_dispatched", clickup_task_id } on valid
//      request; inngest.send called exactly once with the right payload.
//   6. 500 when inngest.send rejects (ClickUp retry desired — at-least-once).
//
// inngest.send is mocked via vi.mock so we never hit the real Inngest API.
// The route MUST NOT import createAdminClient — this test does NOT mock Supabase
// and any import of createAdminClient would fail (or reach real DB), surfacing
// the plan requirement that the route is purely validate-and-fan-out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

const sendCalls: Array<{ name: string; data: Record<string, unknown> }> = [];
let sendShouldReject = false;

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn((p: { name: string; data: Record<string, unknown> }) => {
      if (sendShouldReject) {
        return Promise.reject(new Error("Inngest send failure (test)"));
      }
      sendCalls.push(p);
      return Promise.resolve({ ids: ["evt-test"] });
    }),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/automations/support-tickets/clickup-webhook",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

function makeRequestRaw(rawBody: string): NextRequest {
  return new NextRequest(
    "http://localhost/api/automations/support-tickets/clickup-webhook",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: rawBody,
    },
  );
}

async function postWebhook(body: unknown) {
  // Dynamic import ensures each test gets a fresh module tree after vi.mock
  // hoisting + env manipulation.
  const { POST } = await import("../route");
  return POST(makeRequest(body));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/automations/support-tickets/clickup-webhook", () => {
  const VALID_SECRET = "test-clickup-secret";
  const VALID_BODY = {
    auth: VALID_SECRET,
    event: "taskStatusUpdated",
    task_id: "cu-abc-123",
    history_items: [
      { field: "status", before: { status: "open" }, after: { status: "done" } },
    ],
  };

  beforeEach(() => {
    sendCalls.length = 0;
    sendShouldReject = false;
    process.env.SUPPORT_CLICKUP_WEBHOOK_SECRET = VALID_SECRET;
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.SUPPORT_CLICKUP_WEBHOOK_SECRET;
  });

  // Case 1: env var unset → 500
  it("returns 500 when SUPPORT_CLICKUP_WEBHOOK_SECRET is not set", async () => {
    delete process.env.SUPPORT_CLICKUP_WEBHOOK_SECRET;
    const { POST } = await import("../route");
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/SUPPORT_CLICKUP_WEBHOOK_SECRET/);
    expect(sendCalls).toHaveLength(0);
  });

  // Case 2: invalid JSON → 400
  it("returns 400 on invalid JSON body", async () => {
    const { POST } = await import("../route");
    const res = await POST(makeRequestRaw("not-valid-json{"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/invalid json/i);
    expect(sendCalls).toHaveLength(0);
  });

  // Case 3: wrong secret → 401
  it("returns 401 when body.auth does not match the secret", async () => {
    const res = await postWebhook({ ...VALID_BODY, auth: "wrong-secret" });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/unauthorized/i);
    expect(sendCalls).toHaveLength(0);
  });

  // Case 4: missing task id → 400
  it("returns 400 when no ClickUp task id is present", async () => {
    const body = { ...VALID_BODY };
    delete (body as Record<string, unknown>)["task_id"];
    const res = await postWebhook(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/task id/i);
    expect(sendCalls).toHaveLength(0);
  });

  // Case 5: valid request → 200 + inngest.send called once with correct payload
  it("returns 200 and fires one typed Inngest event on valid request", async () => {
    const res = await postWebhook(VALID_BODY);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.action).toBe("clickup_status_dispatched");
    expect(json.clickup_task_id).toBe("cu-abc-123");

    // Exactly one Inngest dispatch.
    expect(sendCalls).toHaveLength(1);
    const call = sendCalls[0];
    expect(call.name).toBe("support-tickets/clickup-status.received");
    const d = call.data;
    expect(d.clickup_task_id).toBe("cu-abc-123");
    expect(d.event_type).toBe("taskStatusUpdated");
    expect(d.history_items).toEqual(VALID_BODY.history_items);
    // received_at must be a non-empty ISO 8601 string.
    expect(typeof d.received_at).toBe("string");
    expect((d.received_at as string).length).toBeGreaterThan(0);
    expect(() => new Date(d.received_at as string)).not.toThrow();
  });

  // Case 5b: task id tolerance — ClickUp also sends `payload.task.id`
  it("extracts clickup_task_id from nested payload.task.id when task_id is absent", async () => {
    const body = {
      auth: VALID_SECRET,
      event: "taskUpdated",
      payload: { task: { id: "cu-nested-456" } },
      history_items: [],
    };
    const res = await postWebhook(body);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.clickup_task_id).toBe("cu-nested-456");
    expect(sendCalls[0].data.clickup_task_id).toBe("cu-nested-456");
  });

  // Case 6: inngest.send rejects → 500 (ClickUp retry desired)
  it("returns 500 when inngest.send rejects (so ClickUp will retry)", async () => {
    sendShouldReject = true;
    const res = await postWebhook(VALID_BODY);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/inngest/i);
  });
});
