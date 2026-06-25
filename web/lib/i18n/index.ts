import nl from "./dictionaries/nl";
import en from "./dictionaries/en";
import fr from "./dictionaries/fr";
import type { Locale } from "./config";

// nl is canonical: its shape is the contract en/fr must satisfy.
export type Dictionary = typeof nl;

const dictionaries: Record<Locale, Dictionary> = { nl, en, fr };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

/** Translate a raw ClickUp status (case-insensitive); falls back to the raw string. */
export function translateStatus(dict: Dictionary, rawStatus: string): string {
  const key = rawStatus.toLowerCase();
  return (dict.status as Record<string, string>)[key] ?? rawStatus;
}

export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, isLocale, interpolate } from "./config";
export type { Locale } from "./config";
