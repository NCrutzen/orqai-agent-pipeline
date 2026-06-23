// Phase 120-02 Task 1 — sales order/werkorder → account lookup via the
// resolver_index SQL back-search (D-09; LOCKED Stage-2 transport rule 2026-06-15).
//
// Same REST→SQL switch as offerte.ts: the nxtRequest /api/orders/search proxy is
// replaced by the materialized `zapier.dbo.resolver_index` back-search, which
// returns EXACT, kind-tagged, is_unique_in_scope rows (identifier_kind
// "order_no"). Eliminates the spike-011 false-positive class and carries the
// metadata the corroboration engine (Plan 01) consumes.
//
// Order formats observed in the verkoop@ corpus (Plan 03 mining report):
//   - generic order:  "ordernummer 12345" / "order: 67890"  (58 hits)
//   - werkorder:      "werkorder 1634448"                    (40 hits)
//
// Shares the SalesCustomerMatch shape + SalesResolveCtx with offerte.

import {
  lookupResolveCandidates,
  type ResolveCandidateMatch,
} from "@/lib/automations/debtor-email/nxt-zap-client";
import { type SalesCustomerMatch, type SalesResolveCtx, SALES_RESOLVE_INTENT } from "./offerte";

// Sales region + brand scope (sales-specific glue; shared engine stays agnostic).
const SALES_ENVIRONMENT_ID = "BX";
const SALES_BRAND_SCOPE = ["SB"] as const;
const SALES_SCOPE_KEY = "SB";

// WR-03 (Phase 114-07): leading \b so a mid-word "order" (e.g. "herorder",
// "wederorder") no longer matches — only a token that STARTS with "order".
// WERKORDER already requires the literal 'werkorder' prefix; left as-is.
const ORDER_GENERIC = /\border[a-z]*\s*[:#]?\s*(\d{4,8})/gi;
const WERKORDER = /werkorder\s*(\d{5,8})/gi;

/** Strip leading zeros to match the resolver_index identifier_value_norm form. */
function normalizeOrderDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

/** Deduped order numbers in subject-first order. */
export function extractOrderCandidates(
  subject: string,
  body: string,
): string[] {
  const found: string[] = [];
  for (const text of [subject, body]) {
    for (const re of [WERKORDER, ORDER_GENERIC]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        // Capture group = the bare digits (the canonical search term).
        if (m[1]) found.push(m[1]);
      }
    }
  }
  return Array.from(new Set(found));
}

/**
 * Resolve an order/werkorder number to its NXT customer via the resolver_index
 * SQL back-search. Returns the unique-in-scope order_no party, or null when none
 * resolve to exactly one party. A substrate rejection degrades to null.
 */
export async function lookupOrderToAccount(
  ctx: SalesResolveCtx,
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractOrderCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call out

  const normToOriginal = new Map<string, string>();
  for (const c of candidates) {
    const norm = normalizeOrderDigits(c);
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
      brand_scope: ctx.brand_scope ?? [...SALES_BRAND_SCOPE],
    },
    SALES_RESOLVE_INTENT,
  ).catch((err) => {
    console.warn(
      `[sales-resolve] order back-search failed: ${err instanceof Error ? err.message : err}`,
    );
    return { matches: [] as ResolveCandidateMatch[] };
  });

  // Disambiguate by kind: only order_no rows in the SB scope that are unique-in-
  // scope count. Zero or ambiguous (≥2 distinct parties) → null (fail-closed).
  const orderMatches = res.matches.filter(
    (m) =>
      m.identifier_kind === "order_no" &&
      m.scope_key === (ctx.scope_key ?? SALES_SCOPE_KEY) &&
      m.is_unique_in_scope === true,
  );
  const distinctParties = Array.from(new Set(orderMatches.map((m) => m.party_id)));
  if (distinctParties.length !== 1) return null;

  const winner = orderMatches.find((m) => m.party_id === distinctParties[0])!;
  const matched_identifier =
    normToOriginal.get(winner.identifier_value_norm) ?? winner.identifier_value_norm;
  return {
    customer_account_id: winner.party_id,
    customer_name: winner.party_name,
    matched_identifier,
    identifier_kind: "order_no",
    status: winner.status ?? null,
  };
}
