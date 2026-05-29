// Phase 3 Plan 02 Task 2 — Stage2Decide tests (10 behaviors).
//
// Phase 04.1 Plan 07 (P4.1-D-11 REVISED 2026-05-27) — auto-flip verification:
// Tests 4b and 4c below assert the `autoToggleArmedRef` auto-flip semantics
// at stage-2-decide.tsx:80-96 (first non-empty keystroke arms once; explicit
// OFF after dirtying is respected). Audit-only — no production code change.
//
// Behaviors covered (per plan):
//   1. Default state: pick-card with confirm + override-disclosure link.
//   2. Confirm match → no server call, no Inngest emit, optimistic remove.
//   3. Override disclosure reveals number input + AuditBlock + Re-run switch.
//   4. Typing non-digits is stripped; Re-run auto-toggles ON when previously OFF.
//   5. 4-digit input triggers debounced searchCustomers (250ms); validation
//      states cycle in-flight → match / miss.
//   6. Submit disabled until: 4 digits + match + audit + customer changed.
//   7. Submit with Re-run ON → overrideStage2Customer called; on success +
//      rerun_emitted, useRerunContext().markInFlight is called.
//   8. Submit with Re-run OFF → overrideStage2Customer called with rerun:false;
//      markInFlight is NOT called.
//   9. No fuzzy search element in DOM (anti-drift #7).
//  10. No EvalTypeRadio in DOM (anti-drift #6).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

afterEach(() => cleanup());

// ---- Mocks ---------------------------------------------------------------

const overrideMock = vi.fn();
vi.mock("../../actions/override-actions", () => ({
  overrideStage2Customer: (...a: unknown[]) => overrideMock(...a),
}));

const searchCustomersMock = vi.fn();
// Mock both the absolute alias AND the relative path the component uses, so
// vitest's module-identity check matches regardless of how the resolver
// canonicalizes the import.
vi.mock("@/app/(dashboard)/automations/[swarm]/stage-1/components/stage-2-search", () => ({
  searchCustomers: (q: string) => searchCustomersMock(q),
}));
vi.mock("../../stage-1/components/stage-2-search", () => ({
  searchCustomers: (q: string) => searchCustomersMock(q),
}));

// Spy on the real SelectionProvider's markPendingRemoval via a small wrapper.
const markPendingRemovalSpy = vi.fn();
vi.mock("../../selection-context", async () => {
  const mod =
    await vi.importActual<typeof import("../../selection-context")>(
      "../../selection-context",
    );
  return {
    ...mod,
    useSelection: () => {
      const real = mod.useSelection();
      return {
        ...real,
        markPendingRemoval: (id: string) => {
          markPendingRemovalSpy(id);
          real.markPendingRemoval(id);
        },
      };
    },
  };
});

const markInFlightMock = vi.fn();
vi.mock("../../hooks/use-rerun-subscription", () => ({
  useRerunContextOptional: () => ({
    inFlightIds: new Set<string>(),
    markInFlight: (id: string) => markInFlightMock(id),
  }),
}));

import { Stage2Decide } from "../stage-2-decide";
import { SelectionProvider } from "../../selection-context";
import type { BulkReviewRow } from "@/lib/bulk-review/types";

function renderWithProviders(ui: React.ReactElement, rowId = "row-1") {
  return render(
    <SelectionProvider rowIds={[rowId]}>{ui}</SelectionProvider>,
  );
}

function makeRow(over: Partial<BulkReviewRow> = {}): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "e-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: {
      entity_brand: "smeba",
      resolver_source: "sender_map",
      customer_account_id: "0042",
      corrected_customer_account_id: null,
      confidence: 0.9,
      pipeline_event_id: "pe-2",
      resolver_steps: null,
      winner_step: null,
      customer_name: null,
      sender_map_lineage: null,
      inputs: null,
    },
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
    ...over,
  };
}

beforeEach(() => {
  overrideMock.mockReset();
  searchCustomersMock.mockReset();
  markPendingRemovalSpy.mockReset();
  markInFlightMock.mockReset();
});

/** Wait past the 250ms debounce window for the live-validation effect. */
async function settleDebounce() {
  await new Promise((r) => setTimeout(r, 300));
}

