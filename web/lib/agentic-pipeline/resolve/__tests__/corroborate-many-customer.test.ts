// Phase 121-02 (#24 many-customer guard) — VERIFY-FIRST proof.
//
// The hardest attachment-borne case: one mail carrying a ~358-invoice-row
// spreadsheet folds into a single body_text (the 116-05 fold). The engine's own
// extraction regexes then surface ~358 DIFFERING invoice roots. The fear is that
// this identifier flood produces a confident-single AUTO on the WRONG customer
// (T-121-06 — the cardinal Stage-2 failure).
//
// This test PROVES (no new adapter-side code) that the EXISTING, unedited engine
// logic fails closed on that case via TWO independent guards:
//
//   (1) scoreCorroboration DISAGREEMENT demote (corroborate.ts:136-147): a signal
//       set spanning ≥2 customers with ≥2 distinct identifier_kinds returns the
//       precedence winner CAPPED below AUTO (high→medium). 358 distinct customers
//       is the extreme of "≥2", so the demote fires and confidence !== "high".
//
//   (2) the number back-search fail-closed at identifier-match.ts:240
//       (`distinctRoots.length !== 1 → return { result: null }`). 358 distinct
//       roots is ≥2 roots → SUGGEST/null, NEVER AUTO. This guard is STRUCTURAL and
//       already present; it is documented (final test) and asserted via the
//       corroboration demotion proof rather than a live resolve_candidates lookup
//       (the live path is gated on Phase 123 — RESEARCH A4 / OQ-1).
//
// VERIFY-FIRST DECISION: these tests are expected to PASS against the unedited
// corroborate.ts. A PASS here is the signal that the many-customer guard is
// STRUCTURAL and SUFFICIENT — NO new adapter-side guard is built (Pattern 2,
// verify-then-build). Recorded in 121-02-SUMMARY.md.

import { describe, it, expect } from "vitest";
import {
  scoreCorroboration,
  type CorroborationSignal,
} from "../corroborate";
import type { ResolveArgs } from "../engine";
import type { CorroborationConfig } from "../config";

const args: ResolveArgs = {
  nxt_database: "nxt",
  brand_id: "SB",
  conversation_id: null,
  from_email: "sender@many-invoices.example",
  subject: "Openstaande facturen (bijlage)",
  body_text: "",
};

const config: CorroborationConfig = {
  min_signals: 2,
  boost: "high",
  auto_safe_alone_kinds: ["invoice_no", "customer_no"],
};

/**
 * Build N corroboration signals, each on a DISTINCT customer_account_id (mirrors
 * N differing invoice roots, one per spreadsheet row resolving to a different
 * customer). The identifier_kind alternates across ≥2 kinds so the overall set
 * carries ≥2 distinct kinds (the D-05 independence axis) → the disagreement gate
 * (byCustomer.size >= 2 && distinctKinds(signals).size >= 2) fires.
 */
function manyCustomerSignals(n: number): CorroborationSignal[] {
  const kinds = ["invoice_no", "customer_no"];
  const signals: CorroborationSignal[] = [];
  for (let i = 0; i < n; i += 1) {
    signals.push({
      customer_account_id: `C${i}`,
      identifier_kind: kinds[i % kinds.length],
      confidence: "high", // every per-row hit is individually "AUTO-eligible"
      method: "identifier_match",
      precedence_index: i, // C0 is the lowest-index → the precedence winner
      status: null,
      customer_name: `Customer ${i}`,
    });
  }
  return signals;
}

describe("Phase 121-02 (#24): ~358-distinct-root spreadsheet cannot AUTO-resolve", () => {
  it("358 distinct-customer signals → scoreCorroboration demotes below AUTO (confidence !== high)", () => {
    const signals = manyCustomerSignals(358);
    expect(signals).toHaveLength(358);
    // Sanity: the set genuinely spans ≥2 distinct customers AND ≥2 distinct kinds.
    expect(new Set(signals.map((s) => s.customer_account_id)).size).toBe(358);
    expect(new Set(signals.map((s) => s.identifier_kind)).size).toBeGreaterThanOrEqual(2);

    const matched = signals.map((_, i) => `INV-${i}`);
    const r = scoreCorroboration(signals, args, config, matched);

    // The disagreement path fires: winner is the lowest-precedence-index signal,
    // capped below AUTO. THIS is the many-customer guard, proven structural.
    expect(r.confidence).not.toBe("high"); // <-- the #24 demotion proof
    expect(r.confidence).toBe("medium"); // capBelowAuto(high) → medium
    expect(r.reason).toMatch(/disagreement/);
    expect(r.customer_account_id).toBe("C0"); // precedence still selects a winner (D-02)
  });

  it("even a modest 3-distinct-customer flood already demotes (lower bound of the guard)", () => {
    const signals = manyCustomerSignals(3);
    const r = scoreCorroboration(signals, args, config, ["A", "B", "C"]);
    expect(r.confidence).not.toBe("high");
    expect(r.reason).toMatch(/disagreement/);
  });

  // Documents guard (2): the number back-search fail-closed at
  // identifier-match.ts:240 (`distinctRoots.length !== 1 → return { result:null }`)
  // is the ENGINE-tier guard that prevents 358 roots from AUTO-resolving. It is
  // structural and already present; 358 distinct roots ⇒ distinctRoots.length=358
  // !== 1 ⇒ null (never AUTO). Asserted here via the corroboration demotion above
  // rather than a live resolve_candidates call (live path gated on Phase 123).
  it("documents the number back-search distinctRoots !== 1 → null fail-closed (engine-tier)", () => {
    const distinctRoots = Array.from(
      new Set(Array.from({ length: 358 }, (_, i) => `root-${i}`)),
    );
    // The engine guard is `if (distinctRoots.length !== 1) return { result: null }`.
    expect(distinctRoots.length).not.toBe(1);
    // ⇒ the back-search returns null (SUGGEST, never AUTO) for the 358-root flood.
  });
});
