// Phase 82.4 Plan 04 — stage-step.tsx feedback-side-effect wiring tests.
//
// Test A: clicking the "override stage" link in state==='ok' fires the
//   existing onMarkDirty callback AND ALSO calls fireFeedback with
//   verdict='override'. The Inngest dispatch path runs via onMarkDirty
//   upstream and is intentionally NOT what we assert here — we only
//   assert that fireFeedback is added alongside.
//
// Test B: the exported `fireOverrideFeedback` helper (used by stage widgets'
//   submit handlers in future plans) calls fireFeedback with
//   corrected_value and prose_notes correctly.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

// Hoisted mock — must be declared before importing the component.
vi.mock("@/lib/automations/debtor-email/feedback/fire-feedback", () => ({
  fireFeedback: vi.fn(),
}));

import { fireFeedback } from "@/lib/automations/debtor-email/feedback/fire-feedback";
import { StageStep, fireOverrideFeedback } from "../stage-step";
import type { StageData } from "../pipeline-flow";

const baseOk: StageData = {
  n: 1,
  title: "Stage 1 — noise filter",
  axis: null,
  state: "ok",
  currentValue: "noise",
};

beforeEach(() => {
  (fireFeedback as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => cleanup());

describe("StageStep — Phase 82.4 Plan 04 fireFeedback wiring", () => {
  it("Test A: clicking 'override stage' link fires both onMarkDirty AND fireFeedback({verdict:'override'})", () => {
    const onMarkDirty = vi.fn();
    const stage: StageData = {
      ...baseOk,
      emailId: "email-uuid-abc",
    };
    render(<StageStep stage={stage} onMarkDirty={onMarkDirty} />);

    const link = screen.getByRole("button", { name: /Override Stage 1/i });
    fireEvent.click(link);

    // Existing path preserved
    expect(onMarkDirty).toHaveBeenCalledTimes(1);

    // Additive feedback row
    expect(fireFeedback).toHaveBeenCalledTimes(1);
    expect(fireFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        email_id: "email-uuid-abc",
        stage: 1,
        verdict: "override",
      }),
    );
  });

  it("Test A (skipped branch): clicking 'override stage' in state==='skipped' also fires both", () => {
    const onMarkDirty = vi.fn();
    const stage: StageData = {
      ...baseOk,
      state: "skipped",
      emailId: "email-uuid-xyz",
      n: 2,
    };
    render(<StageStep stage={stage} onMarkDirty={onMarkDirty} />);

    const link = screen.getByRole("button", { name: /Override Stage 2/i });
    fireEvent.click(link);

    expect(onMarkDirty).toHaveBeenCalledTimes(1);
    expect(fireFeedback).toHaveBeenCalledTimes(1);
    expect(fireFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        email_id: "email-uuid-xyz",
        stage: 2,
        verdict: "override",
      }),
    );
  });

  it("does NOT fire feedback when emailId is missing (silent skip — preserves Plan 03 invariant)", () => {
    const onMarkDirty = vi.fn();
    const stage: StageData = { ...baseOk }; // no emailId
    render(<StageStep stage={stage} onMarkDirty={onMarkDirty} />);

    fireEvent.click(screen.getByRole("button", { name: /Override Stage 1/i }));

    expect(onMarkDirty).toHaveBeenCalledTimes(1);
    expect(fireFeedback).not.toHaveBeenCalled();
  });

  it("Test B: fireOverrideFeedback helper forwards corrected_value + prose_notes", () => {
    fireOverrideFeedback("email-uuid-def", 1, "spam", "this looked promotional");

    expect(fireFeedback).toHaveBeenCalledTimes(1);
    expect(fireFeedback).toHaveBeenCalledWith({
      email_id: "email-uuid-def",
      stage: 1,
      verdict: "override",
      corrected_value: "spam",
      prose_notes: "this looked promotional",
    });
  });

  it("Test B (no prose): fireOverrideFeedback omits prose_notes when blank", () => {
    fireOverrideFeedback("email-uuid-def", 3, "intent_payment_promise", "   ");

    expect(fireFeedback).toHaveBeenCalledWith({
      email_id: "email-uuid-def",
      stage: 3,
      verdict: "override",
      corrected_value: "intent_payment_promise",
    });
  });
});
