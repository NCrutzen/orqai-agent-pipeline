// Phase 86 Plan 02 — D-03 label normalisation.
//
// Pure, dependency-free, idempotent canonicalisation of a free-form intent
// proposal label into a stable snake_case key.
//
// Pipeline:
//   1. lowercase
//   2. replace runs of non-[a-z0-9_] with a single underscore
//   3. collapse runs of underscores (defensive — step 2 already collapses,
//      but pre-existing `__` in the input would survive otherwise)
//   4. strip leading/trailing underscores
//
// Idempotency contract: normalizeLabel(normalizeLabel(x)) === normalizeLabel(x)
// for every input. Locked by web/lib/automations/intent-proposals/__tests__/normalize.test.ts.

export function normalizeLabel(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}
