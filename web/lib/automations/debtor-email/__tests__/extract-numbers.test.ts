// Phase 91 (CR-02 / WR-02 / WR-06 — review hardening) — precision coverage for
// the number back-search extractor (RESL-08). The extractor feeds the
// ≥99%-precision AUTO tier, whose only defence against a confident wrong resolve
// is candidate uniqueness — so the extractor MUST NOT surface bare free-text junk
// (years, amounts, postcodes, IBAN tails) as candidate tokens. Three trust tiers:
//   1. invoice prefix family (17/25/30/32/33) — unconditional
//   2. branded refs ("SB017092") — unconditional, case-insensitive (WR-02)
//   3. loose tokens (PO/order/quote/job) — context-anchored ONLY (CR-02), bare
//      numeric floor raised to 5 digits.

import { describe, it, expect } from "vitest";
import { extractNumberCandidates } from "../extract-numbers";

describe("extractNumberCandidates — CR-02 precision hardening", () => {
  it("invoice prefix family is emitted unconditionally (no anchor needed)", () => {
    const r = extractNumberCandidates("Betreft factuur 17008641", "");
    expect(r.candidates).toContain("17008641");
  });

  it("branded reference is emitted verbatim + prefix-stripped (unconditional)", () => {
    const r = extractNumberCandidates("Offerte SB017092", "");
    expect(r.candidates).toContain("SB017092");
    expect(r.candidates).toContain("017092");
  });

  // WR-02 — case-insensitive branded prefix.
  it("branded reference matches lowercase / mixed case (WR-02)", () => {
    const lower = extractNumberCandidates("ref sb017092", "");
    expect(lower.candidates).toContain("sb017092");
    expect(lower.candidates).toContain("017092");
    const mixed = extractNumberCandidates("Ref Sb017092", "");
    expect(mixed.candidates).toContain("Sb017092");
  });

  // CR-02 — the cardinal precision case: a bare year / amount with NO order cue
  // must NEVER become a candidate token.
  it("bare 4-digit year with no order cue does NOT resolve (CR-02)", () => {
    const r = extractNumberCandidates("Factuur d.d. 2026", "Bedrag 1500 euro voldaan.");
    expect(r.candidates).not.toContain("2026");
    expect(r.candidates).not.toContain("1500");
  });

  it("bare 5-8 digit number with no order cue does NOT resolve (CR-02)", () => {
    const r = extractNumberCandidates("Postcode 1234 AB, tel 0612345678", "");
    expect(r.candidates).not.toContain("12345678");
    expect(r.candidates).not.toContain("061234");
  });

  // CR-02 — anchored loose tokens DO resolve (recall preserved for real refs).
  it("anchored PO reference resolves (NL bestelnummer cue)", () => {
    const r = extractNumberCandidates("", "Onze bestelnummer: 4502AB verwerkt.");
    expect(r.candidates).toContain("4502AB");
  });

  it("anchored order number resolves (EN cue)", () => {
    const r = extractNumberCandidates("Your order no 778812", "");
    expect(r.candidates).toContain("778812");
  });

  it("anchored PO with explicit PO cue resolves", () => {
    const r = extractNumberCandidates("", "PO: 99001 graag op factuur.");
    expect(r.candidates).toContain("99001");
  });

  // CR-02 floor — even anchored, a 4-digit bare numeric is below the floor.
  it("anchored bare 4-digit number is still rejected (floor = 5 digits)", () => {
    const r = extractNumberCandidates("", "Ordernummer 2026 betreft het jaar.");
    expect(r.candidates).not.toContain("2026");
  });

  // WR-06 — slash-bearing PO round-trips when anchored (extractor grammar matches
  // the seed shape filter which allows '/').
  it("anchored slash-bearing PO is extracted whole (WR-06)", () => {
    const r = extractNumberCandidates("", "Inkoopordernummer 4502/2026 ref.");
    expect(r.candidates).toContain("4502/2026");
  });
});
