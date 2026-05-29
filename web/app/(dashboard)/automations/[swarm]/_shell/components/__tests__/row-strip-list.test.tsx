// Phase 2 Plan 02-01 — RowStripList tests.
// Covers behaviors 5 (mount InlineExpandRow under selected row) and 7
// (pendingRemovalIds fade-then-unmount) from the plan's Task 2 list.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { RowStripList } from "../row-strip-list";
import { SelectionProvider, useSelection } from "../../selection-context";

function makeRow(id: string): BulkReviewRow {
  return {
    email_label_id: id,
    swarm_type: "debtor-email",
    email_id: `email-${id}`,
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
  };
}

describe("RowStripList", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("Test 5: mounts InlineExpandRow only under the selected row", () => {
    const rows = [makeRow("r-1"), makeRow("r-2"), makeRow("r-3")];
    render(
      <SelectionProvider
        initialSelectedId="r-2"
        rowIds={rows.map((r) => r.email_label_id)}
      >
        <RowStripList rows={rows} />
      </SelectionProvider>,
    );
    const expanded = screen.getAllByTestId("inline-expand-row");
    expect(expanded).toHaveLength(1);
    expect(expanded[0].getAttribute("data-row-id")).toBe("r-2");
  });

  it("Test 5b: no InlineExpandRow when no selection", () => {
    const rows = [makeRow("r-1"), makeRow("r-2")];
    render(
      <SelectionProvider
        initialSelectedId={null}
        rowIds={rows.map((r) => r.email_label_id)}
      >
        <RowStripList rows={rows} />
      </SelectionProvider>,
    );
    expect(screen.queryAllByTestId("inline-expand-row")).toHaveLength(0);
  });

  it("Test 6 (via list): click toggles selection through useSelection", () => {
    const rows = [makeRow("r-1"), makeRow("r-2")];
    render(
      <SelectionProvider
        initialSelectedId={null}
        rowIds={rows.map((r) => r.email_label_id)}
      >
        <RowStripList rows={rows} />
      </SelectionProvider>,
    );
    expect(screen.queryAllByTestId("inline-expand-row")).toHaveLength(0);
    // Click r-1 → expands.
    fireEvent.click(screen.getAllByTestId("row-strip")[0]);
    const expanded = screen.getAllByTestId("inline-expand-row");
    expect(expanded).toHaveLength(1);
    expect(expanded[0].getAttribute("data-row-id")).toBe("r-1");
  });

  it("Test 7: pendingRemovalIds triggers fade-then-unmount (180ms)", () => {
    const rows = [makeRow("r-1"), makeRow("r-2")];

    function Harness() {
      const { markPendingRemoval } = useSelection();
      return (
        <>
          <button
            data-testid="trigger-remove"
            onClick={() => markPendingRemoval("r-1")}
          >
            remove
          </button>
          <RowStripList rows={rows} />
        </>
      );
    }

    render(
      <SelectionProvider
        initialSelectedId={null}
        rowIds={rows.map((r) => r.email_label_id)}
      >
        <Harness />
      </SelectionProvider>,
    );
    // Initially both rows visible.
    expect(screen.getAllByTestId("row-strip-list-item")).toHaveLength(2);

    // Mark r-1 pending — opacity flips instantly, DOM kept for 180ms.
    act(() => {
      fireEvent.click(screen.getByTestId("trigger-remove"));
    });
    const items = screen.getAllByTestId("row-strip-list-item");
    expect(items).toHaveLength(2);
    const pendingItem = items.find(
      (el) => el.getAttribute("data-row-id") === "r-1",
    );
    expect(pendingItem?.getAttribute("data-pending")).toBe("true");

    // Advance 180ms — row unmounts.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getAllByTestId("row-strip-list-item")).toHaveLength(1);
    expect(
      screen.getByTestId("row-strip-list-item").getAttribute("data-row-id"),
    ).toBe("r-2");
  });

  // Plan 06-03 — signal "Order unchanged (no reorder)". The list must render
  // rows in the SAME order as the input array (no regroup/reorder).
  it("Plan 06-03: rendered row order === input order (no reorder)", () => {
    const inputOrder = ["r-1", "r-2", "r-3"];
    const rows = inputOrder.map(makeRow);
    render(
      <SelectionProvider
        initialSelectedId={null}
        rowIds={rows.map((r) => r.email_label_id)}
      >
        <RowStripList rows={rows} />
      </SelectionProvider>,
    );
    const renderedOrder = screen
      .getAllByTestId("row-strip")
      .map((el) => el.getAttribute("data-row-id"));
    expect(renderedOrder).toEqual(inputOrder);
  });
});
