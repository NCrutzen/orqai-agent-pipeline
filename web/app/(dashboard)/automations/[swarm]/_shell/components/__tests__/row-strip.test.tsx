// Phase 2 Plan 02-01 — RowStrip tests (5-cell colored outcome strip).
//
// Covers behaviors 1-4 + 6 of the plan's Task 2 list (5 + 7 covered in
// row-strip-list.test.tsx because they require the list wrapper / context).
//
// Hard-separation lock honored: stage_1 fixtures only set noise-filter
// fields (predictor, matched_rule_id, llm_*); stage_3 fixtures only set
// intent-classifier fields (ranked_intents). They never cross.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { RowStrip, deriveCellState, deriveActionCue } from "../row-strip";

const BASE_ROW: BulkReviewRow = {
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
};

describe("RowStrip", () => {
  it("Test 1: renders exactly 5 stage cells (stages 0..4)", () => {
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
      />,
    );
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(
        screen.getByTestId(`row-strip-cell-${idx}`),
      ).toBeInTheDocument();
    }
  });

  it("Test 2a: Stage 1 cell with matched_rule_id renders state 'match'", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_1: {
        category_key: "out_of_office",
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
        category_display_label: null,
        llm_category_display_label: null,
        agent_run_id: null,
      },
    };
    expect(deriveCellState(row, 1)).toBe("match");
  });

  it("Test 2b: Stage 1 cell with predictor='llm_2nd_pass' renders state 'llm-rescue'", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_1: {
        category_key: "other",
        matched_rule_id: null,
        regex_verdict: "unknown",
        llm_second_pass_verdict: "looks like ack",
        pipeline_event_id: "pe-1",
        llm_invoked: true,
        llm_category_key: "other",
        llm_confidence: "medium",
        llm_reasoning: "looks like ack",
        llm_error: null,
        predictor: "llm_2nd_pass",
        llm_model_key: null,
        category_display_label: null,
        llm_category_display_label: null,
        agent_run_id: null,
      },
    };
    expect(deriveCellState(row, 1)).toBe("llm-rescue");
  });

  it("Test 2c: Stage 1 cell with null slot renders state 'idle'", () => {
    expect(deriveCellState(BASE_ROW, 1)).toBe("idle");
  });

  it("Test 3: stage_0 null → Stage 0 cell renders 'safe' (P2-D-03 default)", () => {
    expect(deriveCellState(BASE_ROW, 0)).toBe("safe");
  });

  it("Test 4a: blocked dispatcher (escalated) → Stage 3 cell 'warn'", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_3: {
        top_intent: "invoice_copy_request" as never,
        ranked_intents: [
          { intent_key: "invoice_copy_request" as never, confidence: 0.9, display_label: null },
        ],
        pipeline_event_id: "pe-3",
      },
      stage_3p5: {
        dispatcher_decision: "escalated",
        handler_event: null,
        pipeline_event_id: "pe-3p5",
      },
    };
    expect(deriveCellState(row, 3)).toBe("warn");
  });

  it("Test 4b: blocked dispatcher (escalated) → Stage 4 cell 'blocked'", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_4: {
        handler_key: "label-resolver",
        draft_quality: null,
        feedback_reason: null,
        handler_output_kind: "success",
        pipeline_event_id: "pe-4",
      },
      stage_3p5: {
        dispatcher_decision: "escalated",
        handler_event: null,
        pipeline_event_id: "pe-3p5",
      },
    };
    expect(deriveCellState(row, 4)).toBe("blocked");
  });

  it("Test 6: clicking the row strip invokes onClick", () => {
    const onClick = vi.fn();
    render(
      <RowStrip row={BASE_ROW} isSelected={false} onClick={onClick} />,
    );
    fireEvent.click(screen.getByTestId("row-strip"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("Test 6 (Plan 02): rerunInFlightIds containing the row's email_id pulses Stage 3 + 4 cells", () => {
    const row: BulkReviewRow = { ...BASE_ROW };
    const set = new Set<string>(["e-1"]);
    render(
      <RowStrip
        row={row}
        isSelected={false}
        onClick={() => {}}
        rerunInFlightIds={set}
      />,
    );
    expect(
      screen.getByTestId("row-strip-cell-3-pulse"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("row-strip-cell-4-pulse"),
    ).toBeInTheDocument();
    // Stage 0/1/2 cells do NOT pulse (P3-D-08 — only Stage 3 + 4).
    expect(screen.queryByTestId("row-strip-cell-0-pulse")).toBeNull();
    expect(screen.queryByTestId("row-strip-cell-1-pulse")).toBeNull();
    expect(screen.queryByTestId("row-strip-cell-2-pulse")).toBeNull();
  });

  it("Test 8 (Plan 02): rerunInFlightIds NOT containing the row's email_id → no pulse", () => {
    const set = new Set<string>(["other-email"]);
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
        rerunInFlightIds={set}
      />,
    );
    expect(screen.queryByTestId("row-strip-cell-3-pulse")).toBeNull();
    expect(screen.queryByTestId("row-strip-cell-4-pulse")).toBeNull();
  });

  // Phase 5 Plan 05-02 Task 2 (D-10) — per-cell hover tooltips.
  // Plan 03-19 (operator feedback): copy follows the human-color model
  // (green=clear, orange=attention, red=block, grey=idle).
  it("D-10: stage cells carry a title tooltip in human-color language", () => {
    // BASE_ROW: stage_0 null → safe (clear); stage_1..4 null → idle.
    render(
      <RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />,
    );
    // Stage 0 → safe → clear bucket → "Safety: all clear …"
    expect(
      screen.getByTestId("row-strip-cell-0").getAttribute("title"),
    ).toContain("Safety: all clear");
    // Stage 1 (null) → idle → "Noise: hasn't run yet"
    expect(
      screen.getByTestId("row-strip-cell-1").getAttribute("title"),
    ).toContain("Noise: hasn't run yet");
  });

  it("D-10/03-19: blocked cell tooltip is ACTIONABLE (names the stage + 'open the row to decide')", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_0: {
        verdict: "injection_suspected",
        cost_cents: null,
        confidence: null,
        pipeline_event_id: "pe-0",
      },
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const title = screen
      .getByTestId("row-strip-cell-0")
      .getAttribute("title");
    expect(title).toContain("Safety");
    expect(title).toContain("decide");
  });

  it("D-10/03-19: an llm_2nd_pass (AI-rescued) cell reads as CLEAR — green, no human needed, no jargon", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_1: {
        category_key: "other",
        matched_rule_id: null,
        regex_verdict: "unknown",
        llm_second_pass_verdict: "ack",
        pipeline_event_id: "pe-1",
        llm_invoked: true,
        llm_category_key: "other",
        llm_confidence: "medium",
        llm_reasoning: "ack",
        llm_error: null,
        predictor: "llm_2nd_pass",
        llm_model_key: null,
        category_display_label: null,
        llm_category_display_label: null,
        agent_run_id: null,
      },
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const cell = screen.getByTestId("row-strip-cell-1");
    // Human model: AI-rescued (was purple) now folds into "all clear" — green,
    // nothing for the operator to do. data-state still records the derivation.
    expect(cell.getAttribute("data-state")).toBe("llm-rescue");
    expect(cell.style.background).toContain("--v7-state-safe-bg");
    const title = cell.getAttribute("title");
    expect(title).toContain("all clear");
    expect(title).not.toMatch(/LLM/);
  });

  // Plan 03-19 (operator feedback 2026-05-28) — human-color model lock:
  // green=clear (safe∪match∪llm-rescue), orange=attention (warn),
  // red=block (blocked), grey=idle. data-state keeps the 6-state derivation.
  it("03-19 human-color: a 'match' (Stage 2 resolved) cell renders GREEN (clear), not blue", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: {
        entity_brand: null,
        resolver_source: "sender_map",
        customer_account_id: "CUST-1",
        corrected_customer_account_id: null,
        confidence: 0.9,
        pipeline_event_id: "pe-2",
        resolver_steps: null,
        winner_step: null,
        customer_name: null,
        sender_map_lineage: null,
        inputs: null,
      },
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const cell = screen.getByTestId("row-strip-cell-2");
    expect(cell.getAttribute("data-state")).toBe("match");
    expect(cell.style.background).toContain("--v7-state-safe-bg");
    expect(cell.style.background).not.toContain("--v7-state-match-bg");
  });

  it("03-19 human-color: a 'blocked' cell renders RED (block) + a ring", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_0: {
        verdict: "injection_suspected",
        cost_cents: null,
        confidence: null,
        pipeline_event_id: "pe-0",
      },
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const cell = screen.getByTestId("row-strip-cell-0");
    expect(cell.getAttribute("data-state")).toBe("blocked");
    expect(cell.style.background).toContain("--v7-state-blocked-bg");
    expect(cell.style.boxShadow).toContain("--v7-state-blocked-fg");
  });

  it("03-19 human-color: an 'idle' (not-run) cell renders GREY", () => {
    render(<RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />);
    // stage_1 null → idle
    const cell = screen.getByTestId("row-strip-cell-1");
    expect(cell.getAttribute("data-state")).toBe("idle");
    expect(cell.style.background).toContain("--v7-state-idle-bg");
  });

  it("03-19 layout: all 5 stage cells live in ONE strip container (no wrap)", () => {
    render(<RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />);
    const strip = screen.getByTestId("row-strip-strip");
    expect(strip.style.flexWrap).toBe("nowrap");
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(strip.contains(screen.getByTestId(`row-strip-cell-${idx}`))).toBe(
        true,
      );
    }
  });

  it("renders cells with V7 state tokens (no raw hex)", () => {
    render(
      <RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />,
    );
    // Stage 0 (null) → safe; check inline background style is a var() token.
    const cell = screen.getByTestId("row-strip-cell-0");
    const bg = cell.style.background;
    expect(bg).toMatch(/var\(--v7-state-safe-bg\)/);
  });

  // Phase 5 Plan 05-03 Task 1 (D-06 / SC#2) — the "Auto-applied" lime marker
  // renders ONLY on a live row (dry_run=false → isLive=true). dry_run /
  // unresolved rows (isLive false/undefined) get NO marker.
  it("D-06: live row (isLive=true) renders the 'Auto-applied' lime marker", () => {
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
        isLive
      />,
    );
    const marker = screen.getByTestId("row-strip-auto-applied");
    expect(marker).toBeInTheDocument();
    expect(marker.textContent).toBe("Auto-applied");
    // Lime tint via V7 token — no raw hex.
    expect(marker.style.color).toContain("--v7-lime");
  });

  it("D-06: dry_run row (isLive=false) renders NO 'Auto-applied' marker", () => {
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
        isLive={false}
      />,
    );
    expect(screen.queryByTestId("row-strip-auto-applied")).toBeNull();
  });

  it("D-06: unresolved row (isLive undefined) renders NO 'Auto-applied' marker", () => {
    render(
      <RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />,
    );
    expect(screen.queryByTestId("row-strip-auto-applied")).toBeNull();
  });

  // Plan 03-19 (UAT r2/r3) — outcome labels, full subject, no visible id.
  it("03-19: the five cells render outcome labels (Safety/Noise/Customer/Topic/Action), not bare numbers", () => {
    render(<RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />);
    const labels = ["Safety", "Noise", "Customer", "Topic", "Action"];
    labels.forEach((label, idx) => {
      const cell = screen.getByTestId(`row-strip-cell-${idx}`);
      expect(cell.textContent).toContain(label);
      // No bare single-digit index as the cell content.
      expect(cell.textContent).not.toBe(String(idx));
    });
  });

  it("03-19: renders the FULL subject (no single-line ellipsis truncation)", () => {
    const longSubject =
      "RE: RE: Documenten n.a.v. uitgevoerde werkzaamheden en openstaande facturen Q2";
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
        subjectLabel={longSubject}
      />,
    );
    const subj = screen.getByTestId("row-strip-subject");
    // Full text present (not truncated to a substring).
    expect(subj.textContent).toBe(longSubject);
    // Not hard-truncated: the span must not be nowrap-ellipsed.
    expect(subj.style.textOverflow).not.toBe("ellipsis");
    expect(subj.style.whiteSpace).not.toBe("nowrap");
  });

  it("03-19: no operator-VISIBLE span leaks the row's raw id (data-row-id attribute stays)", () => {
    render(
      <RowStrip
        row={BASE_ROW}
        isSelected={false}
        onClick={() => {}}
        senderLabel="Alice"
        subjectLabel="A real subject"
      />,
    );
    // The id is on the container attribute only — never in visible text.
    expect(
      screen.getByTestId("row-strip").getAttribute("data-row-id"),
    ).toBe("row-1");
    expect(screen.getByTestId("row-strip-sender").textContent).not.toContain(
      "row-1",
    );
    expect(screen.getByTestId("row-strip-subject").textContent).not.toContain(
      "row-1",
    );
    expect(screen.getByTestId("row-strip-sender").textContent).not.toContain(
      "e-1",
    );
    expect(screen.getByTestId("row-strip-subject").textContent).not.toContain(
      "e-1",
    );
  });

  it("03-19: null subject/sender fall back to operator text, never an id", () => {
    render(<RowStrip row={BASE_ROW} isSelected={false} onClick={() => {}} />);
    expect(screen.getByTestId("row-strip-subject").textContent).toBe(
      "(no subject)",
    );
    expect(screen.getByTestId("row-strip-sender").textContent).toContain(
      "(unknown sender)",
    );
  });

  // ---------------------------------------------------------------------------
  // Plan 03 (live UAT 2026-05-28) — confidence-aware Stage 2 cell. The Live
  // queue is all-awaiting by design, so a per-row Action marker carries no
  // signal; instead the Customer cell reads WARN (amber) when the AI was
  // UNSURE (an llm_tiebreaker, or any source below the confidence floor) so the
  // rows that actually need review stand out from the confident-green majority.
  // A high-confidence sender_map / identifier_match stays MATCH (green).
  // ---------------------------------------------------------------------------

  function stage2Slot(
    overrides: Partial<NonNullable<BulkReviewRow["stage_2"]>> = {},
  ): NonNullable<BulkReviewRow["stage_2"]> {
    return {
      entity_brand: null,
      resolver_source: "sender_map",
      customer_account_id: "CUST-1",
      corrected_customer_account_id: null,
      confidence: 0.9,
      pipeline_event_id: "pe-2",
      resolver_steps: null,
      winner_step: null,
      customer_name: null,
      sender_map_lineage: null,
      inputs: null,
      ...overrides,
    };
  }

  it("Plan 03: Stage 2 llm_tiebreaker → warn (amber), regardless of confidence", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: stage2Slot({ resolver_source: "llm_tiebreaker", confidence: 0.4 }),
    };
    expect(deriveCellState(row, 2)).toBe("warn");
  });

  it("Plan 03: Stage 2 high-confidence sender_map → match (green)", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: stage2Slot({ resolver_source: "sender_map", confidence: 0.9 }),
    };
    expect(deriveCellState(row, 2)).toBe("match");
  });

  it("Plan 03: Stage 2 low-confidence identifier_match (below floor) → warn (amber)", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: stage2Slot({
        resolver_source: "identifier_match",
        confidence: 0.5,
      }),
    };
    expect(deriveCellState(row, 2)).toBe("warn");
  });

  it("Plan 03: Stage 2 unresolved (resolver_source null) → warn", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: stage2Slot({ resolver_source: null }),
    };
    expect(deriveCellState(row, 2)).toBe("warn");
  });

  it("Plan 03: tiebreaker row → Customer cell renders WARN background, not match", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: stage2Slot({ resolver_source: "llm_tiebreaker", confidence: 0.4 }),
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const cell = screen.getByTestId("row-strip-cell-2");
    expect(cell.getAttribute("data-state")).toBe("warn");
    expect(cell.style.background).toContain("--v7-state-warn-bg");
  });

  it("Plan 03: a parked-handler row (stage_4 null) keeps Action cell idle grey (not orange)", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_3: {
        top_intent: "invoice_copy_request" as never,
        ranked_intents: [
          {
            intent_key: "invoice_copy_request" as never,
            confidence: 0.9,
            display_label: null,
          },
        ],
        pipeline_event_id: "pe-3",
      },
      stage_4: null,
    };
    render(<RowStrip row={row} isSelected={false} onClick={() => {}} />);
    const cell = screen.getByTestId("row-strip-cell-4");
    expect(cell.getAttribute("data-state")).toBe("idle");
    expect(cell.style.background).toContain("--v7-state-idle-bg");
  });
});

