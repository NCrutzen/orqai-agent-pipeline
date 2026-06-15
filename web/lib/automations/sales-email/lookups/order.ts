// Phase 114-04 Task 1 — sales order/werkorder → account lookup (D-05, D-10).
//
// Extracts order-number candidates from subject+body, validates FORMAT before
// any NXT call (V5 input validation), then resolves order → account via the
// nxtRequest REST proxy (D-10).
//
// Order formats observed in the verkoop@ corpus (Plan 03 mining report):
//   - generic order:  "ordernummer 12345" / "order: 67890"  (58 hits)
//   - werkorder:      "werkorder 1634448"                    (40 hits)
//
// Shares the SalesCustomerMatch shape + tolerant response parsing with offerte.

import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";
import type { SalesCustomerMatch } from "./offerte";
import { pickMatchingCustomer } from "./_match";

// WR-03 (Phase 114-07): leading \b so a mid-word "order" (e.g. "herorder",
// "wederorder") no longer matches — only a token that STARTS with "order".
// WERKORDER already requires the literal 'werkorder' prefix; left as-is.
const ORDER_GENERIC = /\border[a-z]*\s*[:#]?\s*(\d{4,8})/gi;
const WERKORDER = /werkorder\s*(\d{5,8})/gi;

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
        // Capture group = the bare digits (the canonical NXT search term).
        if (m[1]) found.push(m[1]);
      }
    }
  }
  return Array.from(new Set(found));
}

/**
 * Resolve an order/werkorder number to its NXT customer via the REST proxy.
 * Returns the first matched account, or null. Lookup errors degrade to null.
 */
export async function lookupOrderToAccount(
  env: "acceptance" | "production",
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractOrderCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call NXT

  for (const orderNumber of candidates) {
    const res = await nxtRequest(env, "POST", "/api/orders/search", {
      searchTerm: orderNumber,
    }).catch((err) => {
      console.warn(
        `[sales-resolve] order lookup failed for ${orderNumber}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    });
    // FAIL-CLOSED match (spike 011): only a row that references THIS order
    // number resolves; non-matching response → null (safe miss).
    const match = pickMatchingCustomer(res?.data, orderNumber);
    if (match) return { ...match, matched_identifier: orderNumber };
  }
  return null;
}
