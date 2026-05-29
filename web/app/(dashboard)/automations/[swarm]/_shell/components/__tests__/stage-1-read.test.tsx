// Phase 2 Plan 02-03 — Stage 1 Read column tests.
//
// Behaviors (plan Task 1, tests 3–9):
//   T3. PATTERN MATCH section: verdict pill "Rule: <id>", "Decided: <label>".
//   T4. llm_invoked=false → AI RESCUE "Not invoked — pattern match was decisive."
//   T5. llm_invoked=true + no error → verdict pill (label), confidence pill (label
//       not number), reasoning block with Expand toggle.
//   T6. llm_invoked=true + llm_error → red error pill, no verdict pill.
//   T7. row.stage_1 === null → single placeholder line; no sections.
//   T8. NEVER renders cost_cents / token_count / model_id (OQ-5).
//   T9. Reasoning rendered inside pre with white-space: pre-wrap.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type {
  BulkReviewRow,
  BulkReviewStage1Slot,
} from "@/lib/bulk-review/types";
import { Stage1Read } from "../stage-1-read";

afterEach(() => cleanup());

function makeRow(stage1: BulkReviewStage1Slot | null): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "e-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: stage1,
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

function makeSlot(
  overrides: Partial<BulkReviewStage1Slot> = {},
): BulkReviewStage1Slot {
  return {
    category_key: "auto_reply",
    matched_rule_id: "out_of_office",
    regex_verdict: "out_of_office",
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
    agent_run_id: null,
    ...overrides,
  };
}

