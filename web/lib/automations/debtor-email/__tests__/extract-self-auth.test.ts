// Phase 91 Plan 01 Task 1 — D-11 extraction-guard coverage for the self-auth
// extractor (RESL-07), TIGHTENED to labelled contexts only. The extractor is the
// AUTO-tier's id source; it now extracts ONLY from the three self-auth shapes
//   1. aanmaning  `{id} - {name}`
//   2. body label `Klantnummer: {id}`  (NOT `Ons klantnummer:`)
//   3. werkbon    `op locatie {site}`
// A bare standalone 6-7 digit token in NO labelled context is never a candidate
// (that is the tightening — it dropped werkorder / opdrachtnummer / case-id noise
// that flooded the AUTO tier and suppressed real self-auth recall).
//
// Preserved guards: R4-before-R1 (invoice tokens never customer ids),
// `Ons klantnummer:` exclusion, >=2-distinct surfaced (caller fails closed).
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

  it("aanmaning works with a mail prefix (`RE: {id} - {name}`)", () => {
    const r = extractSelfAuthCandidates("RE: 531712 - VERZOEK TOT BETALING", "");
    expect(r.candidates).toContain("531712");
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

describe("extractSelfAuthCandidates — TIGHTENING: labelled contexts only", () => {
  it("drops a bare 6-7 digit token with no self-auth label", () => {
    const r = extractSelfAuthCandidates("betreft 593290 graag voldoen", "");
    expect(r.candidates).toHaveLength(0);
  });

  it("drops a werkorder / opdrachtnummer that is not a klantnummer", () => {
    const r = extractSelfAuthCandidates(
      "Herinnering terugkoppeling op werkorder 102607 gepland",
      "Opdrachtnummer 159510 in behandeling",
    );
    expect(r.candidates).toHaveLength(0);
  });

  it("`klant {id}` WITHOUT `nummer` is not a labelled context", () => {
    const r = extractSelfAuthCandidates("Factuur 17000123 klant 593290", "");
    expect(r.candidates).toHaveLength(0);
  });
});

describe("extractSelfAuthCandidates — D-11 guard: word-boundary 6-7 digits", () => {
  it("rejects an 8-digit number in a Klantnummer label (invoice-length)", () => {
    const r = extractSelfAuthCandidates("", "Klantnummer: 12345678");
    expect(r.candidates).not.toContain("12345678");
    expect(r.candidates).toHaveLength(0);
  });

  it("rejects a 5-digit number in a Klantnummer label", () => {
    const r = extractSelfAuthCandidates("", "Klantnummer: 12345");
    expect(r.candidates).toHaveLength(0);
  });

  it("every surfaced id candidate is a raw 6-7 digit string", () => {
    const r = extractSelfAuthCandidates("593290 - ACME", "Klantnummer: 471214");
    for (const c of r.candidates) {
      expect(c).toMatch(/^\d{6,7}$/);
    }
  });
});

describe("extractSelfAuthCandidates — D-11 guard: R4 before R1", () => {
  it("an invoice-pattern token is NOT returned even in a labelled context", () => {
    // 17000123 matches the invoice prefix pattern /\b(17|25|30|32|33)\d{6}\b/.
    const r = extractSelfAuthCandidates("Factuur 17000123 - ACME", "");
    expect(r.candidates).not.toContain("17000123");
  });

  it("a klantnummer alongside an invoice token still surfaces", () => {
    const r = extractSelfAuthCandidates(
      "Factuur 17000123 Klantnummer: 593290",
      "",
    );
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

  it("a labelled id elsewhere is NOT excluded by the Ons-klantnummer rule", () => {
    const r = extractSelfAuthCandidates(
      "",
      "Ons klantnummer: 998877 — uw klantnummer: 471214",
    );
    expect(r.candidates).not.toContain("998877");
    expect(r.candidates).toContain("471214");
  });
});

describe("extractSelfAuthCandidates — D-11 guard: >=2 distinct surfaced", () => {
  it("two distinct labelled ids both surface so the caller fails closed", () => {
    const r = extractSelfAuthCandidates(
      "Klantnummer: 593290 en klantnummer 471214",
      "",
    );
    expect(r.fromSubject).toContain("593290");
    expect(r.fromSubject).toContain("471214");
    expect(new Set(r.candidates).size).toBeGreaterThanOrEqual(2);
  });

  it("dedupes a repeated id and preserves subject-first order", () => {
    const r = extractSelfAuthCandidates(
      "593290 - ACME",
      "klantnummer 593290 en klantnummer 471214",
    );
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
