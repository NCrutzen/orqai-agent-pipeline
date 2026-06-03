// Phase 3 Plan 02 Task 1 — RerunPulseBadge tests.
//
// Covers behaviors 4-5 from the plan:
//   4. Renders an animated element with CSS animation duration 0.6s (only
//      timing literal in the badge's CSS module).
//   5. Uses var(--amber); no raw hex.

import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, cleanup } from "@testing-library/react";

import { RerunPulseBadge } from "../rerun-pulse-badge";

afterEach(() => cleanup());

const CSS_PATH = join(__dirname, "..", "rerun-pulse-badge.module.css");
const CSS_SRC = readFileSync(CSS_PATH, "utf8");
const TSX_PATH = join(__dirname, "..", "rerun-pulse-badge.tsx");
const TSX_SRC = readFileSync(TSX_PATH, "utf8");

describe("RerunPulseBadge", () => {
  it("Test 4: CSS animation duration is exactly 0.6s; no other animation timings", () => {
    // Animation duration appears in the CSS literally.
    expect(CSS_SRC).toMatch(/animation:[^;]*0\.6s/);
    // No other 0.<digit>s animation durations (allowed timings are 0.12s /
    // 0.15s / 0.6s; the badge module must use only 0.6s).
    const allTimings = CSS_SRC.match(/\b0\.\d+s\b/g) ?? [];
    for (const t of allTimings) {
      expect(t).toBe("0.6s");
    }
  });

  it("Test 5: no raw hex in tsx or module CSS; uses var(--amber)", () => {
    expect(CSS_SRC).toMatch(/var\(--amber/);
    expect(CSS_SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(TSX_SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("renders an aria-hidden span with the badge class", () => {
    render(<RerunPulseBadge />);
    const el = screen.getByTestId("rerun-pulse-badge");
    expect(el).toBeInTheDocument();
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className).toMatch(/badge/);
  });

  it("custom testId is honored", () => {
    render(<RerunPulseBadge testId="custom-pulse" />);
    expect(screen.getByTestId("custom-pulse")).toBeInTheDocument();
  });
});
