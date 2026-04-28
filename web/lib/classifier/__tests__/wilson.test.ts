// Phase 60-00 (D-02). Pin wilsonCiLower against route.ts:24-32 empirical CI-lo.

import { describe, it, expect } from "vitest";
import { wilsonCiLower } from "../wilson";

describe("D-02: wilsonCiLower matches route.ts:24-32 empirical values", () => {
  it("returns 0 when n === 0", () => {
    expect(wilsonCiLower(0, 0)).toBe(0);
  });

  it("subject_paid_marker N=169 k=169 -> ~0.978", () => {
    expect(wilsonCiLower(169, 169)).toBeCloseTo(0.978, 3);
  });

  it("payment_subject N=151 k=151 -> ~0.975", () => {
    // RESEARCH lines 339: N=151,k=151 ~= 0.976; computed precisely 0.9752.
    expect(wilsonCiLower(151, 151)).toBeCloseTo(0.975, 3);
  });

  it("payment_sender+subject N=79 k=79 -> ~0.954", () => {
    expect(wilsonCiLower(79, 79)).toBeCloseTo(0.954, 3);
  });

  it("crosses promotion gate edge: N=30 k=30 (perfect) -> below 0.95", () => {
    // N=30 k=30 -> ~0.886; demonstrates that at N=30 you need substantially more
    // than 28 successes to clear the 0.95 gate. The gate's purpose.
    expect(wilsonCiLower(30, 30)).toBeCloseTo(0.886, 3);
  });

  it("N=30 k=28 -> below 0.95 (gate edge)", () => {
    expect(wilsonCiLower(30, 28)).toBeCloseTo(0.787, 3);
  });
});
