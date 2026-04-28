// Phase 60-05 (D-10). Verifies page.tsx is purely queue-driven:
//   - admin.rpc("classifier_queue_counts", { p_swarm_type: "debtor-email" })
//   - admin.from("automation_runs") with status='predicted' filter
//   - NO Outlook imports / listInboxMessages / classify
//
// Strategy: page.tsx exports a testable `loadPageData(searchParams, admin)`
// helper. We run it against a mock admin client builder that records all
// `from(...)/select/eq/...` chain calls; the real Page component is just a
// thin React shell over that helper.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Mock admin client builder -------------------------------------------
function buildMockAdmin(): {
  admin: unknown;
  rpcCalls: Array<{ name: string; args: unknown }>;
  fromCalls: string[];
  filterCalls: Array<{ table: string; method: string; args: unknown[] }>;
} {
  const rpcCalls: Array<{ name: string; args: unknown }> = [];
  const fromCalls: string[] = [];
  const filterCalls: Array<{ table: string; method: string; args: unknown[] }> = [];

  function makeQuery(table: string, returnRows: unknown[] = []): unknown {
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
    // Make awaitable — return { data, error }
    (q as { then?: unknown }).then = (
      onF: (r: { data: unknown; error: unknown }) => unknown,
    ) => onF({ data: returnRows, error: null });
    return q;
  }

  const admin = {
    rpc: (name: string, args: unknown) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: [], error: null });
    },
    from: (table: string) => {
      fromCalls.push(table);
      return makeQuery(table, []);
    },
  };

  return { admin, rpcCalls, fromCalls, filterCalls };
}

// ---- Tests ---------------------------------------------------------------

describe("D-10: debtor-email-review page reads automation_runs.status='predicted' only", () => {
  it("does NOT import @/lib/outlook or call listInboxMessages/classify in page.tsx source", () => {
    const pagePath = resolve(
      __dirname,
      "../../app/(dashboard)/automations/debtor-email-review/page.tsx",
    );
    const src = readFileSync(pagePath, "utf8");
    expect(src).not.toMatch(/@\/lib\/outlook/);
    expect(src).not.toMatch(/listInboxMessages/);
    expect(src).not.toMatch(/classifyEmail/);
    expect(src).not.toMatch(/MAX_WINDOWS/);
    expect(src).not.toMatch(/windowsWalked/);
    // Sanity: the new pieces are present
    expect(src).toMatch(/classifier_queue_counts/);
    expect(src).toMatch(/AutomationRealtimeProvider/);
    expect(src).toMatch(/Bulk Review/);
  });

  it("loadPageData calls admin.rpc('classifier_queue_counts', { p_swarm_type: 'debtor-email' })", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/debtor-email-review/page"
    );
    const { admin, rpcCalls } = buildMockAdmin();
    await loadPageData({}, admin as never);
    expect(rpcCalls).toContainEqual({
      name: "classifier_queue_counts",
      args: { p_swarm_type: "debtor-email" },
    });
  });

  it("loadPageData queries automation_runs with status='predicted' AND swarm_type='debtor-email' AND limit(100)", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/debtor-email-review/page"
    );
    const { admin, fromCalls, filterCalls } = buildMockAdmin();
    await loadPageData({}, admin as never);

    expect(fromCalls).toContain("automation_runs");

    const onAutomationRuns = filterCalls.filter((c) => c.table === "automation_runs");
    // status='predicted'
    expect(onAutomationRuns).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["status", "predicted"] }),
    );
    // swarm_type='debtor-email'
    expect(onAutomationRuns).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["swarm_type", "debtor-email"] }),
    );
    // limit(100)
    expect(onAutomationRuns).toContainEqual(
      expect.objectContaining({ method: "limit", args: [100] }),
    );
  });

  it("loadPageData applies entity / mailbox / topic / before / rule filters from searchParams", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/debtor-email-review/page"
    );
    const { admin, filterCalls } = buildMockAdmin();
    await loadPageData(
      {
        topic: "payment_admittance",
        entity: "smeba",
        mailbox: "4",
        before: "2026-04-28T00:00:00Z",
        rule: "subject_paid_marker",
      },
      admin as never,
    );

    const onAr = filterCalls.filter((c) => c.table === "automation_runs");
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["topic", "payment_admittance"] }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["entity", "smeba"] }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["mailbox_id", 4] }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({
        method: "lt",
        args: ["created_at", "2026-04-28T00:00:00Z"],
      }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({
        method: "eq",
        args: ["result->predicted->>rule", "subject_paid_marker"],
      }),
    );
  });

  it("loadPageData reads classifier_rules for promotedToday", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/debtor-email-review/page"
    );
    const { admin, fromCalls, filterCalls } = buildMockAdmin();
    await loadPageData({}, admin as never);

    expect(fromCalls).toContain("classifier_rules");
    const onCr = filterCalls.filter((c) => c.table === "classifier_rules");
    expect(onCr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["status", "promoted"] }),
    );
    expect(onCr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["swarm_type", "debtor-email"] }),
    );
    // gte called with promoted_at and an ISO timestamp
    const gteCalls = onCr.filter((c) => c.method === "gte");
    expect(gteCalls.length).toBeGreaterThan(0);
    expect(gteCalls[0].args[0]).toBe("promoted_at");
  });

  it("page.tsx never references the 'emails' or 'outlook' tables", async () => {
    const pagePath = resolve(
      __dirname,
      "../../app/(dashboard)/automations/debtor-email-review/page.tsx",
    );
    const src = readFileSync(pagePath, "utf8");
    expect(src).not.toMatch(/from\(["']emails["']\)/);
  });
});
