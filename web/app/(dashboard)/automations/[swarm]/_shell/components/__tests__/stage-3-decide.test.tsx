// Phase 3 Plan 03 Task 2 — Stage3Decide tests.
//
// Behaviors 1-6 from the plan:
//   1. Renders RankedIntentEditor with value from row.stage_3.ranked_intents.
//   2. Renders EscalateToHumanCard alongside.
//   3. Confirm-state click optimistically removes the row (no server call).
//   4. Dirty + top-1 changed → reorderStage3Intents called + markInFlight.
//   5. Dirty + sub-position only → reorderStage3Intents called, NO markInFlight.
//   6. Escalate Submit → escalateStage3ToHuman called.
//
// Hard-separation lock: fixture uses only swarm_intents.intent_key values
// (the codegen literal-union). Never crosses to swarm_noise_categories.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Stage3Decide } from "../stage-3-decide";
import type { BulkReviewRow, RankedIntent } from "@/lib/bulk-review/types";

// --- Mocks -----------------------------------------------------------------

const reorderMock = vi.fn();
const escalateMock = vi.fn();
vi.mock("../../actions/override-actions", () => ({
  reorderStage3Intents: (i: unknown) => reorderMock(i),
  escalateStage3ToHuman: (i: unknown) => escalateMock(i),
}));

const markPendingRemovalMock = vi.fn();
const markInFlightMock = vi.fn();
vi.mock("../../selection-context", () => ({
  useSelection: () => ({
    markPendingRemoval: markPendingRemovalMock,
    selectedId: null,
    setSelected: () => undefined,
    pendingRemovalIds: new Set<string>(),
  }),
}));

vi.mock("../../hooks/use-rerun-subscription", () => ({
  useRerunContextOptional: () => ({
    markInFlight: markInFlightMock,
    inFlightIds: new Set<string>(),
  }),
}));

// --- Fixture row -----------------------------------------------------------

function rk(intent_key: string, conf: number, label?: string): RankedIntent {
  return {
    intent_key: intent_key as RankedIntent["intent_key"],
    confidence: conf,
    display_label: label ?? null,
  };
}

