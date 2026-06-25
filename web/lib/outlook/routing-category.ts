// Phase 132 Plan 01 (Task 2, D-05) — pure routing→category stamp-back vocabulary.
//
// The info-routing Stage-3 verdict is stamped back onto the source Outlook message
// as exactly one `AI:`-prefixed native category, so operators see the routing
// decision in place AND Phase 134's V10 ambient-loop can parse it. This is a PURE
// derived function — no IO, no DB, no swarm literal — and a sibling of
// intent-category.ts (which stamps Stage-3 INTENT keys). It reuses that module's
// AI_CATEGORY_PREFIX as the single source of the marker.
//
// The EXACT strings below are the V10 ambient-loop contract (Phase 134 parses
// them) and are PINNED by routing-category.test.ts. Do not change them without
// updating that contract.

// Single source of the AI-category marker — re-exported from intent-category.ts
// so the routing labels share the exact same prefix the 112.5 delta-detection
// recognises.
export { AI_CATEGORY_PREFIX } from "./intent-category";
import { AI_CATEGORY_PREFIX } from "./intent-category";

/** The status axis of the routing stamp-back vocabulary. */
export type RoutingCategoryStatus =
  | "forwarded"
  | "held"
  | "triage"
  | "algemeen"
  | "dedup";

/**
 * Build the native Outlook category for an info-routing Stage-3 verdict.
 *
 * Pinned vocabulary (D-05):
 *   forwarded → `AI: routed → <bucket>`
 *   held      → `AI: held → <bucket>`
 *   triage    → `AI: triage`
 *   algemeen  → `AI: algemeen`
 *   dedup     → `AI: routed → <bucket> (dup)`
 */
export function buildRoutingCategory(
  status: RoutingCategoryStatus,
  bucket?: string,
): string {
  switch (status) {
    case "forwarded":
      return `${AI_CATEGORY_PREFIX}routed → ${bucket}`;
    case "held":
      return `${AI_CATEGORY_PREFIX}held → ${bucket}`;
    case "triage":
      return `${AI_CATEGORY_PREFIX}triage`;
    case "algemeen":
      return `${AI_CATEGORY_PREFIX}algemeen`;
    case "dedup":
      return `${AI_CATEGORY_PREFIX}routed → ${bucket} (dup)`;
  }
}

/**
 * Produce the FULL desired category set for a message given its existing
 * categories and the new routing verdict (status + bucket).
 *
 * Clones mergeIntentCategory's mechanics: strips EVERY entry that starts with
 * AI_CATEGORY_PREFIX (defensive against historic double-writes), preserves all
 * non-`AI:` user categories in their original relative order, then appends the
 * single new routing label last. Idempotent: re-merging the same verdict yields
 * no duplicate and stable order.
 */
export function mergeRoutingCategory(
  existing: string[],
  status: RoutingCategoryStatus,
  bucket?: string,
): string[] {
  const withoutStaleAi = existing.filter(
    (category) => !category.startsWith(AI_CATEGORY_PREFIX),
  );
  return [...withoutStaleAi, buildRoutingCategory(status, bucket)];
}
