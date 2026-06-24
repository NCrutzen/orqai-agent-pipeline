// Phase 132 Plan 03 Task 2 (FWD-08, D-07/D-08) — RoutingDetailPane tests.
//
// The info-routing routing detail pane: 6-field verdict + forward-status badge +
// the three D-08 operator controls (re-route / forward-now / don't-forward),
// rendered from the swarm-generic Stage4Decide shell on row.routing !== null.
//
// Hard-separation note: this pane reads row.routing ONLY (the info-routing
// routing verdict) — it never reads stage_1 noise categories or stage_3 intents.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

import { RoutingDetailPane } from "../routing-detail-pane";
import { Stage4Decide } from "../stage-4-decide";
import type { BulkReviewRow, BulkReviewRoutingSlot } from "@/lib/bulk-review/types";

// --- Mocks -----------------------------------------------------------------

const rerouteMock = vi.fn();
const forwardNowMock = vi.fn();
const dontForwardMock = vi.fn();
vi.mock("../../actions/routing-actions", () => ({
  rerouteBucket: (i: unknown) => rerouteMock(i),
  forwardNow: (i: unknown) => forwardNowMock(i),
  dontForward: (i: unknown) => dontForwardMock(i),
}));

const markPendingRemovalMock = vi.fn();
vi.mock("../../selection-context", () => ({
  useSelection: () => ({
    markPendingRemoval: markPendingRemovalMock,
    selectedId: null,
    setSelected: () => undefined,
    pendingRemovalIds: new Set<string>(),
  }),
}));

// Stage4Decide deps (for the render-through test).
vi.mock("../../actions/override-actions", () => ({
  submitStage4Handler: vi.fn(),
}));

// --- Fixtures --------------------------------------------------------------

function routing(
  over: Partial<BulkReviewRoutingSlot> = {},
): BulkReviewRoutingSlot {
  return {
    bucket: "storingen",
    brand: "smeba",
    target_mailbox: "storingen@smeba.nl",
    confidence: "high",
    dedup_status: "routable",
    dedup_layer: null,
    unrouted: false,
    forward_status: "forwarded",
    run_id: "run-1",
    ...over,
  };
}

function makeRow(r: BulkReviewRoutingSlot | null): BulkReviewRow {
  return {
    email_label_id: "11111111-1111-1111-1111-111111111111",
    swarm_type: "info-routing",
    email_id: "22222222-2222-2222-2222-222222222222",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: null,
    stage_3: null,
    stage_3p5: null,
    stage_4: null,
    routing: r,
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
  };
}

beforeEach(() => {
  rerouteMock.mockReset();
  forwardNowMock.mockReset();
  dontForwardMock.mockReset();
  markPendingRemovalMock.mockReset();
});
afterEach(() => cleanup());

