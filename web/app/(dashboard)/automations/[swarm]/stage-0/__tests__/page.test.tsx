// Phase 82 Plan 02 Task 1 — RTL render test for Stage 0 unified-shell page.
//
// V1 verification check (CONTEXT.md): Stage 0 renders the unified shell with
//   - info banner ("Stage 0 (Safety) — prompt-injection filter...") preserved
//     ABOVE the row list (D-16).
//   - empty-state copy "No rows yet" + "Stage 0 awaits backend wiring..." (D-15).
//   - _shell/mailbox-filter mounted (trigger label "All mailboxes").
//   - NO AutomationRealtimeProvider — Stage 0 has no realtime channel today
//     (RESEARCH §Realtime Channels Per Stage). Phase 82 does NOT unify channels.
//
// RSC-page RTL pattern (established Phase 81-02): await the async component,
// pass the result into render(), mock loaders at the module boundary.
//
// Hard-separation reminder (docs/agentic-pipeline/README.md): Stage 0 is the
// safety filter — upstream of and orthogonal to the Stage 1 noise / Stage 3
// intent split. This page touches NEITHER registry; categories=[], intents=[].

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// --- module mocks --------------------------------------------------------

const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...args: unknown[]) => loadSwarmMock(...args),
}));

// Phase 88.2-02 (D-04..D-06): chainable Proxy admin mock with default empty
// response so loaders in the page call-graph don't blow up on `.from(...)`.
// Stage-shell tests only assert on rendered shell — data-shape tests live
// in the per-loader unit tests. Build the mock inside the factory itself —
// no closure refs, no hoist hazards.
vi.mock("@/lib/supabase/admin", async () => {
  const { createSupabaseAdminMock } = await import("@/test-utils/supabase-mock");
  const adminMock = createSupabaseAdminMock({
    defaultResponse: { data: [], error: null },
  });
  return { admin: adminMock, createAdminClient: () => adminMock };
});

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/automations/debtor-email/stage-0",
  useSearchParams: () => new URLSearchParams(),
}));

// Stub PageHeader + StageTabStrip so the test stays focused on Stage 0's body.
vi.mock("../../_shell/page-header", () => ({
  PageHeader: ({ swarm }: { swarm: { swarm_type: string } }) => (
    <div data-testid="page-header">{swarm.swarm_type}</div>
  ),
}));

vi.mock("../../_shell/stage-tab-strip", () => ({
  StageTabStrip: ({ currentStage }: { currentStage: number }) => (
    <div data-testid="stage-tab-strip" data-current-stage={currentStage} />
  ),
}));

import Stage0Page from "../page";

function makeSwarmRow(swarm_type: string) {
  return {
    swarm_type,
    display_name: swarm_type === "debtor-email" ? "Debtor Email" : swarm_type,
    enabled: true,
    stage2_entity_resolver: null,
    mailboxes: [],
  };
}

beforeEach(() => {
  loadSwarmMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("Stage 0 page (unified shell)", () => {
  it("renders Stage 0 info banner above the row list (D-16)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));

    const ui = await Stage0Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    const { container } = render(ui);

    // Info banner copy preserved verbatim from prior placeholder.
    expect(container.textContent ?? "").toContain("Stage 0 (Safety)");
    expect(container.textContent ?? "").toContain("prompt-injection filter");
  });

  it("renders empty-state copy when no rows (D-15)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));

    const ui = await Stage0Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    // Phase 88.2-04: empty-state copy is now "No Stage 0 verdicts yet" +
    // explanatory body. (Test originally asserted the placeholder "No rows
    // yet / awaits backend wiring" copy that landed when the shell was first
    // mounted in D-15.)
    expect(screen.getByText(/No Stage 0 verdicts yet/i)).toBeInTheDocument();
  });

  it("mounts _shell/mailbox-filter (trigger 'All mailboxes')", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));

    const ui = await Stage0Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
      searchParams: Promise.resolve({}),
    });
    render(ui);

    expect(
      screen.getByRole("button", { name: /Filter by mailbox/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("All mailboxes")).toBeInTheDocument();
  });

  it("does NOT mount AutomationRealtimeProvider (Stage 0 has no realtime channel)", async () => {
    loadSwarmMock.mockResolvedValue(makeSwarmRow("debtor-email"));

    const ui = await Stage0Page({
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
      Stage0Page({
        params: Promise.resolve({ swarm: "unknown-swarm" }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
