// Phase 3 Plan 03-07 (gap-closure) — Stage 0 (Safety) Decide column tests.
//
// Sketch 002 Variant C behaviors:
//   1. Renders the 2-state verdict radio; default = "injection" → submit
//      data-mode="confirm", label "Confirm injection ⏎".
//   2. Click "Override → mark as Safe" → submit data-mode="override", label
//      "Submit override ⏎".
//   3. Submit with confirm calls overrideStage0Safety with
//      corrected_value="injection_suspected"; submit with override calls it
//      with corrected_value="safe".
//   4. The audit note is OPTIONAL — an empty note never disables submit.
//   5. Null slot → placeholder (nothing to decide).
//   6. 2-state invariant: every radio maps to exactly one of the two locked
//      enums (no third value can reach the server action).
//
// Plus a source/CSS anti-drift gate:
//   - The module.css contains NO raw 6-digit hex (the 3 button-fg hex live in
//     globals.css as tokens), and NO animation timing outside {0.12s,0.15s,0.6s}.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";

// ---------------------------------------------------------------------------
// Static CSS-module anti-drift gate (T-03-07-02).
// ---------------------------------------------------------------------------
const CSS = readFileSync(
  join(__dirname, "..", "stage-0-decide.module.css"),
  "utf8",
);
const TSX = readFileSync(
  join(__dirname, "..", "stage-0-decide.tsx"),
  "utf8",
);

describe("stage-0-decide.module.css anti-drift", () => {
  const ALLOWED_HEX = new Set(["#0a1a04", "#1a1206", "#1a0606"]);

  it("contains the confirmState/overrideState/submitBtn[data-mode] selectors", () => {
    expect(CSS).toMatch(/\.confirmState\b/);
    expect(CSS).toMatch(/\.overrideState\b/);
    expect(CSS).toMatch(/\.submitBtn\[data-mode="confirm"\]/);
    expect(CSS).toMatch(/\.submitBtn\[data-mode="override"\]/);
  });

  it("uses --v7-* tokens for the verdict triad colors", () => {
    expect(CSS).toMatch(/var\(--v7-action-confirm-bg\)/);
    expect(CSS).toMatch(/var\(--v7-action-confirm-fg\)/);
    expect(CSS).toMatch(/var\(--v7-action-override-bg\)/);
    expect(CSS).toMatch(/var\(--v7-action-override-fg\)/);
  });

  it("contains NO raw 6-digit hex except the 3 documented button-fg values", () => {
    const hexes = CSS.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    const disallowed = hexes.filter((h) => !ALLOWED_HEX.has(h.toLowerCase()));
    expect(disallowed).toEqual([]);
  });

  it("uses NO animation timing outside {0.12s, 0.15s, 0.6s}", () => {
    const timings = CSS.match(/(?<![\d.])\d*\.?\d+s\b/g) ?? [];
    const allowed = new Set(["0.12s", "0.15s", "0.6s"]);
    const offenders = timings.filter((t) => !allowed.has(t));
    expect(offenders).toEqual([]);
  });

  it("source preserves the overrideStage0Safety wiring + 2-state invariant", () => {
    expect(TSX).toMatch(/overrideStage0Safety/);
    expect(TSX).toMatch(/injection_suspected/);
    // No out-of-vocabulary verdict literals reach the action.
    expect(TSX).not.toMatch(/over_budget/);
  });
});

// ---------------------------------------------------------------------------
// Runtime mocks.
// ---------------------------------------------------------------------------
const overrideMock = vi.fn((..._a: unknown[]) => Promise.resolve({ ok: true }));
vi.mock("../../../stage-0/actions", () => ({
  overrideStage0Safety: (arg: unknown) => overrideMock(arg),
}));

import { Stage0Decide } from "../stage-0-decide";
import { SelectionProvider } from "../../selection-context";

beforeEach(() => overrideMock.mockClear());
afterEach(() => cleanup());

