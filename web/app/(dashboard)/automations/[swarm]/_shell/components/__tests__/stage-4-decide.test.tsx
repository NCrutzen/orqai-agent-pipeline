// Phase 3 Plan 01 Task 3 — Stage 4 Decide column tests.
//
// Covers behaviors 1-6 (Test 7 — InlineExpandRow consumer wire-up — is
// covered by the row-strip-list.test integration suite indirectly, and by
// the static-import audit below):
//   1. Renders Stage4Widget content (quality buttons + reason textarea).
//   2. AuditBlock required=false for edited_minor; required=true for rejected_*.
//   3. Submit disabled when rejected verdict + empty AuditBlock.
//   4. Submit calls submitStage4Handler with the mapped (draft_quality,
//      verdict, feedback_reason) tuple + audit_note.
//   5. On {ok:true} no error rendered; on {ok:false, code:'audit_required'}
//      inline error shown.
//   6. NO inngest.send call originates from this component (static guard).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";

// ---------------------------------------------------------------------------
// Static-source guard (Test 6).
// ---------------------------------------------------------------------------
const SRC = readFileSync(
  join(__dirname, "..", "stage-4-decide.tsx"),
  "utf8",
);

describe("stage-4-decide.tsx source-level anti-drift", () => {
  it("Test 6: does NOT call inngest.send (Stage 4 is terminal)", () => {
    expect(SRC).not.toMatch(/inngest\.send/);
  });
  it("does NOT import @/lib/inngest", () => {
    expect(SRC).not.toMatch(/from\s+["']@\/lib\/inngest/);
  });
  it("does NOT reference zapier_tools or allowed_for_intents (CON-handler-tool-allowlist)", () => {
    expect(SRC).not.toMatch(/zapier_tools|allowed_for_intents/);
  });
  it("does NOT mention EvalTypeRadio (anti-drift #6)", () => {
    expect(SRC).not.toMatch(/EvalTypeRadio/);
  });
  it("contains NO raw hex color literals (V7 tokens only)", () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

// ---------------------------------------------------------------------------
// Runtime mocks + render setup.
// ---------------------------------------------------------------------------

const submitMock = vi.fn();
vi.mock("../../actions/override-actions", async () => {
  const actual = await vi.importActual<
    typeof import("../../actions/override-actions")
  >("../../actions/override-actions");
  return {
    ...actual,
    submitStage4Handler: (...a: unknown[]) => submitMock(...a),
  };
});

// Stub the heavyweight shadcn-based Stage4Widget with a plain 1-5 button row
// and textarea — keeps the test runtime free of Radix internals while still
// exercising the wrapper's quality-mapping logic.
vi.mock("../../../stage-1/components/stage-4-widget", () => ({
  Stage4Widget: ({
    quality,
    onQualityChange,
    reason,
    onReasonChange,
  }: {
    quality: number | null;
    onQualityChange: (q: number) => void;
    reason: string;
    onReasonChange: (r: string) => void;
  }) => (
    <div data-testid="stub-stage4widget">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          data-testid={`stub-quality-${n}`}
          aria-pressed={quality === n}
          onClick={() => onQualityChange(n)}
        >
          {n}
        </button>
      ))}
      <textarea
        data-testid="stub-reason-textarea"
        value={reason}
        onChange={(e) => onReasonChange(e.target.value)}
      />
    </div>
  ),
}));

import { Stage4Decide } from "../stage-4-decide";
import { SelectionProvider } from "../../selection-context";
import type { BulkReviewRow } from "@/lib/bulk-review/types";

function makeRow(stage_4_overrides: Partial<NonNullable<BulkReviewRow["stage_4"]>> | null = {}): BulkReviewRow {
  const stage_4 =
    stage_4_overrides === null
      ? null
      : {
          handler_key: "draft-replier",
          draft_quality: null,
          feedback_reason: null,
          handler_output_kind: "draft_body",
          pipeline_event_id: "pe-4",
          ...stage_4_overrides,
        };
  return {
    email_label_id: "lbl-1",
    swarm_type: "debtor-email",
    email_id: "em-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: null,
    stage_3: null,
    stage_3p5: null,
    stage_4,
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

function renderInProvider(row: BulkReviewRow, onSubmitted?: () => void) {
  return render(
    <SelectionProvider rowIds={[row.email_label_id]}>
      <Stage4Decide row={row} onSubmitted={onSubmitted} />
    </SelectionProvider>,
  );
}

beforeEach(() => submitMock.mockReset());
afterEach(() => cleanup());

describe("Stage4Decide runtime behavior", () => {
  it("Test 1: renders the Stage4Widget content (quality 1-5 + reason textarea)", () => {
    renderInProvider(makeRow());
    expect(screen.getByTestId("stub-stage4widget")).toBeDefined();
    expect(screen.getByTestId("stub-quality-1")).toBeDefined();
    expect(screen.getByTestId("stub-quality-5")).toBeDefined();
    expect(screen.getByTestId("stub-reason-textarea")).toBeDefined();
  });

  it("Test 2a: AuditBlock required=false when verdict is edited_minor (quality=4)", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-4"));
    const audit = screen.getByTestId("stage-4-decide-audit");
    expect(audit.getAttribute("data-required")).toBe("false");
  });

  it("Test 2b: AuditBlock required=true when quality maps to rejected_* (quality<=2)", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-1"));
    const audit = screen.getByTestId("stage-4-decide-audit");
    expect(audit.getAttribute("data-required")).toBe("true");
    fireEvent.click(screen.getByTestId("stub-quality-2"));
    expect(audit.getAttribute("data-required")).toBe("true");
  });

  it("Test 3: Submit disabled when rejected verdict + empty AuditBlock", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-1"));
    const submit = screen.getByTestId(
      "stage-4-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // Type non-empty audit content → Submit enables.
    fireEvent.change(
      screen.getByTestId(
        "stage-4-decide-audit-textarea",
      ) as HTMLTextAreaElement,
      { target: { value: "tone was sharp" } },
    );
    expect(submit.disabled).toBe(false);
  });

  it("Submit enabled immediately for edited_minor (audit optional)", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-4"));
    const submit = screen.getByTestId(
      "stage-4-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  it("Test 4: Submit calls submitStage4Handler with the schema-mapped args", async () => {
    submitMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-4b" },
    });
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-4")); // edited_minor
    fireEvent.change(
      screen.getByTestId("stub-reason-textarea") as HTMLTextAreaElement,
      { target: { value: "shifted greeting" } },
    );
    fireEvent.click(screen.getByTestId("stage-4-decide-submit"));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const args = submitMock.mock.calls[0][0] as {
      new_draft_quality: string;
      verdict: string;
      new_feedback_reason: string;
      audit_note: string | null;
      original_event_id: string;
    };
    expect(args.new_draft_quality).toBe("needed_edit");
    expect(args.verdict).toBe("edited_minor");
    expect(args.new_feedback_reason).toBe("shifted greeting");
    expect(args.audit_note).toBeNull();
    expect(args.original_event_id).toBe("pe-4");
  });

  it("Test 4b: rejected verdict args include audit_note + draft_quality=rejected", async () => {
    submitMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-4c" },
    });
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-1")); // rejected_other
    fireEvent.change(
      screen.getByTestId(
        "stage-4-decide-audit-textarea",
      ) as HTMLTextAreaElement,
      { target: { value: "wrong language entirely" } },
    );
    fireEvent.click(screen.getByTestId("stage-4-decide-submit"));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const args = submitMock.mock.calls[0][0] as {
      new_draft_quality: string;
      verdict: string;
      audit_note: string | null;
    };
    expect(args.new_draft_quality).toBe("rejected");
    expect(args.verdict).toBe("rejected_other");
    expect(args.audit_note).toBe("wrong language entirely");
  });

  it("Test 5a: on {ok:true}, no error rendered + onSubmitted invoked", async () => {
    submitMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-4d" },
    });
    const onSubmitted = vi.fn();
    renderInProvider(makeRow(), onSubmitted);
    fireEvent.click(screen.getByTestId("stub-quality-4"));
    fireEvent.click(screen.getByTestId("stage-4-decide-submit"));
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
    expect(screen.queryByTestId("stage-4-decide-error")).toBeNull();
  });

  it("Test 5b: on {ok:false}, error message renders inline + onSubmitted NOT invoked", async () => {
    submitMock.mockResolvedValueOnce({
      ok: false,
      error: "audit-note required for rejection",
      code: "audit_required",
    });
    const onSubmitted = vi.fn();
    renderInProvider(makeRow(), onSubmitted);
    fireEvent.click(screen.getByTestId("stub-quality-4"));
    fireEvent.click(screen.getByTestId("stage-4-decide-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("stage-4-decide-error").textContent).toContain(
        "audit-note required",
      ),
    );
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("renders the placeholder when row.stage_4 is null", () => {
    renderInProvider(makeRow(null));
    expect(screen.getByTestId("stage-4-decide-placeholder")).toBeDefined();
    expect(screen.queryByTestId("stage-4-decide-submit")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Plan 11 — verdict→submit color follow + shared AuditBlock render.
  // -------------------------------------------------------------------------

  it("Plan11-1: submit defaults to confirm (green) with Confirm copy before any change", () => {
    renderInProvider(makeRow());
    const submit = screen.getByTestId(
      "stage-4-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toContain("Confirm");
  });

  it("Plan11-1b: quality=5 (approved) keeps submit on confirm mode", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-5"));
    const submit = screen.getByTestId(
      "stage-4-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toContain("Confirm");
  });

  it("Plan11-2: a minor edit (quality=4) flips submit to override (amber) copy", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-4"));
    const submit = screen.getByTestId(
      "stage-4-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("override");
    expect(submit.textContent).toContain("Submit override");
  });

  it("Plan11-2b: a rejection (quality=1) flips submit to override mode", () => {
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-1"));
    expect(
      screen
        .getByTestId("stage-4-decide-submit")
        .getAttribute("data-mode"),
    ).toBe("override");
  });

  it("Plan11-3: override submit calls the action with a mapped human_verdict + feedback_reason", async () => {
    submitMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-4e" },
    });
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stub-quality-1")); // rejected_other
    fireEvent.change(
      screen.getByTestId("stub-reason-textarea") as HTMLTextAreaElement,
      { target: { value: "tone mismatch" } },
    );
    fireEvent.change(
      screen.getByTestId(
        "stage-4-decide-audit-textarea",
      ) as HTMLTextAreaElement,
      { target: { value: "reply was far too curt" } },
    );
    fireEvent.click(screen.getByTestId("stage-4-decide-submit"));
    await waitFor(() => expect(submitMock).toHaveBeenCalledTimes(1));
    const args = submitMock.mock.calls[0][0] as {
      verdict: string;
      new_feedback_reason: string;
    };
    // Tampering mitigation (T-03-11-01): verdict must be an allowed value.
    expect([
      "approved",
      "edited_minor",
      "edited_major",
      "rejected_other",
    ]).toContain(args.verdict);
    expect(args.verdict).toBe("rejected_other");
    expect(args.new_feedback_reason).toBe("tone mismatch");
  });

  it("Plan11-4: the shared AuditBlock is rendered (question + textarea present)", () => {
    renderInProvider(makeRow());
    expect(screen.getByTestId("stage-4-decide-audit")).toBeDefined();
    expect(screen.getByTestId("stage-4-decide-audit-question")).toBeDefined();
    expect(screen.getByTestId("stage-4-decide-audit-textarea")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Plan 11 — module.css anti-drift guard (T-03-11-03).
// ---------------------------------------------------------------------------

describe("stage-4-decide.module.css anti-drift", () => {
  const CSS = readFileSync(
    join(__dirname, "..", "stage-4-decide.module.css"),
    "utf8",
  );

  it("contains NO raw hex color literals (V7 tokens only)", () => {
    // The 3 lime/amber button-fg hex exceptions live in globals.css, never
    // here. Strip rgba() tints (they encode the §9 brand/red tint, allowed).
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("uses only the allowed animation timings {0.12s, 0.15s, 0.6s}", () => {
    const timings = CSS.match(/\b\d*\.?\d+s\b/g) ?? [];
    for (const t of timings) {
      expect(["0.12s", "0.15s", "0.6s"]).toContain(t);
    }
  });

  it("wires the verdict color triad via submitBtn[data-mode]", () => {
    expect(CSS).toMatch(/\[data-mode="confirm"\]/);
    expect(CSS).toMatch(/\[data-mode="override"\]/);
    expect(CSS).toMatch(/--v7-action-confirm-bg/);
    expect(CSS).toMatch(/--v7-action-override-bg/);
  });
});
