// Quick 260624 — contract tests for the durable pipeline REPLAY endpoint.
//
// Locks: auth gate, input validation, dry-run preview (no send), apply (send),
// not-stalled skip, and dispatcher-stall detection (no send in v1).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const sendCalls: Array<{ name: string; data: Record<string, unknown> }> = [];

vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: vi.fn((p: { name: string; data: Record<string, unknown> }) => {
      sendCalls.push(p);
      return Promise.resolve({ ids: ["evt-1"] });
    }),
  },
}));

// Per-test state driving what the supabase mock returns.
interface MockState {
  email: Record<string, unknown> | null;
  hasS3: boolean;
  hasCoordRun: boolean;
  s2AutorunId: string | null;
  s1Decision: string | null;
}
let mockState: MockState;

function resolveData(table: string, eqs: Record<string, unknown>, mode: "single" | "list") {
  if (table === "emails") return { data: mockState.email, error: null };
  if (table === "coordinator_runs")
    return { data: mockState.hasCoordRun ? [{ run_id: "cr-1" }] : [], error: null };
  if (table === "pipeline_events") {
    if (eqs.stage === 3) return { data: mockState.hasS3 ? [{ id: "pe3" }] : [], error: null };
    if (eqs.stage === 2)
      return {
        data: mockState.s2AutorunId ? [{ automation_run_id: mockState.s2AutorunId }] : [],
        error: null,
      };
    if (eqs.stage === 1)
      return { data: mockState.s1Decision ? [{ decision: mockState.s1Decision }] : [], error: null };
  }
  return mode === "single" ? { data: null, error: null } : { data: [], error: null };
}

function makeChain(table: string) {
  const eqs: Record<string, unknown> = {};
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    eqs[col] = val;
    return chain;
  };
  chain.order = () => chain;
  chain.maybeSingle = () => Promise.resolve(resolveData(table, eqs, "single"));
  chain.limit = () => Promise.resolve(resolveData(table, eqs, "list"));
  return chain;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    schema: () => ({ from: (t: string) => makeChain(t) }),
    from: (t: string) => makeChain(t),
  })),
}));

const SECRET = "test-secret";

function makeReq(body: unknown, secret: string | null = SECRET): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-zapier-secret"] = secret;
  return new NextRequest("http://localhost/api/automations/pipeline/replay", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function importPost() {
  const mod = await import("../route");
  return mod.POST;
}

describe("pipeline replay endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendCalls.length = 0;
    process.env.ZAPIER_INGEST_SECRET = SECRET;
    mockState = {
      email: { id: "e1", source_id: "GRAPH-MSG-1", internet_message_id: null, mailbox: "administratie@fire-control.nl" },
      hasS3: false,
      hasCoordRun: false,
      s2AutorunId: "ar-1",
      s1Decision: "unknown",
    };
  });

  it("401 on missing/wrong secret", async () => {
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"] }, "wrong"));
    expect(res.status).toBe(401);
    expect(sendCalls.length).toBe(0);
  });

  it("400 on empty email_ids", async () => {
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: [] }));
    expect(res.status).toBe(400);
  });

  it("400 on unknown swarm_type", async () => {
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"], swarm_type: "evil" }));
    expect(res.status).toBe(400);
  });

  it("dry-run (default) hand-off: returns the resolver event, fires NOTHING", async () => {
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"] }));
    const json = await res.json();
    expect(json.dry_run).toBe(true);
    expect(json.results[0].action).toBe("refire_stage2_handoff");
    expect(json.results[0].event).toMatchObject({
      name: "debtor-email/stage-2.customer-resolve.requested",
      data: {
        automation_run_id: "ar-1",
        message_id: "GRAPH-MSG-1",
        source_mailbox: "administratie@fire-control.nl",
        category_key: "unknown",
        swarm_type: "debtor-email",
      },
    });
    expect(sendCalls.length).toBe(0);
  });

  it("apply (dry_run:false) hand-off: fires the resolver event", async () => {
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"], dry_run: false }));
    const json = await res.json();
    expect(json.dry_run).toBe(false);
    expect(sendCalls.length).toBe(1);
    expect(sendCalls[0].name).toBe("debtor-email/stage-2.customer-resolve.requested");
    expect(json.results[0].inngest_ids).toEqual(["evt-1"]);
  });

  it("skips an email that already has a Stage-3 event", async () => {
    mockState.hasS3 = true;
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"], dry_run: false }));
    const json = await res.json();
    expect(json.results[0].action).toBe("skipped_not_stalled");
    expect(sendCalls.length).toBe(0);
  });

  it("detects a dispatcher stall (coordinator_run present) without firing", async () => {
    mockState.hasCoordRun = true;
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["e1"], dry_run: false }));
    const json = await res.json();
    expect(json.results[0].action).toBe("dispatcher_stall_detected");
    expect(sendCalls.length).toBe(0);
  });

  it("skips an unknown email_id (no email row)", async () => {
    mockState.email = null;
    const POST = await importPost();
    const res = await POST(makeReq({ email_ids: ["nope"], dry_run: false }));
    const json = await res.json();
    expect(json.results[0].action).toBe("skipped_no_email");
    expect(sendCalls.length).toBe(0);
  });
});
