// Phase 2 Plan 02-02 — Stage 0 Read column tests.
//
// Behaviors (plan Task 1):
//   1. row.stage_0 === null → renders the locked Phase 64 placeholder, no pill.
//   2. verdict === 'safe' → "Safe" pill with safe state tokens.
//   3. verdict === 'injection_suspected' → "Prompt-injection suspected" pill
//      using blocked state tokens (operator-language: never raw enum).
//   4. verdict === 'over_budget' → "Over budget" pill using warn state tokens.
//   5. Section-pattern shape (canonical-patterns §5): uppercase label
//      "Safety verdict" + verdict pill + key/value body (no bordered cards).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { Stage0Read } from "../stage-0-read";

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

describe("Stage0Read", () => {
  it("Test 1: renders Phase 64 placeholder when stage_0 is null (OQ-2 lock)", () => {
    render(<Stage0Read row={makeRow()} />);
    expect(
      screen.getByText(/Stage 0 has not yet shipped/),
    ).toBeInTheDocument();
    // No verdict pill.
    expect(screen.queryByTestId("stage-0-read-verdict-pill")).toBeNull();
  });

  it("Test 2: verdict 'safe' → 'Safe' pill with safe state tokens", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "safe",
            cost_cents: 0,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    const pill = screen.getByTestId("stage-0-read-verdict-pill");
    expect(pill).toHaveTextContent("Safe");
    const style = pill.getAttribute("style") ?? "";
    expect(style).toMatch(/--v7-state-safe-bg/);
    expect(style).toMatch(/--v7-state-safe-fg/);
  });

  it("Test 3: verdict 'injection_suspected' → 'Prompt-injection suspected' pill with blocked state tokens", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "injection_suspected",
            cost_cents: 0,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    const pill = screen.getByTestId("stage-0-read-verdict-pill");
    expect(pill).toHaveTextContent("Prompt-injection suspected");
    // Operator-language lock: NEVER render the raw enum to the operator.
    expect(pill.textContent).not.toMatch(/injection_suspected/);
    const style = pill.getAttribute("style") ?? "";
    expect(style).toMatch(/--v7-state-blocked-bg/);
    expect(style).toMatch(/--v7-state-blocked-fg/);
  });

  it("Test 4: verdict 'over_budget' → 'Too large' pill with warn state tokens", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "over_budget",
            cost_cents: 0,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    const pill = screen.getByTestId("stage-0-read-verdict-pill");
    // Operator-language lock: "Too large", never "Over budget"/"over_budget".
    expect(pill).toHaveTextContent("Too large");
    expect(pill.textContent ?? "").not.toMatch(/over.?budget/i);
    const style = pill.getAttribute("style") ?? "";
    expect(style).toMatch(/--v7-state-warn-bg/);
    expect(style).toMatch(/--v7-state-warn-fg/);
  });

  it("Test 5: section-pattern shape — uppercase label 'Safety verdict' present", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "safe",
            cost_cents: 0,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    const label = screen.getByTestId("stage-0-read-label");
    expect(label.textContent ?? "").toMatch(/Safety verdict/i);
    // No bordered evidence card — section-pattern only.
    expect(screen.queryByTestId("stage-0-read-evidence-card")).toBeNull();
  });

  // Phase 5 Plan 05-02 Task 2 (D-04 / SC#4) — over_budget cost line,
  // placeholder-tolerant (Phase 64 unshipped → never throws).
  it("Test 6: over_budget + cost_cents=250 → cost line shows 'Too large' and '€2.50'", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "over_budget",
            cost_cents: 250,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    const line = screen.getByTestId("stage-0-read-cost-line");
    expect(line.textContent ?? "").toMatch(/Too large/);
    expect(line.textContent ?? "").toMatch(/€2\.50/);
  });

  it("Test 7: over_budget + cost_cents=null → cost line shows '—', never throws", () => {
    expect(() =>
      render(
        <Stage0Read
          row={makeRow({
            stage_0: {
              verdict: "over_budget",
              cost_cents: null,
              confidence: null,
              pipeline_event_id: "pe-0",
            },
          })}
        />,
      ),
    ).not.toThrow();
    const line = screen.getByTestId("stage-0-read-cost-line");
    expect(line.textContent ?? "").toMatch(/Too large/);
    expect(line.textContent ?? "").toMatch(/—/);
  });

  it("Test 8: verdict !== over_budget → no cost line", () => {
    render(
      <Stage0Read
        row={makeRow({
          stage_0: {
            verdict: "safe",
            cost_cents: 250,
            confidence: null,
            pipeline_event_id: "pe-0",
          },
        })}
      />,
    );
    expect(screen.queryByTestId("stage-0-read-cost-line")).toBeNull();
  });
});
