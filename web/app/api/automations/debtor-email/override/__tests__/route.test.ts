// Phase 71-02 — POST /api/automations/debtor-email/override.
// Auth-gated, zod-validated, dispatches debtor-email/override.submitted via Inngest.
// D-13 server-stamps operator_id from auth.uid(); D-14 enforces reason ≤1000 chars.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  FIXTURE_AXIS_1_REGRESSION,
  FIXTURE_AXIS_1_CAPABILITY,
  FIXTURE_AXIS_4_REGRESSION,
} from "@/lib/pipeline-events/__tests__/fixtures/override-events";

const { inngestSend, getMockUser, setMockUser } = vi.hoisted(() => {
  const inngestSend = vi.fn().mockResolvedValue({ ids: ["evt-1"] });
  let mockUser: { id: string } | null = { id: "00000000-0000-4000-8000-0000000000aa" };
  return {
    inngestSend,
    getMockUser: () => mockUser,
    setMockUser: (u: { id: string } | null) => {
      mockUser = u;
    },
  };
});

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: inngestSend },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: getMockUser() } })) },
  })),
}));

import { POST } from "../route";

beforeEach(() => {
  inngestSend.mockClear();
  setMockUser({ id: "00000000-0000-4000-8000-0000000000aa" });
});

function makeReq(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/automations/debtor-email/override", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/automations/debtor-email/override", () => {
  it("happy path emits debtor-email/override.submitted with server-stamped operator_id", async () => {
    const res = await POST(makeReq(FIXTURE_AXIS_1_REGRESSION));
    expect(res.status).toBe(200);
    expect(inngestSend).toHaveBeenCalledTimes(1);
    const sent = inngestSend.mock.calls[0][0];
    expect(sent.name).toBe("debtor-email/override.submitted");
    expect(sent.data.operator_id).toBe("00000000-0000-4000-8000-0000000000aa");
    expect(sent.data.axis).toBe("stage_1_category");
    expect(sent.data.eval_type).toBe("regression");
  });

  it("default eval_type=regression: explicit regression flows through", async () => {
    const res = await POST(makeReq(FIXTURE_AXIS_1_REGRESSION));
    expect(res.status).toBe(200);
    expect(inngestSend.mock.calls[0][0].data.eval_type).toBe("regression");
  });

  it("eval_type=capability flows through", async () => {
    const res = await POST(makeReq(FIXTURE_AXIS_1_CAPABILITY));
    expect(res.status).toBe(200);
    expect(inngestSend.mock.calls[0][0].data.eval_type).toBe("capability");
  });

  it("D-13: client-supplied operator_id is IGNORED, server-stamps auth.uid()", async () => {
    const spoof = {
      ...FIXTURE_AXIS_1_REGRESSION,
      operator_id: "00000000-0000-4000-8000-deadbeefdead",
    };
    const res = await POST(makeReq(spoof));
    expect(res.status).toBe(200);
    expect(inngestSend.mock.calls[0][0].data.operator_id).toBe(
      "00000000-0000-4000-8000-0000000000aa",
    );
  });

  it("D-14: reason >1000 chars rejected with 400 (max-length)", async () => {
    const tooLong = { ...FIXTURE_AXIS_4_REGRESSION, reason: "x".repeat(1001) };
    const res = await POST(makeReq(tooLong));
    expect(res.status).toBe(400);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("axis enum violation → 400", async () => {
    const bad = { ...FIXTURE_AXIS_1_REGRESSION, axis: "stage_99_invalid" };
    const res = await POST(makeReq(bad));
    expect(res.status).toBe(400);
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("unauthenticated → 401, no Inngest event", async () => {
    setMockUser(null);
    const res = await POST(makeReq(FIXTURE_AXIS_1_REGRESSION));
    expect(res.status).toBe(401);
    expect(inngestSend).not.toHaveBeenCalled();
  });
});
