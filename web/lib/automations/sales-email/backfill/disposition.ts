/**
 * Phase 112 Plan 01 Task 1 — backfill auto-vs-approval disposition (D-05/D-06).
 *
 * The backfill sweeper re-evaluates each ingested email's Stage-1 disposition
 * and decides one of three fates:
 *
 *   'auto'  → high-confidence registry-derived noise → auto-archive directly
 *   'queue' → ambiguous (low/med confidence, manual_review keys, un-promoted) →
 *             route to Bulk Review for operator approval
 *   'skip'  → own_outbound_invoice_loopback → neither archived NOR queued (D-06)
 *
 * The AUTO set is REGISTRY-DERIVED, never hardcoded (registry-as-source-of-truth,
 * SWARM-02): it is exactly the rows whose action='categorize_archive', minus the
 * loopback key. payment_admittance + unknown carry action='manual_review' and so
 * are excluded by the filter alone — they resolve to 'queue' with no special-case.
 *
 * Pure (no clock reads, no randomness) — safe under Inngest replay (T-111-09).
 * The worker owns the `loadSwarmNoiseCategories` IO and passes the loaded rows in.
 */

import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

export type RetroConfidence = "low" | "medium" | "high";
export type BackfillDisposition = "auto" | "queue" | "skip";

// D-06: the loopback key is skipped entirely by the backfill (the debtor ~40%
// mis-archive incident). It is dropped from the auto set AND short-circuited to
// 'skip' in classifyDisposition before the auto/queue branch. The category-key
// literal appears here exactly once (this D-06 filter), never in an auto list.
const LOOPBACK_KEY = "own_outbound_invoice_loopback";

/**
 * Derive the auto-archive key set from the live registry rows (D-05). Reads
 * action==='categorize_archive', then drops the loopback key (D-06). NEVER
 * hardcode the category list — pass the rows from loadSwarmNoiseCategories.
 */
export function buildAutoKeySet(
  noiseCategories: SwarmNoiseCategoryRow[],
): Set<string> {
  return new Set(
    noiseCategories
      .filter((c) => c.action === "categorize_archive")
      .map((c) => c.category_key)
      .filter((k) => k !== LOOPBACK_KEY),
  );
}

/**
 * Map a predicted category + confidence to a backfill disposition.
 *
 * Order is load-bearing: the loopback 'skip' short-circuits BEFORE the
 * auto/queue branch (D-06), so a loopback key can never be auto-archived even
 * if it somehow leaked into the auto set.
 */
export function classifyDisposition(
  predictedKey: string,
  confidence: RetroConfidence,
  autoKeys: Set<string>,
): BackfillDisposition {
  // D-06: loopback is never archived and never queued.
  if (predictedKey === LOOPBACK_KEY) return "skip";

  // D-05: only high-confidence registry-derived noise auto-archives.
  if (autoKeys.has(predictedKey) && confidence === "high") return "auto";

  // Everything else (manual_review keys, low/medium confidence, un-promoted,
  // payment_admittance, unknown) routes to Bulk Review.
  return "queue";
}
