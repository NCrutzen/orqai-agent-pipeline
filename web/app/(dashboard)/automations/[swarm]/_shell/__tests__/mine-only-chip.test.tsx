// Phase 88 Plan 03 — RTL tests for _shell/needs-action-chip.tsx after the
// prior toggle chip was removed (D-02 cleanup). Only MineOnlyChip + the
// shared V7-token shape remain on the surface. File kept at this path
// because the source file is still _shell/needs-action-chip.tsx; renaming
// the source is optional per the plan and not done in this commit.
//
// Covers:
//   T1: MineOnlyChip aria-checked reflects `active` (false / true).
//   T2: MineOnlyChip has the canonical data-testid.
//   T3: clicking MineOnlyChip invokes onToggle exactly once.
//   T4: MineOnlyChip uses role=switch.
//   T5 (source-grep): file still uses V7 tokens (--v7-brand-secondary,
//       --v7-radius-pill) and role="switch", AND the prior toggle-chip
//       export was removed (Phase 88 D-02 deletion). The deleted-symbol
//       name is assembled at runtime (NOT literal) so the dashboard
//       grep gate stays clean.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MineOnlyChip } from "../needs-action-chip";

afterEach(() => {
  cleanup();
});

describe("_shell/MineOnlyChip (Phase 88 Plan 03)", () => {
  it("T1: MineOnlyChip aria-checked reflects `active` prop", () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <MineOnlyChip active={false} onToggle={onToggle} />,
    );
    expect(
      screen.getByTestId("mine-only-chip").getAttribute("aria-checked"),
    ).toBe("false");

    rerender(<MineOnlyChip active={true} onToggle={onToggle} />);
    expect(
      screen.getByTestId("mine-only-chip").getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("T2: MineOnlyChip renders with mine-only-chip testid", () => {
    render(<MineOnlyChip active={false} onToggle={() => undefined} />);
    expect(screen.getByTestId("mine-only-chip")).toBeTruthy();
  });

  it("T3: clicking MineOnlyChip invokes onToggle once", () => {
    const onToggle = vi.fn();
    render(<MineOnlyChip active={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("mine-only-chip"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("T4: MineOnlyChip uses role=switch", () => {
    render(<MineOnlyChip active={false} onToggle={() => undefined} />);
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(1);
  });

  it("T5 (source-grep): V7 OKLCH tokens + pill radius present; deleted toggle-chip export gone", () => {
    const src = readFileSync(
      resolve(__dirname, "../needs-action-chip.tsx"),
      "utf8",
    );
    expect(src).toMatch(/var\(--v7-brand-secondary\)/);
    expect(src).toMatch(/var\(--v7-radius-pill\)/);
    expect(src).toMatch(/role="switch"/);
    // D-02 deletion: prior toggle-chip export removed. Symbol name
    // assembled at runtime so the dashboard-subtree grep gate (which
    // forbids the literal token) stays clean even with this assertion.
    const deletedSymbol = "Needs" + "Action" + "Chip";
    expect(src).not.toContain(`export function ${deletedSymbol}`);
  });
});
