// Phase 117 Plan 01 Task 1 (D-1) — pure intent→category mapper.
//
// The Stage-3 top-1 intent_key is written back onto the source Outlook message as
// exactly one `AI:`-prefixed native category (e.g. `AI: quote_request`). This is a
// PURE derived function — there is deliberately NO per-swarm category table, NO
// hardcoded intent→label map, and NO confidence suffix in v1 (deferred). The intent
// keys come from the `swarm_intents` registry; the category is just `AI: <intent_key>`.
//
// The `AI:` prefix is the marker that lets Phase 112.5 delta-detection tell an
// AI-written label apart from a user-authored Outlook category. Keeping the string a
// clean, machine-parseable `AI: <intent_key>` lets 112.5 diff cleanly.
//
// mergeIntentCategory is the strip-stale-AI replacement for categorizeEmail's
// additive dedup-merge (web/lib/outlook/client.ts): it produces the FULL desired
// category array (strip every stale `AI:` entry → keep user categories → append the
// single new `AI:` label) which Plan 02's worker PATCHes directly. categorizeEmail's
// additive merge cannot strip a stale `AI:` label, so a verdict change would
// otherwise accumulate `AI:` labels (D-4 anti-churn).
//
// No IO, no DB, no swarm literal — unit-testable in isolation.

/** The single source of the AI-category marker. Exactly `AI: ` incl. trailing space. */
export const AI_CATEGORY_PREFIX = "AI: ";

/**
 * Build the native Outlook category for a Stage-3 top-1 intent key.
 * `buildIntentCategory("quote_request") === "AI: quote_request"`.
 */
export function buildIntentCategory(intentKey: string): string {
  return `${AI_CATEGORY_PREFIX}${intentKey}`;
}

/**
 * Produce the FULL desired category set for a message given its existing categories
 * and the new Stage-3 top-1 intent key.
 *
 * Strips EVERY entry that starts with AI_CATEGORY_PREFIX (defensive against historic
 * double-writes), preserves all non-`AI:` user categories in their original relative
 * order, then appends the single new `AI:` label last. Idempotent: re-merging the
 * same intent yields no duplicate and stable order.
 */
export function mergeIntentCategory(existing: string[], intentKey: string): string[] {
  const withoutStaleAi = existing.filter(
    (category) => !category.startsWith(AI_CATEGORY_PREFIX),
  );
  return [...withoutStaleAi, buildIntentCategory(intentKey)];
}
