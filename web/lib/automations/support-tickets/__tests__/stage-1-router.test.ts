// Plan 01-02 Task 1 — stage-1-router.ts behavior tests.
// ROUTE-01: deterministic switch on user_chosen_type → decision + branch_target.
// ROUTE-02: p99 < 50ms; we assert max < 5ms across 1000 iterations for headroom.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runStage1Router } from "../stage-1-router";
import { USER_CHOSEN_TYPES } from "../types";

describe("runStage1Router", () => {
  it("maps 'bug' → { decision:'route_bug', branch_target:'bug' }", () => {
    const r = runStage1Router({ user_chosen_type: "bug" });
    expect(r.decision).toBe("route_bug");
    expect(r.branch_target).toBe("bug");
    expect(typeof r.duration_ms).toBe("number");
  });

  it("maps all 5 valid user_chosen_type values to a corresponding decision key", () => {
    for (const t of USER_CHOSEN_TYPES) {
      const r = runStage1Router({ user_chosen_type: t });
      expect(r.decision).toBe(`route_${t}`);
      expect(r.branch_target).toBe(t);
    }
  });

  it("throws RangeError on an unknown user_chosen_type (defense-in-depth)", () => {
    // @ts-expect-error — intentionally violating the type to exercise runtime guard
    expect(() => runStage1Router({ user_chosen_type: "nonsense" })).toThrow(
      RangeError,
    );
  });

  it("has max duration_ms < 5ms across 1000 iterations (ROUTE-02 p99 headroom)", () => {
    let maxMs = 0;
    for (let i = 0; i < 1000; i++) {
      const r = runStage1Router({ user_chosen_type: "bug" });
      if (r.duration_ms > maxMs) maxMs = r.duration_ms;
    }
    expect(maxMs).toBeLessThan(5);
  });

  it("imports zero LLM / fetch / DB modules (Phase 1 invariant — greppable)", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "stage-1-router.ts"),
      "utf8",
    );
    // Strip line comments + block comments so the docstring's mention of
    // "ZERO LLM" doesn't match.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(stripped).not.toMatch(/openai/i);
    expect(stripped).not.toMatch(/anthropic/i);
    expect(stripped).not.toMatch(/\borq\b/i);
    expect(stripped).not.toMatch(/\bfetch\s*\(/);
  });
});
