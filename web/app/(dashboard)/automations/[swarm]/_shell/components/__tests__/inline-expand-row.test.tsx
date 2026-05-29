// Phase 2 Plan 02-01 — InlineExpandRow tests (container shell + window-event bridge).
// Covers behaviors 1-8 of the plan's Task 3 list.
//
// Hard-separation lock honored: fixtures set stage_2.entity_brand from
// the ENTITY_BRANDS literal-union (registry-validated by hydrator). The
// container never touches swarm_noise_categories / swarm_intents directly.

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Phase 5 Plan 05-01 Task 2 — EmailBodyBlock is now mounted inside
// InlineExpandRow (RESEARCH Pitfall 1). It pulls in translate + sonner +
// ThreadModal; stub them so every render in this file stays hermetic (same
// pattern as email-body-block.test.tsx).
const { translateMock, detectLanguageMock, toastMock } = vi.hoisted(() => ({
  translateMock: vi.fn(),
  detectLanguageMock: vi.fn(),
  toastMock: vi.fn(),
}));
vi.mock("@/lib/translation/translate", () => ({
  translate: (...a: unknown[]) => translateMock(...a),
  detectLanguage: (...a: unknown[]) => detectLanguageMock(...a),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(toastMock, { error: toastMock, success: toastMock }),
}));
vi.mock("../thread-modal", () => ({
  ThreadModal: (props: { open: boolean }) =>
    props.open ? <div data-testid="thread-modal-stub">thread-modal</div> : null,
}));

import { InlineExpandRow } from "../inline-expand-row";

afterEach(() => cleanup());

function makeRow(overrides: Partial<BulkReviewRow> = {}): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "e-1",
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
    ...overrides,
  };
}

