"use client";

import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import {
  LOCALES,
  LOCALE_NAMES,
  type Locale,
} from "@/lib/i18n/config";

const LOCALE_COOKIE = "locale";

export function LanguageSelector({
  locale,
  label,
  compact = false,
}: {
  locale: Locale;
  label: string;
  compact?: boolean;
}) {
  const router = useRouter();

  function change(next: Locale) {
    // Persist for a year; readable server-side on the next request.
    document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  }

  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <Globe
        className="pointer-events-none absolute left-2 size-4 text-[var(--v7-muted)]"
        aria-hidden="true"
      />
      <select
        value={locale}
        onChange={(e) => change(e.target.value as Locale)}
        aria-label={label}
        className="appearance-none rounded-md border border-[var(--v7-line)] bg-[var(--v7-panel)] py-1.5 pl-8 pr-7 text-sm text-[var(--v7-text)] hover:border-[var(--v7-muted)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--v7-brand-primary)] cursor-pointer"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {compact ? l.toUpperCase() : LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
