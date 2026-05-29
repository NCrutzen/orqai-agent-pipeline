// Phase 2 Plan 02-06 Task 1 — ModeBar tests (P2-D-08 + OQ-1 reconciliation).
//
// Covers:
//   T1: renders 3 slots Queue · History · Patterns in a 3-third grid.
//   T2: Queue uses --v7-brand-primary tokens when active.
//   T3: History (Phase 5 Plan 05-03 D-08) renders with --v7-brand-secondary
//       chrome, ACTIVE link to /automations/[swarm]/history, no
//       title="ships in Phase 5", data-disabled="false".
//   T4: Patterns renders with --v7-brand-patterns chrome, disabled with
//       opacity:0.5 + pointer-events:none + title="ships in Phase 4".
//   T5: Queue is the default-active mode (Phase 2 ships Queue only).
//   T6: Mounted in client-shell.tsx (source-file grep gate).
//   T7: UI-SPEC §8 has been reconciled to the shipped Phase 1 URL shape
//       (?bulk_review_focus=<uuid>) and the old /queue?email_label_id=
//       pattern is gone (OQ-1).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ModeBar, slotHref } from "../mode-bar";

afterEach(() => cleanup());

describe("ModeBar (Phase 2 Plan 02-06)", () => {
  it("T1: renders 3 slots Queue · History · Patterns in equal-thirds grid", () => {
    render(<ModeBar />);
    const bar = screen.getByTestId("mode-bar");
    expect(bar).toBeInTheDocument();
    expect(screen.getByTestId("mode-bar-slot-queue")).toBeInTheDocument();
    expect(screen.getByTestId("mode-bar-slot-history")).toBeInTheDocument();
    expect(screen.getByTestId("mode-bar-slot-patterns")).toBeInTheDocument();
    // 3-third grid layout
    expect(bar.style.gridTemplateColumns).toBe("1fr 1fr 1fr");
  });

  it("T2: Queue tab uses --v7-brand-primary fg + soft bg when active", () => {
    render(<ModeBar activeMode="queue" />);
    const queue = screen.getByTestId("mode-bar-slot-queue");
    expect(queue.style.color).toContain("--v7-brand-primary");
    // Active bg uses the soft variant.
    expect(queue.style.background).toContain("--v7-brand-primary-soft");
    expect(queue.getAttribute("aria-selected")).toBe("true");
    expect(queue.getAttribute("data-active")).toBe("true");
  });

  it("T3: History tab uses --v7-brand-secondary chrome, ACTIVE link (Phase 5 Plan 05-03 D-08)", () => {
    render(<ModeBar swarmType="debtor-email" />);
    const history = screen.getByTestId("mode-bar-slot-history");
    // Slate-blue chrome retained.
    expect(history.style.color).toContain("--v7-brand-secondary");
    // No longer disabled — flipped active in Phase 5.
    expect(history.style.opacity).toBe("1");
    expect(history.style.pointerEvents).toBe("auto");
    expect(history.getAttribute("data-disabled")).toBe("false");
    expect(history.getAttribute("aria-disabled")).toBeNull();
    // No "ships in Phase 5" tooltip.
    expect(history.getAttribute("title")).not.toBe("ships in Phase 5");
    // Rendered as a Next.js Link to the History route.
    expect(history.tagName.toLowerCase()).toBe("a");
    expect(history.getAttribute("href")).toBe(
      "/automations/debtor-email/history",
    );
  });

  it("T3b: slotHref('history', swarmType) returns the History route", () => {
    expect(slotHref("history", "debtor-email")).toBe(
      "/automations/debtor-email/history",
    );
  });

  it("T3c: History applies active-state chrome when activeMode='history'", () => {
    render(<ModeBar activeMode="history" swarmType="debtor-email" />);
    const history = screen.getByTestId("mode-bar-slot-history");
    expect(history.getAttribute("data-active")).toBe("true");
    expect(history.style.background).toContain("--v7-brand-secondary-soft");
  });

  it("T4: Patterns tab uses --v7-brand-patterns chrome, ACTIVE link (Phase 4 Plan 02 P4-D-12)", () => {
    render(<ModeBar swarmType="debtor-email" />);
    const patterns = screen.getByTestId("mode-bar-slot-patterns");
    expect(patterns.style.color).toContain("--v7-brand-patterns");
    expect(patterns.style.opacity).toBe("1");
    expect(patterns.style.pointerEvents).toBe("auto");
    expect(patterns.getAttribute("data-disabled")).toBe("false");
    // Active route flip: rendered as a Next.js Link with the patterns href.
    expect(patterns.tagName.toLowerCase()).toBe("a");
    expect(patterns.getAttribute("href")).toBe("/automations/debtor-email/patterns");
  });

  it("T4b: Patterns tab applies active-state chrome when activeMode='patterns'", () => {
    render(<ModeBar activeMode="patterns" swarmType="debtor-email" />);
    const patterns = screen.getByTestId("mode-bar-slot-patterns");
    expect(patterns.getAttribute("data-active")).toBe("true");
    expect(patterns.style.background).toContain("--v7-brand-patterns-soft");
  });

  it("T5: Queue is default-active when no activeMode prop is supplied", () => {
    render(<ModeBar />);
    const queue = screen.getByTestId("mode-bar-slot-queue");
    expect(queue.getAttribute("data-active")).toBe("true");
    // The other two are not active.
    expect(
      screen.getByTestId("mode-bar-slot-history").getAttribute("data-active"),
    ).toBe("false");
    expect(
      screen.getByTestId("mode-bar-slot-patterns").getAttribute("data-active"),
    ).toBe("false");
  });

  it("T6: ModeBar is mounted in client-shell.tsx", () => {
    const shellPath = resolve(
      __dirname,
      "../client-shell.tsx",
    );
    const source = readFileSync(shellPath, "utf8");
    // Accept a `ModeBar` named import with any number of additional type
    // imports (Phase 4 added `type ModeBarCounts`; Phase 5 Plan 05-03 added
    // `type ModeBarMode` for the activeMode prop). Match the ModeBar value
    // import + any trailing type imports up to the closing brace.
    expect(source).toMatch(/import\s+\{\s*ModeBar(?:\s*,\s*type\s+\w+)*\s*\}\s+from\s+["']\.\/mode-bar["']/);
    expect(source).toMatch(/<ModeBar/);
  });

  it("T6b: source file uses zero raw hex values (V7-token-only)", () => {
    const modeBarPath = resolve(__dirname, "../mode-bar.tsx");
    const source = readFileSync(modeBarPath, "utf8");
    // Strip block-comment regions to avoid false positives on references like
    // `#b886ff` mentioned in comments.
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "");
    // Match any 3-8 char hex literal that is preceded by `#`.
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  // T7 (UI-SPEC §8 ↔ ?bulk_review_focus reconciliation) was REMOVED. It read
  // .planning/workstreams/bulk-review-flow-ux/.planning/UI-SPEC.md by walking up
  // from cwd — a planning artifact deliberately excluded from the code-only PR
  // and from main, so it threw "UI-SPEC.md not found" on every CI run there. A
  // runtime unit test must not depend on filtered-out planning docs. The
  // UI-SPEC ↔ shipped-URL-shape reconciliation was a Phase 2 planning-time guard
  // and belongs in plan verification, not this suite.
});
