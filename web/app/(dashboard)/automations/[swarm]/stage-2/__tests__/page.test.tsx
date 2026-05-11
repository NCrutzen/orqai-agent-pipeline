// Phase 82 Plan 03 — Stage 2 unified-shell migration tests.
//
// V3 verification check (CONTEXT.md): Stage 2 renders the unified shell with
// the Phase 81 D-12 tagging-failures count banner preserved ABOVE the row
// list (OQ-3 resolution: banner-above, not folded into empty-state copy).
//
// Behaviors covered:
//   1. debtor-email — banner shows "Customer-mapping issues this week: N"
//      with ↗ Open link to /swarm/{swarm}/tagging-failures; loader called.
//   2. non-debtor-email (sales-email) — banner falls back to em-dash, no
//      ↗ Open link, loadStage2WeeklyCount NOT called (Phase 81-02 contract).
//   3. unified shell composition — empty RowList renders empty-state copy;
//      MailboxFilter trigger present; StageTabStrip currentStage=2; NO
//      AutomationRealtimeProvider; no "Bulk Review" copy.
//   4. unknown swarm — notFound() throws NEXT_NOT_FOUND.
//
// RSC-page RTL pattern (Phase 81-02 / 82-02): await the async component,
// pass the result into render(), mock loaders at module boundary.

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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/automations/debtor-email/stage-2",
  useSearchParams: () => new URLSearchParams(),
}));

// Stub PageHeader + StageTabStrip so the test stays focused on Stage 2 body.
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

describe("Stage 2 page (unified shell)", () => {
  it("debtor-email: renders count banner with ↗ Open link above row list", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadStage2WeeklyCountMock.mockResolvedValue(7);

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
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

    expect(container.textContent ?? "").not.toContain("Bulk Review");

    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-current-stage")).toBe("2");
    expect(tabs.getAttribute("data-count-2")).toBe("7");

    expect(loadStage2WeeklyCountMock).toHaveBeenCalledTimes(1);
  });

  it("non-debtor swarm: count is em-dash, no ↗ link, loader NOT called", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("sales-email"));

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "sales-email" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    expect(container.textContent ?? "").toContain(
      "Customer-mapping issues this week:",
    );
    // Em-dash falls back in the count slot.
    expect(container.textContent ?? "").toContain("—");
    expect(
      screen.queryByRole("link", { name: /Open/ }),
    ).not.toBeInTheDocument();

    const tabs = screen.getByTestId("stage-tab-strip");
    expect(tabs.getAttribute("data-count-2")).toBe("0");

    expect(loadStage2WeeklyCountMock).not.toHaveBeenCalled();
  });

  it("renders empty-state copy for empty row list (D-15)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadStage2WeeklyCountMock.mockResolvedValue(0);

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(screen.getByText(/No rows yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Stage 2 awaits backend wiring/i),
    ).toBeInTheDocument();
  });

  it("mounts _shell/mailbox-filter (trigger 'All mailboxes')", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadStage2WeeklyCountMock.mockResolvedValue(3);

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByRole("button", { name: /Filter by mailbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("All mailboxes")).toBeInTheDocument();
  });

  it("does NOT mount AutomationRealtimeProvider (Stage 2 has no realtime channel)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));
    loadStage2WeeklyCountMock.mockResolvedValue(1);

    const ui = await Stage2Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    expect(
      container.querySelector("[data-testid='automation-realtime']"),
    ).toBeNull();
    expect(container.textContent ?? "").not.toContain(
      "AutomationRealtimeProvider",
    );
  });

  it("unknown swarm: notFound() throws NEXT_NOT_FOUND", async () => {
    loadSwarmMock.mockResolvedValue(null);

    await expect(
      Stage2Page({
        params: Promise.resolve({ swarm: "unknown-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(loadStage2WeeklyCountMock).not.toHaveBeenCalled();
  });
});
