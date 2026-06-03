// Phase 3 Plan 03 Task 1 — RankedIntentEditor tests.
//
// Behaviors 1-9 per plan:
//   1. Renders N rows with label + confidence bar + ▲ + ▼ + visual ⠿.
//   2. Top row pill = green DISPATCH WINNER when !isDirty.
//   3. Click ▼ on top row → pill flips to amber YOUR PICK on new top.
//   4. Sub-position reorder leaves top row green DISPATCH WINNER.
//   5. ▲▼ disabled at boundaries.
//   6. ⠿ glyph is non-interactive (aria-hidden, no tabIndex, no draggable).
//   7. No HTML5 DnD attributes in component source.
//   8. Controlled component — onChange called with new order.
//   9. Unknown intent_key renders ⚠ unknown intent pill without crash.
//
// Hard-separation lock: validation registry passed via prop fixture; the
// fixture mirrors `swarm_intents` shape (intent_key vocabulary only — NEVER
// swarm_noise_categories).

import { describe, it, expect, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RankedIntentEditor } from "../ranked-intent-editor";
import type { RankedIntent } from "@/lib/bulk-review/types";

// Fixture intent set — mirror codegen literal-union shape. Hard-separation
// honored: these are Stage 3 intent_keys, never noise category_keys.
const FIXTURE_REGISTRY = [
  "invoice_copy_request",
  "payment_dispute",
  "general_inquiry",
  "other",
] as const;

function rk(
  intent_key: string,
  confidence: number | null,
  display_label: string | null = null,
): RankedIntent {
  return {
    intent_key: intent_key as RankedIntent["intent_key"],
    confidence,
    display_label,
  };
}

function ControlledHarness(props: {
  initial: RankedIntent[];
  onChange?: (next: RankedIntent[]) => void;
  registry?: ReadonlyArray<string>;
}) {
  const [value, setValue] = useState(props.initial);
  return (
    <RankedIntentEditor
      value={value}
      onChange={(n) => {
        setValue(n);
        props.onChange?.(n);
      }}
      intentKeyRegistry={props.registry ?? FIXTURE_REGISTRY}
    />
  );
}

