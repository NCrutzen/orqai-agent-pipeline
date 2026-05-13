// Phase 82.4 Plan 02 — POST /api/automations/debtor-email/feedback.
// Auth-gated, zod-validated route that synchronously INSERTs one row into
// public.email_feedback via createAdminClient.
// T-82.4-02-01 server-stamps operator_id from auth.uid() (zod schema omits it).
// T-82.4-02-02 caps prose_notes at 4000 chars and corrected_value at 500.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { adminInsert, getMockUser, setMockUser } = vi.hoisted(() => {
  const adminInsert = vi.fn();
  let mockUser: { id: string } | null = { id: "00000000-0000-4000-8000-0000000000aa" };
  return {
    adminInsert,
    getMockUser: () => mockUser,
    setMockUser: (u: { id: string } | null) => {
      mockUser = u;
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
    from: vi.fn(() => ({
      insert: adminInsert,
    })),
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
