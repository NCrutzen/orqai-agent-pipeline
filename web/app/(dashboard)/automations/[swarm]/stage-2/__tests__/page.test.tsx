// Phase 81 Plan 02 Task 2 — RTL render test for the Stage 2 placeholder.
//
// Establishes the RSC-page test pattern in this tree: the page is an
// async server component, so we `await` the call and pass the result
// into RTL's `render`. Loaders are mocked at the module boundary.
//
// Three cases:
//   1. debtor-email — count renders ("7"), ↗ Open link points to the
//      tagging-failures debug surface, intro paragraph present, no
//      "Bulk Review" string, no em-dash.
//   2. other swarm (sales-email) — count renders "—", no ↗ Open link,
//      loadStage2WeeklyCount NOT called.
//   3. unknown swarm — rendering throws NEXT_NOT_FOUND (loadSwarm→null).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// --- module mocks --------------------------------------------------------

const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ __stub: true }),
}));

const loadStage2WeeklyCountMock = vi.fn();
vi.mock("../_lib/load-stage-2-weekly-count", () => ({
  loadStage2WeeklyCount: (...args: unknown[]) =>
    loadStage2WeeklyCountMock(...args),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// _shell components rely on registry-derived stage tabs; we stub them
// so the test stays focused on Stage 2's own body. The page imports
// PageHeader + StageTabStrip via relative paths, so we mock those
// relative paths directly.
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
      data-count-2={counts?.[2] ?? ""}
    />
  ),
}));

import Stage2Page from "../page";

function makeSwarmRow(swarm_type: string) {
  return {
    swarm_type,
    display_name:
      swarm_type === "debtor-email" ? "Debtor Email" : "Sales Email",
    enabled: true,
    stage2_entity_resolver:
      swarm_type === "debtor-email" ? "debtor-email/label-resolver" : null,
    mailboxes: [],
  };
}

beforeEach(() => {
  loadSwarmMock.mockReset();
  loadStage2WeeklyCountMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Stage2Page (placeholder)", () => {
  it("debtor-email: renders count + ↗ Open link, no Bulk Review, no em-dash", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadStage2WeeklyCountMock.mockResolvedValue(7);

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
    });
    const { container } = render(ui);

    expect(
      screen.getByText(/Customer-mapping issues this week:/i),
    ).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    const link = screen.getByRole("link", { name: /Open/ });
    expect(link).toHaveAttribute(
      "href",
      "/swarm/debtor-email/tagging-failures",
    );

    expect(container.textContent ?? "").toContain(
      "Stage 2 (Customer mapping)",
    );
    expect(container.textContent ?? "").not.toContain("Bulk Review");
    // The intro paragraph contains an em-dash ("Stage 2 (Customer mapping)
    // — entity / customer resolution"), so scope the no-em-dash check to
    // the count strong element — that's where "—" would render when the
    // count is null.
    const countStrong = screen.getByText("7");
    expect(countStrong.textContent).not.toContain("—");

    // Stage tab strip wired with currentStage=2 and counts[2]=7.
    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-current-stage")).toBe("2");
    expect(tabs.getAttribute("data-count-2")).toBe("7");

    expect(loadStage2WeeklyCountMock).toHaveBeenCalledTimes(1);
  });

  it("non-debtor swarm: count is em-dash, no ↗ link, loader NOT called", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("sales-email"));

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "sales-email" }),
    });
    const { container } = render(ui);

    expect(container.textContent ?? "").toContain(
      "Customer-mapping issues this week:",
    );
    expect(container.textContent ?? "").toContain("—");
    expect(
      screen.queryByRole("link", { name: /Open/ }),
    ).not.toBeInTheDocument();

    // Stage tab strip count falls back to 0 (per `stage2Count ?? 0`).
    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-count-2")).toBe("0");

    expect(loadStage2WeeklyCountMock).not.toHaveBeenCalled();
  });

  it("unknown swarm: notFound() throws NEXT_NOT_FOUND", async () => {
    loadSwarmMock.mockResolvedValue(null);

    await expect(
      Stage2Page({ params: Promise.resolve({ swarm: "unknown-swarm" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(loadStage2WeeklyCountMock).not.toHaveBeenCalled();
  });
});
