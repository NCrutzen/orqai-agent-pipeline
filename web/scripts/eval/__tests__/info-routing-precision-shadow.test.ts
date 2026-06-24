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
  COORDINATOR_RUNS_SELECT,
  mapRowToShadow,
  buildCategoryToBucket,
  computePerMailboxStats,
  type ShadowRow,
  type RoutingDestinationLike,
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

// BUG 3 (WR-05) — the report-mode query selected `human_outlook_category`, which
// is NOT a column on coordinator_runs. Postgres throws "column does not exist" in
// report mode BEFORE the graded_n false-success guard can return
// insufficient_sample. The human-actual category source is not yet wired, so the
// select must reference only real columns and every row maps to a null human
// category (→ graded_n=0 → insufficient_sample, the intended behavior today).
describe("BUG 3 (WR-05): report-mode query selects only real columns", () => {
  it("COORDINATOR_RUNS_SELECT does NOT reference the non-existent human_outlook_category column", () => {
    expect(COORDINATOR_RUNS_SELECT).not.toContain("human_outlook_category");
    expect(COORDINATOR_RUNS_SELECT).toContain("decision_details");
  });

  it("mapRowToShadow treats a row with no captured human correction as ungraded (human_category=null)", () => {
    const rows = mapRowToShadow(
      [
        {
          email_id: "e-1",
          source_mailbox: "info@smeba.nl",
          decision_details: {
            routing: { bucket: "verkoop", confidence: "high" },
          },
        },
      ],
      new Map(), // categoryToBucket
      new Map(), // humanCategoryByEmailId — no correction captured
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].verdict_bucket).toBe("verkoop");
    expect(rows[0].confidence).toBe("high");
    expect(rows[0].source_mailbox).toBe("info@smeba.nl");
    expect(rows[0].human_category).toBeNull();
  });

  it("mapRowToShadow drops rows missing a verdict bucket or confidence", () => {
    const rows = mapRowToShadow(
      [
        {
          email_id: "e-1",
          source_mailbox: "info@smeba.nl",
          decision_details: { routing: { bucket: "verkoop" } }, // no confidence
        },
        {
          email_id: "e-2",
          source_mailbox: "info@smeba.nl",
          decision_details: null, // no routing
        },
      ],
      new Map(),
      new Map(),
    );
    expect(rows).toEqual([]);
  });
});

