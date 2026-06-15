// Shared, FAIL-CLOSED response matcher for the sales NXT identifier lookups
// (offerte / order / postcode→Site). Replaces the three identical, UNSAFE
// `pickCustomer(data)` helpers that took `content[0]` blindly.
//
// Why this exists (spike 011 Phase B, 2026-06-15): the old helpers returned the
// FIRST row of /api/{quotes,orders,sites}/search regardless of whether that row
// actually corresponded to the searched identifier. Live, every offerte search
// returned the SAME customer (512887) — a confident WRONG resolve, exactly the
// false-positive failure mode spike 009 flagged. Sales Stage 2 is still in
// dry-run so nothing was injected, but as-is it blocks the cutover.
//
// The contract here is deliberately conservative: NEVER return a customer unless
// the returned row demonstrably references the searched identifier. We do NOT
// know the exact NXT search response schema (it was never validated — see
// .planning/todos/pending/2026-06-15-sales-offerte-lookup-false-positive.md), so
// the matcher is schema-AGNOSTIC: it scans the row's own values for the searched
// term. If the response does not echo the identifier, we return null (a SAFE
// MISS) rather than guess. "Never wrong" beats "resolves something". Tightening
// to the exact reference field is a follow-up once the live schema is captured.

/** Normalize a reference/identifier to alphanumeric-uppercase (formatting-agnostic). */
function normRef(s: unknown): string {
  return String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Coerce a NXT search response into a flat list of candidate rows. */
function rowsOf(data: unknown): Record<string, unknown>[] {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data)) return data.filter(isObj);
  const content = (data as Record<string, unknown>).content;
  if (Array.isArray(content)) return content.filter(isObj);
  return [data as Record<string, unknown>];
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

/** Shallow-collect a row's primitive values (one level into nested obj/array). */
function valuesOf(row: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (v === null || v === undefined) return;
    const t = typeof v;
    if (t === "string" || t === "number" || t === "boolean") out.push(String(v));
  };
  for (const v of Object.values(row)) {
    if (Array.isArray(v)) v.forEach(push);
    else if (isObj(v)) Object.values(v).forEach(push);
    else push(v);
  }
  return out;
}

/**
 * True iff the row demonstrably references `term`. A row value either EQUALS the
 * normalized term (exact reference field — always trusted) or, for sufficiently
 * specific terms (≥6 chars, e.g. an offertenummer or a postcode embedded in an
 * address line), CONTAINS it. Short terms (<6) require exact field equality to
 * avoid substring collisions (a 4-digit order no. inside an unrelated number).
 */
export function rowReferencesTerm(
  row: Record<string, unknown>,
  term: string,
): boolean {
  const t = normRef(term);
  if (t.length < 4) return false; // too short to verify safely → never trust
  for (const raw of valuesOf(row)) {
    const v = normRef(raw);
    if (!v) continue;
    if (v === t) return true;
    if (t.length >= 6 && v.includes(t)) return true;
  }
  return false;
}

/** Pull the owning customer id/name off a row (common NXT field shapes). */
function customerOf(
  row: Record<string, unknown>,
): { customer_account_id: string; customer_name: string | null } | null {
  const id = row.customerId ?? row.customer_id ?? row.accountId ?? null;
  if (id === null || id === undefined) return null;
  const name = row.customerName ?? row.customer_name ?? row.name ?? null;
  return {
    customer_account_id: String(id),
    customer_name: name === null || name === undefined ? null : String(name),
  };
}

/**
 * FAIL-CLOSED customer pick: return the owning customer of the FIRST search row
 * that BOTH references the searched `term` AND carries a customer id. Returns
 * null when no row verifiably matches the term (a safe miss). This is the single
 * guard that prevents the spike-011 `512887`-for-everything false positive.
 */
export function pickMatchingCustomer(
  data: unknown,
  term: string,
): { customer_account_id: string; customer_name: string | null } | null {
  for (const row of rowsOf(data)) {
    if (!rowReferencesTerm(row, term)) continue;
    const customer = customerOf(row);
    if (customer) return customer;
  }
  return null;
}