// ===========================================================================
// Plan 06-03 — per-row "what's expected" action cue + Stage-3 attention fold
// for un-verified predicted rows. Maps to 06-VALIDATION.md signal rows
// "Every row renders a non-empty action cue", "Green dry-run rows get 'review'
// cue, not 'auto-applied'", "Topic pill orange for un-verified predicted rows".
// ===========================================================================

// A confident Stage 2 slot (sender_map @0.9) keeps the Customer cell GREEN.
function confidentStage2(): NonNullable<BulkReviewRow["stage_2"]> {
  return {
    entity_brand: null,
    resolver_source: "sender_map",
    customer_account_id: "CUST-1",
    corrected_customer_account_id: null,
    confidence: 0.9,
    pipeline_event_id: "pe-2",
    resolver_steps: null,
    winner_step: null,
    customer_name: null,
    sender_map_lineage: null,
    inputs: null,
  };
}

// A predicted Stage 3 slot (>0 ranked intents).
function predictedStage3(): NonNullable<BulkReviewRow["stage_3"]> {
  return {
    top_intent: "invoice_copy_request" as never,
    ranked_intents: [
      {
        intent_key: "invoice_copy_request" as never,
        confidence: 0.9,
        display_label: null,
      },
    ],
    pipeline_event_id: "pe-3",
  };
}