function makeRow(overrides: Partial<BulkReviewRow> = {}): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "email-uuid-1",
    context_version: "1.0.0",
    stage_0: {
      verdict: "injection_suspected",
      cost_cents: 0,
      confidence: null,
      pipeline_event_id: "pe-0",
    },
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

function renderDecide(row: BulkReviewRow) {
  return render(
    <SelectionProvider rowIds={[row.email_label_id]}>
      <Stage0Decide row={row} />
    </SelectionProvider>,
  );
}

describe("Stage0Decide — sketch 002 Variant C", () => {
  it("Test 1: default verdict = injection → submit data-mode=confirm + Confirm label", () => {
    renderDecide(makeRow());
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    const submit = screen.getByTestId("stage-0-decide-submit");
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toMatch(/Confirm injection/);
  });

  it("Test 2: select Override → mark as Safe flips submit to data-mode=override + Submit override label", () => {
    renderDecide(makeRow());
    fireEvent.click(
      screen.getByLabelText(/Override → mark as Safe/i),
    );
    const submit = screen.getByTestId("stage-0-decide-submit");
    expect(submit.getAttribute("data-mode")).toBe("override");
    expect(submit.textContent).toMatch(/Submit override/);
    // Flipping back restores confirm.
    fireEvent.click(screen.getByLabelText(/Confirm: Injection suspected/i));
    expect(submit.getAttribute("data-mode")).toBe("confirm");
  });

  it("Test 3: confirm submit calls overrideStage0Safety with injection_suspected", async () => {
    renderDecide(makeRow());
    fireEvent.click(screen.getByTestId("stage-0-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    expect(overrideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email_id: "email-uuid-1",
        swarm_type: "debtor-email",
        corrected_value: "injection_suspected",
      }),
    );
  });

  it("Test 4: override submit calls overrideStage0Safety with safe", async () => {
    renderDecide(makeRow());
    fireEvent.click(screen.getByLabelText(/Override → mark as Safe/i));
    fireEvent.click(screen.getByTestId("stage-0-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    expect(overrideMock).toHaveBeenCalledWith(
      expect.objectContaining({ corrected_value: "safe" }),
    );
  });

  it("Test 5: 2-state invariant — both radios map to exactly the two locked enums", async () => {
    // injection → injection_suspected
    renderDecide(makeRow());
    fireEvent.click(screen.getByTestId("stage-0-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    expect(overrideMock.mock.calls[0][0]).toMatchObject({
      corrected_value: "injection_suspected",
    });
    cleanup();
    overrideMock.mockClear();
    // safe → safe
    renderDecide(makeRow());
    fireEvent.click(screen.getByLabelText(/Override → mark as Safe/i));
    fireEvent.click(screen.getByTestId("stage-0-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    const sent = overrideMock.mock.calls[0][0] as { corrected_value: string };
    expect(["safe", "injection_suspected"]).toContain(sent.corrected_value);
    expect(sent.corrected_value).toBe("safe");
  });

  it("Test 6: empty audit note does NOT disable submit (Stage 0 audit optional)", () => {
    renderDecide(makeRow());
    const submit = screen.getByTestId(
      "stage-0-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    // The AuditBlock advertises itself as optional, not required.
    expect(
      screen.getByTestId("stage-0-decide-audit-optional-tag"),
    ).toBeInTheDocument();
  });

  it("Test 7: passes the audit note to the action when provided", async () => {
    renderDecide(makeRow());
    fireEvent.change(
      screen.getByTestId("stage-0-decide-audit-textarea"),
      { target: { value: "false positive — legit invoice copy" } },
    );
    fireEvent.click(screen.getByTestId("stage-0-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    expect(overrideMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prose_notes: "false positive — legit invoice copy",
      }),
    );
  });

  it("Test 8: null slot renders the placeholder (nothing to decide)", () => {
    renderDecide(makeRow({ stage_0: null }));
    expect(
      screen.getByTestId("stage-0-decide-placeholder"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stage-0-decide-submit")).toBeNull();
  });
});
