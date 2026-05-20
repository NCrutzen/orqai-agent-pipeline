// Phase 82 Plan 01 Task 3 — RTL tests for _shell/detail-pane.tsx
// Extended in Phase 88 Plan 02 for Stage 2/3 override-widget wire-up.
//
// Covers:
//   T6:  when row=null, renders unified "Select a row to inspect…" copy.
//   T7:  when row provided + activeStage=3, exactly 5 stage cells render
//        (testid stage-cell-0..4); the activeStage cell carries
//        aria-expanded="true" / data-active="true"; others "false".
//   T8 (hard-separation): the Stage 3 cell's widget receives `intents` ONLY
//        (not categories); the Stage 1 cell receives `categories` ONLY.
//   T9:  body preview is collapsible — clicking "Show full email" toggles it.
//   T10 (Phase 88-02 #1): Stage 2 row renders Stage2OverrideWidget, NOT a
//        placeholder div.
//   T11 (Phase 88-02 #2): Stage 3 row renders Stage3OverrideWidget, NOT a
//        placeholder.
//   T12 (Phase 88-02 #3): Stage 3 widget receives the `intents` prop equal to
//        whatever was passed to UnifiedDetailPane.intents.
//   T13 (Phase 88-02 #4): onCancelDirty(2) clears Stage 2 dirty state.
//   T14 (Phase 88-02 #5): onCancelDirty(3) clears Stage 3 dirty state.
//   T15 (Phase 88-02 #6): Footer Cancel-override button (resetAllStageFeedback)
//        clears S0+S1+S2+S3 dirty in one shot.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import type { ReactNode } from "react";

// --- module mocks --------------------------------------------------------

const stage1WidgetProps = vi.fn();
const stage2WidgetProps = vi.fn();
const stage3WidgetProps = vi.fn();

vi.mock("../components/stage-1-widget", () => ({
  Stage1Widget: (props: {
    categories: unknown[];
    value: unknown;
    onChange: unknown;
  }) => {
    stage1WidgetProps(props);
    return (
      <div
        data-testid="stage-1-widget-mock"
        data-cat-count={props.categories.length}
      />
    );
  },
}));

// Phase 88 Plan 02 — detail-pane now imports Stage 2/3 override widgets from
// _shell/components/, not the legacy stage-1/components/ pickers.
vi.mock("../components/stage-2-widget", () => ({
  Stage2OverrideWidget: (props: { value: unknown; onChange: unknown; row: unknown }) => {
    stage2WidgetProps(props);
    return <div data-testid="stage-2-override-widget" />;
  },
}));

vi.mock("../components/stage-3-widget", () => ({
  Stage3OverrideWidget: (props: {
    intents: unknown[];
    value: unknown;
    onChange: unknown;
    row: unknown;
  }) => {
    stage3WidgetProps(props);
    return (
      <div
        data-testid="stage-3-override-widget"
        data-intent-count={props.intents.length}
      />
    );
  },
}));

// PipelineFlow stand-in — exposes the stages array so tests can assert
// structure AND inspect / trigger per-stage dirty mark/cancel via buttons.
vi.mock("../../stage-1/components/pipeline-flow", () => ({
  PipelineFlow: ({
    stages,
    onMarkDirty,
    onCancelDirty,
  }: {
    stages: Array<{ n: number; widget: React.ReactNode; state: string }>;
    onMarkDirty: (n: number) => void;
    onCancelDirty: (n: number) => void;
  }) => (
    <ol data-testid="pipeline-flow-mock">
      {stages.map((s) => (
        <li key={s.n} data-stage={s.n} data-state={s.state}>
          <span data-testid={`stage-${s.n}-title`} />
          <button
            type="button"
            data-testid={`mark-dirty-${s.n}`}
            onClick={() => onMarkDirty(s.n)}
          />
          <button
            type="button"
            data-testid={`cancel-dirty-${s.n}`}
            onClick={() => onCancelDirty(s.n)}
          />
          {s.widget}
        </li>
      ))}
    </ol>
  ),
}));

import { UnifiedDetailPane } from "../detail-pane";
import { SelectionProvider } from "../selection-context";
import type { Row } from "../_lib/types";
import type { PredictedRow } from "../../stage-1/page";

