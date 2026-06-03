// Phase 3 Plan 01 Task 0b — Tests for /automations/[swarm]/review/page.tsx.
//
// Covers:
//   1. Renders BulkReviewClientShell when the swarm exists + enabled.
//   2. Calls notFound() for unknown / disabled swarm.
//   3. Static-import audit: page.tsx does NOT pull in detail-pane.tsx or
//      option-z-detail-pane.tsx (UI-SPEC §13 anti-drift #4 — no side-pane
//      reverts).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Static-import audit (Test 3) — runs first because it does not depend on
// runtime mocks. Reads page.tsx off disk and asserts the negative space.
// ---------------------------------------------------------------------------
const PAGE_PATH = join(
  __dirname,
  "..",
  "page.tsx",
);
const PAGE_SOURCE = readFileSync(PAGE_PATH, "utf8");

describe("Bulk Review route — static-import audit (UI-SPEC §13 anti-drift #4)", () => {
  it("does NOT import detail-pane.tsx (no legacy side-pane revert)", () => {
    expect(PAGE_SOURCE).not.toMatch(/from\s+["'].*\/detail-pane["']/);
  });

  it("does NOT import option-z-detail-pane.tsx (no legacy side-pane revert)", () => {
    expect(PAGE_SOURCE).not.toMatch(
      /from\s+["'].*\/option-z-detail-pane["']/,
    );
  });

  it("imports BulkReviewClientShell from the _shell/client-shell module", () => {
    expect(PAGE_SOURCE).toMatch(/BulkReviewClientShell/);
    expect(PAGE_SOURCE).toMatch(/_shell\/client-shell/);
  });

  it("imports hydrateBulkReviewRow (Phase 1 selector — not a custom inline hydrator)", () => {
    expect(PAGE_SOURCE).toMatch(/hydrateBulkReviewRow/);
  });
});

// ---------------------------------------------------------------------------
// Runtime render tests (Tests 1 + 2). Mock notFound + the loaders so we can
// drive the page function under vitest without a full Next runtime.
// ---------------------------------------------------------------------------

const notFoundMock = vi.fn(() => {
  // Mimic Next's notFound() — throws a sentinel so the function bails.
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
// Phase 5 Plan 05-03 — the page now loads swarm_intents disjointly for the
// Topic facet. Mock it alongside the noise-category loader.
const loadSwarmIntentsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...a: unknown[]) => loadSwarmMock(...a),
  loadSwarmNoiseCategories: (...a: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...a),
  loadSwarmIntents: (...a: unknown[]) => loadSwarmIntentsMock(...a),
}));

const hydrateMock = vi.fn();
vi.mock("@/lib/bulk-review/hydrate", () => ({
  hydrateBulkReviewRow: (...a: unknown[]) => hydrateMock(...a),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin,
}));

// Per-table query result store. Each test rewrites these via fakeQueryFor.
interface FakeQueryResult {
  data: unknown;
}
let fakeLabelsResult: FakeQueryResult = { data: [] };

// Chainable count-query stub used by getModeBarCounts (Phase 4 follow-up).
// Each terminal modifier just resolves to a zero count so the page renders.
function modeBarCountChain() {
  // Phase 06 WR-02: the bucket loader's agent_runs query now chains
  // .eq().or().range() (server-side decided-or-done filter + 1000-row paging),
  // and count-head queries still use .eq()/.in()/.gte()/.not(). One self-
  // returning chain covers both; the awaited result carries count:0 AND data:[]
  // so a count-head reads {count:0} and a range page reads {data:[]} (length 0
  // < 1000 → the loader's paging loop drains in one pass).
  const chain: Record<string, unknown> = {
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    not: () => chain,
    or: () => chain,
    range: () => chain,
    then: undefined,
  };
  chain.then = (
    resolve: (v: { count: number; data: unknown[]; error: null }) => void,
  ) => resolve({ count: 0, data: [], error: null });
  return chain;
}

// Phase 5 Plan 05-01 — loadReviewPageData adds reads of email_pipeline.emails
// (.select().in()), debtor.labeling_settings (.select() awaited), and the
// chunked mailbox helpers (automation_runs / swarms). The schema-scoped and
// top-level proxies below return data-tolerant chains for each.
function emailsSelectChain() {
  // .select(cols).in("id", ids) → await → {data, error}
  const chain: Record<string, unknown> = {
    in: () => chain,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
  return chain;
}
function labelingSelectChain() {
  // .select(cols) → await → {data, error}
  return {
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
}
function emailLabelsSelectChain() {
  // Phase 06 WR-01/WR-03: the bucket loader now issues a count-head
  // (select("id",{count,head}) → await) and a composite-cursor paged query
  // (select("id, created_at").order(created_at desc).order(id desc).limit()
  // [+ .not(...in...) per chunk for the Queue complement, + .or(cursor) when
  // paging]). A single self-returning chain supports every modifier; the
  // awaited result carries the paged rows as `data` and their length as `count`
  // so the page renders fakeLabelsResult rows and the count-head reads a total.
  const chain: Record<string, unknown> = {};
  for (const m of ["order", "limit", "not", "in", "or", "eq", "gte", "lt", "gt"]) {
    chain[m] = () => chain;
  }
  chain.then = (
    resolve: (v: { data: unknown[]; count: number; error: null }) => void,
  ) => {
    const rows = (fakeLabelsResult.data as unknown[] | undefined) ?? [];
    resolve({ data: rows, count: rows.length, error: null });
  };
  return chain;
}
// loadMailboxLabels reads automation_runs via .select().eq().not().not().limit()
function mailboxPairsChain() {
  const c: Record<string, unknown> = {
    eq: () => c,
    not: () => c,
    limit: async () => ({ data: [], error: null }),
    in: () => c,
    order: () => c,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [], error: null }),
  };
  return c;
}

const fakeAdmin = {
  schema: (_schemaName: string) => ({
    from: (tableName: string) => ({
      select: () =>
        tableName === "emails"
          ? emailsSelectChain()
          : tableName === "labeling_settings"
            ? labelingSelectChain()
            : emailLabelsSelectChain(),
    }),
  }),
  // Top-level admin.from used by getModeBarCounts + the mailbox helpers.
  from: (tableName: string) => {
    if (tableName === "automation_runs") {
      return { select: () => mailboxPairsChain() };
    }
    if (tableName === "swarms") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { entity_brand: [] },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: (_cols: string, _opts?: { count: "exact"; head: true }) =>
        modeBarCountChain(),
    };
  },
} as const;

