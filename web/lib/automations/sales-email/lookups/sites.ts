// Phase 120-02 Task 1 — sales postcode/adres → NXT Site → account lookup
// (D-05 CTO-confirmed: installation addresses are "Sites" in NXT; D-09 transport).
//
// ⚠️ POSTCODE PATH PAUSED (Phase 120-02 decision, 2026-06-17). The LOCKED Stage-2
// transport rule forbids REST for resolution — resolution goes via the SQL
// `zapier.dbo.resolver_index` substrate only. But resolver_index does NOT index
// postcodes: its `site_no` kind holds NUMERIC NXT site numbers (e.g. 647225), and
// there is no `postcode` kind. So the postcode→Site back-search has no substrate to
// resolve against yet and returns null (fail-closed) — it does NOT fall back to
// nxtRequest REST. This pauses ~55% of sales identifier volume (postcode_site) until
// resolver_index is extended with a postcode→site kind (the locked "extend the
// lookup tables, don't add a REST call" path).
// → .planning/todos/pending/2026-06-17-extend-resolver-index-postcode-kind.md
//
// The back-search is wired (not deleted): the moment a postcode/site kind lands in
// resolver_index, this path resolves with NO code change beyond the kind allowlist.
//
// V5 input validation: only a well-formed NL postcode reaches the substrate.

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { type SalesCustomerMatch, type SalesResolveCtx, SALES_RESOLVE_INTENT } from "./offerte";

// Sales region + brand scope (sales-specific glue; shared engine stays agnostic).
const SALES_ENVIRONMENT_ID = "BX";
const SALES_BRAND_SCOPE = ["SB"] as const;
const SALES_SCOPE_KEY = "SB";

// Kinds that a postcode could resolve through ONCE resolver_index indexes them.
// Empty match today (postcode strings are not in resolver_index) → fail-closed null.
const POSTCODE_SITE_KINDS = new Set(["postcode", "site_no"]);

// NL postcode (1234 AB). Data-driven shape from the mining report.
const POSTCODE = /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/g;

// WR-02 (Phase 114-07): the bare "4 digits + 2 letters" shape ALSO matches SKUs,
// product references, and reference codes (e.g. "Onderdeel 1234AB"). Postcode is
// 55% of sales volume, so an over-match resolves the WRONG account at high
// confidence. We narrow extraction to an address-like CONTEXT: a candidate is
// only accepted when the ~30-char window AROUND it contains a street-number
// pattern OR an address-label cue.
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
 * Resolve an NL postcode → NXT Site → owning customer account via the
 * resolver_index SQL back-search. Returns null today (no postcode kind in
 * resolver_index — see the file header). Wired so it self-enables when the kind
 * lands. A substrate rejection degrades to null. postcode→Site is corroborating-
 * strength (one postcode → potentially many Sites) so a future hit is "medium".
 */
export async function lookupPostcodeToAccount(
  ctx: SalesResolveCtx,
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractPostcodeCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call out

  const res = await lookupResolveCandidates(
    {
      nxt_database: ctx.nxt_database,
      brand_id: ctx.brand_id,
      environment_id: SALES_ENVIRONMENT_ID,
      identifiers: candidates,
      brand_scope: [...SALES_BRAND_SCOPE],
    },
    SALES_RESOLVE_INTENT,
  ).catch((err) => {
    console.warn(
      `[sales-resolve] postcode back-search failed: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // Today: empty (no postcode kind in resolver_index) → null. Future: a postcode/
  // site kind row that is unique-in-scope resolves at "medium" (corroborating).
  const siteMatches = res.matches.filter(
    (m) =>
      POSTCODE_SITE_KINDS.has(m.identifier_kind) &&
      m.scope_key === SALES_SCOPE_KEY &&
      m.is_unique_in_scope === true,
  );
  const distinctParties = Array.from(new Set(siteMatches.map((m) => m.party_id)));
  if (distinctParties.length !== 1) return null;

  const winner = siteMatches.find((m) => m.party_id === distinctParties[0])!;
  return {
    customer_account_id: winner.party_id,
    customer_name: winner.party_name,
    matched_identifier: winner.identifier_value_norm,
    identifier_kind: winner.identifier_kind,
    status: winner.status ?? null,
    confidence: "medium",
  };
}