const ROW: Row = {
  id: "row-1",
  from_name: "Alice",
  from_email: "alice@example.com",
  subject: "Test subject",
  timestamp: "2026-05-11T10:30:00Z",
  mailbox_id: 4,
  stage_badge: { label: "general_inquiry", variant: "intent" },
};

const PREDICTED_ROW = {
  id: "row-1",
  automation_run_id: "run-1",
  automation: "debtor-email-review",
  status: "predicted",
  swarm_type: "debtor-email",
  topic: "general_inquiry",
  entity: "smeba",
  mailbox_id: 4,
  result: {
    email_id: "row-1",
    message_id: "msg-1",
    source_mailbox: "debiteuren@smeba.nl",
    subject: "Test subject",
    predicted: { rule: "rule-x", category: "general_inquiry" },
  },
  created_at: "2026-05-11T08:00:00Z",
} as unknown as PredictedRow;

const CATEGORIES = [
  {
    swarm_type: "debtor-email",
    category_key: "payment",
    display_label: "Payment",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 1,
    enabled: true,
  },
];

const INTENTS = [
  {
    swarm_type: "debtor-email",
    intent_key: "general_inquiry",
    display_label: "General inquiry",
    display_order: 1,
    enabled: true,
    swarm_dispatch: null,
    requires_orchestration: false,
  },
  {
    swarm_type: "debtor-email",
    intent_key: "payment_promise",
    display_label: "Payment promise",
    display_order: 2,
    enabled: true,
    swarm_dispatch: null,
    requires_orchestration: false,
  },
];

function Harness({ children }: { children: ReactNode }) {
  return (
    <SelectionProvider initialSelectedId={ROW.id} rowIds={[ROW.id]}>
      {children}
    </SelectionProvider>
  );
}

