// Phase 82 Plan 01 Task 3 — RTL tests for _shell/detail-pane.tsx
//
// Covers:
//   T6: when row=null, renders unified "Select a row to inspect…" copy.
//   T7: when row provided + activeStage=3, exactly 5 stage cells render
//       (testid stage-cell-0..4); the activeStage cell carries
//       aria-expanded="true" / data-active="true"; others "false".
//   T8 (hard-separation): the Stage 3 cell's widget receives `intents` ONLY
//       (not categories); the Stage 1 cell receives `categories` ONLY. Verified
//       via vi.mock + prop-spy on Stage1Widget + Stage3Widget.
//   T9: body preview is collapsible — clicking "Show full email" toggles it.
//   T10: Stage0Widget renders the 2-state toggle when active cell is stage 0.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// --- module mocks --------------------------------------------------------

const stage1WidgetProps = vi.fn();
const stage3WidgetProps = vi.fn();

vi.mock("../../stage-1/components/stage-1-widget", () => ({
  Stage1Widget: (props: { categories: unknown[]; value: unknown; onChange: unknown }) => {
    stage1WidgetProps(props);
    return <div data-testid="stage-1-widget-mock" data-cat-count={props.categories.length} />;
  },
}));

vi.mock("../../stage-1/components/stage-3-widget", () => ({
  Stage3Widget: (props: { intents: unknown[]; value: unknown; onChange: unknown }) => {
    stage3WidgetProps(props);
    return <div data-testid="stage-3-widget-mock" data-intent-count={props.intents.length} />;
  },
}));

// PipelineFlow is heavy — render a minimal stand-in that exposes the stages
// array so tests can assert structure.
vi.mock("../../stage-1/components/pipeline-flow", () => ({
  PipelineFlow: ({ stages }: { stages: Array<{ n: number; widget: React.ReactNode }> }) => (
    <ol data-testid="pipeline-flow-mock">
      {stages.map((s) => (
        <li key={s.n} data-stage={s.n}>
          <span data-testid={`stage-${s.n}-title`} />
          {s.widget}
        </li>
      ))}
    </ol>
  ),
}));

import { UnifiedDetailPane } from "../detail-pane";
import type { Row } from "../_lib/types";

const ROW: Row = {
  id: "row-1",
  from_name: "Alice",
  from_email: "alice@example.com",
  subject: "Test subject",
  timestamp: "2026-05-11T10:30:00Z",
  mailbox_id: 4,
  stage_badge: { label: "general_inquiry", variant: "intent" },
};

const CATEGORIES = [
  { swarm_type: "debtor-email", category_key: "payment", display_label: "Payment", outlook_label: null, action: "categorize_archive" as const, swarm_dispatch: null, display_order: 1, enabled: true },
];

const INTENTS = [
  { swarm_type: "debtor-email", intent_key: "general_inquiry", display_label: "General inquiry", display_order: 1, enabled: true, swarm_dispatch: null, requires_orchestration: false },
  { swarm_type: "debtor-email", intent_key: "payment_promise", display_label: "Payment promise", display_order: 2, enabled: true, swarm_dispatch: null, requires_orchestration: false },
];

beforeEach(() => {
  stage1WidgetProps.mockReset();
  stage3WidgetProps.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("_shell/detail-pane (Phase 82 Plan 01)", () => {
  it("T6: when row=null, renders unified 'Select a row to inspect…' copy", () => {
    render(
      <UnifiedDetailPane
        row={null}
        swarmType="debtor-email"
        activeStage={3}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText={null}
      />,
    );
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain(
      "Select a row to inspect",
    );
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain("↑");
    expect(screen.getByTestId("detail-pane-empty").textContent).toContain("↓");
  });

  it("T7: with row + activeStage=3, exactly 5 stage cells render; cell 3 is active", () => {
    render(
      <UnifiedDetailPane
        row={ROW}
        swarmType="debtor-email"
        activeStage={3}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText="Hello"
      />,
    );

    // Five hidden test markers, one per stage.
    for (const n of [0, 1, 2, 3, 4]) {
      expect(screen.getByTestId(`stage-cell-${n}`)).toBeInTheDocument();
    }
    // The activeStage=3 cell is active.
    expect(screen.getByTestId("stage-cell-3").getAttribute("data-active")).toBe("true");
    expect(screen.getByTestId("stage-cell-3").getAttribute("aria-expanded")).toBe("true");
    // Others are not active.
    for (const n of [0, 1, 2, 4]) {
      expect(screen.getByTestId(`stage-cell-${n}`).getAttribute("data-active")).toBe("false");
    }
  });

  it("T8 (HARD-SEPARATION): Stage 3 cell widget receives `intents` ONLY; Stage 1 cell receives `categories` ONLY", () => {
    render(
      <UnifiedDetailPane
        row={ROW}
        swarmType="debtor-email"
        activeStage={3}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText="Hello"
      />,
    );

    // activeStage=3 => the Stage 3 widget is mounted dirty.
    expect(screen.getByTestId("stage-3-widget-mock")).toBeInTheDocument();
    expect(stage3WidgetProps).toHaveBeenCalled();

    // Stage 3 widget received `intents` prop with 2 entries.
    const s3 = stage3WidgetProps.mock.calls[0]![0] as { intents: unknown[]; categories?: unknown };
    expect(Array.isArray(s3.intents)).toBe(true);
    expect((s3.intents as unknown[]).length).toBe(2);
    // Critical: Stage 3 widget does NOT receive `categories`.
    expect("categories" in s3).toBe(false);

    // Render again with activeStage=1 to inspect Stage 1 widget prop-shape.
    cleanup();
    stage1WidgetProps.mockReset();

    render(
      <UnifiedDetailPane
        row={ROW}
        swarmType="debtor-email"
        activeStage={1}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText="Hello"
      />,
    );
    expect(screen.getByTestId("stage-1-widget-mock")).toBeInTheDocument();
    const s1 = stage1WidgetProps.mock.calls[0]![0] as { categories: unknown[]; intents?: unknown };
    expect(Array.isArray(s1.categories)).toBe(true);
    expect((s1.categories as unknown[]).length).toBe(1);
    // Critical: Stage 1 widget does NOT receive `intents`.
    expect("intents" in s1).toBe(false);
  });

  it("T9: body preview is collapsible — button toggles 'Show full email' / 'Hide email'", () => {
    render(
      <UnifiedDetailPane
        row={ROW}
        swarmType="debtor-email"
        activeStage={1}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText="The body content"
      />,
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

  it("T10: Stage0Widget renders 2-state toggle when activeStage=0", () => {
    render(
      <UnifiedDetailPane
        row={ROW}
        swarmType="debtor-email"
        activeStage={0}
        categories={CATEGORIES as never}
        intents={INTENTS as never}
        timeline={[]}
        bodyText="Hello"
      />,
    );

    // Two radio buttons inside the Stage 0 fieldset.
    const inputs = screen.getAllByRole("radio");
    expect(inputs.length).toBe(2);
    expect(screen.getByText("Injection suspected")).toBeInTheDocument();
    expect(screen.getByText("Clean")).toBeInTheDocument();
  });
});
