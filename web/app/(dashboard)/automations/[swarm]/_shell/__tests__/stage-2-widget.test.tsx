// Phase 88 Plan 02 — RTL tests for _shell/components/stage-2-widget.tsx
//
// Behaviour coverage (six numbered cases per plan):
//   it1: renders wrapped Stage2 customer picker (no selection yet → no notes).
//   it2: picking a customer reveals the inline note textarea (fused per D-01b).
//   it3: dispatching `bulk-review:override-submit` POSTs override with
//        axis=stage_2_customer + decision_details={customer_account_id, customer_name}.
//   it4: dispatching `bulk-review:override-discard` clears dirty state.
//   it5: when evalType="regression" and notes empty, submit is blocked.
//   it6: file source must NOT reference SwarmNoiseCategoryRow or SwarmIntentRow.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

// ---- module mocks -------------------------------------------------------

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/automations/debtor-email/stage-2",
  useSearchParams: () => new URLSearchParams(""),
}));

const recordVerdictMock = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock("../../stage-1/actions", () => ({
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

// Mock the wrapped customer-search picker — async server-action otherwise.
// Provide a "Pick fake" button that immediately fires onChange to simulate
// the operator selecting a customer.
vi.mock("../../stage-1/components/stage-2-widget", () => ({
  Stage2Widget: (props: {
    value: { customer_account_id: string; customer_name: string } | null;
    onChange: (next: { customer_account_id: string; customer_name: string }) => void;
    reRun: boolean;
    onReRunChange: (next: boolean) => void;
  }) => (
    <div data-testid="stage-2-picker-mock">
      <button
        type="button"
        data-testid="pick-customer-btn"
        onClick={() =>
          props.onChange({
            customer_account_id: "ACC-42",
            customer_name: "Acme BV",
          })
        }
      >
        Pick Acme
      </button>
      <span data-testid="picker-value">
        {props.value
          ? `${props.value.customer_name}|${props.value.customer_account_id}`
          : "(none)"}
      </span>
    </div>
  ),
}));

import { Stage2OverrideWidget } from "../components/stage-2-widget";
import {
  SelectionProvider,
  useSelection,
} from "../selection-context";

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

function TestHarness({ children }: { children: ReactNode }) {
  const row = makeRow();
  return (
    <SelectionProvider initialSelectedId={row.id} rowIds={[row.id]}>
      {children}
    </SelectionProvider>
  );
}

beforeEach(() => {
  recordVerdictMock.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Stage2OverrideWidget (shell)", () => {
  it("it1: renders the wrapped Stage2 customer picker with no notes initially", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage2OverrideWidget
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );
    expect(screen.getByTestId("stage-2-picker-mock")).toBeInTheDocument();
    // No notes textarea until operator picks a new customer.
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
  });

  it("it2: picking a customer reveals the inline note textarea (D-01b fused form)", () => {
    const row = makeRow();
    function Wrapper() {
      return (
        <Stage2OverrideWidget
          value={null}
          onChange={() => {}}
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
    fireEvent.click(screen.getByTestId("pick-customer-btn"));
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("it3: bulk-review:override-submit POSTs with axis=stage_2_customer + decision_details", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const row = makeRow();
    render(
      <TestHarness>
        <Stage2OverrideWidget
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-customer-btn"));

    // Type ≥10-char regression note (default evalType is regression).
    const notes = screen.getByLabelText(/notes/i);
    fireEvent.change(notes, {
      target: { value: "Wrong customer — should map to Acme BV not legacy" },
    });

    await act(async () => {
      window.dispatchEvent(new Event("bulk-review:override-submit"));
    });

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
      axis: "stage_2_customer",
      email_id: "email-uuid-1",
      decision: "ACC-42",
      decision_details: {
        customer_account_id: "ACC-42",
        customer_name: "Acme BV",
      },
    });
  });

  it("it4: bulk-review:override-discard clears dirty state (textarea hides)", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage2OverrideWidget
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-customer-btn"));
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("bulk-review:override-discard"));
    });

    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
  });

  it("it5: regression evalType with empty notes blocks submit (no POST fires)", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const row = makeRow();
    render(
      <TestHarness>
        <Stage2OverrideWidget
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-customer-btn"));
    // Leave notes empty.

    await act(async () => {
      window.dispatchEvent(new Event("bulk-review:override-submit"));
    });

    // No POST should have fired — toast error path instead.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("it6 (HARD-SEP): file source contains neither SwarmNoiseCategoryRow nor SwarmIntentRow", () => {
    const src = readFileSync(
      resolve(
        __dirname,
        "..",
        "components",
        "stage-2-widget.tsx",
      ),
      "utf-8",
    );
    expect(src.includes("SwarmNoiseCategoryRow")).toBe(false);
    expect(src.includes("SwarmIntentRow")).toBe(false);
  });
});

// Suppress unused-imports warning (useSelection imported only to keep
// SelectionProvider type-link stable in some IDE setups).
void useSelection;
