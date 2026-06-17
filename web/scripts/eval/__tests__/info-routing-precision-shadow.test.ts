/**
 * Phase 131 Plan 05 (ROUTE-08) — unit tests for the shadow precision harness.
 *
 * The match-rate is computed PURELY from a hand-built rows array (each row is a
 * router verdict bucket + the human-actual bucket, already mapped through
 * routing_destinations.outlook_category by main()). These tests import only the
 * exported IO-free pure functions (`computeMatchRate`, `gradeVerdict`); Supabase
 * is never touched.
 *
 * The critical assertion is the graded_n false-success guard (RESEARCH Pitfall
 * 6): with the delta-sync-on-info@ prerequisite absent (0/8000 categories), the
 * harness MUST refuse a pass/fail rather than report a misleading 100%.
 */

import { describe, it, expect } from "vitest";
import {
  computeMatchRate,
  gradeVerdict,
  MIN_GRADED_N,
  MATCH_RATE_GATE,
  type ShadowRow,
} from "../info-routing-precision-shadow";

describe("computeMatchRate — per-bucket + overall verdict-vs-human match-rate", () => {
  it("computes overall_match_pct over high-confidence verdicts (4/5 → 0.8)", () => {
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
      { verdict_bucket: "storingen", human_category: "storingen", confidence: "high" },
      { verdict_bucket: "inspecties", human_category: "inspecties", confidence: "high" },
      { verdict_bucket: "verkoop", human_category: "storingen", confidence: "high" }, // miss
    ];
    const r = computeMatchRate(rows);
    expect(r.graded_n).toBe(5);
    expect(r.ungraded_n).toBe(0);
    expect(r.overall_match_pct).toBeCloseTo(0.8, 5);
  });

  it("reports a correct per-bucket breakdown keyed off the verdict bucket", () => {
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
      { verdict_bucket: "verkoop", human_category: "storingen", confidence: "high" }, // miss
      { verdict_bucket: "storingen", human_category: "storingen", confidence: "high" },
    ];
    const r = computeMatchRate(rows);
    const verkoop = r.per_bucket.find((b) => b.bucket === "verkoop")!;
    const storingen = r.per_bucket.find((b) => b.bucket === "storingen")!;
    expect(verkoop.n).toBe(2);
    expect(verkoop.match_pct).toBeCloseTo(0.5, 5);
    expect(storingen.n).toBe(1);
    expect(storingen.match_pct).toBeCloseTo(1.0, 5);
    // per_bucket is sorted by bucket name for stable output.
    expect(r.per_bucket.map((b) => b.bucket)).toEqual(["storingen", "verkoop"]);
  });

  it("counts a null human_category as ungraded — NOT a match and NOT a miss", () => {
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
      { verdict_bucket: "storingen", human_category: null, confidence: "high" },
      { verdict_bucket: "inspecties", human_category: null, confidence: "high" },
    ];
    const r = computeMatchRate(rows);
    expect(r.graded_n).toBe(1);
    expect(r.ungraded_n).toBe(2);
    // overall is 1/1 graded = 1.0 — the two nulls do NOT drag it down as misses.
    expect(r.overall_match_pct).toBeCloseTo(1.0, 5);
    // ungraded rows do not appear as graded per-bucket entries.
    expect(r.per_bucket.find((b) => b.bucket === "storingen")).toBeUndefined();
    expect(r.per_bucket.find((b) => b.bucket === "inspecties")).toBeUndefined();
  });

  it("includes ONLY high-confidence verdicts (low/medium excluded)", () => {
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
      { verdict_bucket: "storingen", human_category: "verkoop", confidence: "low" }, // excluded
      { verdict_bucket: "inspecties", human_category: "verkoop", confidence: "medium" }, // excluded
    ];
    const r = computeMatchRate(rows);
    // Only the single high-confidence row is graded.
    expect(r.graded_n).toBe(1);
    expect(r.ungraded_n).toBe(0);
    expect(r.overall_match_pct).toBeCloseTo(1.0, 5);
    expect(r.per_bucket.map((b) => b.bucket)).toEqual(["verkoop"]);
  });

  it("returns a 0-sample, 0-pct result for empty input (no NaN)", () => {
    const r = computeMatchRate([]);
    expect(r.graded_n).toBe(0);
    expect(r.ungraded_n).toBe(0);
    expect(r.overall_match_pct).toBe(0);
    expect(r.per_bucket).toEqual([]);
  });
});

describe("gradeVerdict — the graded_n false-success guard + ≥0.85 gate", () => {
  it("REFUSES a verdict when graded_n is below MIN (the false-100% trap)", () => {
    // Every graded row matches → naive overall is 1.0, but graded_n is tiny.
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high" },
    ];
    const stats = computeMatchRate(rows);
    expect(stats.overall_match_pct).toBeCloseTo(1.0, 5);
    const g = gradeVerdict(stats);
    expect(g.status).toBe("insufficient_sample");
    expect(g.pass).toBeNull();
    expect(g.graded_n).toBeLessThan(MIN_GRADED_N);
  });

  it("REFUSES a verdict at graded_n=0 (today's 0/8000 prerequisite-absent state)", () => {
    const rows: ShadowRow[] = [
      { verdict_bucket: "verkoop", human_category: null, confidence: "high" },
      { verdict_bucket: "storingen", human_category: null, confidence: "high" },
    ];
    const stats = computeMatchRate(rows);
    expect(stats.graded_n).toBe(0);
    const g = gradeVerdict(stats);
    expect(g.status).toBe("insufficient_sample");
    expect(g.pass).toBeNull();
  });

  it("emits a PASS when graded_n ≥ MIN and overall ≥ the 0.85 gate", () => {
    const rows: ShadowRow[] = Array.from({ length: MIN_GRADED_N }, (_, i) => ({
      verdict_bucket: "verkoop",
      // 90% match: every 10th row is a miss.
      human_category: i % 10 === 0 ? "storingen" : "verkoop",
      confidence: "high" as const,
    }));
    const stats = computeMatchRate(rows);
    expect(stats.graded_n).toBe(MIN_GRADED_N);
    expect(stats.overall_match_pct).toBeGreaterThanOrEqual(MATCH_RATE_GATE);
    const g = gradeVerdict(stats);
    expect(g.status).toBe("graded");
    expect(g.pass).toBe(true);
  });

  it("emits a FAIL when graded_n ≥ MIN but overall is below the 0.85 gate", () => {
    const rows: ShadowRow[] = Array.from({ length: MIN_GRADED_N }, (_, i) => ({
      verdict_bucket: "verkoop",
      // 50% match — well below 0.85.
      human_category: i % 2 === 0 ? "storingen" : "verkoop",
      confidence: "high" as const,
    }));
    const stats = computeMatchRate(rows);
    expect(stats.graded_n).toBe(MIN_GRADED_N);
    expect(stats.overall_match_pct).toBeLessThan(MATCH_RATE_GATE);
    const g = gradeVerdict(stats);
    expect(g.status).toBe("graded");
    expect(g.pass).toBe(false);
  });
});
