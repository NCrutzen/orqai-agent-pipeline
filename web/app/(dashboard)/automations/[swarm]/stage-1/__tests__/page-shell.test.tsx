// Phase 81 Plan 03 Task 3 — RTL render test for the new Stage 1 shell-wrapped page.
//
// Asserts the canonical chrome:
//   (a) <PageHeader> + <StageTabStrip currentStage={1}> render on top.
//   (b) No "Bulk Review" string appears anywhere in the rendered output.
//   (c) <NoiseCategoryChipStrip> renders below the tab strip.
//   (d) Body uses the 2-col grid (minmax(380px,460px)_1fr) — NOT a 3-col grid.
//   (e) When searchParams.sub === "pending", <CandidateRuleList> + Pending
//       detail pane render instead of <RowList> + <DetailPane>.
//   (f) Cross-swarm: chip-strip prop `categories` reflects the active swarm's
//       registry rows (sales-email mock has different categories than
//       debtor-email mock — goal-backward check #10).
//
// All heavy children are mocked at the module boundary so the test stays
// focused on the RSC envelope.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// --- module mocks --------------------------------------------------------

const loadSwarmMock = vi.fn();
const loadSwarmNoiseCategoriesMock = vi.fn();
const loadSwarmIntentsMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
  loadSwarmNoiseCategories: (...args: unknown[]) =>
    loadSwarmNoiseCategoriesMock(...args),
  loadSwarmIntents: (...args: unknown[]) => loadSwarmIntentsMock(...args),
}));

// Chainable admin client used by loadPageData. All chains resolve to empty
// data so the default branch produces a no-row PageData. Defined inside the
// vi.mock factory to satisfy Vitest's hoisting (factory runs before any
// top-level const).
vi.mock("@/lib/supabase/admin", () => {
  const b: Record<string, unknown> = {};
  b.rpc = () => Promise.resolve({ data: [], error: null });
  b.from = () => b;
  b.schema = () => b;
  b.select = () => b;
  b.eq = () => b;
  b.gte = () => b;
  b.lt = () => b;
  b.order = () => b;
  b.limit = () => b;
  b.in = () => b;
  b.single = () => Promise.resolve({ data: null, error: null });
  b.then = (cb: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve(cb({ data: [], error: null }));
  return { createAdminClient: () => b };
});

const loadStage2WeeklyCountMock = vi.fn();
vi.mock("../../stage-2/_lib/load-stage-2-weekly-count", () => ({
  loadStage2WeeklyCount: (...args: unknown[]) =>
    loadStage2WeeklyCountMock(...args),
}));

const loadRuleSamplesMock = vi.fn();
const promoteRuleMock = vi.fn();
const rejectRuleMock = vi.fn();
vi.mock("../actions", () => ({
  loadRuleSamples: (...args: unknown[]) => loadRuleSamplesMock(...args),
  promoteRule: (...args: unknown[]) => promoteRuleMock(...args),
  rejectRule: (...args: unknown[]) => rejectRuleMock(...args),
  // recordVerdict / fetchReviewEmailBody / safety actions are imported
  // transitively by DetailPane / RowList — stubbed harmlessly.
  recordVerdict: vi.fn(),
  fetchReviewEmailBody: vi.fn(),
  markSafeAndReprocess: vi.fn(),
  dismissSafetyReview: vi.fn(),
  escalateToKanban: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/automations/debtor-email/stage-1",
  useSearchParams: () => new URLSearchParams(""),
}));

// _shell components — mock for goal-backward check (a)/(b).
vi.mock("../../_shell/page-header", () => ({
  PageHeader: ({ swarm }: { swarm: { swarm_type: string } }) => (
    <div data-testid="page-header">{swarm.swarm_type}</div>
  ),
}));

vi.mock("../../_shell/stage-tab-strip", () => ({
  StageTabStrip: ({
    currentStage,
    counts,
  }: {
    currentStage: number;
    counts?: Record<number, number>;
  }) => (
    <div
      data-testid="stage-tab-strip"
      data-current-stage={currentStage}
      data-count-1={counts?.[1] ?? ""}
      data-count-2={counts?.[2] ?? ""}
    />
  ),
}));

// Chip strip — mocked to a marker so (c)+(f) can assert prop wiring.
vi.mock("../noise-category-chip-strip", () => ({
  NoiseCategoryChipStrip: ({
    categories,
    activeSub,
  }: {
    categories: Array<{ category_key: string }>;
    activeSub: string | null;
  }) => (
    <div
      data-testid="noise-category-chip-strip"
      data-categories={categories.map((c) => c.category_key).join(",")}
      data-active-sub={activeSub ?? ""}
    />
  ),
}));

// CandidateRuleList / PendingPromotionDetailPane — markers for (e).
vi.mock("../candidate-rule-list", () => ({
  CandidateRuleList: () => <div data-testid="candidate-rule-list" />,
}));
vi.mock("../pending-promotion-detail-pane", () => ({
  PendingPromotionDetailPane: () => (
    <div data-testid="pending-promotion-detail-pane" />
  ),
}));

// RowList / DetailPane — markers for the default branch.
vi.mock("../row-list", () => ({
  RowList: () => <div data-testid="row-list" />,
}));
vi.mock("../detail-pane", () => ({
  DetailPane: () => <div data-testid="detail-pane" />,
}));
vi.mock("../keyboard-shortcuts", () => ({
  KeyboardShortcuts: () => null,
  Cheatsheet: () => null,
}));
vi.mock("../selection-context", () => ({
  SelectionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="selection-provider">{children}</div>
  ),
}));
vi.mock("@/components/automations/automation-realtime-provider", () => ({
  AutomationRealtimeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="realtime-provider">{children}</div>
  ),
}));

