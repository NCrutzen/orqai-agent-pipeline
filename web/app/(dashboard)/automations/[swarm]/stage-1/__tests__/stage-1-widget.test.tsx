// Phase 82.1 Plan 04 — RTL tests for the new _shell/components/stage-1-widget.tsx.
//
// Asserts D-07..D-12 truths:
//   (1) Category dropdown renders with current value pre-selected.
//   (2) Selecting a new category + clicking Submit dispatches a POST to
//       /api/automations/debtor-email/override with axis=stage_1_category.
//   (3) On successful override POST the widget calls
//       useSelection().markPendingRemoval(row.id) for optimistic removal.
//
// Hard-separation gate (D-11) lives as a source-file grep in the file's
// acceptance criteria — also asserted inline here so a single Vitest run
// catches drift.
//
// All async/server-action edges are mocked at the module boundary; the
// SelectionProvider exposes markPendingRemoval via a spy.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

// --- module mocks --------------------------------------------------------

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/automations/debtor-email/stage-1",
  useSearchParams: () => new URLSearchParams(""),
}));

const recordVerdictMock = vi.fn(async () => ({ ok: true }));
vi.mock("../actions", () => ({
  recordVerdict: (...args: unknown[]) => recordVerdictMock(...args),
  fetchReviewEmailBody: vi.fn(),
}));

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

// Spy harness for useSelection().markPendingRemoval — we mount a real
// SelectionProvider and probe markPendingRemoval calls via a wrapping
// observer component.
const markPendingRemovalSpy = vi.fn();

import { Stage1Widget } from "../../_shell/components/stage-1-widget";
import {
  SelectionProvider,
  useSelection,
} from "../../_shell/selection-context";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

function cat(
  category_key: string,
  display_label: string,
  display_order: number,
): SwarmNoiseCategoryRow {
  return {
    swarm_type: "debtor-email",
    category_key,
    display_label,
    outlook_label: null,
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order,
    enabled: true,
  };
}

const CATEGORIES: SwarmNoiseCategoryRow[] = [
  cat("payment_admittance", "Payment admittance", 0),
  cat("dispute", "Dispute", 1),
];

function makeRow() {
  return {
    id: "email-uuid-1",
    automation_run_id: "run-uuid-1",
    automation: "debtor-email-review",
    status: "predicted",
    swarm_type: "debtor-email",
    topic: "payment_admittance",
    entity: "smeba",
    mailbox_id: 4,
    result: {
      email_id: "email-uuid-1",
      message_id: "msg-1",
      source_mailbox: "debiteuren@smeba.nl",
      subject: "Test subject",
      from: "client@example.com",
      predicted: { rule: "rule-x", category: "payment_admittance" },
    },
    created_at: "2026-05-11T08:00:00Z",
  };
}

// Hook-bridge component that wires the SelectionProvider's markPendingRemoval
// into our spy so we can assert call counts.
function ObserveSelection({ children }: { children: ReactNode }) {
  const { markPendingRemoval } = useSelection();
  // Re-publish to the spy so each call from the widget is observable.
  (
    markPendingRemovalSpy as unknown as { __wrapped?: typeof markPendingRemoval }
  ).__wrapped = markPendingRemoval;
  return <>{children}</>;
}

// Patch the spy to forward to whatever the provider exposes. The widget
// resolves useSelection().markPendingRemoval at render time — we just want
// to observe that it is invoked with row.id, so we monkey-patch via a
// passthrough provider wrapper that records calls before forwarding.
function TestHarness({ children }: { children: ReactNode }) {
  const row = makeRow();
  return (
    <SelectionProvider initialSelectedId={row.id} rowIds={[row.id]}>
      <SelectionProbe />
      <ObserveSelection>{children}</ObserveSelection>
    </SelectionProvider>
  );
}

// SelectionProbe records every render's markPendingRemoval reference; tests
// then call the recorded fn via the published reference. Simpler than
// re-implementing context: we just monkey-patch the provider's markPendingRemoval
// via a side-effectful wrapper inside the widget by sniffing the spy after
// async dispatch completes.
function SelectionProbe() {
  const { markPendingRemoval } = useSelection();
  // First render only — set up an interception via Object.assign so
  // subsequent invocations from the widget go through the spy first.
  const ref = markPendingRemoval;
  Object.defineProperty(window, "__markPendingRemovalRef", {
    value: ref,
    writable: true,
    configurable: true,
  });
  return null;
}

