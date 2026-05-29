// Phase 4 Plan 02 Task 1 — /patterns route tests.
//
// Mirrors the Phase 3 review-page test layout: mocks notFound + loadSwarm +
// the hydration helper, then exercises the page function under vitest.

import { describe, it, expect, vi, beforeEach } from "vitest";

const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
}));

const loadSwarmMock = vi.fn();
vi.mock("@/lib/swarms/registry", () => ({
  loadSwarm: (...a: unknown[]) => loadSwarmMock(...a),
}));

// Phase 4 follow-up 2026-05-27 — getModeBarCounts queries agent_runs +
// promotion_candidates via admin.from(...). Mock a chainable that resolves
// to a zero-count payload so the page renders past the count fetch.
function modeBarCountChain() {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    in: () => chain,
    gte: () => chain,
    not: () => chain,
    then: undefined,
  };
  chain.then = (resolve: (v: { count: number; error: null }) => void) =>
    resolve({ count: 0, error: null });
  return chain;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => modeBarCountChain(),
    }),
  }),
}));

const hydrateMock = vi.fn();
vi.mock("../_lib/hydrate-candidates", () => ({
  hydrateCandidatesForSwarm: (...a: unknown[]) => hydrateMock(...a),
}));

// PatternsListingShell is exercised in its own test. Mock to a marker so the
// page test only asserts on prop threading.
vi.mock("../components/patterns-listing-shell", () => ({
  PatternsListingShell: (props: Record<string, unknown>) => ({
    type: "PatternsListingShell",
    props,
  }),
}));

beforeEach(() => {
  notFoundMock.mockClear();
  loadSwarmMock.mockReset();
  hydrateMock.mockReset();
});

async function importPage() {
  const mod = await import("../page");
  return mod.default;
}

describe("/automations/[swarm]/patterns route", () => {
  it("calls notFound() for an unknown swarm", async () => {
    loadSwarmMock.mockResolvedValueOnce(null);
    const Page = await importPage();
    await expect(
      Page({ params: Promise.resolve({ swarm: "ghost" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound() for a disabled swarm", async () => {
    loadSwarmMock.mockResolvedValueOnce({
      swarm_type: "debtor-email",
      enabled: false,
    });
    const Page = await importPage();
    await expect(
      Page({ params: Promise.resolve({ swarm: "debtor-email" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("hydrates candidates and renders PatternsListingShell with the hydrated rows", async () => {
    loadSwarmMock.mockResolvedValueOnce({
      swarm_type: "debtor-email",
      enabled: true,
    });
    const sample = [
      {
        id: "c-1",
        kind: "regex_rule",
        swarm_type: "debtor-email",
        stage: "1-noise",
        status: "open",
      },
    ];
    hydrateMock.mockResolvedValueOnce(sample);

    const Page = await importPage();
    const tree = await Page({
      params: Promise.resolve({ swarm: "debtor-email" }),
    });

    expect(hydrateMock).toHaveBeenCalledWith("debtor-email");
    expect(notFoundMock).not.toHaveBeenCalled();
    expect(tree).toBeTruthy();
    // tree is a wrapper div whose children is the PatternsListingShell marker
    type Frag = {
      props: { children: { props: { swarm: unknown; candidates: unknown[] } } };
    };
    const shellProps = (tree as unknown as Frag).props.children.props;
    expect(shellProps.candidates).toEqual(sample);
    expect((shellProps.swarm as { swarm_type: string }).swarm_type).toBe(
      "debtor-email",
    );
  });
});
