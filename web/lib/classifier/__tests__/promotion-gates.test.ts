// Phase 60-00 (D-02, D-03). Pure-function promotion/demotion gates.
// Gate values updated in 60-08: promote 0.95 -> 0.92, demote 0.92 -> 0.88.

import { describe, it, expect } from "vitest";
import {
  shouldPromote,
  shouldDemote,
  PROMOTE_N_MIN,
  PROMOTE_CI_LO_MIN,
  DEMOTE_CI_LO_MAX,
} from "../wilson";

describe("D-02: shouldPromote requires N>=30 AND ci_lo>=0.92", () => {
  it("rejects N<30 even with perfect ci_lo", () => {
    expect(shouldPromote(29, 0.99)).toBe(false);
  });

  it("rejects ci_lo<0.92 even with large N", () => {
    expect(shouldPromote(500, 0.919)).toBe(false);
  });

  it("accepts at the exact threshold (N=30, ci_lo=0.92)", () => {
    expect(shouldPromote(PROMOTE_N_MIN, PROMOTE_CI_LO_MIN)).toBe(true);
  });

  it("accepts comfortably above threshold", () => {
    expect(shouldPromote(169, 0.978)).toBe(true);
  });

  it("rejects just below ci_lo threshold even at exact N min", () => {
    expect(shouldPromote(30, 0.919)).toBe(false);
  });

  it("rejects high N with sub-threshold ci_lo", () => {
    expect(shouldPromote(1000, 0.87)).toBe(false);
  });
});

describe("D-03: shouldDemote fires below 0.88 (4pp hysteresis gap)", () => {
  it("does NOT demote at exactly 0.88", () => {
    expect(shouldDemote(DEMOTE_CI_LO_MAX)).toBe(false);
  });

  it("does NOT demote in the 0.88-0.92 hysteresis band", () => {
    expect(shouldDemote(0.9)).toBe(false);
  });

  it("demotes below 0.88", () => {
    expect(shouldDemote(0.879)).toBe(true);
    expect(shouldDemote(0.85)).toBe(true);
    expect(shouldDemote(0.5)).toBe(true);
  });

  it("does NOT demote at near-perfect ci_lo", () => {
    expect(shouldDemote(0.999)).toBe(false);
  });
});

describe("D-02 + D-03: 4pp hysteresis gap prevents flap-demotion", () => {
  it("a rule promoted at ci_lo=0.92 will not flap-demote until ci_lo<0.88", () => {
    // Step 1: rule clears the promotion gate.
    expect(shouldPromote(30, 0.92)).toBe(true);
    // Step 2: ci_lo dips into the hysteresis band -- no demotion yet.
    expect(shouldDemote(0.9)).toBe(false);
    // Step 3: ci_lo finally drops below the demote floor -- now we demote.
    expect(shouldDemote(0.87)).toBe(true);
  });
});
