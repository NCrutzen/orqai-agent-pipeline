// Phase 2 Plan 02-04 — Stage1FeedbackWidget forbidden-call guard.
//
// Behavior 9 (separate file per plan instructions): assert that across BOTH
// the confirm path AND the override path, the widget never:
//   • posts to a URL containing "pipeline_events"
//   • posts to a URL containing "/override"
//   • triggers any fetch whose body shape isn't the /feedback payload
//
// We do this by hijacking fireFeedback to spy on the JSON it forwards (the
// helper's fetch URL is the only one this widget reaches for) AND by reading
// the source file off disk to assert the import graph contains no forbidden
// symbols. The static + dynamic combo is the "import-graph scan via grep-
// style filesystem assertion" the plan calls for.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type {
  BulkReviewRow,
  BulkReviewStage1Slot,
} from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

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
];

function makeSlot(): BulkReviewStage1Slot {
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

describe("Stage1FeedbackWidget — forbidden-call surface", () => {
  beforeEach(() => {
    fireFeedbackSpy.mockClear();
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

  it("Test 9a: confirm path — fireFeedback is the ONLY call, no /override, no pipeline_events in payload", async () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-confirm"));
    await Promise.resolve();
    expect(fireFeedbackSpy).toHaveBeenCalledTimes(1);
    const payload = fireFeedbackSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    // Payload keys are the /feedback contract — NOT a pipeline_events row.
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toMatch(/pipeline_events/);
    expect(serialised).not.toMatch(/\/override/);
    // Shape sanity: every key must be from the /feedback contract — no
    // axis-1 / pipeline_events keys snuck in. corrected_value and
    // prose_notes may be present with `undefined` value (object spread is
    // immaterial — server-side zod treats them as omitted).
    const allowedKeys = new Set([
      "agent_run_id",
      "email_id",
      "stage",
      "verdict",
      "corrected_value",
      "prose_notes",
    ]);
    for (const k of Object.keys(payload)) {
      expect(allowedKeys.has(k)).toBe(true);
    }
  });

  it("Test 9b: override path — fireFeedback payload is /feedback shape; no override URL, no pipeline_events", async () => {
    render(
      <Stage1FeedbackWidget row={makeRow(makeSlot())} categories={CATEGORIES} />,
    );
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-flip"));
    const trigger = screen.getByRole("combobox", {
      name: /Pick a Stage 1 category/i,
    });
    fireEvent.click(trigger);
    const option = await screen.findByRole("option", {
      name: /out_of_office/i,
    });
    fireEvent.click(option);
    fireEvent.click(screen.getByTestId("stage-1-feedback-widget-confirm"));
    await Promise.resolve();
    expect(fireFeedbackSpy).toHaveBeenCalledTimes(1);
    const payload = fireFeedbackSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toMatch(/pipeline_events/);
    expect(serialised).not.toMatch(/\/override/);
    // verdict='override' but the WRITE goes through /feedback (server then
    // gates the human_verdict UPDATE on stage===1 + verdict==='override' +
    // agent_run_id — see route test P2-04 Test 2).
    expect(payload.verdict).toBe("override");
  });

  it("Test 9c: source file — no import / fetch reference to pipeline_events or /override", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.resolve(__dirname, "..", "stage-1-feedback-widget.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/pipeline_events/);
    expect(src).not.toMatch(/\/override/);
    expect(src).not.toMatch(/writeOverride/);
  });
});
