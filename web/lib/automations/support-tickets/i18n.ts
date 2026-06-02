/**
 * Shared locale resolution for the support-tickets pipeline.
 *
 * Requirement I18N-05: when a `submitter_locale` value from the ticket row is
 * NULL or outside the supported set, fall back to 'en' AND log a warning so
 * the operator can investigate registry drift / front-end bugs.
 *
 * Vendor locales (from `support_software_systems.vendor_locale`) frequently
 * default to NULL until the registry is populated — falling back silently is
 * the expected behavior there.
 */

export const SUPPORTED_SUBMITTER_LOCALES = ["nl", "en", "fr"] as const;
export type SubmitterLocale = (typeof SUPPORTED_SUBMITTER_LOCALES)[number];

const isSupported = (v: unknown): v is SubmitterLocale =>
  typeof v === "string" &&
  (SUPPORTED_SUBMITTER_LOCALES as readonly string[]).includes(v);

/**
 * Resolve a `support_tickets.submitter_locale` value to a supported locale.
 * Unknown / null / empty values fall back to 'en' WITH a console.warn (I18N-05).
 */
export function resolveSubmitterLocale(
  input: string | null | undefined,
): SubmitterLocale {
  if (isSupported(input)) return input;
  console.warn(
    `[support-tickets/i18n] unknown submitter_locale ${JSON.stringify(input)} — falling back to 'en' (I18N-05)`,
  );
  return "en";
}

/**
 * Resolve a `support_software_systems.vendor_locale` value to a supported
 * locale. Unknown / null falls back to 'en' WITHOUT a warning — vendor_locale
 * is expected to be NULL for un-enriched registry rows.
 */
export function resolveVendorLocale(
  input: string | null | undefined,
): SubmitterLocale {
  if (isSupported(input)) return input;
  return "en";
}
