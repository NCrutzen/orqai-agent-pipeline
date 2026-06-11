// Phase 91 Plan 01 Task 1 — D-11 extraction-guard coverage for the self-auth
// extractor (RESL-07). The extractor is the AUTO-tier's id source; P0 had NO
// guards (identifier-match.ts:11-13), so all four D-11 guards live here:
//   1. word-boundary 6-7 digit id  /(?<!\d)\d{6,7}(?!\d)/
//   2. R4-before-R1 — invoice tokens are never also customer ids
//   3. "Ons klantnummer:" span excluded (their id for us != our customer id)
//   4. >=2 distinct ids surfaced so the caller fails closed to SUGGEST
//
// value_norm MUST be the raw digit string (no leading-zero strip, no reformat)
// to match resolver_index.identifier_value_norm = CAST(id_org AS nvarchar).

import { describe, it, expect } from "vitest";
import { extractSelfAuthCandidates } from "../extract-self-auth";

describe("extractSelfAuthCandidates — three self-auth shapes (RESL-07)", () => {
  it("aanmaning subject `{id} - {name}` → id in fromSubject", () => {
    const r = extractSelfAuthCandidates("593290 - ACME Bouw BV", "");
    expect(r.fromSubject).toContain("593290");
    expect(r.candidates).toContain("593290");
  });

  it("body `Klantnummer: {id}` → id in fromBody", () => {
    const r = extractSelfAuthCandidates("", "Klantnummer: 471214");
    expect(r.fromBody).toContain("471214");
    expect(r.candidates).toContain("471214");
  });

  it("werkbon `op locatie {site}` → site candidate", () => {
    const r = extractSelfAuthCandidates("", "Werkbon op locatie 100234 afgerond");
    expect(r.fromBody).toContain("100234");
    expect(r.candidates).toContain("100234");
  });
});

describe("extractSelfAuthCandidates — D-11 guard: word-boundary 6-7 digits", () => {
  it("rejects digit runs glued to letters (X12345678)", () => {
    const r = extractSelfAuthCandidates("ref X12345678 end", "");
    expect(r.candidates).not.toContain("12345678");
    expect(r.candidates).toHaveLength(0);
  });

  it("rejects 5-digit tokens", () => {
    const r = extractSelfAuthCandidates("order 12345 done", "");
    expect(r.candidates).not.toContain("12345");
    expect(r.candidates).toHaveLength(0);
  });

  it("rejects 8+ digit standalone tokens (those are invoice-length)", () => {
    const r = extractSelfAuthCandidates("ref 123456789 end", "");
    expect(r.candidates).not.toContain("123456789");
  });

  it("every surfaced id candidate is a raw 6-7 digit string", () => {
    const r = extractSelfAuthCandidates("593290 - ACME", "Klantnummer: 471214");
    for (const c of r.candidates) {
      expect(c).toMatch(/^\d{6,7}$/);
    }
  });
});

describe("extractSelfAuthCandidates — D-11 guard: R4 before R1", () => {
  it("an invoice-pattern token is NOT returned as a customer id", () => {
    // 17000123 matches the invoice prefix pattern /\b(17|25|30|32|33)\d{6}\b/.
    const r = extractSelfAuthCandidates("Factuur 17000123 - ACME", "");
    expect(r.candidates).not.toContain("17000123");
  });

  it("a non-invoice 6-7 digit token alongside an invoice token still surfaces", () => {
    const r = extractSelfAuthCandidates("Factuur 17000123 klant 593290", "");
    expect(r.candidates).not.toContain("17000123");
    expect(r.candidates).toContain("593290");
  });
});

describe("extractSelfAuthCandidates — D-11 guard: Ons klantnummer exclusion", () => {
  it("excludes the id inside an `Ons klantnummer:` span (their id for us)", () => {
    const r = extractSelfAuthCandidates("", "Ons klantnummer: 998877");
    expect(r.candidates).not.toContain("998877");
    expect(r.candidates).toHaveLength(0);
  });

  it("a bare id elsewhere is NOT excluded by the Ons-klantnummer rule", () => {
    const r = extractSelfAuthCandidates("", "Ons klantnummer: 998877 — uw klantnummer: 471214");
    expect(r.candidates).not.toContain("998877");
    expect(r.candidates).toContain("471214");
  });
});

describe("extractSelfAuthCandidates — D-11 guard: >=2 distinct surfaced", () => {
  it("two distinct subject ids both surface so the caller fails closed", () => {
    const r = extractSelfAuthCandidates("593290 en 471214 samengevoegd", "");
    expect(r.fromSubject).toContain("593290");
    expect(r.fromSubject).toContain("471214");
    expect(new Set(r.candidates).size).toBeGreaterThanOrEqual(2);
  });

  it("dedupes a repeated id and preserves subject-first order", () => {
    const r = extractSelfAuthCandidates("593290 - ACME", "klantnummer 593290 en 471214");
    expect(r.candidates).toEqual(["593290", "471214"]);
  });
});

describe("extractSelfAuthCandidates — purity / null-safety", () => {
  it("handles null/undefined subject + body without throwing", () => {
    const r = extractSelfAuthCandidates(null, undefined);
    expect(r.candidates).toEqual([]);
    expect(r.fromSubject).toEqual([]);
    expect(r.fromBody).toEqual([]);
  });
});