beforeEach(() => {
  stage1WidgetProps.mockReset();
  stage2WidgetProps.mockReset();
  stage3WidgetProps.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("_shell/detail-pane (Phase 82 Plan 01 + Phase 88 Plan 02)", () => {
  it("T6: when row=null, renders unified 'Select a row to inspect…' copy", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={null}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText={null}
        />
      </Harness>,
    );
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain(
      "Select a row to inspect",
    );
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain("↑");
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain("↓");
  });

  it("T7: with row + activeStage=3, exactly 5 stage cells render; cell 3 is active", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
        />
      </Harness>,
    );

    for (const n of [0, 1, 2, 3, 4]) {
      expect(screen.getByTestId(`stage-cell-${n}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("stage-cell-3").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("stage-cell-3").getAttribute("aria-expanded")).toBe("true");
    for (const n of [0, 1, 2, 4]) {
      expect(screen.getByTestId(`stage-cell-${n}`).getAttribute("data-active")).toBe("false");
    }
  });

  it("T8 (HARD-SEPARATION): Stage 3 widget receives `intents` ONLY; Stage 1 widget receives `categories` ONLY", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    // Mark Stage 3 dirty to mount the widget.
    fireEvent.click(screen.getByTestId("mark-dirty-3"));
    expect(screen.getByTestId("stage-3-override-widget")).toBeInTheDocument();
    expect(stage3WidgetProps).toHaveBeenCalled();

    const s3 = stage3WidgetProps.mock.calls.at(-1)![0] as {
      intents: unknown[];
      categories?: unknown;
    };
    expect(Array.isArray(s3.intents)).toBe(true);
    expect((s3.intents as unknown[]).length).toBe(2);
    expect("categories" in s3).toBe(false);

    // Stage 1 — mark dirty and verify it receives `categories` only.
    fireEvent.click(screen.getByTestId("mark-dirty-1"));
    expect(screen.getByTestId("stage-1-widget-mock")).toBeInTheDocument();
    const s1 = stage1WidgetProps.mock.calls.at(-1)![0] as {
      categories: unknown[];
      intents?: unknown;
    };
    expect(Array.isArray(s1.categories)).toBe(true);
    expect((s1.categories as unknown[]).length).toBe(1);
    expect("intents" in s1).toBe(false);
  });

  it("T9: body preview is collapsible — button toggles 'Show full email' / 'Hide email'", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={1}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="The body content"
        />
      </Harness>,
    );

    const btn = screen.getByTestId("toggle-body-button");
    expect(btn.textContent).toContain("Show full email");
    expect(screen.queryByTestId("email-body-content")).not.toBeInTheDocument();

    fireEvent.click(btn);
    expect(btn.textContent).toContain("Hide email");
    expect(screen.getByTestId("email-body-content").textContent).toContain(
      "The body content",
    );

    fireEvent.click(btn);
    expect(btn.textContent).toContain("Show full email");
    expect(screen.queryByTestId("email-body-content")).not.toBeInTheDocument();
  });

  // ---- Phase 88 Plan 02 new assertions ---------------------------------

  it("T10 (P88-02 #1): Stage 2 row renders Stage2OverrideWidget (NOT the Plan-06 placeholder div)", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={2}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTestId("mark-dirty-2"));
    expect(screen.getByTestId("stage-2-override-widget")).toBeInTheDocument();
    // Placeholder copy must be gone.
    expect(
      screen.queryByText(/Stage 2 customer override — wired in Plan 06/),
    ).not.toBeInTheDocument();
  });

  it("T11 (P88-02 #2): Stage 3 row renders Stage3OverrideWidget (NOT a placeholder)", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTestId("mark-dirty-3"));
    expect(screen.getByTestId("stage-3-override-widget")).toBeInTheDocument();
  });

  it("T12 (P88-02 #3): Stage 3 widget receives the `intents` prop forwarded from UnifiedDetailPane", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTestId("mark-dirty-3"));
    const s3 = stage3WidgetProps.mock.calls.at(-1)![0] as { intents: unknown[] };
    expect(s3.intents).toEqual(INTENTS);
  });

  it("T13 (P88-02 #4): onCancelDirty(2) clears Stage 2 dirty state (widget unmounts)", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={2}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTestId("mark-dirty-2"));
    expect(screen.getByTestId("stage-2-override-widget")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-dirty-2"));
    expect(screen.queryByTestId("stage-2-override-widget")).not.toBeInTheDocument();
  });

  it("T14 (P88-02 #5): onCancelDirty(3) clears Stage 3 dirty state (widget unmounts)", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={3}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    fireEvent.click(screen.getByTestId("mark-dirty-3"));
    expect(screen.getByTestId("stage-3-override-widget")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("cancel-dirty-3"));
    expect(screen.queryByTestId("stage-3-override-widget")).not.toBeInTheDocument();
  });

  it("T15 (P88-02 #6): footer 'Cancel override' (resetAllStageFeedback) clears S0+S1+S2+S3 dirty in one shot", () => {
    render(
      <Harness>
        <UnifiedDetailPane
          row={ROW}
          swarmType="debtor-email"
          activeStage={1}
          categories={CATEGORIES as never}
          intents={INTENTS as never}
          timeline={[]}
          bodyText="Hello"
          predictedRow={PREDICTED_ROW}
        />
      </Harness>,
    );

    // Mark stages 0, 1, 2, 3 dirty.
    fireEvent.click(screen.getByTestId("mark-dirty-0"));
    fireEvent.click(screen.getByTestId("mark-dirty-1"));
    fireEvent.click(screen.getByTestId("mark-dirty-2"));
    fireEvent.click(screen.getByTestId("mark-dirty-3"));

    // All four widgets must be mounted (stage-0 widget rendered by detail-pane
    // is the real Stage0Widget — its data-testid isn't pre-set, but Stage 1/2/3
    // mocks are confirmable here).
    expect(screen.getByTestId("stage-1-widget-mock")).toBeInTheDocument();
    expect(screen.getByTestId("stage-2-override-widget")).toBeInTheDocument();
    expect(screen.getByTestId("stage-3-override-widget")).toBeInTheDocument();

    // Click the footer Cancel-override button (active when any stage dirty).
    fireEvent.click(screen.getByTestId("detail-pane-cancel-override"));

    // All overrideable widgets gone.
    expect(screen.queryByTestId("stage-1-widget-mock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stage-2-override-widget")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stage-3-override-widget")).not.toBeInTheDocument();
  });
});