describe("Stage1Read", () => {
  it("Test 3: PATTERN MATCH section renders matched_rule_id + decided label", () => {
    render(<Stage1Read row={makeRow(makeSlot())} />);
    expect(screen.getByText(/PATTERN MATCH/)).toBeInTheDocument();
    const pill = screen.getByTestId("stage-1-read-pattern-pill");
    expect(pill).toHaveTextContent("Rule: out_of_office");
    // "Decided" key with display label, not the raw key.
    expect(screen.getByText("Decided")).toBeInTheDocument();
    expect(screen.getByTestId("stage-1-read-decided-value")).toHaveTextContent(
      "Auto reply",
    );
  });

  it("Test 3b: no rule matched → 'No rule matched' pill with idle tokens", () => {
    render(
      <Stage1Read
        row={makeRow(
          makeSlot({ matched_rule_id: null, regex_verdict: "unknown" }),
        )}
      />,
    );
    const pill = screen.getByTestId("stage-1-read-pattern-pill");
    expect(pill).toHaveTextContent("No rule matched");
    const style = pill.getAttribute("style") ?? "";
    expect(style).toMatch(/--v7-state-idle-bg/);
  });

  it("Test 4: llm_invoked=false → AI RESCUE 'Not invoked — pattern match was decisive.'", () => {
    render(<Stage1Read row={makeRow(makeSlot({ llm_invoked: false }))} />);
    expect(screen.getByText(/AI RESCUE/)).toBeInTheDocument();
    expect(
      screen.getByText(/Not invoked — pattern match was decisive\./),
    ).toBeInTheDocument();
    // Must NOT use the raw word "regex" in this sentence (operator-language).
    expect(screen.queryByText(/regex was decisive/)).toBeNull();
    // No verdict / confidence pill in this branch.
    expect(screen.queryByTestId("stage-1-read-llm-verdict-pill")).toBeNull();
    expect(screen.queryByTestId("stage-1-read-llm-confidence-pill")).toBeNull();
  });

  it("Test 5: llm_invoked=true + no error → verdict pill (label) + confidence pill (label) + reasoning block w/ Expand", () => {
    const long = "x".repeat(500);
    render(
      <Stage1Read
        row={makeRow(
          makeSlot({
            llm_invoked: true,
            llm_category_key: "spam",
            llm_category_display_label: "Spam",
            llm_confidence: "high",
            llm_reasoning: long,
            llm_error: null,
            predictor: "llm_2nd_pass",
          }),
        )}
      />,
    );
    const verdict = screen.getByTestId("stage-1-read-llm-verdict-pill");
    expect(verdict).toHaveTextContent("LLM verdict: Spam");
    const conf = screen.getByTestId("stage-1-read-llm-confidence-pill");
    // Confidence rendered as label string, NOT a number — OQ-6.
    expect(conf).toHaveTextContent("Confidence: high");
    expect(conf.textContent).not.toMatch(/0\.\d/);
    expect(conf.textContent).not.toMatch(/\d+%/);

    // Reasoning truncated; expand button toggles to full.
    const reasoning = screen.getByTestId("stage-1-read-llm-reasoning");
    expect(reasoning.textContent ?? "").toContain("xxx"); // truncated form
    expect((reasoning.textContent ?? "").length).toBeLessThan(long.length + 5);
    const expandBtn = screen.getByRole("button", { name: /Expand/ });
    fireEvent.click(expandBtn);
    expect(screen.getByTestId("stage-1-read-llm-reasoning").textContent).toBe(
      long,
    );
  });

  it("Test 6: llm_invoked=true + llm_error → red error pill, no verdict pill", () => {
    render(
      <Stage1Read
        row={makeRow(
          makeSlot({
            llm_invoked: true,
            llm_category_key: null,
            llm_category_display_label: null,
            llm_confidence: null,
            llm_reasoning: null,
            llm_error: "orq timeout after 31s",
            predictor: "llm_2nd_pass",
          }),
        )}
      />,
    );
    const errorPill = screen.getByTestId("stage-1-read-llm-error-pill");
    expect(errorPill).toHaveTextContent("Error: orq timeout after 31s");
    const style = errorPill.getAttribute("style") ?? "";
    expect(style).toMatch(/--v7-state-blocked-bg/);
    expect(style).toMatch(/--v7-state-blocked-fg/);
    expect(screen.queryByTestId("stage-1-read-llm-verdict-pill")).toBeNull();
  });

  it("Test 7: row.stage_1 === null → single placeholder, no sections", () => {
    render(<Stage1Read row={makeRow(null)} />);
    expect(
      screen.getByText(/Stage 1 has not yet run on this row\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PATTERN MATCH/)).toBeNull();
    expect(screen.queryByText(/AI RESCUE/)).toBeNull();
  });

  it("Test 8: never renders cost_cents / token_count / model_id (OQ-5)", () => {
    const { container } = render(
      <Stage1Read
        row={makeRow(
          makeSlot({
            llm_invoked: true,
            llm_category_key: "spam",
            llm_category_display_label: "Spam",
            llm_confidence: "medium",
            llm_reasoning: "short reason",
            llm_error: null,
            predictor: "llm_2nd_pass",
          }),
        )}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/cost_cents|token_count|model_id/);
    expect(text).not.toMatch(/cost cents|token count|model id/i);
  });

  describe("Phase 04.1 — purple variant", () => {
    it("predictor='llm_2nd_pass' + model_key set → rescue card with data-variant='pass-2'", () => {
      render(
        <Stage1Read
          row={makeRow(
            makeSlot({
              llm_invoked: true,
              llm_category_key: "spam",
              llm_category_display_label: "Spam",
              llm_confidence: "high",
              llm_reasoning: "short",
              predictor: "llm_2nd_pass",
              llm_model_key: "stage-1-category-classifier",
            }),
          )}
        />,
      );
      const card = screen.getByTestId("stage-1-llm-rescue-card");
      expect(card.getAttribute("data-variant")).toBe("pass-2");
    });

    it("Pass-2 rescue header contains '— · — tok · {model_key}'", () => {
      render(
        <Stage1Read
          row={makeRow(
            makeSlot({
              llm_invoked: true,
              llm_category_key: "spam",
              llm_category_display_label: "Spam",
              llm_confidence: "high",
              llm_reasoning: "short",
              predictor: "llm_2nd_pass",
              llm_model_key: "stage-1-category-classifier",
            }),
          )}
        />,
      );
      const header = screen.getByTestId("stage-1-llm-rescue-header");
      expect(header.textContent ?? "").toMatch(
        /—\s*·\s*—\s*tok\s*·\s*stage-1-category-classifier/,
      );
    });

    it("predictor='regex' → rescue card has data-variant='regex-only', no purple header", () => {
      render(
        <Stage1Read
          row={makeRow(
            makeSlot({
              llm_invoked: false,
              predictor: "regex",
              llm_model_key: null,
            }),
          )}
        />,
      );
      const card = screen.getByTestId("stage-1-llm-rescue-card");
      expect(card.getAttribute("data-variant")).toBe("regex-only");
      expect(screen.queryByTestId("stage-1-llm-rescue-header")).toBeNull();
    });

    it("llm_model_key === null but Pass-2 ran → variant='pass-2' AND header shows em-dash for model slot", () => {
      render(
        <Stage1Read
          row={makeRow(
            makeSlot({
              llm_invoked: true,
              llm_category_key: "spam",
              llm_category_display_label: "Spam",
              llm_confidence: "high",
              llm_reasoning: "short",
              predictor: "llm_2nd_pass",
              llm_model_key: null,
            }),
          )}
        />,
      );
      const card = screen.getByTestId("stage-1-llm-rescue-card");
      expect(card.getAttribute("data-variant")).toBe("pass-2");
      const header = screen.getByTestId("stage-1-llm-rescue-header");
      // Final slot after the second "·" must be the em-dash.
      expect(header.textContent ?? "").toMatch(/—\s*·\s*—\s*tok\s*·\s*—\s*$/);
    });

    it("no raw hex in inline styles for purple variant", () => {
      const { container } = render(
        <Stage1Read
          row={makeRow(
            makeSlot({
              llm_invoked: true,
              llm_category_key: "spam",
              llm_category_display_label: "Spam",
              llm_confidence: "high",
              llm_reasoning: "short",
              predictor: "llm_2nd_pass",
              llm_model_key: "stage-1-category-classifier",
            }),
          )}
        />,
      );
      const styled = container.querySelectorAll("[style]");
      for (const el of Array.from(styled)) {
        const style = el.getAttribute("style") ?? "";
        expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      }
    });
  });

  it("Test 9: reasoning rendered inside <pre> with white-space: pre-wrap", () => {
    render(
      <Stage1Read
        row={makeRow(
          makeSlot({
            llm_invoked: true,
            llm_category_key: "spam",
            llm_category_display_label: "Spam",
            llm_confidence: "low",
            llm_reasoning: "line1\nline2",
            llm_error: null,
            predictor: "llm_2nd_pass",
          }),
        )}
      />,
    );
    const reasoning = screen.getByTestId("stage-1-read-llm-reasoning");
    expect(reasoning.tagName.toLowerCase()).toBe("pre");
    const style = reasoning.getAttribute("style") ?? "";
    expect(style).toMatch(/pre-wrap/);
  });
});
