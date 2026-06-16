/**
 * Phase 130 Plan 05 Task 3 — unit tests for the re-scoped NOISE-03 baseline.
 *
 * The metric is now computed PURELY from the info_unknown_pool_composition view
 * distribution — ZERO human labelling, no sampling, no Wilson CI. These tests
 * import only the exported pure function `computeUnknownShare`; IO (Supabase) is
 * never touched.
 */

import { describe, it, expect } from "vitest";
import {
  computeUnknownShare,
  type CompositionRow,
} from "../info-unknown-pool-noise-baseline";

describe("computeUnknownShare — per-mailbox unknown-share from the view", () => {
  it("reports per-mailbox unknown_pct, unknown_n and total_n", () => {
    const rows: CompositionRow[] = [
      { mailbox_entity: "smeba", decision: "unknown", n: 60, pct: 60 },
      { mailbox_entity: "smeba", decision: "cold_sales_outreach", n: 30, pct: 30 },
      { mailbox_entity: "smeba", decision: "payment_admittance", n: 10, pct: 10 },
    ];
    const [s] = computeUnknownShare(rows);
    expect(s.mailbox_entity).toBe("smeba");
    expect(s.unknown_pct).toBe(60);
    expect(s.unknown_n).toBe(60);
    expect(s.total_n).toBe(100);
  });

  it("aggregates the six info-routing noise classes into noise_class_pct", () => {
    const rows: CompositionRow[] = [
      { mailbox_entity: "smeba", decision: "unknown", n: 40, pct: 40 },
      { mailbox_entity: "smeba", decision: "cold_sales_outreach", n: 20, pct: 20 },
      { mailbox_entity: "smeba", decision: "marketing_newsletter", n: 15, pct: 15 },
      { mailbox_entity: "smeba", decision: "auto_dealer_spam", n: 25, pct: 25 },
    ];
    const [s] = computeUnknownShare(rows);
    // 20 + 15 + 25 = 60 (payment_admittance / non-noise-class excluded).
    expect(s.noise_class_pct).toBe(60);
  });

  it("splits multiple mailboxes and sorts them", () => {
    const rows: CompositionRow[] = [
      { mailbox_entity: "smeba", decision: "unknown", n: 50, pct: 50 },
      { mailbox_entity: "smeba", decision: "cold_sales_outreach", n: 50, pct: 50 },
      { mailbox_entity: "fire-control", decision: "unknown", n: 80, pct: 80 },
      { mailbox_entity: "fire-control", decision: "marketing_newsletter", n: 20, pct: 20 },
    ];
    const out = computeUnknownShare(rows);
    expect(out.map((s) => s.mailbox_entity)).toEqual(["fire-control", "smeba"]);
    expect(out[0].unknown_pct).toBe(80);
    expect(out[1].unknown_pct).toBe(50);
  });

  it("groups a null mailbox under (null) and defaults missing unknown to 0", () => {
    const rows: CompositionRow[] = [
      { mailbox_entity: null, decision: "cold_sales_outreach", n: 10, pct: 100 },
    ];
    const [s] = computeUnknownShare(rows);
    expect(s.mailbox_entity).toBe("(null)");
    expect(s.unknown_pct).toBe(0);
    expect(s.unknown_n).toBe(0);
    expect(s.total_n).toBe(10);
  });

  it("returns an empty array for empty input", () => {
    expect(computeUnknownShare([])).toEqual([]);
  });
});