import Stage1Page from "../page";

function makeSwarmRow(swarm_type: string) {
  return {
    swarm_type,
    display_name: swarm_type === "debtor-email" ? "Debtor Email" : "Sales Email",
    description: null,
    review_route: `/automations/${swarm_type}/stage-1`,
    source_table: "automation_runs",
    enabled: true,
    ui_config: {
      tree_levels: [],
      row_columns: [],
      drawer_fields: [],
      default_sort: "created_at",
    },
    side_effects: null,
    stage1_regex_module: null,
    stage2_entity_resolver:
      swarm_type === "debtor-email" ? "debtor-email/label-resolver" : null,
    stage3_coordinator_agent_key: null,
    canonical_context_shape: null,
    entity_brand: null,
  };
}

const debtorCats = [
  {
    swarm_type: "debtor-email",
    category_key: "payment",
    display_label: "Payment",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 1,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "unknown",
    display_label: "Unknown",
    outlook_label: null,
    action: "reject" as const,
    swarm_dispatch: null,
    display_order: 99,
    enabled: true,
  },
];

const salesCats = [
  {
    swarm_type: "sales-email",
    category_key: "lead",
    display_label: "New lead",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 1,
    enabled: true,
  },
];

beforeEach(() => {
  loadSwarmMock.mockReset();
  loadSwarmNoiseCategoriesMock.mockReset();
  loadSwarmIntentsMock.mockReset();
  loadStage2WeeklyCountMock.mockReset();
  loadRuleSamplesMock.mockReset();
  loadSwarmIntentsMock.mockResolvedValue([]);
  loadStage2WeeklyCountMock.mockResolvedValue(0);
  loadRuleSamplesMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe("Stage 1 page shell (Phase 81 Plan 03)", () => {
  it("(a)+(b)+(c)+(d): renders PageHeader + StageTabStrip(currentStage=1) + chip strip; no 'Bulk Review' string; default branch shows RowList + DetailPane in 2-col grid", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadSwarmNoiseCategoriesMock.mockResolvedValue(debtorCats);

    const ui = await Stage1Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    // (a)
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-current-stage")).toBe("1");

    // (b)
    expect(container.textContent ?? "").not.toContain("Bulk Review");
    expect(container.textContent ?? "").not.toContain(
      "Review predicted classifications",
    );

    // (c)
    expect(screen.getByTestId("noise-category-chip-strip")).toBeInTheDocument();

    // (d) — 2-col grid present, 3-col grid absent
    const html = container.innerHTML;
    expect(html).toContain("grid-cols-[minmax(380px,460px)_1fr]");
    expect(html).not.toContain("clamp(220px,18vw,280px)");

    // Default branch
    expect(screen.getByTestId("row-list")).toBeInTheDocument();
    expect(screen.getByTestId("detail-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("candidate-rule-list")).not.toBeInTheDocument();
  });

  it("(e) ?sub=pending → CandidateRuleList + PendingPromotionDetailPane render instead of RowList + DetailPane", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadSwarmNoiseCategoriesMock.mockResolvedValue(debtorCats);

    const ui = await Stage1Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({ sub: "pending" }),
    });
    render(ui);

    expect(screen.getByTestId("candidate-rule-list")).toBeInTheDocument();
    expect(
      screen.getByTestId("pending-promotion-detail-pane"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("row-list")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-pane")).not.toBeInTheDocument();

    // chip strip's activeSub prop reflects the URL state
    const strip = screen.getByTestId("noise-category-chip-strip");
    expect(strip.getAttribute("data-active-sub")).toBe("pending");
  });

  it("(f) cross-swarm: chip strip receives the active swarm's noise categories", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("sales-email"));
    loadSwarmNoiseCategoriesMock.mockResolvedValue(salesCats);

    const ui = await Stage1Page({
      params: Promise.resolve({ swarm: "sales-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    const strip = screen.getByTestId("noise-category-chip-strip");
    expect(strip.getAttribute("data-categories")).toBe("lead");
    // Sanity: no debtor-only chip leaked in.
    expect(strip.getAttribute("data-categories")).not.toContain("payment");

    // Stage 2 count is 0 for non-debtor swarms (no telemetry today).
    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-count-2")).toBe("0");

    // loadStage2WeeklyCount must NOT be called for non-debtor swarms.
    expect(loadStage2WeeklyCountMock).not.toHaveBeenCalled();
  });

  it("unknown swarm → notFound throws NEXT_NOT_FOUND", async () => {
    loadSwarmMock.mockResolvedValue(null);

    await expect(
      Stage1Page({
        params: Promise.resolve({ swarm: "unknown-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
