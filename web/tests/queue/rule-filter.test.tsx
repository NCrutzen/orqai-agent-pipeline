// Phase 60-05 (D-15). Verifies the ?rule=X URL filter applies as a JSONB
// path filter on automation_runs.result.

import { describe, it, expect } from "vitest";

function buildRecorder(): {
  admin: unknown;
  filterCalls: Array<{ table: string; method: string; args: unknown[] }>;
} {
  const filterCalls: Array<{ table: string; method: string; args: unknown[] }> = [];
  function makeQuery(table: string): unknown {
    const q: Record<string, unknown> = {};
    const chain = (method: string) => (...args: unknown[]) => {
      filterCalls.push({ table, method, args });
      return q;
    };
    q.select = chain("select");
    q.eq = chain("eq");
    q.lt = chain("lt");
    q.gte = chain("gte");
    q.order = chain("order");
    q.limit = chain("limit");
    (q as { then?: unknown }).then = (
      onF: (r: { data: unknown; error: unknown }) => unknown,
    ) => onF({ data: [], error: null });
    return q;
  }
  const admin = {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: (t: string) => makeQuery(t),
  };
  return { admin, filterCalls };
}

describe("D-15: ?rule=X filter applies via JSONB path on automation_runs.result", () => {
  it("appends .eq('result->predicted->>rule', ruleKey) to the list query", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, filterCalls } = buildRecorder();
    await loadPageData({ rule: "subject_paid_marker" }, admin as never, "debtor-email");

    const onAr = filterCalls.filter((c) => c.table === "automation_runs");
    expect(onAr).toContainEqual(
      expect.objectContaining({
        method: "eq",
        args: ["result->predicted->>rule", "subject_paid_marker"],
      }),
    );
  });

  it("does NOT add the rule filter when ?rule= is absent", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, filterCalls } = buildRecorder();
    await loadPageData({}, admin as never, "debtor-email");

    const onAr = filterCalls.filter((c) => c.table === "automation_runs");
    const ruleEq = onAr.find(
      (c) =>
        c.method === "eq" &&
        Array.isArray(c.args) &&
        c.args[0] === "result->predicted->>rule",
    );
    expect(ruleEq).toBeUndefined();
  });

  it("Pending promotion tab queries classifier_rules.status='candidate'", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, filterCalls } = buildRecorder();
    await loadPageData({ tab: "pending" }, admin as never, "debtor-email");

    const onCr = filterCalls.filter((c) => c.table === "classifier_rules");
    expect(onCr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["status", "candidate"] }),
    );
  });
});
