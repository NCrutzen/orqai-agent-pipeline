import { describe, it, expect } from "vitest";
import {
  wilsonLowerBound,
  gradeBucketsByWilson,
  computeBucketCoverage,
  resolveObservedBucket,
  FORWARD_WILSON_GATE,
  FORWARD_COVERAGE_GATE,
  MIN_OBSERVED_N,
  type ForwardObservation,
} from "../forward-wilson";

describe("wilsonLowerBound", () => {
  it("returns 0 for n=0 (no evidence)", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
  });

  it("stays conservative on a tiny perfect sample (1/1 ≪ 1.0)", () => {
    const lb = wilsonLowerBound(1, 1);
    expect(lb).toBeGreaterThan(0);
    expect(lb).toBeLessThan(0.5); // 1/1 must NOT clear a 0.85 gate
  });

  it("rises toward p̂ as n grows", () => {
    const small = wilsonLowerBound(9, 10); // 90%
    const large = wilsonLowerBound(90, 100); // 90%
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThan(0.9);
    expect(large).toBeGreaterThan(0.8);
  });

  it("clamps to [0,1]", () => {
    expect(wilsonLowerBound(100, 100)).toBeLessThanOrEqual(1);
    expect(wilsonLowerBound(0, 100)).toBeGreaterThanOrEqual(0);
  });
});

describe("gradeBucketsByWilson", () => {
  const mk = (
    predicted: string,
    observed: string | null,
    n: number,
  ): ForwardObservation[] =>
    Array.from({ length: n }, () => ({
      predicted_bucket: predicted,
      observed_bucket: observed,
      source_mailbox: "info@smeba.nl",
    }));

  it("passes a bucket with a large, high-agreement sample", () => {
    const obs = [...mk("verkoop", "verkoop", 48), ...mk("verkoop", "inspecties", 2)];
    const g = gradeBucketsByWilson(obs).get("verkoop")!;
    expect(g.n).toBe(50);
    expect(g.agree).toBe(48);
    expect(g.pass).toBe(true);
    expect(g.wilson_lower).toBeGreaterThanOrEqual(FORWARD_WILSON_GATE);
  });

  it("does NOT pass below MIN_OBSERVED_N even at 100% agreement", () => {
    const obs = mk("storingen", "storingen", MIN_OBSERVED_N - 1);
    const g = gradeBucketsByWilson(obs).get("storingen")!;
    expect(g.observed_rate).toBe(1);
    expect(g.pass).toBe(false);
  });

  it("does NOT pass when agreement is too low even with a big sample", () => {
    const obs = [...mk("verkoop", "verkoop", 30), ...mk("verkoop", "inspecties", 20)];
    const g = gradeBucketsByWilson(obs).get("verkoop")!;
    expect(g.pass).toBe(false); // 60% ≪ 0.85 lower bound
  });

  it("excludes ungraded (observed_bucket=null) rows from n", () => {
    const obs = [...mk("verkoop", "verkoop", 25), ...mk("verkoop", null, 100)];
    const g = gradeBucketsByWilson(obs).get("verkoop")!;
    expect(g.n).toBe(25); // the 100 non-routing forwards never count
  });
});

describe("resolveObservedBucket", () => {
  const destinations = [
    { destination_key: "verkoop", brand: "smeba", target_mailbox: "verkoop@smeba.nl", outlook_category: "Verkoop" },
    { destination_key: "inspecties", brand: "smeba", target_mailbox: "planning@smeba.nl", outlook_category: "Inspecties" },
    { destination_key: "unrouted", brand: null, target_mailbox: null, outlook_category: null },
  ];

  it("maps a known target mailbox to its bucket (case-insensitive)", () => {
    expect(resolveObservedBucket("Verkoop@Smeba.NL", destinations)).toBe("verkoop");
    expect(resolveObservedBucket("planning@smeba.nl", destinations)).toBe("inspecties");
  });

  it("returns null for a personal/external address (ungraded)", () => {
    expect(resolveObservedBucket("jan.devries@smeba.nl", destinations)).toBeNull();
    expect(resolveObservedBucket("", destinations)).toBeNull();
    expect(resolveObservedBucket(null, destinations)).toBeNull();
  });

  it("never matches the null-target unrouted sentinel", () => {
    expect(resolveObservedBucket("", destinations)).toBeNull();
  });
});

describe("computeBucketCoverage (D-05 — distinct denominators, Pitfall 3)", () => {
  const mk = (
    predicted: string,
    observed: string | null,
    n: number,
  ): ForwardObservation[] =>
    Array.from({ length: n }, () => ({
      predicted_bucket: predicted,
      observed_bucket: observed,
      source_mailbox: "info@smeba.nl",
    }));

  it("coverage = graded / TOTAL incl. nulls (25 total, 12 graded → 0.48)", () => {
    const obs = [...mk("storingen", "storingen", 12), ...mk("storingen", null, 13)];
    const c = computeBucketCoverage(obs).get("storingen")!;
    expect(c.total).toBe(25);
    expect(c.graded).toBe(12);
    expect(c.coverage).toBeCloseTo(0.48, 10);
  });

  it("coverage = 1.0 when all observations are graded (20 total, 20 graded)", () => {
    const obs = mk("verkoop", "verkoop", 20);
    const c = computeBucketCoverage(obs).get("verkoop")!;
    expect(c.total).toBe(20);
    expect(c.graded).toBe(20);
    expect(c.coverage).toBe(1);
  });

  it("a bucket with 0 observations is simply absent (never coverage NaN)", () => {
    const m = computeBucketCoverage([]);
    expect(m.has("anything")).toBe(false);
    expect(m.size).toBe(0);
    for (const v of m.values()) expect(Number.isNaN(v.coverage)).toBe(false);
  });

  it("exposes FORWARD_COVERAGE_GATE = 0.70", () => {
    expect(FORWARD_COVERAGE_GATE).toBe(0.7);
  });
});
