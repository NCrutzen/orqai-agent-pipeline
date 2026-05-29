// Phase 2 Plan 02-04 — Stage1FeedbackWidget tests.
//
// Covers behaviors 1–8 + 10 from the plan's Task 2 list. The forbidden-call
// surface (behavior 9) is asserted in the sibling
// stage-1-feedback-widget.no-pipeline-events.test.tsx file via a fetch-URL
// scan so the assertion is unambiguous even on success paths that touch
// global fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type {
  BulkReviewRow,
  BulkReviewStage1Slot,
} from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

// Hoisted spy for fireFeedback so we can assert the exact payload shape.
const { fireFeedbackSpy } = vi.hoisted(() => ({
  fireFeedbackSpy: vi.fn(
    async (..._args: unknown[]): Promise<undefined> => undefined,
  ),
}));

vi.mock("@/lib/automations/debtor-email/feedback/fire-feedback", () => ({
  fireFeedback: fireFeedbackSpy,
}));

import { Stage1FeedbackWidget } from "../stage-1-feedback-widget";

const CATEGORIES: SwarmNoiseCategoryRow[] = [
  {
    swarm_type: "debtor-email",
    category_key: "auto_reply",
    display_label: "Auto reply",
    outlook_label: null,
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 1,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "out_of_office",
    display_label: "Out of office",
    outlook_label: null,
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 2,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "spam",
    display_label: "Spam",
    outlook_label: null,
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 3,
    enabled: true,
  },
];

function makeSlot(overrides: Partial<BulkReviewStage1Slot> = {}): BulkReviewStage1Slot {
  return {
    category_key: "auto_reply",
    matched_rule_id: "rule-7",
    regex_verdict: "rule-7",
    llm_second_pass_verdict: null,
    pipeline_event_id: "pe-1",
    llm_invoked: false,
    llm_category_key: null,
    llm_confidence: null,
    llm_reasoning: null,
    llm_error: null,
    predictor: "regex",
    llm_model_key: null,
    category_display_label: "Auto reply",
    llm_category_display_label: null,
    agent_run_id: "33333333-3333-4333-8333-333333333333",
    ...overrides,
  };
}

