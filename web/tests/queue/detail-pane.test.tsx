// Phase 61-02 (D-DETAIL-PANE / D-DETAIL-ACTIONS / D-AUTO-ADVANCE).
// Detail pane assertions: renders meta + actions for a selected row;
// Approve/Reject/Skip call recordVerdict with the right payload; auto-
// advance pushes ?selected=<next-row-id> within 220ms; CustomEvent wiring
// from KeyboardShortcuts triggers the same submit path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

// ---- next/navigation mock (must be set before component import) ---------
const pushMock = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/automations/debtor-email-review",
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

// ---- recordVerdict + fetchReviewEmailBody mocks --------------------------
const recordVerdictMock = vi.fn().mockResolvedValue({ ok: true });
const fetchBodyMock = vi.fn().mockResolvedValue({ bodyText: "hi", bodyHtml: null });
vi.mock(
  "@/app/(dashboard)/automations/debtor-email-review/actions",
  () => ({
    recordVerdict: (...args: unknown[]) => recordVerdictMock(...args),
    fetchReviewEmailBody: (...args: unknown[]) => fetchBodyMock(...args),
    OVERRIDE_CATEGORIES: ["payment", "auto_reply", "ooo_temporary", "ooo_permanent", "unknown"],
  }),
);

// sonner toast mock — detail-pane imports `toast.error`
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DetailPane } from "@/app/(dashboard)/automations/debtor-email-review/detail-pane";
import type { PredictedRow } from "@/app/(dashboard)/automations/debtor-email-review/page";

function makeRow(id: string, overrides: Partial<PredictedRow> = {}): PredictedRow {
  return {
    id,
    automation: "debtor-email",
    status: "predicted",
    swarm_type: "debtor-email",
    topic: "payment_admittance",
    entity: "smeba",
    mailbox_id: 4,
    result: {
      message_id: `msg-${id}`,
      source_mailbox: "info@smeba.example",
      subject: `Subject ${id}`,
      from: `sender-${id}@example.com`,
      fromName: `Sender ${id}`,
      predicted: { rule: "subject_paid_marker", category: "payment" },
    },
    created_at: "2026-04-29T08:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  pushMock.mockClear();
  recordVerdictMock.mockClear();
  recordVerdictMock.mockResolvedValue({ ok: true });
  fetchBodyMock.mockClear();
  currentSearch = "selected=row-2";
  // jsdom has window.location; the auto-advance path reads window.location.search.
  Object.defineProperty(window, "location", {
    value: {
      pathname: "/automations/debtor-email-review",
      search: "?selected=row-2",
    },
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DetailPane: empty state", () => {
  it("renders an empty placeholder when row is null", () => {
    render(<DetailPane row={null} rows={[]} selection={{}} />);
    expect(screen.getByText(/Select a row from the list/i)).toBeInTheDocument();
  });
});

describe("DetailPane: meta + action bar", () => {
  it("renders subject, sender, rule, action buttons for the selected row", () => {
    const row = makeRow("row-2");
    render(<DetailPane row={row} rows={[row]} selection={{ selected: "row-2" }} />);
    expect(screen.getByText("Subject row-2")).toBeInTheDocument();
    expect(screen.getByText(/Sender row-2/)).toBeInTheDocument();
    expect(screen.getByText("subject_paid_marker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeInTheDocument();
  });
});

describe("DetailPane: submit + auto-advance", () => {
  it("Approve click calls recordVerdict with decision='approve' and auto-advances within 220ms", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2"), makeRow("row-3")];
    render(<DetailPane row={rows[1]} rows={rows} selection={{ selected: "row-2" }} />);
    const approve = screen.getByRole("button", { name: /Approve/ });

    await act(async () => {
      fireEvent.click(approve);
      // flush the awaited recordVerdict promise
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordVerdictMock).toHaveBeenCalledTimes(1);
    const call = recordVerdictMock.mock.calls[0][0];
    expect(call.decision).toBe("approve");
    expect(call.automation_run_id).toBe("row-2");
    expect(call.rule_key).toBe("subject_paid_marker");

    // Auto-advance fires inside a setTimeout(200ms) — advance the timer.
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0]).toMatch(/selected=row-3/);
  });

  it("Reject click calls recordVerdict with decision='reject' and auto-advances", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2")];
    render(<DetailPane row={rows[0]} rows={rows} selection={{ selected: "row-1" }} />);
    Object.defineProperty(window, "location", {
      value: { pathname: "/automations/debtor-email-review", search: "?selected=row-1" },
      writable: true,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "reject", automation_run_id: "row-1" }),
    );

    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock.mock.calls[0][0]).toMatch(/selected=row-2/);
  });

  it("Skip click sends override_category='unknown'", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2")];
    render(<DetailPane row={rows[0]} rows={rows} selection={{ selected: "row-1" }} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ override_category: "unknown" }),
    );
  });
});

describe("DetailPane: keyboard CustomEvent wiring", () => {
  it("listens for bulk-review:approve and submits", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1")];
    render(<DetailPane row={rows[0]} rows={rows} selection={{ selected: "row-1" }} />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("bulk-review:approve"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordVerdictMock).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approve" }),
    );
  });
});
