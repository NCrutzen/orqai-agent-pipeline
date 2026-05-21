// Phase 86 Plan 03 Task 3 — IntentProposalsClientShell RTL coverage.
//
// Verifies:
//   T1: empty state copy is verbatim D-06 ("No novel intent proposals yet" +
//       the locked body line).
//   T2: cluster rows render centroid_label + member_count when clusters are
//       provided; <details> expansion reveals member_labels.
//   T3: refresh button calls the triggerRefresh server action (mocked) and
//       enters the "Refreshing…" disabled state.
//   T4: tab mount fires logTabView exactly once (mocked).
//   T5: NO read-write affordance — the shell carries zero "Promote",
//       "Approve", "Dismiss", or "Reject" surface (V9.0 territory).
//
// Hard-separation reminder (docs/agentic-pipeline/README.md): this surface
// is read-only over intent_proposal_clusters. The shell never writes
// swarm_intents and never reads swarm_noise_categories.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ClusterRow } from "@/lib/automations/intent-proposals/types";

// --- module mocks --------------------------------------------------------

const logTabViewMock = vi.fn().mockResolvedValue(undefined);
const triggerRefreshMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock("../actions", () => ({
  logTabView: (...a: unknown[]) => logTabViewMock(...a),
  triggerRefresh: (...a: unknown[]) => triggerRefreshMock(...a),
}));

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Import AFTER mocks so the module bindings resolve to the spies.
import { IntentProposalsClientShell } from "../client-shell";

afterEach(() => {
  cleanup();
  logTabViewMock.mockClear();
  triggerRefreshMock.mockClear();
  pushMock.mockClear();
});

const sampleCluster: ClusterRow = {
  id: "00000000-0000-4000-8000-000000000001",
  swarm_type: "debtor-email",
  centroid_label: "wka_data_request",
  member_count: 5,
  member_labels: ["wka_data_request", "wka_request", "wka_filing"],
  sample_email_ids: ["evt-1", "evt-2", "evt-3"],
  window_start: "2026-04-20T00:00:00Z",
  window_end: "2026-05-20T00:00:00Z",
  refreshed_at: "2026-05-20T04:00:00Z",
};

describe("IntentProposalsClientShell", () => {
  it("T1 — renders verbatim D-06 empty state when clusters=[]", () => {
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[]}
        crossSwarmDropdownVisible={false}
      />,
    );
    expect(screen.getByText("No novel intent proposals yet")).toBeTruthy();
    expect(
      screen.getByText(
        "The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic.",
      ),
    ).toBeTruthy();
  });

  it("T2 — renders cluster centroid + member_count + samples on expansion", async () => {
    const user = userEvent.setup();
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[sampleCluster]}
        crossSwarmDropdownVisible={false}
      />,
    );
    expect(screen.getByText("wka_data_request")).toBeTruthy();
    expect(screen.getByText("5 this window")).toBeTruthy();

    const summary = screen.getByText("wka_data_request");
    await user.click(summary);
    expect(
      screen.getByText(/wka_data_request, wka_request, wka_filing/),
    ).toBeTruthy();
    expect(screen.getByText(/evt-1, evt-2, evt-3/)).toBeTruthy();
  });

  it("T3 — refresh button calls triggerRefresh and shows 'Refreshing…'", async () => {
    const user = userEvent.setup();
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[]}
        crossSwarmDropdownVisible={false}
      />,
    );
    const button = screen.getByRole("button", { name: /refresh clusters/i });
    expect(button.textContent).toBe("Refresh");
    await user.click(button);
    expect(triggerRefreshMock).toHaveBeenCalledTimes(1);
    // After click the button enters the disabled "Refreshing…" state for 5s.
    const after = screen.getByRole("button", { name: /refresh clusters/i });
    expect(after.textContent).toBe("Refreshing…");
    expect((after as HTMLButtonElement).disabled).toBe(true);
  });

  it("T4 — mount fires logTabView exactly once with the right scope", () => {
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[]}
        crossSwarmDropdownVisible={false}
      />,
    );
    expect(logTabViewMock).toHaveBeenCalledTimes(1);
    expect(logTabViewMock).toHaveBeenCalledWith({
      swarm_type: "debtor-email",
      cluster_id: null,
    });
  });

  it("T4b — filter='all' passes swarm_type=null to logTabView", () => {
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="all"
        clusters={[]}
        crossSwarmDropdownVisible={true}
      />,
    );
    expect(logTabViewMock).toHaveBeenCalledTimes(1);
    expect(logTabViewMock).toHaveBeenCalledWith({
      swarm_type: null,
      cluster_id: null,
    });
  });

  it("T5 — NO promote / approve / dismiss / reject affordance (read-only per D-04)", () => {
    const { container } = render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[sampleCluster]}
        crossSwarmDropdownVisible={false}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/promote/);
    expect(html).not.toMatch(/approve/);
    expect(html).not.toMatch(/dismiss/);
    // Use word-boundary so "refresh" doesn't false-positive on "reject".
    expect(html).not.toMatch(/\breject\b/);
  });

  it("T6 — cross-swarm dropdown hidden when only one swarm has clusters", () => {
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[sampleCluster]}
        crossSwarmDropdownVisible={false}
      />,
    );
    expect(
      screen.queryByLabelText("Cross-swarm filter"),
    ).toBeNull();
  });

  it("T6b — cross-swarm dropdown visible when >1 swarm has clusters", () => {
    render(
      <IntentProposalsClientShell
        swarmType="debtor-email"
        filter="current"
        clusters={[sampleCluster]}
        crossSwarmDropdownVisible={true}
      />,
    );
    const select = screen.getByLabelText("Cross-swarm filter");
    expect(select).toBeTruthy();
  });
});