describe("deriveActionCue", () => {
  // Signal: "Every row renders a non-empty action cue" — all 4 variants.
  it("block variant: any blocked cell → 'Needs a decision' / block", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      stage_0: {
        verdict: "injection_suspected",
        cost_cents: null,
        confidence: null,
        pipeline_event_id: "pe-0",
      },
    };
    const cue = deriveActionCue(row, false);
    expect(cue.label).toBe("Needs a decision");
    expect(cue.tone).toBe("block");
    expect(cue.label.length).toBeGreaterThan(0);
  });

  it("attention variant: an attention cell (no block) → 'Check this one' / attention", () => {
    const row: BulkReviewRow = {
      ...BASE_ROW,
      // Low-confidence Stage 2 → warn → attention.
      stage_2: { ...confidentStage2(), resolver_source: "llm_tiebreaker", confidence: 0.4 },
    };
    const cue = deriveActionCue(row, false);
    expect(cue.label).toBe("Check this one");
    expect(cue.tone).toBe("attention");
  });

  it("all-clear dry-run (isLive falsy) → 'Review the AI's calls' / clear", () => {
    // BASE_ROW: stage_0 null → safe; all others null → idle. No block/attention.
    const cue = deriveActionCue(BASE_ROW, false);
    expect(cue.label).toBe("Review the AI's calls");
    expect(cue.tone).toBe("clear");
    expect(cue.label.length).toBeGreaterThan(0);
  });

  it("all-clear live (isLive true) → 'Auto-applied — confirm or skip' / clear", () => {
    const cue = deriveActionCue(BASE_ROW, true);
    expect(cue.label).toBe("Auto-applied — confirm or skip");
    expect(cue.tone).toBe("clear");
    expect(cue.label.length).toBeGreaterThan(0);
  });

  // Signal: "Green dry-run rows get 'review' cue, not 'auto-applied'".
  it("dry-run all-clear label !== live all-clear label", () => {
    const dryRun = deriveActionCue(BASE_ROW, false);
    const live = deriveActionCue(BASE_ROW, true);
    expect(dryRun.label).not.toBe(live.label);
  });
});

