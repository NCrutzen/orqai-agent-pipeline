// Phase 67-06 Task 3 — TDD test for loadTaggingFailuresForReview.
//
// Tests the helper in ISOLATION via its injectable `admin` parameter.
// No chainable page-level mock; the stub mirrors only the chain segment
// the helper actually walks (.schema().from().select().in().eq()).
//
// Five locked behaviours:
//   1. Empty pairs → returns empty Map; admin not touched.
//   2. No matching rows → empty Map; chain called with deduped emailIds and
//      .eq("icontroller_tag_status", "failed").
//   3. Single match → Map keyed by automation_run_id with TaggingFailureSummary
//      populated from the email_labels row.
//   4. Multiple pairs sharing one email_id (race/retry collision) → both
//      automation_run_ids resolve, last-write-wins on the email_labels row.
//   5. Supabase error → throws Error containing helper-name + supabase message.

import { describe, it, expect, vi } from "vitest";
import {
  loadTaggingFailuresForReview,
  type TaggingFailureSummary,
} from "../tagging-failures-loader";

type StubRow = {
  id: string;
  email_id: string;
  icontroller_tag_status: string;
  error: string | null;
  screenshot_before_url: string | null;
  screenshot_after_url: string | null;
};

function makeStubAdmin(opts: {
  data?: StubRow[];
  error?: { message: string } | null;
}) {
  const eqMock = vi.fn(async () => ({
    data: opts.data ?? [],
    error: opts.error ?? null,
  }));
  const inMock = vi.fn(() => ({ eq: eqMock }));
  const selectMock = vi.fn(() => ({ in: inMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const schemaMock = vi.fn(() => ({ from: fromMock }));
  return {
    admin: { schema: schemaMock } as unknown as Parameters<
      typeof loadTaggingFailuresForReview
    >[1],
    spies: { schemaMock, fromMock, selectMock, inMock, eqMock },
  };
}

describe("loadTaggingFailuresForReview", () => {
  it("returns empty Map and does NOT touch admin when pairs is empty", async () => {
    const { admin, spies } = makeStubAdmin({ data: [] });
    const result = await loadTaggingFailuresForReview([], admin);
    expect(result.size).toBe(0);
    expect(spies.schemaMock).not.toHaveBeenCalled();
  });

  it("returns empty Map when no email_labels rows match", async () => {
    const { admin, spies } = makeStubAdmin({ data: [] });
    const result = await loadTaggingFailuresForReview(
      [{ automation_run_id: "run-1", email_id: "email-1" }],
      admin,
    );
    expect(result.size).toBe(0);
    expect(spies.schemaMock).toHaveBeenCalledWith("debtor");
    expect(spies.fromMock).toHaveBeenCalledWith("email_labels");
    expect(spies.inMock).toHaveBeenCalledWith("email_id", ["email-1"]);
    expect(spies.eqMock).toHaveBeenCalledWith(
      "icontroller_tag_status",
      "failed",
    );
  });

  it("attaches a tagging summary for each matching pair", async () => {
    const { admin } = makeStubAdmin({
      data: [
        {
          id: "label-1",
          email_id: "email-1",
          icontroller_tag_status: "failed",
          error: "brand_mismatch: Sicli vs smeba",
          screenshot_before_url: "https://example.com/b.png",
          screenshot_after_url: "https://example.com/a.png",
        },
      ],
    });
    const result = await loadTaggingFailuresForReview(
      [{ automation_run_id: "run-1", email_id: "email-1" }],
      admin,
    );
    expect(result.size).toBe(1);
    const summary = result.get("run-1") as TaggingFailureSummary;
    expect(summary).toMatchObject({
      email_label_id: "label-1",
      icontroller_tag_status: "failed",
      error: "brand_mismatch: Sicli vs smeba",
      screenshot_before_url: "https://example.com/b.png",
      screenshot_after_url: "https://example.com/a.png",
    });
  });

  it("dedupes email_ids across pairs and last-write-wins on collisions", async () => {
    const { admin, spies } = makeStubAdmin({
      data: [
        {
          id: "label-old",
          email_id: "email-1",
          icontroller_tag_status: "failed",
          error: "old",
          screenshot_before_url: null,
          screenshot_after_url: null,
        },
        {
          id: "label-new",
          email_id: "email-1",
          icontroller_tag_status: "failed",
          error: "new",
          screenshot_before_url: null,
          screenshot_after_url: null,
        },
      ],
    });
    const result = await loadTaggingFailuresForReview(
      [
        { automation_run_id: "run-A", email_id: "email-1" },
        { automation_run_id: "run-B", email_id: "email-1" },
      ],
      admin,
    );
    // .in() should be called with deduped ["email-1"]
    expect(spies.inMock).toHaveBeenCalledWith("email_id", ["email-1"]);
    expect(result.size).toBe(2);
    expect(result.get("run-A")?.email_label_id).toBe("label-new");
    expect(result.get("run-B")?.email_label_id).toBe("label-new");
  });

  it("throws with helper-prefixed message when supabase returns an error", async () => {
    const { admin } = makeStubAdmin({
      data: [],
      error: { message: "boom" },
    });
    await expect(
      loadTaggingFailuresForReview(
        [{ automation_run_id: "run-1", email_id: "email-1" }],
        admin,
      ),
    ).rejects.toThrow(/loadTaggingFailuresForReview.*boom/);
  });
});
