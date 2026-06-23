// Cross-project i18n foundation (project 1 & 2). Locale is stored in a cookie so
// it is readable in BOTH Server Components (via next/headers) and Client
// Components (via document.cookie), without locale-prefixed routing.

export const LOCALES = ["nl", "en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "nl";
export const LOCALE_COOKIE = "locale";

/** Display names (each in its own language) for the selector. */
export const LOCALE_NAMES: Record<Locale, string> = {
  nl: "Nederlands",
  en: "English",
  fr: "Français",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/** Replace {key} placeholders in a translated string. */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}
