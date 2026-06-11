// Phase 91 (WR-03 — review hardening) — shared AUTO-tier gate helpers.
//
// The ≥99%-precision AUTO tier (self_auth + number back-search) must never inject
// a confident wrong customer. WR-03: a previous_customer_id (or any kind) pointing
// at a STOPPED / inactive customer is a stale mapping — the legacy id was
// re-keyed, the account closed, or the record split — and must NOT AUTO-resolve.
// The status is carried on every resolve_candidates row (resolver_index.status,
// seeded from nxt.dbo.customer.status / resolver_customer.status), so both AUTO
// steps gate on it BEFORE the single-distinct-party/root check.
//
// Swarm-agnostic (D-08): no debtor literals leak into the engine — this is a
// generic "is this customer record still resolvable?" status filter.

/**
 * Statuses that disqualify a candidate from the AUTO tier. Denylist (not an
 * allowlist) so an unrecognised but still-live status (e.g. "debtor", "prospect-
 * converted") is not silently dropped — only CLEARLY terminal/inactive states are
 * excluded. NL + EN forms, matched case-insensitively after trim.
 */
const NON_AUTO_STATUSES = new Set<string>([
  "stopped",
  "gestopt",
  "inactive",
  "inactief",
  "blocked",
  "geblokkeerd",
  "closed",
  "gesloten",
  "deleted",
  "verwijderd",
  "archived",
  "gearchiveerd",
]);

/**
 * True iff the candidate's customer status permits an AUTO resolve. A null/empty/
 * unknown status is treated as eligible (no contradicting signal — consistent with
 * the null-brand prefix-family rule); a clearly terminal status (stopped/inactive/
 * blocked/closed/deleted/archived, NL or EN) fails CLOSED to SUGGEST.
 */
export function isAutoEligibleStatus(status: string | null | undefined): boolean {
  if (status == null) return true;
  const norm = status.trim().toLowerCase();
  if (norm === "") return true;
  return !NON_AUTO_STATUSES.has(norm);
}
