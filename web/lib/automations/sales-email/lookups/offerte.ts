// Phase 114-04 Task 1 — sales offerte → account lookup (D-05, D-10).
//
// Extracts offertenummer candidates from subject+body, validates FORMAT before
// any NXT call (V5 input validation — the email body is untrusted; a crafted
// identifier could target a wrong account), then resolves the quote → account
// via the nxtRequest REST proxy (D-10 transport; one auth path, no per-kind Zap).
//
// Two offerte formats observed in the verkoop@ corpus (Plan 03 mining report):
//   - SB-format:   "Offerte SB014967"        → /\bSB\d{5,6}\b/i   (284 hits, 22%)
//   - SMEQ-format: "Smeq 97891" / "SMEQ98082" → /\bSME[QB]\s?\d{4,6}\b/i (46 hits)
//
// Pure extraction + a single REST read. No nested step.run (replay-safe — the
// engine/adapter runs INSIDE the worker's step.run).

import { nxtRequest } from "@/lib/automations/nxt-zapier/nxt-client";

// Data-driven regex shapes (Plan 03 mining report `kinds[].pattern`).
const OFFERTE_SB = /\bSB\d{5,6}\b/gi;
const OFFERTE_SMEQ = /\bSME[QB]\s?\d{4,6}\b/gi;

export interface SalesCustomerMatch {
  customer_account_id: string;
  customer_name: string | null;
  matched_identifier: string;
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
        // NXT search term is canonical.
        found.push(m[0].replace(/\s+/g, "").toUpperCase());
      }
    }
  }
  return Array.from(new Set(found));
}

/**
 * Resolve an offertenummer to its NXT customer via the REST proxy.
 * Returns the first matched account, or null when none of the extracted
 * (format-validated) offerte numbers resolve. Lookup errors degrade to null
 * (a single-layer failure must not fail the whole resolver).
 */
export async function lookupOfferteToAccount(
  env: "acceptance" | "production",
  subject: string,
  body: string,
): Promise<SalesCustomerMatch | null> {
  const candidates = extractOfferteCandidates(subject, body);
  if (candidates.length === 0) return null; // V5: nothing valid → never call NXT

  for (const offerteNumber of candidates) {
    // NXT reads go over POST (docs/nxt-rest-access.md); prod reads need
    // allowWrite via the proxy route, not here. nxtRequest is the in-process
    // transport; it throws only on transport error, returns {ok,status,data}.
    const res = await nxtRequest(env, "POST", "/api/quotes/search", {
      searchTerm: offerteNumber,
    }).catch((err) => {
      console.warn(
        `[sales-resolve] offerte lookup failed for ${offerteNumber}: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    });
    const match = pickCustomer(res?.data);
    if (match) return { ...match, matched_identifier: offerteNumber };
  }
  return null;
}

/** Tolerant extraction of a customer id/name from a NXT quote-search response. */
function pickCustomer(
  data: unknown,
): { customer_account_id: string; customer_name: string | null } | null {
  if (!data || typeof data !== "object") return null;
  // Accept either a bare object or a {content:[...]} / array envelope.
  const row = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : Array.isArray((data as Record<string, unknown>).content)
      ? ((data as Record<string, unknown>).content as unknown[])[0]
      : (data as Record<string, unknown>);
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const id = r.customerId ?? r.customer_id ?? r.accountId ?? null;
  if (id === null || id === undefined) return null;
  const name = r.customerName ?? r.customer_name ?? r.name ?? null;
  return {
    customer_account_id: String(id),
    customer_name: name === null || name === undefined ? null : String(name),
  };
}