describe("RoutingDetailPane — verdict rendering", () => {
  it("renders the 6 verdict fields for a forwarded row", () => {
    render(<RoutingDetailPane row={makeRow(routing())} />);
    // Scope verdict assertions to the <dd> cells so they don't collide with the
    // re-route <option> list (which also contains "storingen").
    expect(screen.getByText("storingen", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("smeba", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("storingen@smeba.nl", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("high", { selector: "dd" })).toBeTruthy();
    // dedup status + unrouted both surfaced.
    expect(screen.getByText("routable", { selector: "dd" })).toBeTruthy();
  });

  it("renders a forward-status badge whose text matches the status", () => {
    render(<RoutingDetailPane row={makeRow(routing({ forward_status: "forwarded" }))} />);
    const badge = screen.getByTestId("routing-forward-status");
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/forwarded/);
  });

  it("renders a placeholder when row.routing is null", () => {
    render(<RoutingDetailPane row={makeRow(null)} />);
    expect(screen.getByTestId("routing-detail-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("routing-detail-pane")).toBeNull();
  });
});

describe("RoutingDetailPane — operator controls", () => {
  it("re-route select lists buckets sourced from DESTINATION_KEYS_BY_SWARM", () => {
    render(<RoutingDetailPane row={makeRow(routing())} />);
    const select = screen.getByTestId("routing-reroute-select") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    // The codegen info-routing destination keys (sans the unrouted sentinel).
    for (const key of [
      "algemeen",
      "inspecties",
      "opleidingen",
      "order_entry",
      "sollicitaties",
      "storingen",
      "verkoop",
    ]) {
      expect(optionValues).toContain(key);
    }
  });

  it("unrouted row: badge reads 'unrouted' and Forward-now is NOT enabled", () => {
    render(
      <RoutingDetailPane
        row={makeRow(
          routing({
            bucket: "unrouted",
            brand: null,
            target_mailbox: null,
            unrouted: true,
            forward_status: "unrouted",
          }),
        )}
      />,
    );
    expect(screen.getByTestId("routing-forward-status").textContent).toMatch(
      /unrouted/,
    );
    const fwd = screen.queryByTestId("routing-forward-now") as HTMLButtonElement | null;
    // Either absent OR present-but-disabled (surfaced for human handling).
    expect(fwd === null || fwd.disabled).toBe(true);
  });

  it("routable row: Forward-now is enabled and calls forwardNow", async () => {
    forwardNowMock.mockResolvedValue({ ok: true });
    render(<RoutingDetailPane row={makeRow(routing({ forward_status: "held" }))} />);
    const fwd = screen.getByTestId("routing-forward-now") as HTMLButtonElement;
    expect(fwd.disabled).toBe(false);
    fireEvent.click(fwd);
    await waitFor(() => expect(forwardNowMock).toHaveBeenCalledTimes(1));
    expect(forwardNowMock).toHaveBeenCalledWith({
      email_id: "22222222-2222-2222-2222-222222222222",
      swarm_type: "info-routing",
      run_id: "run-1",
    });
    await waitFor(() =>
      expect(markPendingRemovalMock).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      ),
    );
  });

  it("stays (algemeen, null target) row: badge reads 'stays' and Forward-now is NOT enabled", () => {
    render(
      <RoutingDetailPane
        row={makeRow(
          routing({
            bucket: "algemeen",
            brand: null,
            target_mailbox: null,
            forward_status: "stays",
          }),
        )}
      />,
    );
    expect(screen.getByTestId("routing-forward-status").textContent).toMatch(
      /stays/,
    );
    const fwd = screen.queryByTestId("routing-forward-now") as HTMLButtonElement | null;
    expect(fwd === null || fwd.disabled).toBe(true);
  });

  it("re-route: selecting a bucket + audit note + submit calls rerouteBucket", async () => {
    rerouteMock.mockResolvedValue({ ok: true });
    render(<RoutingDetailPane row={makeRow(routing())} />);
    fireEvent.change(screen.getByTestId("routing-reroute-select"), {
      target: { value: "verkoop" },
    });
    fireEvent.change(screen.getByTestId("routing-audit-note"), {
      target: { value: "this is actually a sales lead" },
    });
    fireEvent.click(screen.getByTestId("routing-reroute-submit"));
    await waitFor(() => expect(rerouteMock).toHaveBeenCalledTimes(1));
    expect(rerouteMock).toHaveBeenCalledWith(
      expect.objectContaining({
        swarm_type: "info-routing",
        run_id: "run-1",
        new_bucket: "verkoop",
        audit_note: "this is actually a sales lead",
      }),
    );
  });

  it("don't-forward: audit note + click calls dontForward", async () => {
    dontForwardMock.mockResolvedValue({ ok: true });
    render(<RoutingDetailPane row={makeRow(routing())} />);
    fireEvent.change(screen.getByTestId("routing-audit-note"), {
      target: { value: "handled manually" },
    });
    fireEvent.click(screen.getByTestId("routing-dont-forward"));
    await waitFor(() => expect(dontForwardMock).toHaveBeenCalledTimes(1));
    expect(dontForwardMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email_id: "22222222-2222-2222-2222-222222222222",
        swarm_type: "info-routing",
        audit_note: "handled manually",
      }),
    );
  });
});

describe("Stage4Decide — render-through to RoutingDetailPane (D-07 shell reuse)", () => {
  it("renders RoutingDetailPane when row.routing is non-null", () => {
    render(<Stage4Decide row={makeRow(routing())} />);
    expect(screen.getByTestId("routing-detail-pane")).toBeTruthy();
    // The existing Stage-4 widget/placeholder must NOT render for routing rows.
    expect(screen.queryByTestId("stage-4-decide")).toBeNull();
    expect(screen.queryByTestId("stage-4-decide-placeholder")).toBeNull();
  });

  it("renders the existing Stage-4 placeholder when row.routing is null (debtor/sales unchanged)", () => {
    const debtorRow = makeRow(null);
    debtorRow.swarm_type = "debtor-email";
    render(<Stage4Decide row={debtorRow} />);
    expect(screen.queryByTestId("routing-detail-pane")).toBeNull();
    // stage_4 null → the existing Stage-4 placeholder renders unchanged.
    expect(screen.getByTestId("stage-4-decide-placeholder")).toBeTruthy();
  });
});
