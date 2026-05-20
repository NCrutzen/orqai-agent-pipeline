// Phase 88 Plan 02 — RTL tests for _shell/components/stage-3-widget.tsx
//
// Six behaviour cases:
//   it1: renders wrapped Stage3 intent picker; receives `intents` prop.
//   it2: picking an intent reveals the inline note textarea (D-01b).
//   it3: bulk-review:override-submit POSTs axis=stage_3_intent + decision_details.
//   it4: bulk-review:override-discard clears dirty state.
//   it5: regression evalType with empty notes blocks submit.
//   it6: file source must NOT reference SwarmNoiseCategoryRow (hard-sep gate).

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

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
  usePathname: () => "/automations/debtor-email/stage-3",
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

// Mock the underlying Stage3 intent picker — Radix Select inside JSDOM is
// noisy; the wrapper widget is what we want to exercise. Expose a button to
// trigger onChange with a fixed intent_key.
vi.mock("../../stage-1/components/stage-3-widget", () => ({
  Stage3Widget: (props: {
    intents: Array<{ intent_key: string; display_label: string }>;
    value: string | null;
    onChange: (intentKey: string) => void;
  }) => (
    <div data-testid="stage-3-picker-mock" data-intent-count={props.intents.length}>
      <button
        type="button"
        data-testid="pick-intent-btn"
        onClick={() => props.onChange("credit_request")}
      >
        Pick credit_request
      </button>
      <span data-testid="picker-value">{props.value ?? "(none)"}</span>
    </div>
  ),
}));

import { Stage3OverrideWidget } from "../components/stage-3-widget";
import {
  SelectionProvider,
  useSelection,
} from "../selection-context";
import type { SwarmIntentRow } from "@/lib/swarms/types";

const INTENTS: SwarmIntentRow[] = [
  {
    swarm_type: "debtor-email",
    intent_key: "general_inquiry",
    display_label: "General inquiry",
    display_order: 1,
    enabled: true,
    swarm_dispatch: null,
    requires_orchestration: false,
  } as SwarmIntentRow,
  {
    swarm_type: "debtor-email",
    intent_key: "credit_request",
    display_label: "Credit request",
    display_order: 2,
    enabled: true,
    swarm_dispatch: null,
    requires_orchestration: false,
  } as SwarmIntentRow,
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

describe("Stage3OverrideWidget (shell)", () => {
  it("it1: renders wrapped Stage3 intent picker and forwards `intents`", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage3OverrideWidget
          intents={INTENTS}
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );
    expect(screen.getByTestId("stage-3-picker-mock")).toBeInTheDocument();
    expect(
      screen.getByTestId("stage-3-picker-mock").getAttribute("data-intent-count"),
    ).toBe("2");
    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
  });

  it("it2: picking an intent reveals the inline note textarea", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage3OverrideWidget
          intents={INTENTS}
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );
    fireEvent.click(screen.getByTestId("pick-intent-btn"));
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
  });

  it("it3: bulk-review:override-submit POSTs axis=stage_3_intent + intent_key", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const row = makeRow();
    render(
      <TestHarness>
        <Stage3OverrideWidget
          intents={INTENTS}
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-intent-btn"));

    const notes = screen.getByLabelText(/notes/i);
    fireEvent.change(notes, {
      target: { value: "Misclassified — this is actually a credit request" },
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
      axis: "stage_3_intent",
      email_id: "email-uuid-1",
      decision: "credit_request",
      decision_details: { intent_key: "credit_request" },
    });
  });

  it("it4: bulk-review:override-discard clears dirty (textarea hides)", () => {
    const row = makeRow();
    render(
      <TestHarness>
        <Stage3OverrideWidget
          intents={INTENTS}
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-intent-btn"));
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event("bulk-review:override-discard"));
    });

    expect(screen.queryByLabelText(/notes/i)).not.toBeInTheDocument();
  });

  it("it5: regression evalType with empty notes blocks submit", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    const row = makeRow();
    render(
      <TestHarness>
        <Stage3OverrideWidget
          intents={INTENTS}
          value={null}
          onChange={() => {}}
          row={row as never}
          swarmType="debtor-email"
        />
      </TestHarness>,
    );

    fireEvent.click(screen.getByTestId("pick-intent-btn"));

    await act(async () => {
      window.dispatchEvent(new Event("bulk-review:override-submit"));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it("it6 (HARD-SEP): file source does NOT reference SwarmNoiseCategoryRow", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "components", "stage-3-widget.tsx"),
      "utf-8",
    );
    expect(src.includes("SwarmNoiseCategoryRow")).toBe(false);
  });
});

void useSelection;
