// Phase 82 Plan 01 Task 2 — RTL tests for _shell/chip-strip.tsx
//
// Covers:
//   T5: renders chips[] as buttons with role="tab"; aria-selected matches `active`.
//       Clicking calls `onChange(chip.key)`.
//   T6 (hard-separation lock): the SOURCE FILE does NOT import any registry
//       loader (loadSwarmNoiseCategories | loadSwarmIntents | etc.). Read via
//       fs.readFileSync + regex assertion.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ChipStrip } from "../chip-strip";

afterEach(() => {
  cleanup();
});

describe("_shell/chip-strip (Phase 82 Plan 01)", () => {
  it("T5a: renders one tab per chip; aria-selected matches active key", () => {
    const onChange = vi.fn();
    render(
      <ChipStrip
        chips={[
          { key: "all", label: "All", count: 10 },
          { key: "payment", label: "Payment", count: 4 },
          { key: "dispute", label: "Dispute", count: 6 },
        ]}
        active="payment"
        onChange={onChange}
        ariaLabel="Filter by category"
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    const payment = screen.getByRole("tab", { name: /^Payment —/ });
    expect(payment.getAttribute("aria-selected")).toBe("true");

    const all = screen.getByRole("tab", { name: /^All —/ });
    expect(all.getAttribute("aria-selected")).toBe("false");
  });

  it("T5b: clicking a chip invokes onChange with chip.key", () => {
    const onChange = vi.fn();
    render(
      <ChipStrip
        chips={[
          { key: "all", label: "All", count: 10 },
          { key: "payment", label: "Payment", count: 4 },
        ]}
        active="all"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Payment —/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("payment");
  });

  it("T6 (hard-separation): source file imports NO registry loader", () => {
    const src = readFileSync(
      resolve(__dirname, "../chip-strip.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/loadSwarmNoiseCategories/);
    expect(src).not.toMatch(/loadSwarmIntents/);
    expect(src).not.toMatch(/loadSwarm[A-Z]/); // any loadSwarm* helper
    expect(src).not.toMatch(/SwarmIntentRow/);
    expect(src).not.toMatch(/SwarmNoiseCategoryRow/);
  });
});
