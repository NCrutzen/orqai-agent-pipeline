// Phase 61-02 + 61-hotfix (D-DETAIL-PANE / D-DETAIL-ACTIONS / D-AUTO-ADVANCE).
// Detail pane assertions: renders meta + actions for the row matching
// SelectionProvider's selectedId; Approve/Reject/Skip call recordVerdict with
// the right payload; auto-advance updates selection via history.replaceState
// within 220ms; CustomEvent wiring from KeyboardShortcuts triggers the same
// submit path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { ReactNode } from "react";

// ---- next/navigation mock — DetailPane calls useRouter().replace() after
// a successful verdict so Next's router state AND URL sync to the next
// row, the server re-runs loadPageData, and the verdict-flipped row
// drops out of rows[]. (router.refresh would race with replaceState and
// re-fetch against the stale ?selected= param.)
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: replaceMock,
    refresh: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => "/automations/debtor-email/review",
  useSearchParams: () => new URLSearchParams(),
}));

// ---- recordVerdict + fetchReviewEmailBody mocks --------------------------
const recordVerdictMock = vi.fn().mockResolvedValue({ ok: true });
const fetchBodyMock = vi
  .fn()
  .mockResolvedValue({ ok: true, bodyText: "hi", bodyHtml: null });
vi.mock(
  "@/app/(dashboard)/automations/[swarm]/review/actions",
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

import { DetailPane as RawDetailPane } from "@/app/(dashboard)/automations/[swarm]/review/detail-pane";
import { SelectionProvider } from "@/app/(dashboard)/automations/[swarm]/review/selection-context";
import type { PredictedRow } from "@/app/(dashboard)/automations/[swarm]/review/page";
import type { SwarmCategoryRow } from "@/lib/swarms/types";

// Phase 56.7-03: DetailPane now requires `swarmType`, `categories`, and
// `drawerFields` props (registry-driven). Provide debtor-email defaults
// here so the existing assertions don't all need to thread them through.
const TEST_CATEGORIES: SwarmCategoryRow[] = [
  { swarm_type: "debtor-email", category_key: "payment", display_label: "Payment", outlook_label: "Payment", action: "categorize_archive", swarm_dispatch: null, display_order: 10, enabled: true },
  { swarm_type: "debtor-email", category_key: "auto_reply", display_label: "Auto-reply", outlook_label: "Auto-Reply", action: "categorize_archive", swarm_dispatch: null, display_order: 20, enabled: true },
  { swarm_type: "debtor-email", category_key: "ooo_temporary", display_label: "OOO (temporary)", outlook_label: "OoO Temp", action: "categorize_archive", swarm_dispatch: null, display_order: 30, enabled: true },
  { swarm_type: "debtor-email", category_key: "unknown", display_label: "Skip (label-only)", outlook_label: null, action: "reject", swarm_dispatch: null, display_order: 60, enabled: true },
];

type DetailPaneProps = Parameters<typeof RawDetailPane>[0];
function DetailPane(
  props: Omit<DetailPaneProps, "swarmType" | "categories" | "drawerFields"> &
    Partial<Pick<DetailPaneProps, "swarmType" | "categories" | "drawerFields">>,
) {
  const { swarmType = "debtor-email", categories = TEST_CATEGORIES, drawerFields = [], ...rest } = props;
  return (
    <RawDetailPane
      {...rest}
      swarmType={swarmType}
      categories={categories}
      drawerFields={drawerFields}
    />
  );
}

function withSelection(
  initialSelectedId: string | null,
  children: ReactNode,
  rowIds: string[] = [],
) {
  return (
    <SelectionProvider initialSelectedId={initialSelectedId} rowIds={rowIds}>
      {children}
    </SelectionProvider>
  );
}

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

let replaceStateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  recordVerdictMock.mockClear();
  recordVerdictMock.mockResolvedValue({ ok: true });
  fetchBodyMock.mockClear();
  replaceMock.mockClear();
  replaceStateSpy = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  replaceStateSpy.mockRestore();
  vi.useRealTimers();
});

describe("DetailPane: empty state", () => {
  it("renders an empty placeholder when no row matches selectedId", () => {
    render(withSelection(null, <DetailPane rows={[]} initialSelectedRow={null} />));
    expect(screen.getByText(/Select a row from the list/i)).toBeInTheDocument();
  });
});

