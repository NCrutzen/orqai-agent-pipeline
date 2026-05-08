// Phase 64-01 Task 2 (RED). BUDG-01 — per-run budget ceiling logic.
// Constants pinned to values from .planning/phases/64-stage-0-.../64-01-PROBES.md
// (updated by Phase 999.7 D-02):
//   BUDGET_CEILING_CENTS = 15
//   BUDGET_CEILING_TOKENS = 16000
// Module under test does NOT exist yet; Plan 02 ships it. RED state by design.
// Phase 999.7 Wave 0 (RED). D-02 bump — RED until Plan 02 bumps source constant.

import { describe, it, expect } from "vitest";
import {
  check,
  BUDGET_CEILING_CENTS,
  BUDGET_CEILING_TOKENS,
} from "../budget-counter";

describe("BUDG-01: check returns not-breached for empty state", () => {
  it("returns { breached: false } when cost=0 and tokens=0", () => {
    const result = check({ cost_cents: 0, token_count: 0 });
    expect(result.breached).toBe(false);
  });
});

describe("BUDG-01: check breaches when cost exceeds ceiling", () => {
  it("returns breached:true with reason mentioning cost_cents when cost > ceiling", () => {
    const result = check({
      cost_cents: BUDGET_CEILING_CENTS + 1,
      token_count: 0,
    });
    expect(result.breached).toBe(true);
    expect(result.reason).toMatch(/cost_cents/);
  });
});

describe("BUDG-01: check breaches when tokens exceed ceiling", () => {
  it("returns breached:true with reason mentioning token_count when tokens > ceiling", () => {
    const result = check({
      cost_cents: 0,
      token_count: BUDGET_CEILING_TOKENS + 1,
    });
    expect(result.breached).toBe(true);
    expect(result.reason).toMatch(/token_count/);
  });
});

describe("BUDG-01: check is strict greater-than (boundary)", () => {
  it("returns breached:false at the exact ceiling values (RESEARCH Pattern 4 — strict >)", () => {
    const result = check({
      cost_cents: BUDGET_CEILING_CENTS,
      token_count: BUDGET_CEILING_TOKENS,
    });
    expect(result.breached).toBe(false);
  });
});

describe("BUDG-01: exported constants match PROBES.md pinned values", () => {
  it("BUDGET_CEILING_CENTS equals 15 (D-16 default; bootstrap caveat per PROBES.md)", () => {
    expect(BUDGET_CEILING_CENTS).toBe(15);
  });

  it("BUDGET_CEILING_TOKENS equals 16000 (Phase 999.7 D-02 — long-email guard, was 5000 in Phase 64 D-14)", () => {
    expect(BUDGET_CEILING_TOKENS).toBe(16000);
  });
});