describe("RankedIntentEditor", () => {
  afterEach(() => cleanup());

  it("Test 1: renders N rows with label, confidence bar, ▲, ▼, and visual ⠿ glyph", () => {
    const initial = [
      rk("invoice_copy_request", 0.94, "Invoice copy"),
      rk("payment_dispute", 0.04, "Payment dispute"),
      rk("general_inquiry", 0.02, "General inquiry"),
    ];
    render(<ControlledHarness initial={initial} />);
    for (let i = 0; i < 3; i++) {
      expect(screen.getByTestId(`ranked-intent-editor-row-${i}`)).toBeTruthy();
      expect(screen.getByTestId(`ranked-intent-editor-up-${i}`)).toBeTruthy();
      expect(screen.getByTestId(`ranked-intent-editor-down-${i}`)).toBeTruthy();
    }
    expect(screen.getByTestId("ranked-intent-editor-label-0").textContent).toContain(
      "Invoice copy",
    );
    // Drag-handle glyph present somewhere — anti-drift #8 visual-only.
    expect(document.body.textContent).toContain("⠿");
  });

  it("Test 2: top row shows green DISPATCH WINNER pill when not dirty", () => {
    const initial = [
      rk("invoice_copy_request", 0.94),
      rk("payment_dispute", 0.04),
    ];
    render(<ControlledHarness initial={initial} />);
    expect(screen.queryByTestId("ranked-intent-editor-pill-dispatch")).toBeTruthy();
    expect(screen.queryByTestId("ranked-intent-editor-pill-your-pick")).toBeNull();
    expect(
      screen.getByTestId("ranked-intent-editor").getAttribute("data-dirty"),
    ).toBe("false");
  });

  it("Test 3: clicking ▼ on top row flips pill to amber YOUR PICK on the new top", () => {
    const initial = [
      rk("invoice_copy_request", 0.6),
      rk("payment_dispute", 0.3),
      rk("general_inquiry", 0.1),
    ];
    const onChange = vi.fn();
    render(<ControlledHarness initial={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ranked-intent-editor-down-0"));
    // After the swap, position 0 = payment_dispute, position 1 = invoice_copy_request
    expect(
      screen.getByTestId("ranked-intent-editor").getAttribute("data-dirty"),
    ).toBe("true");
    expect(screen.queryByTestId("ranked-intent-editor-pill-your-pick")).toBeTruthy();
    expect(screen.queryByTestId("ranked-intent-editor-pill-dispatch")).toBeNull();
    expect(
      screen
        .getByTestId("ranked-intent-editor-row-0")
        .getAttribute("data-intent-key"),
    ).toBe("payment_dispute");
    expect(onChange).toHaveBeenCalled();
  });

  it("Test 4: sub-position reorder (positions 1 ↔ 2) — top row still green DISPATCH WINNER if top unchanged… but per sketch 005 lock, ANY change flips pill to YOUR PICK", () => {
    // Sketch 005 README §2: "If it differs → #1 row turns amber" — covers any
    // reorder, not only top-1 changes. Anti-drift parity with the editor's
    // isDirty signal: once dirty, pill is amber.
    const initial = [
      rk("invoice_copy_request", 0.94),
      rk("payment_dispute", 0.04),
      rk("general_inquiry", 0.02),
    ];
    render(<ControlledHarness initial={initial} />);
    // Move position 1 down (swap 1↔2) — top row UNCHANGED at the array level.
    fireEvent.click(screen.getByTestId("ranked-intent-editor-down-1"));
    // The list is now dirty (positions 1 and 2 swapped) — sketch 005 lock
    // flips the pill to YOUR PICK on ANY dirty state.
    expect(
      screen.getByTestId("ranked-intent-editor").getAttribute("data-dirty"),
    ).toBe("true");
    expect(screen.queryByTestId("ranked-intent-editor-pill-your-pick")).toBeTruthy();
    expect(screen.queryByTestId("ranked-intent-editor-pill-dispatch")).toBeNull();
    // Top intent_key still invoice_copy_request — operator pulled a sub
    // reorder, server action will detect topChanged=false and skip re-emit.
    expect(
      screen
        .getByTestId("ranked-intent-editor-row-0")
        .getAttribute("data-intent-key"),
    ).toBe("invoice_copy_request");
  });

  it("Test 5: ▲ disabled at position 0, ▼ disabled at last position", () => {
    const initial = [
      rk("invoice_copy_request", 0.6),
      rk("payment_dispute", 0.3),
      rk("general_inquiry", 0.1),
    ];
    render(<ControlledHarness initial={initial} />);
    expect(
      (screen.getByTestId("ranked-intent-editor-up-0") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByTestId("ranked-intent-editor-down-2") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    // Mid-position both enabled.
    expect(
      (screen.getByTestId("ranked-intent-editor-up-1") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    expect(
      (screen.getByTestId("ranked-intent-editor-down-1") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("Test 6: ⠿ drag-handle glyph is non-interactive (aria-hidden, no tabIndex)", () => {
    const initial = [rk("invoice_copy_request", 0.5)];
    render(<ControlledHarness initial={initial} />);
    // Find the glyph by text content scan and assert it's aria-hidden + has no tabIndex.
    const row = screen.getByTestId("ranked-intent-editor-row-0");
    const handle = Array.from(row.querySelectorAll("span")).find(
      (s) => s.textContent === "⠿",
    );
    expect(handle).toBeTruthy();
    expect(handle!.getAttribute("aria-hidden")).toBe("true");
    expect(handle!.getAttribute("tabindex")).toBe(null);
    expect(handle!.getAttribute("draggable")).toBe(null);
  });

  it("Test 7: source file contains zero HTML5 DnD attributes (anti-drift #8)", () => {
    const src = readFileSync(
      join(__dirname, "..", "ranked-intent-editor.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/\bdraggable\b/);
    expect(src).not.toMatch(/onDragStart/);
    expect(src).not.toMatch(/onDragOver/);
    expect(src).not.toMatch(/onDrop\b/);
    expect(src).not.toMatch(/onDragEnd/);
  });

  it("Test 8: fully controlled — onChange surfaces the new order to parent", () => {
    const initial = [
      rk("invoice_copy_request", 0.6),
      rk("payment_dispute", 0.3),
    ];
    const onChange = vi.fn();
    render(<ControlledHarness initial={initial} onChange={onChange} />);
    fireEvent.click(screen.getByTestId("ranked-intent-editor-down-0"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as RankedIntent[];
    expect(next.map((r) => r.intent_key)).toEqual([
      "payment_dispute",
      "invoice_copy_request",
    ]);
  });

  it("Test 9: unknown intent_key renders ⚠ unknown intent pill without crashing", () => {
    const initial = [
      rk("invoice_copy_request", 0.6),
      // Unknown — not in fixture registry.
      rk("schedule_call", 0.3, "Schedule call"),
    ];
    render(<ControlledHarness initial={initial} />);
    expect(screen.getByTestId("ranked-intent-editor-unknown-1")).toBeTruthy();
    expect(
      screen.getByTestId("ranked-intent-editor-unknown-1").textContent,
    ).toContain("unknown intent");
  });

  it("Test 9b: contains the DISPATCH WINNER and YOUR PICK literal strings (sketch 005 lock)", () => {
    const src = readFileSync(
      join(__dirname, "..", "ranked-intent-editor.tsx"),
      "utf8",
    );
    expect(src).toContain("DISPATCH WINNER");
    expect(src).toContain("YOUR PICK");
  });
});
