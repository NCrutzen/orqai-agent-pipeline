// Phase 82.4 Plan 06 Task 1 — RTL tests for _shell/needs-action-chip.tsx
//
// Covers:
//   T1: NeedsActionChip aria-checked reflects `active` (false / true).
//   T2: MineOnlyChip has correct data-testid.
//   T3: clicking either chip calls onToggle exactly once.
//   T4: data-testid values match the contract (needs-action-chip / mine-only-chip).
//   T5 (source-grep): file uses V7 tokens (--v7-brand-secondary +
//       --v7-radius-pill) and role="switch".

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NeedsActionChip, MineOnlyChip } from "../needs-action-chip";

afterEach(() => {
  cleanup();
});

describe("_shell/needs-action-chip (Phase 82.4 Plan 06)", () => {
  it("T1: NeedsActionChip aria-checked reflects `active` prop", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <NeedsActionChip active={false} onToggle={onToggle} />,
    );
    expect(
      screen.getByTestId("needs-action-chip").getAttribute("aria-checked"),
    ).toBe("false");

    rerender(<NeedsActionChip active={true} onToggle={onToggle} />);
    expect(
      screen.getByTestId("needs-action-chip").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("T2: MineOnlyChip renders with mine-only-chip testid", () => {
    render(<MineOnlyChip active={false} onToggle={() => undefined} />);
    expect(screen.getByTestId("mine-only-chip")).toBeTruthy();
  });

  it("T3a: clicking NeedsActionChip invokes onToggle once", () => {
    const onToggle = vi.fn();
    render(<NeedsActionChip active={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("needs-action-chip"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("T3b: clicking MineOnlyChip invokes onToggle once", () => {
    const onToggle = vi.fn();
    render(<MineOnlyChip active={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("mine-only-chip"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("T4: both chips use role=switch", () => {
    render(
      <>
        <NeedsActionChip active={false} onToggle={() => undefined} />
        <MineOnlyChip active={false} onToggle={() => undefined} />
      </>,
    );
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
  });

  it("T5 (source-grep): V7 OKLCH tokens + pill radius present in source", () => {
    const src = readFileSync(
      resolve(__dirname, "../needs-action-chip.tsx"),
      "utf8",
    );
    expect(src).toMatch(/var\(--v7-brand-secondary\)/);
    expect(src).toMatch(/var\(--v7-radius-pill\)/);
    expect(src).toMatch(/role="switch"/);
  });
});
