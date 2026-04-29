// Phase 61-01 + 61-hotfix (D-FETCH-EMAIL-BODY). Verifies fetchReviewEmailBody
// returns a typed result `{ ok: true, ... } | { ok: false, error }` instead
// of throwing — Next masks server-action throws in production builds, so
// errors must travel through the result envelope to reach the user.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks ----------------------------------------------------------------

let selectError: { message: string } | null = null;
let selectData: { result: Record<string, unknown> | null } | null = {
  result: { message_id: "msg-1", source_mailbox: "x@y.nl" },
};

const adminClientMock = {
  from: vi.fn((_table: string) => ({
    select: (_cols: string) => ({
      eq: (_col: string, _val: unknown) => ({
        single: () =>
          Promise.resolve(
            selectError
              ? { data: null, error: selectError }
              : { data: selectData, error: null },
          ),
      }),
    }),
  })),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminClientMock,
}));

const fetchMessageBodyMock = vi.fn(
  async (
    _mailbox: string,
    _id: string,
  ): Promise<{ bodyText: string; bodyHtml: string; bodyType: "text" | "html" }> => ({
    bodyText: "hello world",
    bodyHtml: "<p>hello world</p>",
    bodyType: "html",
  }),
);

vi.mock("@/lib/outlook", () => ({
  fetchMessageBody: (mailbox: string, id: string) => fetchMessageBodyMock(mailbox, id),
}));

// Import AFTER mocks
import { fetchReviewEmailBody } from "@/app/(dashboard)/automations/debtor-email-review/actions";

beforeEach(() => {
  selectError = null;
  selectData = { result: { message_id: "msg-1", source_mailbox: "x@y.nl" } };
  adminClientMock.from.mockClear();
  fetchMessageBodyMock.mockReset();
  fetchMessageBodyMock.mockResolvedValue({
    bodyText: "hello world",
    bodyHtml: "<p>hello world</p>",
    bodyType: "html",
  });
});

describe("fetchReviewEmailBody (D-FETCH-EMAIL-BODY)", () => {
  it("reads automation_runs.result.{message_id, source_mailbox} for the given run id", async () => {
    await fetchReviewEmailBody("ar-uuid-1");
    expect(adminClientMock.from).toHaveBeenCalledWith("automation_runs");
    expect(fetchMessageBodyMock).toHaveBeenCalledWith("x@y.nl", "msg-1");
  });

  it("returns { ok: true, bodyText, bodyHtml } from fetchMessageBody", async () => {
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({
      ok: true,
      bodyText: "hello world",
      bodyHtml: "<p>hello world</p>",
    });
  });

  it("returns { ok: false, error } when select returns null", async () => {
    selectError = { message: "no row" };
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({ ok: false, error: "automation_run not found" });
  });

  it("returns { ok: false, error: 'missing ...' } when jsonb is incomplete", async () => {
    selectData = { result: { source_mailbox: "x@y.nl" } }; // no message_id
    expect(await fetchReviewEmailBody("ar-uuid-1")).toEqual({
      ok: false,
      error: "automation_run missing message_id or source_mailbox",
    });

    selectData = { result: { message_id: "msg-1" } }; // no source_mailbox
    expect(await fetchReviewEmailBody("ar-uuid-1")).toEqual({
      ok: false,
      error: "automation_run missing message_id or source_mailbox",
    });

    selectData = { result: null };
    expect(await fetchReviewEmailBody("ar-uuid-1")).toEqual({
      ok: false,
      error: "automation_run missing message_id or source_mailbox",
    });
  });

  it("returns { ok: true, bodyText: '', bodyHtml: null } when fetchMessageBody returns empty body", async () => {
    fetchMessageBodyMock.mockResolvedValueOnce({
      bodyText: "",
      bodyHtml: "",
      bodyType: "text",
    });
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({ ok: true, bodyText: "", bodyHtml: null });
  });

  it("surfaces fetchMessageBody errors via { ok: false, error: 'outlook fetch failed: ...' }", async () => {
    // Quiet the diagnostic console.error during this expected-failure test.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMessageBodyMock.mockRejectedValueOnce(new Error("403 Forbidden"));
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({
      ok: false,
      error: "outlook fetch failed: 403 Forbidden",
    });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