describe("DetailPane: meta + action bar", () => {
  it("renders subject, sender, rule, action buttons for the selected row", () => {
    const row = makeRow("row-2");
    render(
      withSelection(
        "row-2",
        <DetailPane rows={[row]} initialSelectedRow={null} />,
      ),
    );
    expect(screen.getByText("Subject row-2")).toBeInTheDocument();
    expect(screen.getByText(/Sender row-2/)).toBeInTheDocument();
    expect(screen.getByText("subject_paid_marker")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skip/ })).toBeInTheDocument();
  });

  it("falls back to initialSelectedRow when the id is not in rows[]", () => {
    const stale = makeRow("row-99");
    render(
      withSelection(
        "row-99",
        <DetailPane rows={[]} initialSelectedRow={stale} />,
      ),
    );
    expect(screen.getByText("Subject row-99")).toBeInTheDocument();
  });
});

describe("DetailPane: submit + auto-advance", () => {
  it("Approve click calls recordVerdict and auto-advances within 220ms", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2"), makeRow("row-3")];
    render(
      withSelection(
        "row-2",
        <DetailPane rows={rows} initialSelectedRow={null} />,
      ),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordVerdictMock).toHaveBeenCalledTimes(1);
    const call = recordVerdictMock.mock.calls[0][0];
    expect(call.decision).toBe("approve");
    expect(call.automation_run_id).toBe("row-2");
    expect(call.rule_key).toBe("subject_paid_marker");

    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    // Auto-advance updated selection to the next row in client state.
    // Detail pane should now render row-3's subject.
    expect(screen.getByText("Subject row-3")).toBeInTheDocument();
    // And the URL was patched via replaceState.
    const lastReplace = replaceStateSpy.mock.calls.at(-1);
    expect(String(lastReplace?.[2] ?? "")).toMatch(/selected=row-3/);
    // router.replace() was called so Next's router state syncs to the
    // next row AND the server re-runs loadPageData; the verdict-flipped
    // row leaves the queue. URL must carry ?selected=row-3.
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(String(replaceMock.mock.calls[0][0])).toMatch(/selected=row-3/);
  });

  it("Reject click calls recordVerdict with decision='reject' and auto-advances", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2")];
    render(
      withSelection(
        "row-1",
        <DetailPane rows={rows} initialSelectedRow={null} />,
      ),
    );

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
    expect(screen.getByText("Subject row-2")).toBeInTheDocument();
  });

  it("Skip click sends override_category='unknown'", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2")];
    render(
      withSelection(
        "row-1",
        <DetailPane rows={rows} initialSelectedRow={null} />,
      ),
    );

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
    render(
      withSelection(
        "row-1",
        <DetailPane rows={rows} initialSelectedRow={null} />,
      ),
    );

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

describe("DetailPane: optimistic removal", () => {
  it("the just-approved row is hidden from view immediately, before the server roundtrip", async () => {
    vi.useFakeTimers();
    const rows = [makeRow("row-1"), makeRow("row-2"), makeRow("row-3")];
    render(
      withSelection(
        "row-2",
        <DetailPane rows={rows} initialSelectedRow={null} />,
        rows.map((r) => r.id),
      ),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Approve/ }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    // Detail pane should now show row-3, NOT row-2 — even though the
    // server hasn't returned new data yet (rows[] still includes row-2
    // in this test). That's the optimistic filter at work.
    expect(screen.getByText("Subject row-3")).toBeInTheDocument();
    expect(screen.queryByText("Subject row-2")).not.toBeInTheDocument();
  });
});

describe("DetailPane: body fetch error surfaces real message", () => {
  it("renders the action's error string when ok=false", async () => {
    fetchBodyMock.mockResolvedValueOnce({
      ok: false,
      error: "outlook fetch failed: graph 401 Unauthorized",
    });
    const row = makeRow("row-1");
    render(
      withSelection(
        "row-1",
        <DetailPane rows={[row]} initialSelectedRow={null} />,
      ),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Show full email/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(/outlook fetch failed: graph 401 Unauthorized/),
    ).toBeInTheDocument();
  });
});