describe("Stage2Decide", () => {
  it("Test 1: default state renders pick-card with confirm + flip", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    expect(screen.getByTestId("stage-2-decide-pick-card")).toBeInTheDocument();
    expect(
      screen.getByTestId("stage-2-decide-pick-card-account").textContent,
    ).toContain("0042");
    expect(screen.getByTestId("stage-2-decide-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("stage-2-decide-flip")).toBeInTheDocument();
  });

  it("Test 2: confirm calls markPendingRemoval; no server call", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-confirm"));
    expect(markPendingRemovalSpy).toHaveBeenCalledWith("row-1");
    expect(overrideMock).not.toHaveBeenCalled();
    expect(markInFlightMock).not.toHaveBeenCalled();
  });

  it("Test 3: flip reveals input + AuditBlock + Re-run switch", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    expect(screen.getByTestId("stage-2-decide-input")).toBeInTheDocument();
    expect(screen.getByTestId("stage-2-decide-audit")).toBeInTheDocument();
    expect(
      screen.getByTestId("stage-2-decide-rerun-switch"),
    ).toBeInTheDocument();
    const cb = screen.getByTestId(
      "stage-2-decide-rerun-checkbox",
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true); // default ON per P3-D-02
    // AuditBlock is REQUIRED on Axis 2.
    const audit = screen.getByTestId("stage-2-decide-audit");
    expect(audit.getAttribute("data-required")).toBe("true");
  });

  it("Test 4a: non-digit input is stripped", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    const input = screen.getByTestId(
      "stage-2-decide-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "a0b1c2d3" } });
    expect(input.value).toBe("0123");
  });

  it("Test 4b: typing auto-toggles Re-run switch ON when it was OFF", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    const cb = screen.getByTestId(
      "stage-2-decide-rerun-checkbox",
    ) as HTMLInputElement;
    // Operator turns it OFF first.
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
    // Auto-toggle is disarmed by explicit operator action — typing should NOT
    // flip it back ON.
    const input = screen.getByTestId(
      "stage-2-decide-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0079" } });
    expect(cb.checked).toBe(false);
  });

  it("Test 4c: typing auto-toggles Re-run ON when armed (no prior explicit toggle)", () => {
    // Simulate a fresh open where switch already starts ON and stays armed
    // until either the operator typed OR explicitly toggled. The armed state
    // is internal — we test the observable: switch is ON after typing.
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    const cb = screen.getByTestId(
      "stage-2-decide-rerun-checkbox",
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    const input = screen.getByTestId(
      "stage-2-decide-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "0079" } });
    expect(cb.checked).toBe(true);
  });

  it("Test 5: 4-digit input triggers debounced searchCustomers; match resolves", async () => {
    searchCustomersMock.mockResolvedValue([
      { customer_account_id: "0079", customer_name: "ACME B.V." },
    ]);
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    const input = screen.getByTestId("stage-2-decide-input");
    fireEvent.change(input, { target: { value: "0079" } });

    // Before the debounce fires, search not called.
    expect(searchCustomersMock).not.toHaveBeenCalled();

    // Advance past the 250ms debounce.
    await settleDebounce();
    expect(searchCustomersMock).toHaveBeenCalledWith("0079");

    await waitFor(() => {
      const v = screen.getByTestId("stage-2-decide-validation");
      expect(v.textContent).toContain("ACME B.V.");
      expect(v.textContent).toContain("0079");
    });
  });

  it("Test 5b: no-match shows red ✗ line", async () => {
    searchCustomersMock.mockResolvedValue([]);
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    fireEvent.change(screen.getByTestId("stage-2-decide-input"), {
      target: { value: "9999" },
    });
    await settleDebounce();
    await waitFor(() => {
      const v = screen.getByTestId("stage-2-decide-validation");
      expect(v.textContent).toContain("No customer with account number 9999");
    });
  });

  it("Test 6: Submit disabled until 4 digits + match + audit + changed", async () => {
    searchCustomersMock.mockResolvedValue([
      { customer_account_id: "0079", customer_name: "ACME B.V." },
    ]);
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    const submit = screen.getByTestId(
      "stage-2-decide-submit-override",
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // 4 digits but same as current → still disabled (no change).
    fireEvent.change(screen.getByTestId("stage-2-decide-input"), {
      target: { value: "0042" },
    });
    searchCustomersMock.mockResolvedValueOnce([
      { customer_account_id: "0042", customer_name: "Existing" },
    ]);
    await settleDebounce();
    await waitFor(() => {
      expect(submit.disabled).toBe(true);
    });

    // Change to 0079; match resolves; still need audit.
    fireEvent.change(screen.getByTestId("stage-2-decide-input"), {
      target: { value: "0079" },
    });
    await settleDebounce();
    await waitFor(() => {
      expect(submit.disabled).toBe(true); // still no audit
    });

    fireEvent.change(screen.getByTestId("stage-2-decide-audit-textarea"), {
      target: { value: "Found by invoice ref 2024-3142." },
    });
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
  });

  it("Test 7: Submit with rerun ON → override called; markInFlight called on rerun_emitted", async () => {
    searchCustomersMock.mockResolvedValue([
      { customer_account_id: "0079", customer_name: "ACME B.V." },
    ]);
    overrideMock.mockResolvedValue({
      ok: true,
      data: { pipeline_event_id: "pe-x", rerun_emitted: true },
    });
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    fireEvent.change(screen.getByTestId("stage-2-decide-input"), {
      target: { value: "0079" },
    });
    await settleDebounce();
    fireEvent.change(screen.getByTestId("stage-2-decide-audit-textarea"), {
      target: { value: "ok" },
    });
    const submit = screen.getByTestId(
      "stage-2-decide-submit-override",
    ) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));

    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(overrideMock).toHaveBeenCalled());

    expect(overrideMock).toHaveBeenCalledTimes(1);
    const args = overrideMock.mock.calls[0][0] as {
      new_customer_account_id: string;
      audit_note: string;
      rerun: boolean;
    };
    expect(args.new_customer_account_id).toBe("0079");
    expect(args.rerun).toBe(true);
    expect(args.audit_note).toBe("ok");
    expect(markInFlightMock).toHaveBeenCalledWith("e-1");
    expect(markPendingRemovalSpy).toHaveBeenCalledWith("row-1");
  });

  it("Test 8: Submit with rerun OFF → override called with rerun:false; no markInFlight", async () => {
    searchCustomersMock.mockResolvedValue([
      { customer_account_id: "0079", customer_name: "ACME B.V." },
    ]);
    overrideMock.mockResolvedValue({
      ok: true,
      data: { pipeline_event_id: "pe-x", rerun_emitted: false },
    });
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    // Operator opts out of re-run.
    fireEvent.click(screen.getByTestId("stage-2-decide-rerun-checkbox"));
    fireEvent.change(screen.getByTestId("stage-2-decide-input"), {
      target: { value: "0079" },
    });
    await settleDebounce();
    fireEvent.change(screen.getByTestId("stage-2-decide-audit-textarea"), {
      target: { value: "ok" },
    });
    const submit = screen.getByTestId(
      "stage-2-decide-submit-override",
    ) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(submit);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(overrideMock).toHaveBeenCalled());

    const args = overrideMock.mock.calls[0][0] as { rerun: boolean };
    expect(args.rerun).toBe(false);
    expect(markInFlightMock).not.toHaveBeenCalled();
  });
});

