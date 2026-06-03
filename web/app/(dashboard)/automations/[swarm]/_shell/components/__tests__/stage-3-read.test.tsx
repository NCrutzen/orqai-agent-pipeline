// Phase 2 Plan 02-05 Task 2 — Stage 3 Read column tests.
//
// Behavior locks (per plan tests 3–10):
//   T3. Full ranked list rendered (not just top pick) — fixture with 4
//       entries renders 4 items.
//   T4. Position 1 → green/lime highlight + "DISPATCH WINNER" pill.
//   T5. Positions 2..N → dim/muted styling.
//   T6. Item renders display_label (not raw intent_key) when available.
//   T7. Confidence bar width proportional to confidence; null confidence
//       renders 0% with "—" indicator.
//   T8. NO reorder controls (▲/▼ / drag / chevron).
//   T9. row.stage_3 === null OR ranked_intents.length === 0 → placeholder.
//   T10. No EscalateToHumanCard.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type {
  BulkReviewRow,
  BulkReviewStage3Slot,
  RankedIntent,
} from "@/lib/bulk-review/types";
import type { Intent } from "@/lib/automations/debtor-email/coordinator/intent.generated";
import { Stage3Read } from "../stage-3-read";

afterEach(() => cleanup());

function makeRow(stage3: BulkReviewStage3Slot | null): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "e-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: null,
    stage_3: stage3,
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

function r(
  intent_key: Intent,
  confidence: number | null,
  display_label: string | null = null,
  evidence: Partial<
    Pick<
      RankedIntent,
      "reasoning" | "sub_type" | "document_reference" | "confidence_label"
    >
  > = {},
): RankedIntent {
  return { intent_key, confidence, display_label, ...evidence };
}

const FOUR_ENTRIES: BulkReviewStage3Slot = {
  top_intent: "invoice_copy_request" as Intent,
  ranked_intents: [
    r("invoice_copy_request" as Intent, 0.92, "Invoice copy request"),
    r("payment_dispute" as Intent, 0.61, "Payment dispute"),
    r("general_inquiry" as Intent, 0.34, "General inquiry"),
    r("other" as Intent, 0.12, "Other"),
  ],
  pipeline_event_id: "pe-3",
};

