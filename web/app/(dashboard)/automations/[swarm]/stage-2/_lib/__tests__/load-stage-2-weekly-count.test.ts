// Phase 81-02 Task 1 — TDD unit test for loadStage2WeeklyCount.
//
// Tests the head-count helper in isolation via its injectable `admin`
// parameter. Stub mirrors the exact chain segment the helper walks:
//   admin.schema("debtor").from("email_labels").select(..., {head: true})
//        .eq("icontroller_tag_status","failed").gte("created_at", <iso>)
//
// Four locked behaviours:
//   1. Returns numeric count from supabase response.
//   2. Returns 0 when count is null (no rows match).
//   3. Throws prefixed Error on supabase error.
//   4. Walks the chain with the expected args (schema/from/select/eq/gte).

import { describe, it, expect, vi } from "vitest";
import { loadStage2WeeklyCount } from "../load-stage-2-weekly-count";

function makeStubAdmin(opts: {
  count?: number | null;
  error?: { message: string } | null;
}) {
  const gteMock = vi.fn(async () => ({
    count: opts.count ?? null,
    error: opts.error ?? null,
  }));
  const eqMock = vi.fn(() => ({ gte: gteMock }));
  const selectMock = vi.fn(() => ({ eq: eqMock }));
  const fromMock = vi.fn(() => ({ select: selectMock }));
  const schemaMock = vi.fn(() => ({ from: fromMock }));
  return {
    admin: { schema: schemaMock } as unknown as Parameters<
      typeof loadStage2WeeklyCount
    >[0],
    spies: { schemaMock, fromMock, selectMock, eqMock, gteMock },
  };
}

describe("loadStage2WeeklyCount", () => {
  it("returns the numeric count from supabase", async () => {
    const { admin } = makeStubAdmin({ count: 7 });
    const result = await loadStage2WeeklyCount(admin);
    expect(result).toBe(7);
  });

  it("returns 0 when supabase count is null", async () => {
    const { admin } = makeStubAdmin({ count: null });
    const result = await loadStage2WeeklyCount(admin);
    expect(result).toBe(0);
  });

  it("throws a prefixed error when supabase returns an error", async () => {
    const { admin } = makeStubAdmin({
      count: null,
      error: { message: "boom" },
    });
    await expect(loadStage2WeeklyCount(admin)).rejects.toThrow(
      "loadStage2WeeklyCount: boom",
    );
  });

  it("walks the expected chain: schema=debtor, table=email_labels, head-count, status=failed, created_at>=7d-ago", async () => {
    const { admin, spies } = makeStubAdmin({ count: 3 });
    const before = Date.now();
    await loadStage2WeeklyCount(admin);

    expect(spies.schemaMock).toHaveBeenCalledWith("debtor");
    expect(spies.fromMock).toHaveBeenCalledWith("email_labels");
    expect(spies.selectMock).toHaveBeenCalledWith("id", {
      count: "exact",
      head: true,
    });
    expect(spies.eqMock).toHaveBeenCalledWith(
      "icontroller_tag_status",
      "failed",
    );

    expect(spies.gteMock).toHaveBeenCalledTimes(1);
    const [col, iso] = spies.gteMock.mock.calls[0] as unknown as [
      string,
      string,
    ];
    expect(col).toBe("created_at");
    // ISO string for ~7 days ago, sanity bounds:
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const parsed = Date.parse(iso);
    expect(Number.isFinite(parsed)).toBe(true);
    // Should be roughly (now - 7d). Allow a 5s window for clock drift.
    expect(parsed).toBeLessThanOrEqual(before - sevenDaysMs + 5_000);
    expect(parsed).toBeGreaterThanOrEqual(before - sevenDaysMs - 5_000);
  });
});