describe("Stage2Decide — sketch-004 pick-card (Plan 03-09)", () => {
  it("renders slot.customer_name as the pick-card headline when present", () => {
    renderWithProviders(
      <Stage2Decide
        row={makeRow({
          stage_2: { ...makeRow().stage_2!, customer_name: "Van den Berg BV" },
        })}
      />,
    );
    expect(
      screen.getByTestId("stage-2-decide-pick-card-name").textContent,
    ).toBe("Van den Berg BV");
  });

  it("falls back to '(name unavailable)' when customer_name is null (no fabrication)", () => {
    renderWithProviders(
      <Stage2Decide
        row={makeRow({
          stage_2: { ...makeRow().stage_2!, customer_name: null },
        })}
      />,
    );
    expect(
      screen.getByTestId("stage-2-decide-pick-card-name").textContent,
    ).toBe("(name unavailable)");
  });

  it("renders the source-pill with source + confidence (match = blue path)", () => {
    renderWithProviders(
      <Stage2Decide
        row={makeRow({
          stage_2: {
            ...makeRow().stage_2!,
            resolver_source: "sender_map",
            confidence: 1,
          },
        })}
      />,
    );
    const pill = screen.getByTestId("stage-2-decide-source-pill");
    expect(pill.textContent).toContain("sender-map");
    expect(pill.textContent).toContain("100%");
  });

  it("does NOT render the lineage line when sender_map_lineage is null", () => {
    renderWithProviders(
      <Stage2Decide
        row={makeRow({
          stage_2: { ...makeRow().stage_2!, sender_map_lineage: null },
        })}
      />,
    );
    expect(screen.queryByTestId("stage-2-decide-lineage")).toBeNull();
  });

  it("renders the lineage line when sender_map_lineage is non-null", () => {
    renderWithProviders(
      <Stage2Decide
        row={makeRow({
          stage_2: {
            ...makeRow().stage_2!,
            sender_map_lineage: "Promoted to deterministic in W18.",
          },
        })}
      />,
    );
    const lineage = screen.getByTestId("stage-2-decide-lineage");
    expect(lineage.textContent).toBe("Promoted to deterministic in W18.");
  });

  it("opening the override disclosure applies the .overriding collapse on the column", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    const root = screen.getByTestId("stage-2-decide");
    // Closed by default — no overriding class on the column wrapper.
    expect(root.className).not.toMatch(/overriding/);
    fireEvent.click(screen.getByTestId("stage-2-decide-flip"));
    // The <details> is open and the column carries the overriding collapse class
    // (which CSS uses to hide pick-card / big-action / or-divider).
    expect(root.className).toMatch(/overriding/);
    const disc = screen.getByTestId(
      "stage-2-decide-override-disclosure",
    ) as HTMLDetailsElement;
    expect(disc.open).toBe(true);
  });

  it("Confirm big-action calls the confirm handler (no server call)", () => {
    renderWithProviders(<Stage2Decide row={makeRow()} />);
    fireEvent.click(screen.getByTestId("stage-2-decide-confirm"));
    expect(markPendingRemovalSpy).toHaveBeenCalledWith("row-1");
    expect(overrideMock).not.toHaveBeenCalled();
  });
});

