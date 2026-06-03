// Phase 3 Plan 01 Task 2 — Stage 1 Decide column tests (Axis 1 write-path
// flip from feedback-only to override-emit).
// Phase 3 Plan 08 Task 2 — rewritten for the sketch-003 single-dropdown
// structure: one always-visible category dropdown that defaults to the
// system verdict; the footer submit flips green "Confirm rule/rescue" ↔
// amber "Submit override" on dropdown change.
//
// Covers:
//   1. Regex path, dropdown unchanged → submit data-mode="confirm", copy
//      "Confirm rule"; clicking it calls overrideStage1Category with
//      new_category_key === slot.category_key (confirm == no-op category).
//   2. LLM-rescue path (llm_invoked true), dropdown unchanged → copy
//      "Confirm rescue".
//   3. Changing the dropdown → submit data-mode="override", copy
//      "Submit override"; submit calls the action with the new category +
//      audit note; the select-wrap gains the dirty marker.
//   4. On {ok:true} no error; on {ok:false} inline error + no markPendingRemoval.
//   5. NO EvalTypeRadio / eval-type radio text (anti-drift #6).
//   6. NO thumbs-up/down widget (anti-drift #5).
//   7. Category dropdown is hydrated from the passed-in registry (no hardcode).
//   8. module.css anti-drift: no raw hex (V7 tokens), allowed timings only,
//      submitBtn[data-mode] triad wired.

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
// Static-source guard — runs first; reads source off disk to assert the
// negative space (no eval radio, no thumbs widget, no hardcoded categories).
// ---------------------------------------------------------------------------
const SRC = readFileSync(
  join(__dirname, "..", "stage-1-decide.tsx"),
  "utf8",
);

