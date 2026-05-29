// Phase 82.4 Plan 02 — POST /api/automations/debtor-email/feedback.
// Auth-gated, zod-validated route that synchronously INSERTs one row into
// public.email_feedback via createAdminClient.
// T-82.4-02-01 server-stamps operator_id from auth.uid() (zod schema omits it).
// T-82.4-02-02 caps prose_notes at 4000 chars and corrected_value at 500.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const {
  adminInsert,
  adminUpdate,
  adminUpdateEq,
  fromCalls,
  getMockUser,
  setMockUser,
  setUpdateResult,
} = vi.hoisted(() => {
  const adminInsert = vi.fn();
  const fromCalls: string[] = [];
  let mockUser: { id: string } | null = { id: "00000000-0000-4000-8000-0000000000aa" };
  let updateResult: { count: number; error: { message: string } | null } = {
    count: 1,
    error: null,
  };
  // .eq() is the terminal in our chain — it returns the result envelope.
  const adminUpdateEq =
    (globalThis as unknown as { __vi__?: { fn?: () => unknown } }).__vi__?.fn?.() ?? null;
  // Build the .update() => { eq } chain. We use plain function spies rather
  // than vi.fn() inside hoisted block because vi is not available at hoist
  // time — we just want call recording.
  const eqCalls: unknown[][] = [];
  const eqFn = (...args: unknown[]) => {
    eqCalls.push(args);
    return Promise.resolve(updateResult);
  };
  const updateCalls: unknown[][] = [];
  const adminUpdate = (...args: unknown[]) => {
    updateCalls.push(args);
    return { eq: eqFn };
  };
  // Expose call lists via getter-like .mock shims (matches vi.fn() surface
  // used by assertions below).
  (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock = {
    calls: updateCalls,
  };
  (eqFn as unknown as { mock: { calls: unknown[][] } }).mock = {
    calls: eqCalls,
  };
  return {
    adminInsert,
    adminUpdate,
    adminUpdateEq: eqFn,
    fromCalls,
    getMockUser: () => mockUser,
    setMockUser: (u: { id: string } | null) => {
      mockUser = u;
    },
    setUpdateResult: (r: { count: number; error: { message: string } | null }) => {
      updateResult = r;
    },
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: getMockUser() } })) },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      fromCalls.push(table);
      if (table === "agent_runs") {
        return { update: adminUpdate };
      }
      return { insert: adminInsert };
    }),
  })),
}));

import { POST } from "../route";

const VALID_EMAIL_ID = "11111111-1111-4111-8111-111111111111";

function makeReq(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/automations/debtor-email/feedback", {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function happyInsert() {
  return {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({
        data: { id: "ffffffff-ffff-4fff-8fff-ffffffffffff" },
        error: null,
      })),
    })),
  };
}