describe("InlineExpandRow", () => {
  it("Test 1: renders 5 stage tabs", () => {
    render(<InlineExpandRow row={makeRow()} />);
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(
        screen.getByTestId(`inline-expand-tab-${idx}`),
      ).toBeInTheDocument();
    }
  });

  it("Test 1b: default active stage = first warn/blocked, else Stage 1", () => {
    // All-null row: Stage 0 → safe, Stage 1 → idle, Stages 2-4 idle → no
    // warn/blocked → fallback Stage 1.
    const { container } = render(<InlineExpandRow row={makeRow()} />);
    expect(
      container.querySelector('[data-active-stage="1"]'),
    ).toBeInTheDocument();
  });

  it("Test 1c: default active stage prefers a blocked stage", () => {
    const row = makeRow({
      stage_0: {
        verdict: "injection_suspected",
        cost_cents: 0,
        confidence: null,
        pipeline_event_id: "pe-0",
      },
    });
    const { container } = render(<InlineExpandRow row={row} />);
    expect(
      container.querySelector('[data-active-stage="0"]'),
    ).toBeInTheDocument();
  });

  it("Test 2: renders 2-col Read+Decide body; Stage 3 Decide is now allowed (Plan 03 Task 2)", () => {
    render(<InlineExpandRow row={makeRow()} />);
    expect(screen.getByTestId("inline-expand-read-col")).toBeInTheDocument();
    expect(screen.getByTestId("inline-expand-decide-col")).toBeInTheDocument();
    // Switch to Stage 3 → without stage3Content.decide provided, the
    // container falls back to the "ships in a later Plan" placeholder.
    // When stage3Content.decide IS provided by row-strip-list.tsx, the
    // Stage3Decide widget renders.
    fireEvent.click(screen.getByTestId("inline-expand-tab-3"));
    expect(screen.getByTestId("empty-decide-3")).toHaveTextContent(
      /Stage 3 decide column ships in a later Plan/,
    );
  });

  it("Test 2b (Plan 03): when stage3Content.decide is provided, Stage 3 Decide is mounted (no placeholder)", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        stage3Content={{
          read: <div data-testid="custom-stage-3-read">read</div>,
          decide: <div data-testid="custom-stage-3-decide">decide</div>,
        }}
      />,
    );
    fireEvent.click(screen.getByTestId("inline-expand-tab-3"));
    expect(screen.getByTestId("custom-stage-3-decide")).toBeInTheDocument();
    expect(screen.queryByTestId("empty-decide-3")).toBeNull();
  });

  it("Test 2 (Plan 02): rerunInFlight=true makes Stage 3 + 4 tabs non-interactive", () => {
    const row = makeRow();
    render(<InlineExpandRow row={row} rerunInFlight={true} />);
    const tab3 = screen.getByTestId("inline-expand-tab-3");
    const tab4 = screen.getByTestId("inline-expand-tab-4");
    expect(tab3.getAttribute("aria-disabled")).toBe("true");
    expect(tab4.getAttribute("aria-disabled")).toBe("true");
    expect(tab3.style.opacity).toBe("0.5");
    expect(tab4.style.opacity).toBe("0.5");
    expect(tab3.style.pointerEvents).toBe("none");
    expect(tab4.style.pointerEvents).toBe("none");
    // Click is a no-op while disabled (activeStage stays at default Stage 1).
    fireEvent.click(tab3);
    fireEvent.click(tab4);
    const container = screen.getByTestId("inline-expand-row");
    expect(container.getAttribute("data-active-stage")).toBe("1");
  });

  it("Test 2 (Plan 02): rerunInFlight=true keeps Stage 0/1/2 tabs interactive", () => {
    const row = makeRow();
    render(<InlineExpandRow row={row} rerunInFlight={true} />);
    const tab2 = screen.getByTestId("inline-expand-tab-2");
    expect(tab2.getAttribute("aria-disabled")).toBeNull();
    fireEvent.click(tab2);
    expect(
      screen.getByTestId("inline-expand-row").getAttribute("data-active-stage"),
    ).toBe("2");
  });

  it("Test 3: footer affordance line has 4 locked labels in order", () => {
    render(<InlineExpandRow row={makeRow()} />);
    const footer = screen.getByTestId("inline-expand-footer");
    const text = footer.textContent ?? "";
    const idxConfirm = text.indexOf("⏎ Confirm rule");
    const idxJK = text.indexOf("J / K next-prev");
    const idxEsc = text.indexOf("Esc collapse");
    const idxN = text.indexOf("N skip");
    expect(idxConfirm).toBeGreaterThanOrEqual(0);
    expect(idxJK).toBeGreaterThan(idxConfirm);
    expect(idxEsc).toBeGreaterThan(idxJK);
    expect(idxN).toBeGreaterThan(idxEsc);
  });

  it("Test 4a: brand badge renders from stage_2.entity_brand when present", () => {
    const row = makeRow({
      stage_2: {
        entity_brand: "smeba",
        resolver_source: "sender_map",
        customer_account_id: "cust-1",
        corrected_customer_account_id: null,
        confidence: 0.9,
        pipeline_event_id: "pe-2",
        resolver_steps: null,
        winner_step: null,
        customer_name: null,
        sender_map_lineage: null,
        inputs: null,
      },
    });
    render(<InlineExpandRow row={row} />);
    const badge = screen.getByTestId("inline-expand-brand-badge");
    expect(badge).toHaveTextContent("smeba");
    expect(badge.getAttribute("data-brand")).toBe("smeba");
  });

  it("Test 4b: brand badge not rendered when entity_brand is null", () => {
    render(<InlineExpandRow row={makeRow()} />);
    expect(
      screen.queryByTestId("inline-expand-brand-badge"),
    ).not.toBeInTheDocument();
  });

  it("Test 5: the container itself registers NO bulk-review:approve/reject/skip listeners — the real handlers live in the per-stage Decide widgets (IN-03 / IN-05). toggle-body is owned by the EmailBodyBlock child, not this container.", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(<InlineExpandRow row={makeRow()} />);
    const added = addSpy.mock.calls.map((c) => c[0] as string);
    expect(added).not.toContain("bulk-review:approve");
    expect(added).not.toContain("bulk-review:reject");
    expect(added).not.toContain("bulk-review:skip");
    // bulk-review:toggle-body IS registered — but by the EmailBodyBlock child
    // (email-body-block.tsx), which now owns body expansion. The former no-op
    // toggle-body forwarder on this container was removed (IN-05).
    addSpy.mockRestore();
  });

  it("Test 6: does NOT register bulk-review:eval-type-* listeners (sketch 003 lock)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    render(<InlineExpandRow row={makeRow()} />);
    const added = addSpy.mock.calls.map((c) => c[0] as string);
    expect(added).not.toContain("bulk-review:eval-type-capability");
    expect(added).not.toContain("bulk-review:eval-type-regression");
    addSpy.mockRestore();
  });

  it("Test 7: client-shell.tsx renders <RowStripList> (Bulk Review surface swap)", () => {
    // Source-grep gate: the new client-shell.tsx imports RowStripList and
    // does NOT mount the legacy UnifiedDetailPane or RowList.
    const path = join(
      process.cwd(),
      "app",
      "(dashboard)",
      "automations",
      "[swarm]",
      "_shell",
      "client-shell.tsx",
    );
    const src = readFileSync(path, "utf8");
    expect(src).toMatch(/RowStripList/);
    // No import of the legacy detail-pane or row-list.
    expect(src).not.toMatch(/from\s+"\.\/detail-pane"/);
    expect(src).not.toMatch(/from\s+"\.\/option-z-detail-pane"/);
    expect(src).not.toMatch(/from\s+"\.\/row-list"/);
    // No JSX mount of the legacy components.
    expect(src).not.toMatch(/<UnifiedDetailPane[\s/>]/);
    expect(src).not.toMatch(/<OptionZDetailPane[\s/>]/);
    expect(src).not.toMatch(/<RowList[\s/>]/);
  });

  it("Test 8: stage-content slot props injected per-stage are rendered when active", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        stage1Content={{
          read: <div data-testid="custom-stage1-read">custom S1 read</div>,
          decide: <div data-testid="custom-stage1-decide">custom S1 decide</div>,
        }}
      />,
    );
    // Default active = Stage 1 (no warn/blocked rows) → custom content visible.
    expect(screen.getByTestId("custom-stage1-read")).toBeInTheDocument();
    expect(screen.getByTestId("custom-stage1-decide")).toBeInTheDocument();
  });
});

