// Phase 61-01 (D-FETCH-EMAIL-BODY). Verifies fetchReviewEmailBody:
// - reads automation_runs.result.{message_id, source_mailbox} for the run id
// - calls outlook fetchMessageBody(mailbox, message_id)
// - returns { bodyText, bodyHtml } (bodyHtml is null when empty)
// - throws "automation_run not found" when select returns null
// - throws "automation_run missing message_id or source_mailbox" when jsonb incomplete
// - returns { bodyText: "", bodyHtml: null } when fetchMessageBody returns empty body
// - surfaces fetchMessageBody errors with prefix "outlook fetch failed: ..."

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

  it("returns { bodyText, bodyHtml } from fetchMessageBody", async () => {
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({
      bodyText: "hello world",
      bodyHtml: "<p>hello world</p>",
    });
  });

  it("throws 'automation_run not found' when select returns null", async () => {
    selectError = { message: "no row" };
    await expect(fetchReviewEmailBody("ar-uuid-1")).rejects.toThrow(
      /automation_run not found/,
    );
  });

  it("throws 'automation_run missing message_id or source_mailbox' when jsonb is incomplete", async () => {
    selectData = { result: { source_mailbox: "x@y.nl" } }; // no message_id
    await expect(fetchReviewEmailBody("ar-uuid-1")).rejects.toThrow(
      /missing message_id or source_mailbox/,
    );

    selectData = { result: { message_id: "msg-1" } }; // no source_mailbox
    await expect(fetchReviewEmailBody("ar-uuid-1")).rejects.toThrow(
      /missing message_id or source_mailbox/,
    );

    selectData = { result: null };
    await expect(fetchReviewEmailBody("ar-uuid-1")).rejects.toThrow(
      /missing message_id or source_mailbox/,
    );
  });

  it("returns { bodyText: '', bodyHtml: null } when fetchMessageBody returns empty body", async () => {
    fetchMessageBodyMock.mockResolvedValueOnce({
      bodyText: "",
      bodyHtml: "",
      bodyType: "text",
    });
    const out = await fetchReviewEmailBody("ar-uuid-1");
    expect(out).toEqual({ bodyText: "", bodyHtml: null });
  });

  it("surfaces fetchMessageBody errors with prefix 'outlook fetch failed: ...'", async () => {
    fetchMessageBodyMock.mockRejectedValueOnce(new Error("403 Forbidden"));
    await expect(fetchReviewEmailBody("ar-uuid-1")).rejects.toThrow(
      /outlook fetch failed: 403 Forbidden/,
    );
  });
});