beforeEach(() => {
  adminInsert.mockReset();
  adminInsert.mockImplementation(() => happyInsert());
  // Clear the hoisted call lists between tests so .mock.calls.length is a
  // valid per-test signal.
  (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls.length = 0;
  (adminUpdateEq as unknown as { mock: { calls: unknown[][] } }).mock.calls.length = 0;
  fromCalls.length = 0;
  setUpdateResult({ count: 1, error: null });
  setMockUser({ id: "00000000-0000-4000-8000-0000000000aa" });
});

describe("POST /api/automations/debtor-email/feedback", () => {
  it("unauthenticated → 401, no insert", async () => {
    setMockUser(null);
    const res = await POST(
      makeReq({ email_id: VALID_EMAIL_ID, stage: 1, verdict: "confirm" }),
    );
    expect(res.status).toBe(401);
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("invalid json → 400", async () => {
    const req = makeReq(null, "{not-json");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid json");
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("invalid payload (stage=4) → 400", async () => {
    const res = await POST(
      makeReq({ email_id: VALID_EMAIL_ID, stage: 4, verdict: "confirm" }),
    );
    expect(res.status).toBe(400);
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("invalid payload (verdict='bogus') → 400", async () => {
    const res = await POST(
      makeReq({ email_id: VALID_EMAIL_ID, stage: 1, verdict: "bogus" }),
    );
    expect(res.status).toBe(400);
    expect(adminInsert).not.toHaveBeenCalled();
  });

  it("happy path → 200 + insert called with operator_id stamped from session", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 2,
        verdict: "override",
        corrected_value: "ACME Holding",
        prose_notes: "Picked the right parent customer.",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.id).toBe("ffffffff-ffff-4fff-8fff-ffffffffffff");

    expect(adminInsert).toHaveBeenCalledTimes(1);
    const insertedRow = adminInsert.mock.calls[0][0];
    expect(insertedRow.operator_id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(insertedRow.email_id).toBe(VALID_EMAIL_ID);
    expect(insertedRow.stage).toBe(2);
    expect(insertedRow.verdict).toBe("override");
    expect(insertedRow.corrected_value).toBe("ACME Holding");
    expect(insertedRow.prose_notes).toBe("Picked the right parent customer.");
  });

  // ------------------------------------------------------------------
  // Phase 2 Plan 02-04 — OQ-9: extended POST handler
  // (stage=1 + verdict='override' + agent_run_id → also UPDATE
  // agent_runs.human_verdict='edited_minor').
  // ------------------------------------------------------------------

  const VALID_RUN_ID = "22222222-2222-4222-8222-222222222222";

  it("P2-04 Test 1: stage=1 verdict=confirm (no agent_run_id) → 200, no agent_runs update", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "confirm",
      }),
    );
    expect(res.status).toBe(200);
    expect(adminInsert).toHaveBeenCalledTimes(1);
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(0);
    expect(fromCalls).not.toContain("agent_runs");
  });

  it("P2-04 Test 2: stage=1 verdict=override + agent_run_id → email_feedback INSERT + agent_runs UPDATE human_verdict=edited_minor", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "override",
        corrected_value: "out_of_office",
        agent_run_id: VALID_RUN_ID,
      }),
    );
    expect(res.status).toBe(200);
    expect(adminInsert).toHaveBeenCalledTimes(1);
    const updateCalls = (
      adminUpdate as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0]).toEqual({ human_verdict: "edited_minor" });
    // count: "exact" option
    expect(updateCalls[0][1]).toEqual({ count: "exact" });
    const eqCalls = (
      adminUpdateEq as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    expect(eqCalls.length).toBe(1);
    expect(eqCalls[0]).toEqual(["id", VALID_RUN_ID]);
    expect(fromCalls).toContain("agent_runs");
  });

  it("P2-04 Test 3: stage=1 verdict=override WITHOUT agent_run_id → email_feedback INSERT only, NO agent_runs UPDATE", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "override",
        corrected_value: "out_of_office",
      }),
    );
    expect(res.status).toBe(200);
    expect(adminInsert).toHaveBeenCalledTimes(1);
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(0);
  });

  it("P2-04 Test 4: stage=0 verdict=override + agent_run_id → NO agent_runs UPDATE (path gated to stage===1)", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 0,
        verdict: "override",
        agent_run_id: VALID_RUN_ID,
      }),
    );
    expect(res.status).toBe(200);
    expect(adminInsert).toHaveBeenCalledTimes(1);
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(0);
  });

  it("P2-04 Test 5: stage=1 override with stale agent_run_id (count=0) → 200, server warns, does NOT 500", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    setUpdateResult({ count: 0, error: null });
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "override",
        corrected_value: "out_of_office",
        agent_run_id: VALID_RUN_ID,
      }),
    );
    expect(res.status).toBe(200);
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(1);
    const warned = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .some((s) => s.includes("matched 0 rows"));
    expect(warned).toBe(true);
    warnSpy.mockRestore();
  });

  it("P2-04 Test 6: stage=1 override with agent_run_id that is NOT a uuid → 400", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "override",
        corrected_value: "out_of_office",
        agent_run_id: "not-a-uuid",
      }),
    );
    expect(res.status).toBe(400);
    expect(adminInsert).not.toHaveBeenCalled();
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(0);
  });

  it("P2-04 Test 7: unauthenticated still 401 even with agent_run_id payload", async () => {
    setMockUser(null);
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "override",
        corrected_value: "out_of_office",
        agent_run_id: VALID_RUN_ID,
      }),
    );
    expect(res.status).toBe(401);
    expect(adminInsert).not.toHaveBeenCalled();
    expect(
      (adminUpdate as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .length,
    ).toBe(0);
  });

  it("T-82.4-02-01: client-supplied operator_id is IGNORED (server-stamps auth.uid())", async () => {
    const res = await POST(
      makeReq({
        email_id: VALID_EMAIL_ID,
        stage: 1,
        verdict: "confirm",
        operator_id: "00000000-0000-4000-8000-deadbeefdead",
      }),
    );
    expect(res.status).toBe(200);
    expect(adminInsert).toHaveBeenCalledTimes(1);
    const insertedRow = adminInsert.mock.calls[0][0];
    expect(insertedRow.operator_id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(insertedRow.operator_id).not.toBe("00000000-0000-4000-8000-deadbeefdead");
  });
});
