// Phase 04.1 — Plan 05 Task 1. getThreadMessages server-action tests.
//
// Mitigates T-04.1-01 (UUID validation), T-04.1-02 (admin client under
// dashboard auth gate — no getUser path; route boundary enforces auth).
//
// See PLAN.md tasks for the 6 required behaviors.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock chain --------------------------------------------------------
//
// The action uses:  admin.schema(...).from(...).select(...).eq(...).order(...)
// which returns `{ data, error }`. We expose orderMock at the leaf so per-
// test responses can be programmed.

const orderMock = vi.fn();
const eqMock = vi.fn(() => ({ order: orderMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const schemaMock = vi.fn(() => ({ from: fromMock }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ schema: schemaMock }),
}));

import { getThreadMessages } from "../thread-actions";

// Valid v4 UUIDs (zod v4 enforces version + variant nibbles).
const VALID_CONV = "11111111-1111-4111-8111-111111111111";
const VALID_CURRENT = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";
const ANOTHER_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  orderMock.mockReset();
  eqMock.mockClear();
  selectMock.mockClear();
  fromMock.mockClear();
  schemaMock.mockClear();
});

describe("getThreadMessages — T-04.1-01 UUID validation", () => {
  it("rejects non-UUID conversation_id without hitting supabase", async () => {
    const r = await getThreadMessages("not-a-uuid", VALID_CURRENT, "debtor-email");
    expect(r).toEqual({ ok: false, reason: "invalid_uuid" });
    expect(schemaMock).not.toHaveBeenCalled();
  });

  it("rejects non-UUID current_email_id without hitting supabase", async () => {
    const r = await getThreadMessages(VALID_CONV, "still-not-uuid", "debtor-email");
    expect(r).toEqual({ ok: false, reason: "invalid_uuid" });
    expect(schemaMock).not.toHaveBeenCalled();
  });
});

describe("getThreadMessages — happy path", () => {
  it("returns 3 ordered messages and flags only current_email_id as is_current", async () => {
    orderMock.mockResolvedValueOnce({
      data: [
        {
          id: OTHER_ID,
          sender_name: "Alice",
          sender_email: "a@x.com",
          received_at: "2026-01-01T00:00:00Z",
          subject: "s1",
          body_text: "b1",
        },
        {
          id: VALID_CURRENT,
          sender_name: "Bob",
          sender_email: "b@x.com",
          received_at: "2026-01-02T00:00:00Z",
          subject: "s2",
          body_text: "b2",
        },
        {
          id: ANOTHER_ID,
          sender_name: "Carol",
          sender_email: "c@x.com",
          received_at: "2026-01-03T00:00:00Z",
          subject: "s3",
          body_text: "b3",
        },
      ],
      error: null,
    });

    const r = await getThreadMessages(VALID_CONV, VALID_CURRENT, "debtor-email");
    if (!r.ok) throw new Error("expected ok");
    expect(r.messages).toHaveLength(3);
    expect(r.messages.filter((m) => m.is_current)).toHaveLength(1);
    expect(r.messages.find((m) => m.is_current)?.id).toBe(VALID_CURRENT);
  });

  it("invokes order('received_at', ascending: true)", async () => {
    orderMock.mockResolvedValueOnce({ data: [], error: null });
    await getThreadMessages(VALID_CONV, VALID_CURRENT, "debtor-email");
    expect(orderMock).toHaveBeenCalledWith("received_at", { ascending: true });
    expect(eqMock).toHaveBeenCalledWith("conversation_id", VALID_CONV);
    expect(schemaMock).toHaveBeenCalledWith("email_pipeline");
    expect(fromMock).toHaveBeenCalledWith("emails");
  });
});

describe("getThreadMessages — supabase error + empty result", () => {
  it("surfaces supabase error.message as reason", async () => {
    orderMock.mockResolvedValueOnce({ data: null, error: { message: "PGRST116" } });
    const r = await getThreadMessages(VALID_CONV, VALID_CURRENT, "debtor-email");
    expect(r).toEqual({ ok: false, reason: "PGRST116" });
  });

  it("returns { ok: true, messages: [] } on empty data", async () => {
    orderMock.mockResolvedValueOnce({ data: [], error: null });
    const r = await getThreadMessages(VALID_CONV, VALID_CURRENT, "debtor-email");
    expect(r).toEqual({ ok: true, messages: [] });
  });
});