describe("stage-1-decide.tsx source-level anti-drift", () => {
  it("Test 5: does NOT mention EvalTypeRadio (anti-drift #6)", () => {
    expect(SRC).not.toMatch(/EvalTypeRadio/);
  });
  it("Test 6: does NOT render a thumbs-up/down widget (anti-drift #5)", () => {
    expect(SRC).not.toMatch(/👍|👎|thumb.?up|thumb.?down/i);
  });
  it("Test 7a: contains NO hardcoded category-key string literals", () => {
    // Sample of well-known category keys that have appeared in dropdowns
    // historically — they must come from the passed-in registry, not hardcoded.
    expect(SRC).not.toMatch(/out_of_office|payment|invoice_copy|spam/);
  });
  it("contains NO raw hex color literals (V7 tokens only)", () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
  it("uses the class-based CSS module (no inline style objects for layout/color)", () => {
    expect(SRC).toMatch(/from\s+"\.\/stage-1-decide\.module\.css"/);
    // No inline `style={{ ... }}` objects remain.
    expect(SRC).not.toMatch(/style=\{\{/);
  });
});

// ---------------------------------------------------------------------------
// Runtime behavior tests. Mock the server action + Stage1Widget so the test
// can drive the dropdown flow without the shadcn Select internals.
// ---------------------------------------------------------------------------

const overrideMock = vi.fn();
vi.mock("../../actions/override-actions", () => ({
  overrideStage1Category: (...a: unknown[]) => overrideMock(...a),
}));

// Stub Stage1Widget with a plain <select> so we can fire change events
// without going through shadcn's Radix UI internals.
vi.mock("../../../stage-1/components/stage-1-widget", () => ({
  Stage1Widget: ({
    categories,
    value,
    onChange,
  }: {
    categories: { category_key: string; display_label: string }[];
    value: string | null;
    onChange: (k: string) => void;
  }) => (
    <select
      data-testid="stub-stage1widget-select"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="" disabled>
        Pick a category…
      </option>
      {categories.map((c) => (
        <option key={c.category_key} value={c.category_key}>
          {c.display_label}
        </option>
      ))}
    </select>
  ),
}));

import { Stage1Decide } from "../stage-1-decide";
import { SelectionProvider } from "../../selection-context";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

function makeRow(overrides: Partial<BulkReviewRow> = {}): BulkReviewRow {
  return {
    email_label_id: "lbl-1",
    swarm_type: "debtor-email",
    email_id: "em-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: {
      category_key: "auto_reply",
      matched_rule_id: "rule-1",
      regex_verdict: "auto_reply",
      llm_second_pass_verdict: null,
      pipeline_event_id: "pe-1",
      llm_invoked: false,
      llm_category_key: null,
      llm_confidence: null,
      llm_reasoning: null,
      llm_error: null,
      predictor: "regex",
      llm_model_key: null,
      category_display_label: "Auto-reply",
      llm_category_display_label: null,
      agent_run_id: "ar-1",
    },
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

// Include the current verdict ("auto_reply") so the always-visible dropdown
// can render its default selection alongside the override candidates.
const CATEGORIES: SwarmNoiseCategoryRow[] = [
  {
    swarm_type: "debtor-email",
    category_key: "auto_reply",
    display_label: "Auto-reply",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 0,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "category_a",
    display_label: "Category A",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 1,
    enabled: true,
  },
  {
    swarm_type: "debtor-email",
    category_key: "category_b",
    display_label: "Category B",
    outlook_label: null,
    action: "categorize_archive" as const,
    swarm_dispatch: null,
    display_order: 2,
    enabled: true,
  },
];

function renderInProvider(row: BulkReviewRow, onSubmitted?: () => void) {
  return render(
    <SelectionProvider rowIds={[row.email_label_id]}>
      <Stage1Decide row={row} categories={CATEGORIES} onSubmitted={onSubmitted} />
    </SelectionProvider>,
  );
}

beforeEach(() => {
  overrideMock.mockReset();
});
afterEach(() => cleanup());

describe("Stage1Decide runtime behavior", () => {
  it("Test 1: regex path, dropdown unchanged → confirm mode + 'Confirm rule', submits new_category_key === current verdict", async () => {
    overrideMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-2" },
    });
    const onSubmitted = vi.fn();
    renderInProvider(makeRow(), onSubmitted);

    const submit = screen.getByTestId(
      "stage-1-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toContain("Confirm rule");

    fireEvent.click(submit);
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    const args = overrideMock.mock.calls[0][0] as {
      new_category_key: string;
      audit_note: string | null;
      original_decision: string;
    };
    expect(args.new_category_key).toBe("auto_reply"); // confirm = no-op-category
    expect(args.audit_note).toBeNull();
    expect(args.original_decision).toBe("auto_reply");
    await waitFor(() => expect(onSubmitted).toHaveBeenCalled());
  });

  it("Test 2: LLM-rescue path (llm_invoked) keeps confirm copy as 'Confirm rescue'", () => {
    const row = makeRow();
    row.stage_1 = { ...row.stage_1!, llm_invoked: true, predictor: "llm_2nd_pass" };
    renderInProvider(row);
    const submit = screen.getByTestId(
      "stage-1-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("confirm");
    expect(submit.textContent).toContain("Confirm rescue");
    expect(submit.textContent).not.toContain("Confirm rule");
  });

  it("Test 3: changing the dropdown flips submit to override (amber) + calls action with picked category + audit note", async () => {
    overrideMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-2" },
    });
    renderInProvider(makeRow());

    const select = screen.getByTestId(
      "stub-stage1widget-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "category_b" } });

    const submit = screen.getByTestId(
      "stage-1-decide-submit",
    ) as HTMLButtonElement;
    expect(submit.getAttribute("data-mode")).toBe("override");
    expect(submit.textContent).toContain("Submit override");
    // The select-wrap reflects the dirty (override) intent.
    expect(
      screen
        .getByTestId("stage-1-decide-category-dropdown")
        .getAttribute("data-dirty"),
    ).toBe("true");

    const auditTa = screen.getByTestId(
      "stage-1-decide-audit-textarea",
    ) as HTMLTextAreaElement;
    fireEvent.change(auditTa, { target: { value: "this is the wrong rule" } });

    fireEvent.click(submit);
    await waitFor(() => expect(overrideMock).toHaveBeenCalledTimes(1));
    const args = overrideMock.mock.calls[0][0] as {
      new_category_key: string;
      audit_note: string | null;
    };
    expect(args.new_category_key).toBe("category_b");
    expect(args.audit_note).toBe("this is the wrong rule");
  });

  it("Test 3b: changing back to the current verdict returns submit to confirm mode", () => {
    renderInProvider(makeRow());
    const select = screen.getByTestId(
      "stub-stage1widget-select",
    ) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "category_b" } });
    expect(
      screen.getByTestId("stage-1-decide-submit").getAttribute("data-mode"),
    ).toBe("override");
    fireEvent.change(select, { target: { value: "auto_reply" } });
    expect(
      screen.getByTestId("stage-1-decide-submit").getAttribute("data-mode"),
    ).toBe("confirm");
  });

  it("Test 4a: on {ok:true}, no error rendered (markPendingRemoval is silently invoked)", async () => {
    overrideMock.mockResolvedValueOnce({
      ok: true,
      data: { pipeline_event_id: "pe-2" },
    });
    renderInProvider(makeRow());
    fireEvent.click(screen.getByTestId("stage-1-decide-submit"));
    await waitFor(() => expect(overrideMock).toHaveBeenCalled());
    expect(screen.queryByTestId("stage-1-decide-error")).toBeNull();
  });

  it("Test 4b: on {ok:false}, error.message renders inline and onSubmitted is NOT called", async () => {
    overrideMock.mockResolvedValueOnce({
      ok: false,
      error: "registry returned: invalid_category",
      code: "invalid_category",
    });
    const onSubmitted = vi.fn();
    renderInProvider(makeRow(), onSubmitted);

    fireEvent.click(screen.getByTestId("stage-1-decide-submit"));
    await waitFor(() =>
      expect(screen.getByTestId("stage-1-decide-error").textContent).toContain(
        "invalid_category",
      ),
    );
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("Test 5b: NO eval-type radio text ('Recent regression' / 'New case') renders", () => {
    renderInProvider(makeRow());
    expect(screen.queryByText(/Recent regression/i)).toBeNull();
    expect(screen.queryByText(/New case/i)).toBeNull();
  });

  it("Test 7b: dropdown options are exactly the passed-in registry rows (no hardcoded list)", () => {
    renderInProvider(makeRow());
    const select = screen.getByTestId(
      "stub-stage1widget-select",
    ) as HTMLSelectElement;
    const optionValues = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => v !== ""); // skip placeholder
    expect(optionValues).toEqual(["auto_reply", "category_a", "category_b"]);
  });

  it("renders the 160px optional audit-block; the eval_type/jargon note is gone (Plan 03-15 r3-4)", () => {
    renderInProvider(makeRow());
    const audit = screen.getByTestId("stage-1-decide-audit");
    expect(audit.getAttribute("data-required")).toBe("false");
    const ta = screen.getByTestId(
      "stage-1-decide-audit-textarea",
    ) as HTMLTextAreaElement;
    expect(ta.style.minHeight).toBe("160px");
    // The ★ eval_type=regression / QA-admin note was dropped (operators never
    // see internal pipeline terms — operator-language.md).
    expect(screen.queryByTestId("stage-1-decide-eval-note")).toBeNull();
    expect(screen.queryByText(/eval_type/i)).toBeNull();
    expect(screen.queryByText(/promotion-recommender/i)).toBeNull();
    expect(screen.queryByText(/Phase 4/i)).toBeNull();
  });

  it("renders a placeholder when row.stage_1 is null", () => {
    renderInProvider(makeRow({ stage_1: null }));
    expect(screen.getByTestId("stage-1-decide-placeholder")).toBeDefined();
    expect(screen.queryByTestId("stage-1-decide-submit")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// module.css anti-drift guard (T-03-08-02).
// ---------------------------------------------------------------------------

describe("stage-1-decide.module.css anti-drift", () => {
  const CSS = readFileSync(
    join(__dirname, "..", "stage-1-decide.module.css"),
    "utf8",
  );

  it("contains NO raw hex color literals (V7 tokens only)", () => {
    // The 3 lime/amber button-fg hex exceptions live in globals.css, never
    // here. Strip comments + rgba() tints (the §9 brand/red tint, allowed).
    const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("uses only the allowed animation timings {0.12s, 0.15s, 0.6s}", () => {
    const timings = CSS.match(/\b\d*\.?\d+s\b/g) ?? [];
    for (const t of timings) {
      expect(["0.12s", "0.15s", "0.6s"]).toContain(t);
    }
  });

  it("wires the verdict color triad via submitBtn[data-mode] + the dirty select-wrap", () => {
    expect(CSS).toMatch(/\[data-mode="confirm"\]/);
    expect(CSS).toMatch(/\[data-mode="override"\]/);
    expect(CSS).toMatch(/--v7-action-confirm-bg/);
    expect(CSS).toMatch(/--v7-action-override-bg/);
    expect(CSS).toMatch(/\.selectWrap/);
    expect(CSS).toMatch(/\.dirty/);
  });
});
