// Phase 56.7-03 (D-08, D-15). Page is now mounted at the dynamic-segment
// route /automations/[swarm]/review. Verifies:
//   - loadPageData threads `swarmType` into the classifier_queue_counts RPC
//     AND into the automation_runs `.eq("swarm_type", …)` filter.
//   - The page's React server component calls notFound() when loadSwarm
//     returns null (unknown or disabled swarm).
//   - The page does NOT import @/lib/outlook (queue-driven, D-10).
//
// Strategy: page.tsx exports a testable `loadPageData(searchParams, admin,
// swarmType)` helper. We run it against a mock admin client builder that
// records all `from(...)/select/eq/...` chain calls.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---- Mocks --------------------------------------------------------------

const loadSwarmMock = vi.fn();
const loadSwarmCategoriesMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...a: unknown[]) => loadSwarmMock(...a),
  loadSwarmCategories: (...a: unknown[]) => loadSwarmCategoriesMock(...a),
}));

const notFoundMock = vi.fn(() => {
  throw new Error("__NEXT_NOT_FOUND__");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

// createAdminClient stub — page calls it once per request. The loader
// helper itself is exercised with a per-test recorder admin instead.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({}),
}));

// Stub the realtime + child components; we're testing data-flow, not JSX.
vi.mock("@/components/automations/automation-realtime-provider", () => ({
  AutomationRealtimeProvider: ({ children }: { children: unknown }) => children,
}));

// ---- Mock admin client builder for loadPageData -------------------------
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
    (q as { single?: unknown }).single = () =>
      Promise.resolve({ data: null, error: null });
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

beforeEach(() => {
  loadSwarmMock.mockReset();
  loadSwarmCategoriesMock.mockReset();
  notFoundMock.mockClear();
});

// ---- Static-source assertions (D-10 holdover) ----------------------------

describe("D-10: page reads automation_runs.status='predicted' only (no Outlook)", () => {
  it("does NOT import @/lib/outlook or call listInboxMessages/classify in page.tsx source", () => {
    const pagePath = resolve(
      __dirname,
      "../../app/(dashboard)/automations/[swarm]/review/page.tsx",
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
    expect(src).toMatch(/loadSwarm\(admin/);
    expect(src).toMatch(/loadSwarmCategories\(/);
    expect(src).toMatch(/notFound\(\)/);
  });

  it("page.tsx never references the 'emails' or 'outlook' tables", () => {
    const pagePath = resolve(
      __dirname,
      "../../app/(dashboard)/automations/[swarm]/review/page.tsx",
    );
    const src = readFileSync(pagePath, "utf8");
    expect(src).not.toMatch(/from\(["']emails["']\)/);
  });
});

// ---- loadPageData behaviour ---------------------------------------------

describe("loadPageData threads swarmType through every Supabase call", () => {
  it("calls admin.rpc('classifier_queue_counts', { p_swarm_type: <swarmType> })", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, rpcCalls } = buildMockAdmin();
    await loadPageData({}, admin as never, "debtor-email");
    expect(rpcCalls).toContainEqual({
      name: "classifier_queue_counts",
      args: { p_swarm_type: "debtor-email" },
    });
  });

  it("queries automation_runs with swarm_type=<swarmType> AND status='predicted' AND limit(100)", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, fromCalls, filterCalls } = buildMockAdmin();
    await loadPageData({}, admin as never, "debtor-email");

    expect(fromCalls).toContain("automation_runs");
    const onAr = filterCalls.filter((c) => c.table === "automation_runs");
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["status", "predicted"] }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["swarm_type", "debtor-email"] }),
    );
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "limit", args: [100] }),
    );
  });

  it("classifier_rules promotedToday filter uses swarm_type=<swarmType>", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, filterCalls } = buildMockAdmin();
    await loadPageData({}, admin as never, "debtor-email");

    const onCr = filterCalls.filter((c) => c.table === "classifier_rules");
    expect(onCr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["status", "promoted"] }),
    );
    expect(onCr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["swarm_type", "debtor-email"] }),
    );
  });

  it("threads a different swarmType end-to-end (e.g. 'sales-email')", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
    );
    const { admin, rpcCalls, filterCalls } = buildMockAdmin();
    await loadPageData({}, admin as never, "sales-email");

    expect(rpcCalls).toContainEqual({
      name: "classifier_queue_counts",
      args: { p_swarm_type: "sales-email" },
    });
    const onAr = filterCalls.filter((c) => c.table === "automation_runs");
    expect(onAr).toContainEqual(
      expect.objectContaining({ method: "eq", args: ["swarm_type", "sales-email"] }),
    );
  });

  it("applies entity / mailbox / topic / before / rule filters from searchParams", async () => {
    const { loadPageData } = await import(
      "@/app/(dashboard)/automations/[swarm]/review/page"
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
      "debtor-email",
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
});

// ---- swarm-aware: notFound() for unknown / disabled swarms --------------

describe("swarm-aware: registry-driven page entry point", () => {
  it("calls notFound() when loadSwarm returns null (unknown swarm)", async () => {
    loadSwarmMock.mockResolvedValue(null);
    loadSwarmCategoriesMock.mockResolvedValue([]);
    const Page = (
      await import("@/app/(dashboard)/automations/[swarm]/review/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ swarm: "bogus-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound() when loadSwarm returns enabled=false", async () => {
    loadSwarmMock.mockResolvedValue({
      swarm_type: "disabled-swarm",
      display_name: "Disabled",
      description: null,
      review_route: "/automations/disabled-swarm/review",
      source_table: "automation_runs",
      enabled: false,
      ui_config: { tree_levels: ["topic"], row_columns: [], drawer_fields: [], default_sort: "created_at desc" },
      side_effects: null,
    });
    loadSwarmCategoriesMock.mockResolvedValue([]);
    const Page = (
      await import("@/app/(dashboard)/automations/[swarm]/review/page")
    ).default;
    await expect(
      Page({
        params: Promise.resolve({ swarm: "disabled-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(/__NEXT_NOT_FOUND__/);
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });
});
