import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";
import { getDictionary, type Dictionary } from "./index";

/**
 * Read the active locale. Precedence: the user's explicit cookie choice →
 * `fallback` (e.g. the AD preferred language) → DEFAULT_LOCALE.
 */
export async function getLocale(fallback?: Locale | null): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  if (isLocale(value)) return value;
  return fallback ?? DEFAULT_LOCALE;
}

/** Convenience: resolve the locale and its dictionary in one call. */
export async function getI18n(
  fallback?: Locale | null,
): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await getLocale(fallback);
  return { locale, dict: getDictionary(locale) };
}
