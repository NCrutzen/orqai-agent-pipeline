// Phase 999.8 Plan 08 Task 1 — RTL test for PredictorChip (D-08, D-12).
//
// Cases:
//   (a) predictor='llm_2nd_pass', llmConfidence='medium'  → renders "LLM · medium"
//   (b) predictor='llm_2nd_pass', llmConfidence='high'    → renders "LLM · high"
//   (c) predictor='regex'                                 → renders "regex" (no rule_key)
//   (d) predictor=null                                    → renders nothing

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { PredictorChip } from "../components/PredictorChip";

afterEach(() => cleanup());

describe("PredictorChip (D-08, D-12)", () => {
  it("renders 'LLM · medium' for llm_2nd_pass + medium confidence", () => {
    render(<PredictorChip predictor="llm_2nd_pass" llmConfidence="medium" />);
    const chip = screen.getByTestId("predictor-chip");
    expect(chip.textContent).toBe("LLM · medium");
    expect(chip.getAttribute("data-predictor")).toBe("llm_2nd_pass");
  });

  it("renders 'LLM · high' for llm_2nd_pass + high confidence", () => {
    render(<PredictorChip predictor="llm_2nd_pass" llmConfidence="high" />);
    expect(screen.getByTestId("predictor-chip").textContent).toBe("LLM · high");
  });

  it("renders 'regex' for regex predictor (D-12: no rule_key)", () => {
    render(<PredictorChip predictor="regex" llmConfidence={null} />);
    const chip = screen.getByTestId("predictor-chip");
    expect(chip.textContent).toBe("regex");
    expect(chip.getAttribute("data-predictor")).toBe("regex");
  });

  it("renders nothing when predictor is null (pre-cutover row, D-09 forward-only)", () => {
    const { container } = render(<PredictorChip predictor={null} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("predictor-chip")).toBeNull();
  });

  it("renders nothing when predictor is undefined", () => {
    const { container } = render(<PredictorChip predictor={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
