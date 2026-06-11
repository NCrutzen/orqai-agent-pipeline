// Phase 91 (D-01/D-02) — Composite→numeric party-id strip.
//
// The resolver substrate returns composite party ids of the form
// `environment_id || id_org` (e.g. "BX593290"). Two separable facts live in
// that string:
//   - D-01: the NUMERIC customer id ("593290") is what we persist as
//     customer_account_id and present to operators.
//   - D-02: the environment_id qualifier ("BX") is preserved SEPARATELY by the
//     caller (a dedicated email_labels.environment_id column / engine arg), so a
//     future (environment_id, customer_account_id) key needs no migration.
//
// This helper performs ONLY the D-01 presentation strip. It is a STRIP, NOT a
// DISCARD: the environment_id is still held by the caller (config.scope.
// environment_id) and persisted alongside the numeric — Wave-2's job, not this
// helper's. Pure function, no I/O.

/**
 * Strip the environment_id prefix off a composite party id, returning the
 * numeric customer id. Returns the input unchanged if it does not start with
 * the given prefix (defensive — handles already-numeric ids or a different
 * environment family without corrupting them).
 *
 * @example stripEnvPrefix("BX593290", "BX") // → "593290"
 */
export function stripEnvPrefix(partyId: string, environmentId: string): string {
  return partyId.startsWith(environmentId)
    ? partyId.slice(environmentId.length)
    : partyId;
}