// ─── Plan 04 Task 1 (ROUTE-08 / D-01) — human_category wired from the 112.5
// delta-synced operator correction, mapped to a bucket via categoryToBucket.
// The gate logic (computeMatchRate/gradeVerdict + MIN/GATE) stays byte-unchanged.
describe("Plan 04: human_category wired from the operator correction", () => {
  const destinations: RoutingDestinationLike[] = [
    { destination_key: "verkoop", brand: "smeba", outlook_category: "Verkoop" },
    { destination_key: "verkoop", brand: "fire-control", outlook_category: "Verkoop" },
    { destination_key: "storingen", brand: "smeba", outlook_category: "Storingen" },
    { destination_key: "unrouted", brand: "smeba", outlook_category: null },
  ];

  it("buildCategoryToBucket maps the master outlook_category → bucket (and skips null)", () => {
    const m = buildCategoryToBucket(destinations);
    expect(m.get("Verkoop")).toBe("verkoop");
    expect(m.get("Storingen")).toBe("storingen");
    // the unrouted sentinel has a null outlook_category → no entry.
    expect([...m.values()]).not.toContain("unrouted");
  });

  it("buildCategoryToBucket ALSO recognises the AI routing-label vocabulary → bucket", () => {
    const m = buildCategoryToBucket(destinations);
    // The held stamp (Plan 01) the operator corrects is `AI: held → <bucket>`;
    // a corrected/forwarded label is `AI: routed → <bucket>`. Both resolve to the
    // bucket so the captured category maps whether the operator applied a master
    // colour category OR edited the AI routing label.
    expect(m.get("AI: routed → verkoop")).toBe("verkoop");
    expect(m.get("AI: held → storingen")).toBe("storingen");
  });

  it("resolves human_category to the bucket when an operator correction is captured", () => {
    const categoryToBucket = buildCategoryToBucket(destinations);
    const humanCategoryByEmailId = new Map<string, string>([
      ["e-1", "Verkoop"], // operator applied the master routing colour category
      ["e-2", "AI: routed → storingen"], // operator edited the AI routing label
    ]);
    const rows = mapRowToShadow(
      [
        {
          email_id: "e-1",
          source_mailbox: "info@smeba.nl",
          decision_details: { routing: { bucket: "verkoop", confidence: "high" } },
        },
        {
          email_id: "e-2",
          source_mailbox: "info@fire-control.nl",
          decision_details: { routing: { bucket: "verkoop", confidence: "high" } },
        },
      ],
      categoryToBucket,
      humanCategoryByEmailId,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].human_category).toBe("verkoop"); // matches verdict → match
    expect(rows[1].human_category).toBe("storingen"); // differs from verdict → miss
  });

  it("a captured category that maps to NO bucket → human_category null (ungraded)", () => {
    const categoryToBucket = buildCategoryToBucket(destinations);
    const humanCategoryByEmailId = new Map<string, string>([
      ["e-1", "Belangrijk"], // a user category that is not a routing destination
    ]);
    const rows = mapRowToShadow(
      [
        {
          email_id: "e-1",
          source_mailbox: "info@smeba.nl",
          decision_details: { routing: { bucket: "verkoop", confidence: "high" } },
        },
      ],
      categoryToBucket,
      humanCategoryByEmailId,
    );
    expect(rows[0].human_category).toBeNull();
  });

  it("MIN_GRADED_N and MATCH_RATE_GATE are unchanged (false-success guard intact)", () => {
    expect(MIN_GRADED_N).toBe(50);
    expect(MATCH_RATE_GATE).toBe(0.85);
  });
});

// ─── Plan 04 Task 1 — per-mailbox grouping so Task 2's auto-flip reads a
// per-mailbox graded/pass status (precision is measured PER MAILBOX, not swarm-wide).
describe("computePerMailboxStats — per-mailbox graded verdict (for the auto-flip)", () => {
  it("groups rows by source_mailbox and grades each mailbox independently", () => {
    const rows: ShadowRow[] = [
      // smeba: 1 graded row (insufficient on its own)
      { verdict_bucket: "verkoop", human_category: "verkoop", confidence: "high", source_mailbox: "info@smeba.nl" },
      // fire-control: 1 graded row
      { verdict_bucket: "storingen", human_category: "verkoop", confidence: "high", source_mailbox: "info@fire-control.nl" },
    ];
    const byMailbox = computePerMailboxStats(rows);
    expect(byMailbox.has("info@smeba.nl")).toBe(true);
    expect(byMailbox.has("info@fire-control.nl")).toBe(true);
    // Each mailbox graded in isolation — small samples → insufficient_sample.
    expect(byMailbox.get("info@smeba.nl")!.verdict.status).toBe("insufficient_sample");
    expect(byMailbox.get("info@fire-control.nl")!.verdict.status).toBe("insufficient_sample");
    // The smeba row matched; the fire-control row missed — independent stats.
    expect(byMailbox.get("info@smeba.nl")!.stats.overall_match_pct).toBeCloseTo(1.0, 5);
    expect(byMailbox.get("info@fire-control.nl")!.stats.overall_match_pct).toBeCloseTo(0.0, 5);
  });

  it("a mailbox with ≥MIN graded rows at ≥0.85 grades to a passing verdict", () => {
    const rows: ShadowRow[] = Array.from({ length: MIN_GRADED_N }, (_, i) => ({
      verdict_bucket: "verkoop",
      human_category: i % 10 === 0 ? "storingen" : "verkoop", // 90% match
      confidence: "high" as const,
      source_mailbox: "info@smeba.nl",
    }));
    const byMailbox = computePerMailboxStats(rows);
    const smeba = byMailbox.get("info@smeba.nl")!;
    expect(smeba.verdict.status).toBe("graded");
    expect(smeba.verdict.pass).toBe(true);
    expect(smeba.stats.graded_n).toBe(MIN_GRADED_N);
  });
});