describe("Stage 3 attention for un-verified predicted", () => {
  // Signal: "Topic pill orange for un-verified predicted rows".
  const PREDICTED_UNVERIFIED: BulkReviewRow = {
    ...BASE_ROW,
    stage_2: confidentStage2(),
    stage_3: predictedStage3(),
    stage_3p5: null,
    overrides: { ...BASE_ROW.overrides, axis_1_human_verdict: null },
  };

  it("un-verified predicted (dry-run) → Topic cell folds to attention (warn)", () => {
    render(
      <RowStrip
        row={PREDICTED_UNVERIFIED}
        isSelected={false}
        onClick={() => {}}
        isLive={false}
      />,
    );
    const cell = screen.getByTestId("row-strip-cell-3");
    // humanColorFor("warn") === "attention" → warn background token.
    expect(cell.getAttribute("data-state")).toBe("warn");
    expect(cell.style.background).toContain("--v7-state-warn-bg");
  });

  it("same row: the confident Stage-2 (Customer) cell stays GREEN — only Topic is orange", () => {
    render(
      <RowStrip
        row={PREDICTED_UNVERIFIED}
        isSelected={false}
        onClick={() => {}}
        isLive={false}
      />,
    );
    const customer = screen.getByTestId("row-strip-cell-2");
    expect(customer.getAttribute("data-state")).toBe("match");
    expect(customer.style.background).toContain("--v7-state-safe-bg");
  });

  it("Topic cell carries a verify-oriented tooltip when it folds to attention", () => {
    render(
      <RowStrip
        row={PREDICTED_UNVERIFIED}
        isSelected={false}
        onClick={() => {}}
        isLive={false}
      />,
    );
    const title = screen.getByTestId("row-strip-cell-3").getAttribute("title");
    expect(title).toContain("Topic");
    expect(title).toMatch(/verify/i);
    // Operator-language: never "LLM".
    expect(title).not.toMatch(/LLM/);
  });

  it("decided row (axis_1_human_verdict set) → Topic cell stays GREEN (match)", () => {
    const decided: BulkReviewRow = {
      ...PREDICTED_UNVERIFIED,
      overrides: { ...PREDICTED_UNVERIFIED.overrides, axis_1_human_verdict: "confirm" },
    };
    render(
      <RowStrip row={decided} isSelected={false} onClick={() => {}} isLive={false} />,
    );
    const cell = screen.getByTestId("row-strip-cell-3");
    expect(cell.getAttribute("data-state")).toBe("match");
    expect(cell.style.background).toContain("--v7-state-safe-bg");
  });

  it("live row (isLive true) → Topic cell stays GREEN (match), no fold", () => {
    render(
      <RowStrip
        row={PREDICTED_UNVERIFIED}
        isSelected={false}
        onClick={() => {}}
        isLive
      />,
    );
    const cell = screen.getByTestId("row-strip-cell-3");
    expect(cell.getAttribute("data-state")).toBe("match");
    expect(cell.style.background).toContain("--v7-state-safe-bg");
  });

  it("escalated row → Topic cell stays attention (unchanged path)", () => {
    const escalated: BulkReviewRow = {
      ...PREDICTED_UNVERIFIED,
      stage_3p5: {
        dispatcher_decision: "escalated",
        handler_event: null,
        pipeline_event_id: "pe-3p5",
      },
    };
    render(
      <RowStrip row={escalated} isSelected={false} onClick={() => {}} isLive={false} />,
    );
    const cell = screen.getByTestId("row-strip-cell-3");
    expect(cell.getAttribute("data-state")).toBe("warn");
  });

  it("renders a per-row action cue pill with data-tone (cue derives from deriveCellState)", () => {
    // The cue is a PURE deriveCellState read (locked signature) — the Topic
    // attention fold is render-only and does NOT change the cue. This fixture is
    // all-clear at the deriveCellState level + dry-run → "Review the AI's calls".
    render(
      <RowStrip
        row={PREDICTED_UNVERIFIED}
        isSelected={false}
        onClick={() => {}}
        isLive={false}
      />,
    );
    const pill = screen.getByTestId("row-strip-action-cue");
    expect(pill).toBeInTheDocument();
    expect(pill.getAttribute("data-tone")).toBe("clear");
    expect(pill.textContent).toBe("Review the AI's calls");
  });

  it("an attention row (low-confidence Stage 2) shows the 'Check this one' cue pill", () => {
    const attentionRow: BulkReviewRow = {
      ...BASE_ROW,
      stage_2: { ...confidentStage2(), resolver_source: "llm_tiebreaker", confidence: 0.4 },
    };
    render(
      <RowStrip row={attentionRow} isSelected={false} onClick={() => {}} isLive={false} />,
    );
    const pill = screen.getByTestId("row-strip-action-cue");
    expect(pill.getAttribute("data-tone")).toBe("attention");
    expect(pill.textContent).toBe("Check this one");
  });
});
