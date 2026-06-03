/**
 * Plan 05-01 Task 1 — Canonical ClickUp-status → notification-status mapping.
 *
 * This is the SINGLE SOURCE OF TRUTH for ClickUp status strings. Do NOT
 * hardcode ClickUp status strings anywhere else in the support-tickets
 * codebase. Plan 05-03 (outbound Inngest fn) and Plan 05-04 (admin view)
 * import from this module.
 *
 * Exports:
 *   - CANONICAL_OUTBOUND_STATUSES — 4-element const tuple (ordered)
 *   - ClickupStatusCategory — literal-union type for the 4 canonical values
 *   - CLICKUP_STATUS_LOOKUP — raw-string → canonical map (reused by admin filter)
 *   - mapClickupStatus() — pure, deterministic mapping function
 */

// ---------------------------------------------------------------------------
// Canonical status taxonomy (OUTBOUND-02)
// ---------------------------------------------------------------------------

/**
 * The 4 canonical notification statuses for outbound ClickUp sync, in the
 * prescribed sequence: assigned → in-progress → resolved → closed.
 *
 * Plan 05-03 fires a support_notifications row for each of these transitions.
 * Statuses that do not appear here (e.g. "to do", "backlog") do not trigger
 * a notification — mapClickupStatus returns null for those.
 */
export const CANONICAL_OUTBOUND_STATUSES = [
  "assigned",
  "in-progress",
  "resolved",
  "closed",
] as const;

/**
 * Literal-union type derived from the const tuple. Consumers (e.g. Plan 05-03
 * notif writer, Plan 05-04 admin filter) can use this for type narrowing
 * instead of comparing against raw strings.
 */
export type ClickupStatusCategory =
  (typeof CANONICAL_OUTBOUND_STATUSES)[number];

// ---------------------------------------------------------------------------
// Raw-string → canonical lookup table
// ---------------------------------------------------------------------------

/**
 * Maps lowercase-trimmed raw ClickUp status strings to a canonical
 * ClickupStatusCategory. Values NOT in this table map to null (no notification).
 *
 * Exported so Plan 05-04's admin filter can reuse the same vocabulary for
 * display labels and filter chips without re-deriving the taxonomy.
 *
 * NOTE: This table governs ALL status recognition for support-tickets.
 * When ClickUp adds new statuses, extend this table; never duplicate
 * the logic in consumer code.
 */
export const CLICKUP_STATUS_LOOKUP: Readonly<
  Record<string, ClickupStatusCategory>
> = {
  // ── assigned ────────────────────────────────────────────────────────────
  assigned: "assigned",
  "in review queue": "assigned",

  // ── in-progress ─────────────────────────────────────────────────────────
  "in-progress": "in-progress",
  "in progress": "in-progress",
  doing: "in-progress",

  // ── resolved ────────────────────────────────────────────────────────────
  resolved: "resolved",
  fixed: "resolved",
  done: "resolved",

  // ── closed ──────────────────────────────────────────────────────────────
  closed: "closed",
  complete: "closed",
  completed: "closed",
  archived: "closed",
} as const;

// ---------------------------------------------------------------------------
// mapClickupStatus
// ---------------------------------------------------------------------------

/**
 * Map a raw ClickUp status string to a canonical ClickupStatusCategory.
 *
 * - Case-insensitive; trims surrounding whitespace.
 * - Returns null for: null, undefined, empty/whitespace-only strings, statuses
 *   that are not notify-worthy ("to do", "open", "backlog", …), and any
 *   unrecognised string.
 * - The caller should log a warning when null is returned for a non-empty input
 *   so that new ClickUp status vocabulary is surfaced for taxonomy extension.
 *
 * @param raw - Raw status string from a ClickUp webhook payload or API response.
 * @returns Canonical status, or null if no notification should be fired.
 *
 * @example
 *   mapClickupStatus("In Progress")   // → "in-progress"
 *   mapClickupStatus("DONE")          // → "resolved"
 *   mapClickupStatus("to do")         // → null  (not notify-worthy)
 *   mapClickupStatus(null)            // → null
 */
export function mapClickupStatus(
  raw: string | null | undefined,
): ClickupStatusCategory | null {
  if (raw == null) return null;

  const normalised = raw.trim().toLowerCase();
  if (normalised === "") return null;

  return CLICKUP_STATUS_LOOKUP[normalised] ?? null;
}