describe("Stage3Read", () => {
  it("T3: renders the full ranked list (4 entries)", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    const items = screen.getAllByTestId(/^stage-3-read-rank-/);
    expect(items).toHaveLength(4);
  });

  it("T4: Position 1 renders highlight + 'DISPATCH WINNER'", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    const first = screen.getByTestId("stage-3-read-rank-1");
    expect(first).toHaveTextContent("DISPATCH WINNER");
    expect(first.getAttribute("data-winner")).toBe("true");
    // highlight token applied
    expect(first.getAttribute("style") ?? "").toMatch(/--v7-state-match-(bg|fg)/);
  });

  it("T5: Positions 2..N render muted (no winner attr, no DISPATCH WINNER)", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    const second = screen.getByTestId("stage-3-read-rank-2");
    expect(second.getAttribute("data-winner")).toBe("false");
    expect(second).not.toHaveTextContent("DISPATCH WINNER");
    expect(second.getAttribute("style") ?? "").toMatch(/--v7-fg-muted/);
  });

  it("T6: Item renders display_label, not raw intent_key, when label present", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    const first = screen.getByTestId("stage-3-read-rank-1");
    expect(first).toHaveTextContent("Invoice copy request");
  });

  it("T6b: Falls back to intent_key when display_label === null", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [r("invoice_copy_request" as Intent, 0.5, null)],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    expect(screen.getByTestId("stage-3-read-rank-1")).toHaveTextContent(
      "invoice_copy_request",
    );
  });

  it("T7: Confidence bar width matches coerced value", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    const bar1 = screen.getByTestId("stage-3-read-bar-1");
    expect(bar1.getAttribute("style") ?? "").toMatch(/width:\s*92%/);
    const bar2 = screen.getByTestId("stage-3-read-bar-2");
    expect(bar2.getAttribute("style") ?? "").toMatch(/width:\s*61%/);
  });

  it("T7b: null confidence → 0% bar + '—' indicator", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [r("invoice_copy_request" as Intent, null, "Invoice")],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    const bar = screen.getByTestId("stage-3-read-bar-1");
    expect(bar.getAttribute("style") ?? "").toMatch(/width:\s*0%/);
    const item = screen.getByTestId("stage-3-read-rank-1");
    expect(item).toHaveTextContent("—");
  });

  it("T8: NO reorder controls (no buttons, drag handles, chevrons)", () => {
    const { container } = render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
    // No reorder glyphs
    const html = container.innerHTML;
    expect(html).not.toMatch(/▲|▼/);
    expect(html.toLowerCase()).not.toMatch(/drag|reorder|chevron/);
  });

  it("T9a: stage_3 === null → placeholder", () => {
    render(<Stage3Read row={makeRow(null)} />);
    expect(
      screen.getByTestId("stage-3-read-placeholder"),
    ).toHaveTextContent("Stage 3 has not yet run on this row.");
  });

  it("T9b: empty ranked_intents → placeholder", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    expect(
      screen.getByTestId("stage-3-read-placeholder"),
    ).toHaveTextContent("Stage 3 has not yet run on this row.");
  });

  it("T10: no EscalateToHumanCard / escalate copy", () => {
    const { container } = render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/escalate/);
  });

  it("T6c: RANKED INTENT section label renders", () => {
    render(<Stage3Read row={makeRow(FOUR_ENTRIES)} />);
    expect(screen.getByText("RANKED INTENT")).toBeInTheDocument();
  });

  // Plan 03-14 (UAT r3-2) — reasoning paragraph + runner-up/gap-to-#2.
  it("03-14 T1: ≥2 intents → renders reasoning + runner-up + gap-to-#2", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [
        r("invoice_copy_request" as Intent, 0.92, "Invoice copy request", {
          reasoning: "Customer asks for a copy of invoice 12345.",
          confidence_label: "high",
        }),
        r("payment_dispute" as Intent, 0.61, "Payment dispute"),
      ],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    expect(
      screen.getByTestId("stage-3-read-reasoning").textContent,
    ).toContain("Customer asks for a copy of invoice 12345.");
    expect(
      screen.getByTestId("stage-3-read-runner-up").textContent,
    ).toContain("Payment dispute");
    // gap = round((0.92 - 0.61) * 100) = 31 pts
    expect(screen.getByTestId("stage-3-read-gap").textContent).toContain(
      "31 pts",
    );
    expect(
      screen.getByTestId("stage-3-read-confidence-label").textContent,
    ).toContain("high");
  });

  it("03-14 T2: single intent → reasoning shown, NO runner-up / gap", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [
        r("invoice_copy_request" as Intent, 0.9, "Invoice copy request", {
          reasoning: "Single clear request.",
        }),
      ],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    expect(
      screen.getByTestId("stage-3-read-reasoning").textContent,
    ).toContain("Single clear request.");
    expect(
      screen.queryByTestId("stage-3-read-runner-up"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("stage-3-read-gap")).not.toBeInTheDocument();
  });

  it("03-14 T3: winner with null reasoning → reasoning section omitted (no placeholder)", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [
        r("invoice_copy_request" as Intent, 0.9, "Invoice copy request"),
        r("payment_dispute" as Intent, 0.6, "Payment dispute"),
      ],
      pipeline_event_id: "pe-3",
    };
    render(<Stage3Read row={makeRow(slot)} />);
    expect(
      screen.queryByTestId("stage-3-read-reasoning"),
    ).not.toBeInTheDocument();
    // runner-up still renders (≥2 intents).
    expect(screen.getByTestId("stage-3-read-runner-up")).toBeInTheDocument();
  });

  it("03-14 T4: no model_key / internal jargon leaks into the rendered output", () => {
    const slot: BulkReviewStage3Slot = {
      top_intent: "invoice_copy_request" as Intent,
      ranked_intents: [
        r("invoice_copy_request" as Intent, 0.9, "Invoice copy request", {
          reasoning: "Clear invoice copy request.",
          confidence_label: "high",
        }),
        r("payment_dispute" as Intent, 0.6, "Payment dispute"),
      ],
      pipeline_event_id: "pe-3",
    };
    const { container } = render(<Stage3Read row={makeRow(slot)} />);
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/model_key|model key/);
    expect(html).not.toMatch(/decision_details/);
  });
});
