// Phase 114-04 Task 1 — sales postcode/adres → NXT Site → account lookup
// (D-05 CTO-confirmed: installation addresses are "Sites" in NXT; D-10 transport).
//
// This is the highest-frequency sales identifier (postcode_site, 706 hits / 55%
// in the Plan 03 mining report). A NL postcode in the subject/body identifies an
// installation Site, which maps to its owning customer account.
//
// V5 input validation: only a well-formed NL postcode ([1-9][0-9]{3}\s?[A-Za-z]{2})
// reaches NXT. This lookup is GENERICALLY cross-swarm (postcode→Site is reusable
// by any installation-addressed swarm) — kept here in iteration 1, structured so
// it could later promote to a generic resolve/steps/* module WITHOUT an engine
// edit (STAGE2-01).

import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";
import type { SalesCustomerMatch } from "./offerte";
import { pickMatchingCustomer } from "./_match";

// NL postcode (1234 AB). Data-driven shape from the mining report.
const POSTCODE = /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/g;

// WR-02 (Phase 114-07): the bare "4 digits + 2 letters" shape ALSO matches SKUs,
// product references, and reference codes (e.g. "Onderdeel 1234AB"). Postcode is
// 55% of sales volume, so an over-match resolves the WRONG account at high
// confidence. We narrow extraction to an address-like CONTEXT: a candidate is
// only accepted when the ~30-char window AROUND it contains a street-number
// pattern OR an address-label cue. This is a heuristic narrowing, NOT a full NL
// postcode-range validation (that would be the proper fix — see D-06 todo).
const ADDRESS_CUE = /(adres|postcode|straat|weg|laan|plein|locatie|vestiging)/i;
// A street number immediately before the postcode token, e.g. "Dorpsstraat 1, ".
const STREET_NUMBER_BEFORE = /\d+\s*[a-zA-Z]?,?\s*$/;

function hasAddressContext(text: string, matchIndex: number, matchLen: number): boolean {
  const before = text.slice(Math.max(0, matchIndex - 30), matchIndex);
  const after = text.slice(matchIndex + matchLen, matchIndex + matchLen + 30);
  const window = before + " " + after;
  if (ADDRESS_CUE.test(window)) return true;
  // A street-number pattern directly preceding the postcode (NL convention:
  // "<straat> <huisnummer>, <postcode> <plaats>").
  if (STREET_NUMBER_BEFORE.test(before)) return true;
  return false;
}

/** Deduped, normalized NL postcodes in subject-first order. */
export function extractPostcodeCandidates(
  subject: string,
  body: string,
): string[] {
  const found: string[] = [];
  for (const text of [subject, body]) {
    POSTCODE.lastIndex = 0;
    for (const m of text.matchAll(POSTCODE)) {
      // WR-02 gate: reject a standalone token (SKU/reference) with no address
      // context. Only a postcode in an address-like context is a candidate.
      if (m.index === undefined || !hasAddressContext(text, m.index, m[0].length)) {
        continue;
      }
      // Canonical "1234AB" (strip the optional space, uppercase the letters).
      found.push(m[0].replace(/\s+/g, "").toUpperCase());
    }
  }
  return Array.from(new Set(found));
}

/**
 * Resolve an NL postcode → NXT Site → owning customer account via the REST
 * proxy. Returns the first resolved account, or null. Lookup errors degrade to
 * null (a single-layer failure must not fail the whole resolver).
 */
export async function lookupPostcodeToAccount(
  env: "acceptance" | "production",
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractPostcodeCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call NXT

  for (const postcode of candidates) {
    const res = await nxtRequest(env, "POST", "/api/sites/search", {
      searchTerm: postcode,
    }).catch((err) => {
      console.warn(
        `[sales-resolve] site lookup failed for ${postcode}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    });
    // FAIL-CLOSED match (spike 011): only a Site row whose address actually
    // carries THIS postcode resolves; non-matching response → null (safe miss).
    const match = pickMatchingCustomer(res?.data, postcode);
    // WR-02 (Phase 114-07): a postcode maps to potentially MULTIPLE Sites, so
    // even a hit is only corroborating-strength → confidence:"medium", not
    // "high". The adapter honors this via SalesCustomerMatch.confidence. Full
    // multi-match corroboration (multiple agreeing signals RAISE confidence) is
    // the deferred D-06 engine fast-follow
    // (.planning/todos/pending/2026-06-04-d06-corroboration-fast-follow.md);
    // this downgrade is the safe interim.
    if (match)
      return { ...match, matched_identifier: postcode, confidence: "medium" };
  }
  return null;
}