beforeEach(() => {
  recordVerdictMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  markPendingRemovalSpy.mockClear();
  // Reset window.fetch mock per-test.
  vi.restoreAllMocks();
  // JSDOM polyfill — Radix Select calls scrollIntoView when opening.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }
  // hasPointerCapture / releasePointerCapture for Radix Select in JSDOM.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
});
afterEach(() => {
  cleanup();
});

describe("Stage1Widget (shell)", () => {
  it("renders the category dropdown with current value pre-selected", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage1Widget
          categories={CATEGORIES}
          value="payment_admittance"
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );
    // The Select trigger surfaces the current value as its visible text.
    expect(
      screen.getByLabelText("Pick a Stage 1 category"),
    ).toBeTruthy();
    // value="payment_admittance" should appear in the trigger button copy.
    expect(
      screen.getByLabelText("Pick a Stage 1 category").textContent ?? "",
    ).toContain("payment_admittance");
  });

  it("dispatches an override POST when the user picks a category and submits", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const row = makeRow();
    function Wrapper() {
      // Local onChange — we forward value into the widget via state so the
      // dropdown becomes controlled after user interaction.
      const [val, setVal] = (
        require("react") as typeof import("react")
      ).useState<string | null>("payment_admittance");
      return (
        <Stage1Widget
          categories={CATEGORIES}
          value={val}
          onChange={(next: string) => setVal(next)}
          row={row as never}
          swarmType="debtor-email"
        />
      );
    }

    render(
      <TestHarness>
        <Wrapper />
      </TestHarness>,
    );

    // Open the Select trigger.
    fireEvent.click(screen.getByLabelText("Pick a Stage 1 category"));
    // The Radix Select renders items in a portal; pick by visible text.
    const opt = await screen.findByText("dispute");
    fireEvent.click(opt);

    // Type ≥10-char regression note (notesRequired path).
    const notes = await screen.findByLabelText(/notes/i);
    fireEvent.change(notes, {
      target: { value: "Real regression: model said admit, actually dispute" },
    });

    // Click Submit override.
    const submit = await screen.findByRole("button", {
      name: /submit override/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/automations/debtor-email/override",
        expect.objectContaining({ method: "POST" }),
      );
    });
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body).toMatchObject({
      axis: "stage_1_category",
      email_id: "email-uuid-1",
      decision: "dispute",
    });
  });

  it("marks the row for optimistic removal after a successful override submit", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(null, { status: 200 }),
    );

    const row = makeRow();

    function Wrapper() {
      const [val, setVal] = (
        require("react") as typeof import("react")
      ).useState<string | null>("payment_admittance");
      // Wrap useSelection.markPendingRemoval so we can spy on it.
      const sel = useSelection();
      // Replace ref the very first render; subsequent renders are stable.
      const orig = sel.markPendingRemoval;
      (sel as { markPendingRemoval: typeof orig }).markPendingRemoval = (
        id: string,
      ) => {
        markPendingRemovalSpy(id);
        return orig(id);
      };
      return (
        <Stage1Widget
          categories={CATEGORIES}
          value={val}
          onChange={(next: string) => setVal(next)}
          row={row as never}
          swarmType="debtor-email"
        />
      );
    }

    render(
      <TestHarness>
        <Wrapper />
      </TestHarness>,
    );

    fireEvent.click(screen.getByLabelText("Pick a Stage 1 category"));
    const opt = await screen.findByText("dispute");
    fireEvent.click(opt);
    const notes = await screen.findByLabelText(/notes/i);
    fireEvent.change(notes, {
      target: { value: "Override note for the optimistic-removal test" },
    });
    const submit = await screen.findByRole("button", {
      name: /submit override/i,
    });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(markPendingRemovalSpy).toHaveBeenCalledWith("email-uuid-1");
    });
  });

  it("hard-separation grep gate (D-11): no swarm_intents / SwarmIntentRow in source", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "..",
        "..",
        "_shell",
        "components",
        "stage-1-widget.tsx",
      ),
      "utf8",
    );
    expect(/swarm_intents|SwarmIntentRow/.test(src)).toBe(false);
  });
});
