// Phase 120-02 Task 1 — sales offerte → account lookup via the resolver_index
// SQL back-search (D-09; LOCKED Stage-2 transport rule 2026-06-15).
//
// Transport history: Phase 114 resolved offerte → account over the nxtRequest
// REST proxy (/api/quotes/search). Spike 011 proved that endpoint ignores
// searchTerm → every offerte resolved to the SAME customer (512887), a confident
// WRONG resolve. Phase 120 switches the transport to the materialized
// `zapier.dbo.resolver_index` back-search (the same substrate the debtor engine
// uses), which returns EXACT, kind-tagged, is_unique_in_scope rows — eliminating
// the false-positive class AND carrying the identifier_kind + is_unique_in_scope
// metadata the corroboration engine (Plan 01) needs.
//
// Two offerte formats observed in the verkoop@ corpus (Plan 03 mining report):
//   - SB-format:   "Offerte SB014967"        → /\bSB\d{5,6}\b/i   (284 hits, 22%)
//   - SMEQ-format: "Smeq 97891" / "SMEQ98082" → /\bSME[QB]\s?\d{4,6}\b/i (46 hits)
//
// resolver_index stores the OFFER number normalized to BARE DIGITS with leading
// zeros stripped (verified: "SB014098" → identifier_value_norm "14098",
// identifier_kind "quote_no", scope_key "SB", party_id "BX228895" Bever B.V.,
// is_unique_in_scope true). NOTE: the same digits "14098" ALSO exist under
// identifier_kind "order_no" for a DIFFERENT party (BX490393), so the offerte
// path MUST filter the returned rows by identifier_kind === "quote_no" before the
// uniqueness pick — value+scope alone is ambiguous across kinds.
//
// Pure extraction + a single substrate read. No nested step.run (replay-safe —
// the adapter runs INSIDE the worker's step.run).

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";

// Data-driven regex shapes (Plan 03 mining report `kinds[].pattern`).
const OFFERTE_SB = /\bSB\d{5,6}\b/gi;
const OFFERTE_SMEQ = /\bSME[QB]\s?\d{4,6}\b/gi;

// Sales region + brand scope for the resolver_index back-search. Sales is BX
// (RESL-06 hard region scope) with brand SB. These are SALES-SPECIFIC glue
// constants — the shared engine/scorer stay swarm-agnostic; per-swarm scope lives
// in the per-swarm lookup files. Exported (Phase 123-02) so the adapter's
// sender_match + factuur_match cases reuse the SAME scope constants rather than
// redefining them (single source of truth for the sales scope).
export const SALES_ENVIRONMENT_ID = "BX";
export const SALES_BRAND_SCOPE = ["SB"] as const;
export const SALES_SCOPE_KEY = "SB";

// Phase 120-03: the dedicated resolve_candidates allowlist intent for sales
// resolution (default-deny `allowed_for_intents`, BUDG-02). Sales resolution is
// allowlisted under its OWN intent for per-swarm auditability, not lumped with
// debtor's 'unknown'. Seeded into public.zapier_tools by 20260616b.
export const SALES_RESOLVE_INTENT = "sales_resolution";

/** The per-email/per-tenant resolution context threaded from the adapter. */
export interface SalesResolveCtx {
  nxt_database: string;
  brand_id: string;
}

export interface SalesCustomerMatch {
  customer_account_id: string;
  customer_name: string | null;
  matched_identifier: string;
  // Phase 120-02: the resolver_index identifier_kind this match resolved on
  // (e.g. "quote_no" | "order_no"). The corroboration adapter reads it to build
  // a CorroborationSignal's independence axis (D-05). Absent for non-kinded paths.
  identifier_kind?: string;
  // Phase 120-02: the resolver_index customer status, carried so the corroboration
  // boost gate (isAutoEligibleStatus, T-120-05) can exclude stopped/inactive
  // accounts from AUTO. Absent ⇒ treated as eligible (no contradicting signal).
  status?: string | null;
  // WR-02 (Phase 114-07): per-lookup confidence the adapter honors when building
  // its ResolveResult. Absent ⇒ "high" (offerte/order are strong identifiers).
  // postcode→Site is a corroborating-strength signal (one postcode can map to
  // multiple Sites) so it self-downgrades to "medium".
  confidence?: "high" | "medium" | "low";
}

/**
 * Normalize an offerte identifier to the resolver_index `identifier_value_norm`
 * form: strip the alpha prefix (SB/SMEQ/SMEB) AND leading zeros so "SB014098" and
 * "SMEQ98082" become "14098" / "98082" (verified resolver_index shape).
 */
function normalizeOfferteDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

/** Deduped offerte identifiers in subject-first order (subject = higher signal). */
export function extractOfferteCandidates(
  subject: string,
  body: string,
): string[] {
  const found: string[] = [];
  for (const text of [subject, body]) {
    for (const re of [OFFERTE_SB, OFFERTE_SMEQ]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        // Normalize internal whitespace (e.g. "SMEQ 98082" → "SMEQ98082") so the
        // canonical original is stable for the audit trail.
        found.push(m[0].replace(/\s+/g, "").toUpperCase());
      }
    }
  }
  return Array.from(new Set(found));
}

/**
 * Resolve an offertenummer to its NXT customer via the resolver_index SQL
 * back-search. Returns the unique-in-scope quote_no party, or null when none of
 * the extracted (format-validated) offerte numbers resolve to exactly one party.
 * A substrate rejection degrades to null (a single-layer failure must not fail
 * the whole resolver).
 */
export async function lookupOfferteToAccount(
  ctx: SalesResolveCtx,
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractOfferteCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call out

  // Map each bare-digit form back to its canonical original for the audit trail.
  const normToOriginal = new Map<string, string>();
  for (const c of candidates) {
    const norm = normalizeOfferteDigits(c);
    if (norm && !normToOriginal.has(norm)) normToOriginal.set(norm, c);
  }
  const identifiers = Array.from(normToOriginal.keys());
  if (identifiers.length === 0) return null;

  const res = await lookupResolveCandidates(
    {
      nxt_database: ctx.nxt_database,
      brand_id: ctx.brand_id,
      environment_id: SALES_ENVIRONMENT_ID,
      identifiers,
      brand_scope: [...SALES_BRAND_SCOPE],
    },
    SALES_RESOLVE_INTENT,
  ).catch((err) => {
    console.warn(
      `[sales-resolve] offerte back-search failed: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // Disambiguate by kind FIRST: the same digits can be a quote for one party AND
  // an order for another (verified for "14098"). Only quote_no rows in the SB
  // scope that are unique-in-scope count. Zero or ambiguous (≥2 distinct parties)
  // → null (fail-closed: never a confident wrong guess).
  const quoteMatches = res.matches.filter(
    (m) =>
      m.identifier_kind === "quote_no" &&
      m.scope_key === SALES_SCOPE_KEY &&
      m.is_unique_in_scope === true,
  );
  const distinctParties = Array.from(new Set(quoteMatches.map((m) => m.party_id)));
  if (distinctParties.length !== 1) return null;

  const winner = quoteMatches.find((m) => m.party_id === distinctParties[0])!;
  const matched_identifier =
    normToOriginal.get(winner.identifier_value_norm) ?? winner.identifier_value_norm;
  return {
    customer_account_id: winner.party_id,
    customer_name: winner.party_name,
    matched_identifier,
    identifier_kind: "quote_no",
    status: winner.status ?? null,
  };
}
