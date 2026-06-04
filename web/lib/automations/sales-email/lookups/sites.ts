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

// NL postcode (1234 AB). Data-driven shape from the mining report.
const POSTCODE = /\b[1-9][0-9]{3}\s?[A-Za-z]{2}\b/g;

/** Deduped, normalized NL postcodes in subject-first order. */
export function extractPostcodeCandidates(
  subject: string,
  body: string,
): string[] {
  const found: string[] = [];
  for (const text of [subject, body]) {
    POSTCODE.lastIndex = 0;
    for (const m of text.matchAll(POSTCODE)) {
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
    const match = pickCustomer(res?.data);
    if (match) return { ...match, matched_identifier: postcode };
  }
  return null;
}

/**
 * Pull the owning customer off a NXT Site-search response. A Site row carries
 * the customer it belongs to (customerId), which is the account we resolve to.
 */
function pickCustomer(
  data: unknown,
): { customer_account_id: string; customer_name: string | null } | null {
  if (!data || typeof data !== "object") return null;
  const row = Array.isArray(data)
    ? (data[0] as Record<string, unknown> | undefined)
    : Array.isArray((data as Record<string, unknown>).content)
      ? ((data as Record<string, unknown>).content as unknown[])[0]
      : (data as Record<string, unknown>);
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  // A Site → its owning customer. Accept the common NXT field shapes.
  const id = r.customerId ?? r.customer_id ?? r.accountId ?? null;
  if (id === null || id === undefined) return null;
  const name = r.customerName ?? r.customer_name ?? r.name ?? null;
  return {
    customer_account_id: String(id),
    customer_name: name === null || name === undefined ? null : String(name),
  };
}
