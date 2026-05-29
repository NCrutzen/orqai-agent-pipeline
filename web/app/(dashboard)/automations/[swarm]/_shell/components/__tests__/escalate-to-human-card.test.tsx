// Phase 3 Plan 03 / Plan 10 Task 1 — EscalateToHumanCard tests.
//
// Sketch 005 reconcile: the card is now a clickable .escalate-row (glyph ⚠ /
// title / sub / keyhint) that TOGGLES the parent col-decide into escalating
// mode. It no longer owns its own AuditBlock or Submit — the composer
// (stage-3-decide.tsx) owns the shared audit + footer submit. Behaviors:
//   - Renders the verbatim "human queue" title + sub-line (UI-SPEC §10).
//   - Clicking the row calls onToggle; data-state reflects the escalating prop.
//   - Operator-copy lock: never the word "Kanban".

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { EscalateToHumanCard } from "../escalate-to-human-card";

describe("EscalateToHumanCard", () => {
  afterEach(() => cleanup());

  it("Test 10: idle state shows verbatim title + sub-line (human-queue copy)", () => {
    render(<EscalateToHumanCard escalating={false} onToggle={() => undefined} />);
    const card = screen.getByTestId("escalate-to-human-card");
    expect(card.getAttribute("data-state")).toBe("idle");
    expect(screen.getByTestId("escalate-to-human-card-title").textContent).toBe(
      "None of these — escalate to human queue",
    );
    expect(
      screen.getByTestId("escalate-to-human-card-sub").textContent,
    ).toContain("Routes the row to the human queue");
    expect(
      screen.getByTestId("escalate-to-human-card-sub").textContent,
    ).toContain("what intent is missing from the registry");
  });

  it("Test 11: clicking the row calls onToggle", () => {
    const onToggle = vi.fn();
    render(<EscalateToHumanCard escalating={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("Test 11b: Enter / Space on the row also toggles (keyboard a11y)", () => {
    const onToggle = vi.fn();
    render(<EscalateToHumanCard escalating={false} onToggle={onToggle} />);
    const card = screen.getByTestId("escalate-to-human-card");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("Test 11c: escalating=true reflects active state + aria-pressed", () => {
    render(<EscalateToHumanCard escalating={true} onToggle={() => undefined} />);
    const card = screen.getByTestId("escalate-to-human-card");
    expect(card.getAttribute("data-state")).toBe("active");
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("Test 12: disabled card does not toggle on click", () => {
    const onToggle = vi.fn();
    render(
      <EscalateToHumanCard
        escalating={false}
        onToggle={onToggle}
        disabled={true}
      />,
    );
    fireEvent.click(screen.getByTestId("escalate-to-human-card"));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("operator-copy lock: source uses 'human queue' / 'human', never 'Kanban'", () => {
    const src = readFileSync(
      join(__dirname, "..", "escalate-to-human-card.tsx"),
      "utf8",
    );
    expect(src).toContain("None of these — escalate to human queue");
    expect(src).toContain("human queue");
    expect(src).not.toMatch(/Kanban/i);
  });
});