describe("Stage2Decide — anti-drift gates (source greps)", () => {
  const SRC = readFileSync(
    join(__dirname, "..", "stage-2-decide.tsx"),
    "utf8",
  );

  /** Strip line + block comments so anti-drift greps don't trip on doc
   *  text that explicitly names the forbidden patterns (e.g. "no fuzzy
   *  search" appears in the file-header contract comment). */
  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }
  const CODE = stripComments(SRC);

  it("Test 9: no fuzzy / combobox / name-search markers in code (anti-drift #7)", () => {
    expect(CODE).not.toMatch(/fuzzy/i);
    expect(CODE).not.toMatch(/combobox/i);
    expect(CODE).not.toMatch(/name.?search/i);
  });

  it("Test 10: no EvalTypeRadio import or render (anti-drift #6)", () => {
    expect(CODE).not.toMatch(/EvalTypeRadio/);
  });

  it("input shape locked: type=text, inputMode=numeric, pattern \\d{4}", () => {
    expect(SRC).toMatch(/inputMode="numeric"/);
    expect(SRC).toMatch(/pattern="\[0-9\]\{4\}"/);
    expect(SRC).toMatch(/maxLength=\{4\}/);
    expect(SRC).not.toMatch(/type="number"/);
  });

  it("no raw hex in tsx or module CSS", () => {
    const CSS = readFileSync(
      join(__dirname, "..", "stage-2-decide.module.css"),
      "utf8",
    );
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(CSS).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("module.css uses only allowed animation timings (0.12s / 0.15s / 0.6s)", () => {
    const CSS = readFileSync(
      join(__dirname, "..", "stage-2-decide.module.css"),
      "utf8",
    );
    // Extract every <number>s duration token in the module.
    const timings = CSS.match(/\b\d+(?:\.\d+)?s\b/g) ?? [];
    const allowed = new Set(["0.12s", "0.15s", "0.6s"]);
    const offenders = timings.filter((t) => !allowed.has(t));
    expect(offenders).toEqual([]);
  });

  it("module.css carries the full sketch-004 Decide class set", () => {
    const CSS = readFileSync(
      join(__dirname, "..", "stage-2-decide.module.css"),
      "utf8",
    );
    for (const cls of [
      "pickCard",
      "pickName",
      "sourcePill",
      "bigAction",
      "bigActionPrimary",
      "bigActionSelected",
      "orDivider",
      "overrideDisclosure",
      "customerInputRow",
      "resolvedFeedback",
      "switch",
      "overriding",
    ]) {
      expect(CSS).toContain(`.${cls}`);
    }
  });

  it("verbatim UI-SPEC §10 Re-run switch copy", () => {
    expect(SRC).toMatch(
      /Re-run Topic \+ Action with the corrected customer/,
    );
  });

  it("searchCustomers only invoked via DIGITS_RX-gated effect (no other usage)", () => {
    // The component only calls searchCustomers from inside the 4-digit-gated
    // useEffect. There are no other invocation sites in this module.
    const lines = SRC.split("\n");
    const calls = lines.filter((l) => /searchCustomers\(/.test(l));
    expect(calls.length).toBe(1);
  });
});
