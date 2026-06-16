/**
 * Phase 130 Plan 03 Task 3 — unit tests for the PURE half of the NOISE-03
 * baseline script (sampling + fraction+Wilson-CI). IO (Supabase, fs) is never
 * touched here — these import only the exported pure functions, proving the
 * pure/IO split required by the plan's acceptance criteria.
 */

import { describe, it, expect } from "vitest";
import {
  mulberry32,
  samplePerMailbox,
  computeNoiseFractions,
  compareFractions,
  parseLabelledRows,
  type SampleCandidate,
  type LabelledRow,
} from "../info-unknown-pool-noise-baseline";

function candidate(id: string, mailbox: string): SampleCandidate {
  return { id, mailbox_entity: mailbox, subject: id, sender: null, snippet: null };
}

describe("mulberry32 — deterministic PRNG", () => {
  it("same seed → same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("different seed → different sequence", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });
});

describe("samplePerMailbox", () => {
  const pool: SampleCandidate[] = [
    ...Array.from({ length: 10 }, (_, i) => candidate(`s${i}`, "smeba")),
    ...Array.from({ length: 5 }, (_, i) => candidate(`f${i}`, "fire-control")),
  ];

  it("samples up to n per mailbox, capped at group size", () => {
    const out = samplePerMailbox(pool, 4, 130);
    expect(out["smeba"]).toHaveLength(4);
    expect(out["fire-control"]).toHaveLength(4);
  });

  it("caps at pool size when n exceeds it", () => {
    const out = samplePerMailbox(pool, 100, 130);
    expect(out["smeba"]).toHaveLength(10);
    expect(out["fire-control"]).toHaveLength(5);
  });

  it("is deterministic for a fixed seed (same draw on re-run)", () => {
    const a = samplePerMailbox(pool, 3, 7);
    const b = samplePerMailbox(pool, 3, 7);
    expect(a["smeba"].map((c) => c.id)).toEqual(b["smeba"].map((c) => c.id));
  });

  it("groups null mailbox under (null)", () => {
    const out = samplePerMailbox(
      [{ id: "x", mailbox_entity: null, subject: null, sender: null, snippet: null }],
      5,
      1,
    );
    expect(out["(null)"]).toHaveLength(1);
  });
});

describe("computeNoiseFractions — per-mailbox fraction + Wilson CI", () => {
  it("computes noise fraction and CI lower bound per mailbox", () => {
    const rows: LabelledRow[] = [
      ...Array.from({ length: 30 }, (_, i): LabelledRow => ({
        id: `s${i}`,
        mailbox_entity: "smeba",
        label: i < 15 ? "noise" : "routable",
      })),
    ];
    const [f] = computeNoiseFractions(rows);
    expect(f.mailbox_entity).toBe("smeba");
    expect(f.n).toBe(30);
    expect(f.noise).toBe(15);
    expect(f.routable).toBe(15);
    expect(f.noise_fraction).toBeCloseTo(0.5, 5);
    expect(f.wilson_ci_lo).toBeGreaterThan(0);
    expect(f.wilson_ci_lo).toBeLessThan(0.5);
    // WR-02 part B: wilson_ci_hi present, >= lo, and (15/30 case) in (0.5, 1)
    // and strictly above the point estimate.
    expect(f.wilson_ci_hi).toBeGreaterThanOrEqual(f.wilson_ci_lo);
    expect(f.wilson_ci_hi).toBeGreaterThan(f.noise_fraction);
    expect(f.wilson_ci_hi).toBeGreaterThan(0.5);
    expect(f.wilson_ci_hi).toBeLessThan(1);
    expect(f.under_min_n).toBe(false);
  });

  it("flags under_min_n when sample below promotion minimum (30)", () => {
    const rows: LabelledRow[] = [
      { id: "a", mailbox_entity: "fire-control", label: "noise" },
      { id: "b", mailbox_entity: "fire-control", label: "routable" },
    ];
    const [f] = computeNoiseFractions(rows);
    expect(f.under_min_n).toBe(true);
  });
});

describe("compareFractions — BEFORE vs AFTER delta", () => {
  it("computes positive delta when noise share drops", () => {
    const before = computeNoiseFractions(
      Array.from({ length: 10 }, (_, i): LabelledRow => ({
        id: `b${i}`,
        mailbox_entity: "smeba",
        label: i < 5 ? "noise" : "routable", // 50%
      })),
    );
    const after = computeNoiseFractions(
      Array.from({ length: 10 }, (_, i): LabelledRow => ({
        id: `a${i}`,
        mailbox_entity: "smeba",
        label: i < 1 ? "noise" : "routable", // 10%
      })),
    );
    const [cmp] = compareFractions(before, after);
    expect(cmp.mailbox_entity).toBe("smeba");
    expect(cmp.noise_fraction_delta).toBeCloseTo(0.4, 5);
  });

  it("null delta when a mailbox is missing on one side", () => {
    const before = computeNoiseFractions([
      { id: "b", mailbox_entity: "smeba", label: "noise" },
    ]);
    const [cmp] = compareFractions(before, []);
    expect(cmp.noise_fraction_delta).toBeNull();
  });
});

describe("parseLabelledRows — shape validation", () => {
  it("parses a valid labelled file", () => {
    const rows = parseLabelledRows({
      rows: [{ id: "x", mailbox_entity: "smeba", label: "noise" }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe("noise");
  });

  it("throws on a bad label", () => {
    expect(() =>
      parseLabelledRows({ rows: [{ id: "x", label: "TODO_noise_or_routable" }] }),
    ).toThrow(/label must be/);
  });

  it("throws when rows is missing", () => {
    expect(() => parseLabelledRows({})).toThrow(/must be/);
  });
});
