// Phase 86 Plan 02 Task 1 — RED tests for Levenshtein + clusterProposals.
//
// Corpus ground truth locked from 86-RESEARCH.md Q5 / 86-02-PLAN.md <interfaces>.

import { describe, it, expect } from "vitest";

import {
  levenshtein,
  similarity,
  clusterProposals,
} from "../cluster";
import type { ProposalRow } from "../types";

// ---------------------------------------------------------------------------
// levenshtein
// ---------------------------------------------------------------------------
describe("levenshtein", () => {
  it("classic kitten/sitting distance is 3", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("empty vs abc is 3", () => {
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("abc vs empty is 3", () => {
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("identical strings have distance 0", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("is symmetric", () => {
    expect(levenshtein("kitten", "sitting")).toBe(
      levenshtein("sitting", "kitten"),
    );
  });
});

// ---------------------------------------------------------------------------
// similarity
// ---------------------------------------------------------------------------
describe("similarity", () => {
  it("similarity('','') === 1", () => {
    expect(similarity("", "")).toBe(1);
  });

  it("is symmetric", () => {
    expect(similarity("abc", "abcd")).toBe(similarity("abcd", "abc"));
  });

  it("returns 1 for identical strings", () => {
    expect(similarity("coupa", "coupa")).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// RESEARCH Q5 corpus pairs — locked ground truth
// ---------------------------------------------------------------------------
describe("similarity corpus (RESEARCH Q5)", () => {
  const TOL = 0.005;
  // RESEARCH Q5 ground truth. The merge/no-merge column is the contractual
  // lock; the similarity column is the exact value the formula
  // `1 - levenshtein(a,b)/max(|a|,|b|)` produces. Two cells (wka_* vs
  // ketenaansprakelijkheid_request) deviate from 86-RESEARCH.md's
  // hand-computed 0.194 / 0.355 — the canonical Levenshtein DP yields
  // ~0.333 and ~0.300 respectively (max-len 30, distances 20 and 21). The
  // RESEARCH cells appear to have been hand-estimated. The merge decision
  // (NO at 0.85) is the same either way and is what the algorithm
  // contractually commits to. See 86-02-SUMMARY.md "Deviations from Plan".
  const corpus: Array<{ a: string; b: string; sim: number; merge: boolean }> = [
    { a: "wka_data_request",         b: "wka_request",                       sim: 0.6875, merge: false },
    { a: "wka_data_request",         b: "ketenaansprakelijkheid_request",    sim: 0.333,  merge: false },
    { a: "wka_request",              b: "ketenaansprakelijkheid_request",    sim: 0.300,  merge: false },
    { a: "payment_extension",        b: "payment_schedule",                  sim: 0.529,  merge: false },
    { a: "coupa_po_notification",    b: "coupa_notification",                sim: 0.857,  merge: true  },
    { a: "payment_extension_request",b: "payment_schedule_request",          sim: 0.680,  merge: false },
  ];

  for (const c of corpus) {
    it(`similarity(${c.a}, ${c.b}) ≈ ${c.sim}`, () => {
      const s = similarity(c.a, c.b);
      expect(Math.abs(s - c.sim)).toBeLessThanOrEqual(TOL);
    });

    it(`pair ${c.a} ↔ ${c.b} ${c.merge ? "merges" : "does NOT merge"} at 0.85`, () => {
      const s = similarity(c.a, c.b);
      expect(s >= 0.85).toBe(c.merge);
    });
  }
});

// ---------------------------------------------------------------------------
// clusterProposals
// ---------------------------------------------------------------------------
function row(label: string, idSuffix: string): ProposalRow {
  return {
    pipeline_event_id: `pe-${idSuffix}`,
    email_id: `em-${idSuffix}`,
    swarm_type: "debtor-email",
    proposal_label: label,
    proposal_reason: null,
    intent_version: "2026-05-19.v3",
    ranked_top_intent: null,
    created_at: "2026-05-20T10:00:00.000Z",
    subject: null,
    sender_email: null,
  };
}

describe("clusterProposals", () => {
  it("returns [] on empty input", () => {
    expect(clusterProposals([])).toEqual([]);
  });

  it("returns a single cluster of size 1 for a single row", () => {
    const c = clusterProposals([row("wka_data_request", "1")]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      centroid: "wka_data_request",
      count: 1,
    });
    expect(c[0].members).toHaveLength(1);
  });

  it("yields 2 clusters for [wka_data_request, wka_data_request, wka_request] at 0.85", () => {
    const c = clusterProposals([
      row("wka_data_request", "1"),
      row("wka_data_request", "2"),
      row("wka_request", "3"),
    ]);
    expect(c).toHaveLength(2);
    // Sorted by member_count DESC — largest first.
    expect(c[0].count).toBe(2);
    expect(c[0].centroid).toBe("wka_data_request");
    expect(c[1].count).toBe(1);
    expect(c[1].centroid).toBe("wka_request");
  });

  it("yields 1 cluster of size 3 for [coupa_po_notification x2, coupa_notification] with centroid = most-frequent", () => {
    const c = clusterProposals([
      row("coupa_po_notification", "1"),
      row("coupa_notification", "2"),
      row("coupa_po_notification", "3"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      centroid: "coupa_po_notification",
      count: 3,
    });
    expect(c[0].memberLabels.sort()).toEqual(
      ["coupa_notification", "coupa_po_notification"],
    );
  });

  it("clusters are sorted by member_count DESC", () => {
    const c = clusterProposals([
      row("wka_request", "1"),
      row("coupa_po_notification", "2"),
      row("coupa_notification", "3"),
      row("coupa_po_notification", "4"),
    ]);
    expect(c[0].count).toBeGreaterThanOrEqual(c[c.length - 1].count);
    expect(c[0].count).toBe(3);
    expect(c[c.length - 1].count).toBe(1);
  });

  it("normalises labels before clustering (e.g. 'WKA Data Request' === 'wka_data_request')", () => {
    const c = clusterProposals([
      row("WKA Data Request", "1"),
      row("wka_data_request", "2"),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0].count).toBe(2);
    expect(c[0].centroid).toBe("wka_data_request");
  });
});
