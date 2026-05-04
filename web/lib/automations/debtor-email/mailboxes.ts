/**
 * iController mailbox IDs per Moyne Roberts brand.
 *
 * Source: URL pattern https://walkerfire.icontroller.eu/messages/index/mailbox/{id}
 * Captured manually 2026-04-23. Keep in sync with Zapier per-mailbox Zaps;
 * each Zap sends the corresponding `icontroller_mailbox_id` in its payload.
 */
export const ICONTROLLER_MAILBOXES = {
  "debiteuren@smeba.nl": 4,
  "debiteuren@berki.nl": 171,
  "debiteuren@sicli-noord.nl": 15,
  "debiteuren@sicli-sud.nl": 16,
  "debiteuren@smeba-fire.nl": 5,
} as const;

export type SourceMailbox = keyof typeof ICONTROLLER_MAILBOXES;

export function isKnownMailbox(s: string): s is SourceMailbox {
  return s in ICONTROLLER_MAILBOXES;
}

/**
 * Phase 67 (R-04, mandatory): brand-suffix regex per entity.
 *
 * Per SELECTORS.md lines 142-184: iController's typeahead is brand-agnostic
 * — typing a customer_id can return matches across multiple brands. Each
 * result is rendered `<id> - <name> (<brand>)`. The label module parses
 * the parenthesized brand and bails out (returns 'brand_mismatch') if
 * it doesn't match the source mailbox's expected pattern.
 *
 * `entity` values come from labeling_settings.entity (Phase 56-02 wave 3).
 */
export const MAILBOX_BRAND_PATTERNS: Record<string, RegExp> = {
  smeba: /smeba\s+brand/i,
  "smeba-fire": /smeba\s*fire/i,
  "sicli-noord": /sicli.*(north|noord)/i,
  "sicli-sud": /sicli.*(south|sud|zuid)/i,
  berki: /berki/i,
};

/**
 * Defensive helper: returns true if `annotatedBrand` (from the parenthesized
 * suffix in iController's Select2 result) matches the expected pattern for
 * `entity`. Returns false on null/empty input or unknown entity.
 */
export function matchesExpectedBrand(
  annotatedBrand: string | null,
  entity: string | null,
): boolean {
  if (!annotatedBrand || !entity) return false;
  const pattern = MAILBOX_BRAND_PATTERNS[entity];
  if (!pattern) return false;
  return pattern.test(annotatedBrand);
}