function makeRow(slot: BulkReviewStage1Slot | null): BulkReviewRow {
  return {
    email_label_id: "label-1",
    swarm_type: "debtor-email",
    email_id: "11111111-1111-4111-8111-111111111111",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: slot,
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

describe("Stage1FeedbackWidget", () => {
  beforeEach(() => {
    fireFeedbackSpy.mockClear();
    // JSDOM polyfills — Radix Select uses these APIs.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function () {};
    }
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

  it("Test 1: initial state — Confirm rule (green) + Flip to override (amber); no dropdown; AuditBlock visible", () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    const confirmBtn = screen.getByTestId("stage-1-feedback-widget-confirm");
    expect(confirmBtn).toHaveTextContent("Confirm rule");
    const confirmStyle = confirmBtn.getAttribute("style") ?? "";
    expect(confirmStyle).toMatch(/--v7-action-confirm-bg/);
    expect(confirmStyle).toMatch(/--v7-action-confirm-fg/);

    const flipBtn = screen.getByTestId("stage-1-feedback-widget-flip");
    expect(flipBtn).toHaveTextContent("Flip to override");
    const flipStyle = flipBtn.getAttribute("style") ?? "";
    expect(flipStyle).toMatch(/--v7-action-override-bg/);
    expect(flipStyle).toMatch(/--v7-action-override-fg/);

    // Category dropdown not visible yet.
    expect(
      screen.queryByTestId("stage-1-feedback-widget-category-dropdown"),
    ).toBeNull();

    // AuditBlock visible.
    const textarea = screen.getByTestId(
      "stage-1-feedback-widget-notes",
    ) as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.maxLength).toBe(4000);
    expect(textarea.getAttribute("style") ?? "").toMatch(
      /min-height:\s*160px/i,
    );
  });

  it("Test 2: clicking Confirm fires fireFeedback with stage=1, verdict=confirm, agent_run_id from slot", async () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-confirm"));
    // fireFeedback is awaited; await microtask.
    await Promise.resolve();
    expect(fireFeedbackSpy).toHaveBeenCalledTimes(1);
    const payload = fireFeedbackSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      email_id: "11111111-1111-4111-8111-111111111111",
      stage: 1,
      verdict: "confirm",
      agent_run_id: "33333333-3333-4333-8333-333333333333",
    });
    // No corrected_value on the confirm path.
    expect(payload.corrected_value).toBeUndefined();
  });

  it("Test 3: clicking Flip to override reveals the category dropdown + 'Submit override' CTA", () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-flip"));
    expect(
      screen.getByTestId("stage-1-feedback-widget-category-dropdown"),
    ).toBeInTheDocument();
    const cta = screen.getByTestId("stage-1-feedback-widget-confirm");
    expect(cta).toHaveTextContent("Submit override");
    // Still green (verdict color bound to action class, not state).
    expect(cta.getAttribute("style") ?? "").toMatch(/--v7-action-confirm-bg/);
    // Cancel button now visible.
    expect(
      screen.getByTestId("stage-1-feedback-widget-cancel"),
    ).toHaveTextContent("Cancel");
  });

  it("Test 4: flip → select 'out_of_office' → Submit fires fireFeedback with verdict=override + corrected_value + agent_run_id", async () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-flip"));
    // Select wrapper has a native dropdown — fire change via radix-style trigger
    // is fragile in jsdom. The Stage1CategorySelect component renders a
    // <Select> from @/components/ui/select; for the unit test we drive its
    // onChange directly by invoking the hidden radix combobox value. Since
    // we cannot easily fire that here, we exercise the dropdown path by
    // simulating the same state-update fireFeedback consumes: type the
    // value into a synthetic textarea note and then assert the disabled
    // gate before/after selecting a category. To keep the test crisp we
    // expose the dropdown's behavior through a direct workaround — pressing
    // the trigger then querying its options is the contract @testing-library
    // expects.
    const trigger = screen.getByRole("combobox", {
      name: /Pick a Stage 1 category/i,
    });
    fireEvent.click(trigger);
    // Find the 'out_of_office' option (the dropdown renders category_key).
    const option = await screen.findByRole("option", {
      name: /out_of_office/i,
    });
    fireEvent.click(option);

    // Add a note to exercise the prose_notes pass-through.
    fireEvent.change(screen.getByTestId("stage-1-feedback-widget-notes"), {
      target: { value: "  Better match for OOO    " },
    });

    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-confirm"));
    await Promise.resolve();
    expect(fireFeedbackSpy).toHaveBeenCalledTimes(1);
    const payload = fireFeedbackSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      email_id: "11111111-1111-4111-8111-111111111111",
      stage: 1,
      verdict: "override",
      corrected_value: "out_of_office",
      prose_notes: "Better match for OOO",
      agent_run_id: "33333333-3333-4333-8333-333333333333",
    });
  });

  it("Test 5: AuditBlock textarea — operator-facing label, 4000 char cap, 160px min-height, brand-orange left border", () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    expect(
      screen.getByText(/What's the correction context\? \(optional\)/),
    ).toBeInTheDocument();
    const ta = screen.getByTestId(
      "stage-1-feedback-widget-notes",
    ) as HTMLTextAreaElement;
    expect(ta.maxLength).toBe(4000);
    const style = ta.getAttribute("style") ?? "";
    expect(style).toMatch(/min-height:\s*160px/i);
    expect(style).toMatch(/border-left:\s*3px solid var\(--v7-brand-primary\)/i);
  });

  it("Test 6: component never imports EvalTypeRadio (file-content assertion)", async () => {
    // Static file-content check — the import graph is asserted by reading
    // the file as text and grep-ing for the forbidden symbols. This is the
    // "import-graph scan via grep-style filesystem assertion" the plan calls
    // for. Mirrors the equivalent guard used by other Phase 2 widgets.
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(
        __dirname,
        "..",
        "stage-1-feedback-widget.tsx",
      ),
      "utf8",
    );
    expect(src).not.toMatch(/EvalTypeRadio/);
    expect(src).not.toMatch(/eval-type-radio/);
    expect(src).not.toMatch(/eval_type/);
  });

  it("Test 7: component never posts to /api/automations/debtor-email/override (file-content assertion)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(__dirname, "..", "stage-1-feedback-widget.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\/api\/automations\/debtor-email\/override/);
  });

  it("Test 8: component never imports / calls writeOverride (file-content assertion)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(__dirname, "..", "stage-1-feedback-widget.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/writeOverride/);
    expect(src).not.toMatch(/from .*write-override/);
  });

  it("Test 10: row.stage_1 === null → placeholder, no buttons, no textarea", () => {
    render(
      <Stage1FeedbackWidget row={makeRow(null)} categories={CATEGORIES} />,
    );
    expect(
      screen.getByText(/No Stage 1 decision to vote on yet\./),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stage-1-feedback-widget-confirm")).toBeNull();
    expect(screen.queryByTestId("stage-1-feedback-widget-flip")).toBeNull();
    expect(screen.queryByTestId("stage-1-feedback-widget-notes")).toBeNull();
  });
});