beforeEach(() => {
  notFoundMock.mockClear();
  loadSwarmMock.mockReset();
  loadSwarmNoiseCategoriesMock.mockReset();
  loadSwarmIntentsMock.mockReset();
  // Default: empty intents list (Topic facet hydrates from this). Tests that
  // care override per-case; the happy-path Test 1 just needs it to resolve.
  loadSwarmIntentsMock.mockResolvedValue([]);
  hydrateMock.mockReset();
  fakeLabelsResult = { data: [] };
});

// Import after mocks are installed. Dynamic import so each test gets a fresh
// module state when needed.
async function importPage() {
  const mod = await import("../page");
  return mod.default;
}

describe("Bulk Review route — runtime behavior", () => {
  it("Test 2: notFound() for unknown swarm (loadSwarm returns null)", async () => {
    loadSwarmMock.mockResolvedValueOnce(null);
    const BulkReviewPage = await importPage();
    await expect(
      BulkReviewPage({
        params: Promise.resolve({ swarm: "ghost-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("Test 2b: notFound() for a disabled swarm (enabled: false)", async () => {
    loadSwarmMock.mockResolvedValueOnce({
      swarm_type: "debtor-email",
      enabled: false,
    });
    const BulkReviewPage = await importPage();
    await expect(
      BulkReviewPage({
        params: Promise.resolve({ swarm: "debtor-email" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("Test 1: renders BulkReviewClientShell with hydrated rows for an enabled swarm", async () => {
    loadSwarmMock.mockResolvedValueOnce({
      swarm_type: "debtor-email",
      enabled: true,
    });
    fakeLabelsResult = {
      data: [{ id: "lbl-1" }, { id: "lbl-2" }],
    };
    hydrateMock
      .mockResolvedValueOnce({
        email_label_id: "lbl-1",
        swarm_type: "debtor-email",
        email_id: "em-1",
        context_version: "1.0.0",
        stage_0: null,
        stage_1: null,
        stage_2: null,
        stage_3: null,
        stage_3p5: null,
        stage_4: null,
        overrides: {
          axis_1_corrected_category: null,
          axis_1_human_verdict: null,
          axis_2_corrected_customer_account_id: null,
          axis_2_reviewed_by: null,
          axis_2_reviewed_at: null,
          axis_4_draft_quality: null,
          axis_4_feedback_reason: null,
          axis_3_event_ids: [],
        },
      })
      .mockResolvedValueOnce(null); // second hydrate returns null — filtered out
    loadSwarmNoiseCategoriesMock.mockResolvedValueOnce([]);

    const BulkReviewPage = await importPage();
    const element = await BulkReviewPage({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });

    // The page returns a JSX element. We assert it's a single wrapper that
    // contains BulkReviewClientShell with the surviving row.
    expect(element).toBeTruthy();
    expect(hydrateMock).toHaveBeenCalledTimes(2);
    expect(notFoundMock).not.toHaveBeenCalled();

    // Drill into the element tree to find BulkReviewClientShell + assert its
    // props were threaded correctly. Phase 06 Plan 02 — children is now an array
    // ([BulkReviewClientShell, LoadMoreLink]); the shell is the first child.
    type Child = { props?: { rows?: unknown[]; noiseCategories?: unknown[] } };
    type R = { props: { children: Child | Child[] } };
    const children = (element as unknown as R).props.children;
    const childArray = Array.isArray(children) ? children : [children];
    const shellProps = childArray.find(
      (c) => c && c.props && Array.isArray(c.props.rows),
    )!.props as { rows: unknown[]; noiseCategories: unknown[] };
    expect(Array.isArray(shellProps.rows)).toBe(true);
    expect(shellProps.rows).toHaveLength(1); // null was filtered
    expect((shellProps.rows[0] as { email_label_id: string }).email_label_id).toBe(
      "lbl-1",
    );
    expect(Array.isArray(shellProps.noiseCategories)).toBe(true);
  });
});