function makeRow(ranked: RankedIntent[]): BulkReviewRow {
  return {
    email_label_id: "11111111-1111-1111-1111-111111111111",
    swarm_type: "debtor-email",
    email_id: "22222222-2222-2222-2222-222222222222",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: null,
    stage_3: {
      top_intent: ranked[0].intent_key,
      ranked_intents: ranked,
      pipeline_event_id: "33333333-3333-3333-3333-333333333333",
    },
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

beforeEach(() => {
  reorderMock.mockReset();
  escalateMock.mockReset();
  markPendingRemovalMock.mockReset();
  markInFlightMock.mockReset();
});

afterEach(() => cleanup());

describe("Stage3Decide", () => {
  it("Test 1: renders RankedIntentEditor with row.stage_3.ranked_intents", () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.94, "Invoice copy"),
      rk("payment_dispute", 0.04, "Payment dispute"),
      rk("general_inquiry", 0.02, "General inquiry"),
    ]);
    render(<Stage3Decide row={row} />);
    expect(screen.getByTestId("stage-3-decide")).toBeTruthy();
    expect(screen.getByTestId("stage-3-decide-editor")).toBeTruthy();
    // Each ranked row from the fixture is rendered.
    expect(screen.getByTestId("stage-3-decide-editor-row-0")).toBeTruthy();
    expect(screen.getByTestId("stage-3-decide-editor-row-2")).toBeTruthy();
  });

  it("Test 2: renders EscalateToHumanCard alongside the editor", () => {
    const row = makeRow([rk("invoice_copy_request", 0.94), rk("other", 0.06)]);
    render(<Stage3Decide row={row} />);
    expect(screen.getByTestId("escalate-to-human-card")).toBeTruthy();
  });

  it("Test 3: clean confirm — markPendingRemoval, no server call", () => {
    const row = makeRow([rk("invoice_copy_request", 0.94), rk("other", 0.06)]);
    render(<Stage3Decide row={row} />);
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-dirty"),
    ).toBe("false");
    fireEvent.click(screen.getByTestId("stage-3-decide-confirm"));
    expect(markPendingRemovalMock).toHaveBeenCalledWith(row.email_label_id);
    expect(reorderMock).not.toHaveBeenCalled();
  });

  it("Test 4: dirty + top-1 changed → reorderStage3Intents called + markInFlight", async () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.3),
      rk("other", 0.1),
    ]);
    reorderMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_ids: ["pe-a", "pe-b"], rerun_emitted: true },
    });
    render(<Stage3Decide row={row} />);
    // Move position 0 down (top-1 flip).
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-0"));
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-top-changed"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("stage-3-decide-submit-reorder"));
    await waitFor(() => expect(reorderMock).toHaveBeenCalledTimes(1));
    const args = reorderMock.mock.calls[0][0] as {
      original_decision: string;
      new_ranked_intents: Array<{ intent_key: string }>;
    };
    expect(args.original_decision).toBe("invoice_copy_request");
    expect(args.new_ranked_intents[0].intent_key).toBe("general_inquiry");
    expect(markInFlightMock).toHaveBeenCalledWith(row.email_id);
    expect(markPendingRemovalMock).toHaveBeenCalledWith(row.email_label_id);
  });

  it("Test 5: dirty + sub-position only → reorderStage3Intents called, NO markInFlight", async () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.3),
      rk("other", 0.1),
    ]);
    reorderMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_ids: ["pe-a", "pe-b", "pe-c"], rerun_emitted: false },
    });
    render(<Stage3Decide row={row} />);
    // Move position 1 down (swap 1↔2 — top-1 unchanged).
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-1"));
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-top-changed"),
    ).toBe("false");
    fireEvent.click(screen.getByTestId("stage-3-decide-submit-reorder"));
    await waitFor(() => expect(reorderMock).toHaveBeenCalledTimes(1));
    expect(markInFlightMock).not.toHaveBeenCalled();
    expect(markPendingRemovalMock).toHaveBeenCalledWith(row.email_label_id);
  });

  it("Test 6: escalate flips footer red + required audit; Submit → escalateStage3ToHuman", async () => {
    const row = makeRow([rk("invoice_copy_request", 0.94), rk("other", 0.06)]);
    escalateMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-esc-1" },
    });
    render(<Stage3Decide row={row} />);
    // Click the escalate-row → col-decide enters escalating mode.
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    const root = screen.getByTestId("stage-3-decide");
    expect(root.getAttribute("data-escalating")).toBe("true");
    // The shared audit-block flips red (tone=danger) + REQUIRED + reworded.
    const audit = screen.getByTestId("stage-3-decide-audit");
    expect(audit.getAttribute("data-tone")).toBe("danger");
    expect(audit.getAttribute("data-required")).toBe("true");
    expect(
      screen.getByTestId("stage-3-decide-audit-question").textContent,
    ).toContain("What intent is missing from the registry?");
    // Footer submit flips to escalate (red), disabled until the note is filled.
    const submit = screen.getByTestId("stage-3-decide-escalate") as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("escalate");
    expect(submit.disabled).toBe(true);
    fireEvent.change(
      screen.getByTestId("stage-3-decide-audit-textarea"),
      { target: { value: "Customer asking to schedule a phone call" } },
    );
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(escalateMock).toHaveBeenCalledTimes(1));
    const args = escalateMock.mock.calls[0][0] as {
      audit_note: string;
      swarm_type: string;
    };
    expect(args.audit_note).toContain("phone call");
    expect(args.swarm_type).toBe("debtor-email");
    expect(markPendingRemovalMock).toHaveBeenCalledWith(row.email_label_id);
  });

  it("Test 6b: whitespace-only escalate note keeps Submit disabled", () => {
    const row = makeRow([rk("invoice_copy_request", 0.94), rk("other", 0.06)]);
    render(<Stage3Decide row={row} />);
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    const submit = screen.getByTestId("stage-3-decide-escalate") as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("stage-3-decide-audit-textarea"), {
      target: { value: "   \t " },
    });
    expect(submit.disabled).toBe(true);
  });

  it("Test 6c: toggling escalate off restores the confirm/override footer", () => {
    const row = makeRow([rk("invoice_copy_request", 0.94), rk("other", 0.06)]);
    render(<Stage3Decide row={row} />);
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    expect(screen.getByTestId("stage-3-decide-escalate")).toBeTruthy();
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-escalating"),
    ).toBe("false");
    expect(screen.getByTestId("stage-3-decide-confirm")).toBeTruthy();
  });

  it("partial-success rerun_failed: warning shown, row still removed", async () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.3),
    ]);
    reorderMock.mockResolvedValueOnce({
      ok: false,
      code: "rerun_failed",
      error: "reorder saved but re-run kickoff failed: inngest unreachable",
    });
    render(<Stage3Decide row={row} />);
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-0"));
    fireEvent.click(screen.getByTestId("stage-3-decide-submit-reorder"));
    await waitFor(() =>
      expect(screen.queryByTestId("stage-3-decide-warning")).toBeTruthy(),
    );
    expect(markPendingRemovalMock).toHaveBeenCalledWith(row.email_label_id);
  });

  it("hard error: setError shown, row NOT removed", async () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.3),
    ]);
    reorderMock.mockResolvedValueOnce({
      ok: false,
      code: "invalid_intent",
      error: "unknown intent_key: foo",
    });
    render(<Stage3Decide row={row} />);
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-0"));
    fireEvent.click(screen.getByTestId("stage-3-decide-submit-reorder"));
    await waitFor(() =>
      expect(screen.queryByTestId("stage-3-decide-error")).toBeTruthy(),
    );
    expect(markPendingRemovalMock).not.toHaveBeenCalled();
  });

  it("section header is the UI-SPEC §10 locked copy", () => {
    const row = makeRow([rk("invoice_copy_request", 0.94)]);
    render(<Stage3Decide row={row} />);
    expect(
      screen.getByTestId("stage-3-decide-section-label").textContent,
    ).toBe("Decide · pick the right intent");
  });

  // --- Sketch-005 reconcile (Plan 10) ------------------------------------

  it("Sketch 005: clean state → confirm submit + DISPATCH WINNER on position-1", () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.94, "Invoice copy"),
      rk("general_inquiry", 0.06),
    ]);
    render(<Stage3Decide row={row} />);
    const submit = screen.getByTestId("stage-3-decide-confirm");
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toContain("Confirm ranking");
    expect(
      screen.getByTestId("stage-3-decide-editor-pill-dispatch").textContent,
    ).toContain("DISPATCH WINNER");
  });

  it("Sketch 005: reorder dirties → override(amber) submit + YOUR PICK on new top", () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6, "Invoice copy"),
      rk("general_inquiry", 0.4, "General inquiry"),
    ]);
    render(<Stage3Decide row={row} />);
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-0"));
    const submit = screen.getByTestId("stage-3-decide-submit-reorder");
    expect(submit.getAttribute("data-mode")).toBe("override");
    expect(submit.textContent).toContain("Submit reorder → General inquiry");
    expect(
      screen.getByTestId("stage-3-decide-editor-pill-your-pick").textContent,
    ).toContain("YOUR PICK");
    // The DISPATCH WINNER pill is gone once dirty.
    expect(
      screen.queryByTestId("stage-3-decide-editor-pill-dispatch"),
    ).toBeNull();
  });

  it("Sketch 005: Reset order appears when dirty and restores classifier order", () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.4),
    ]);
    render(<Stage3Decide row={row} />);
    expect(screen.queryByTestId("stage-3-decide-editor-reset")).toBeNull();
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-down-0"));
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-dirty"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("stage-3-decide-editor-reset"));
    expect(
      screen.getByTestId("stage-3-decide").getAttribute("data-dirty"),
    ).toBe("false");
    expect(screen.getByTestId("stage-3-decide-confirm")).toBeTruthy();
  });

  it("Anti-drift #8: no element carries a draggable attribute (▲▼ only)", () => {
    const row = makeRow([
      rk("invoice_copy_request", 0.6),
      rk("general_inquiry", 0.4),
    ]);
    const { container } = render(<Stage3Decide row={row} />);
    expect(container.querySelector("[draggable]")).toBeNull();
    // The move buttons exist as ▲▼ glyphs.
    expect(screen.getByTestId("stage-3-decide-editor-up-1").textContent).toBe("▲");
    expect(screen.getByTestId("stage-3-decide-editor-down-0").textContent).toBe("▼");
  });

  it("Anti-drift: module.css files use no raw hex outside the allowed set + only allowed timings", () => {
    const allowedHex = new Set([
      "#0a1a04", // lime button-fg
      "#1a1206", // amber button-fg
      "#1a0606", // red button-fg
      "#000", // move-btn hover fg (sketch verbatim)
    ]);
    const allowedTimings = new Set(["0.12s", "0.15s", "0.6s"]);
    for (const name of [
      "ranked-intent-editor.module.css",
      "stage-3-decide.module.css",
    ]) {
      const css = readFileSync(join(__dirname, "..", name), "utf8");
      const hexes = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      for (const h of hexes) {
        expect(
          allowedHex.has(h.toLowerCase()),
          `${name}: unexpected raw hex ${h}`,
        ).toBe(true);
      }
      const timings = css.match(/\b\d*\.?\d+s\b/g) ?? [];
      for (const t of timings) {
        expect(
          allowedTimings.has(t),
          `${name}: unexpected timing ${t}`,
        ).toBe(true);
      }
    }
  });
});