// Phase 5 Plan 05-01 Task 2 — EmailBodyBlock mount + thread-gate (Pitfall 1).
const CONV_ID = "33333333-3333-4333-8333-333333333333";

describe("InlineExpandRow — EmailBodyBlock mount (Pitfall 1)", () => {
  it("mounts EmailBodyBlock (email-body-section present)", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        bodyText="hello"
        conversationId={CONV_ID}
        messageCount={3}
        swarmType="debtor-email"
      />,
    );
    expect(screen.getByTestId("email-body-section")).toBeInTheDocument();
  });

  it("renders 'View full thread' when conversation_id set + message_count=3", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        bodyText="hello"
        conversationId={CONV_ID}
        messageCount={3}
        swarmType="debtor-email"
      />,
    );
    expect(screen.getByTestId("view-full-thread-button")).toBeInTheDocument();
  });

  it("does NOT render the thread button when message_count=1", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        bodyText="hello"
        conversationId={CONV_ID}
        messageCount={1}
        swarmType="debtor-email"
      />,
    );
    expect(screen.queryByTestId("view-full-thread-button")).toBeNull();
  });

  it("does NOT render the thread button when conversation_id is null", () => {
    render(
      <InlineExpandRow
        row={makeRow()}
        bodyText="hello"
        conversationId={null}
        messageCount={3}
        swarmType="debtor-email"
      />,
    );
    expect(screen.queryByTestId("view-full-thread-button")).toBeNull();
  });
});
