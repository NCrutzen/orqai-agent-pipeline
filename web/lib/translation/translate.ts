// Phase 04.1 — translation provider stub. Fails closed (P4.1-D-05 / P4.1-D-06).
//
// Replacement plan: swap the `translate` impl with a real call (Orq.ai Router
// or DeepL) without touching call sites. The Result discriminated-union shape
// is locked per P4.1-D-05 — mirrors web/lib/v7/briefing/generate.ts:265-302.
//
// NOTE: no "use server" here. translate() is already async so the future
// provider phase can move it behind a server-action boundary without touching
// call sites. detectLanguage() stays a sync client util (future: franc-min),
// which a "use server" module would forbid (all exports must be async actions).

export type TranslateInput = {
  text: string;
  target_lang: string; // ISO-639-1: "en" | "nl" | "fr" | "de" | …
  scope: "message" | "thread";
};

export type TranslateResult =
  | { ok: true; translated_text: string; source_lang: string | null; provider: string }
  | { ok: false; reason: "not_configured" | "unsupported_lang" | "rate_limited" | "provider_error" };

export async function translate(_input: TranslateInput): Promise<TranslateResult> {
  return { ok: false, reason: "not_configured" };
}

// detectLanguage — Plan 03-16 (UAT r3-5). Dependency-free best-effort
// language detection via a tiny stopword + diacritic heuristic. Returns
// "nl" | "fr" | "de" | "en" for clearly-in-language text, and null when the
// text is empty, too short, or ambiguous (the chip then renders a clean
// "language: not detected" state instead of a broken "unknown").
//
// Detection ≠ translation: this is a cheap O(n) local scan with no network
// and no LLM (consistent with the project's "heuristic beats LLM for a closed
// taxonomy" memo). Real machine translation stays post-milestone (translate()
// above is unchanged). TODO(future): swap for franc-min if accuracy matters.
//
// Signature is locked: (text: string) => string | null.

const STOPWORDS: Record<string, readonly string[]> = {
  nl: ["de", "het", "een", "en", "niet", "met", "voor", "van", "is", "op", "te", "dat", "ik", "je"],
  fr: ["le", "la", "les", "un", "une", "et", "pour", "avec", "ne", "pas", "est", "vous", "nous", "que"],
  de: ["der", "die", "das", "und", "nicht", "mit", "für", "ein", "ist", "sie", "wir", "auf", "den", "zu"],
  en: ["the", "and", "of", "to", "for", "with", "not", "is", "are", "you", "we", "this", "that", "it"],
};

// Cap the scanned tokens to bound work on very large bodies (T-03-16-01).
const MAX_TOKENS = 400;
const MIN_SCORE = 2; // need at least this many stopword hits to decide
const MARGIN = 1; // winner must beat the runner-up by at least this much

export function detectLanguage(text: string): string | null {
  if (typeof text !== "string") return null;
  const lower = text.toLowerCase();
  if (lower.trim().length < 8) return null;

  const tokens = lower.split(/[^a-zà-ÿß]+/).filter(Boolean).slice(0, MAX_TOKENS);
  if (tokens.length < 3) return null;

  const tokenSet = new Set(tokens);
  const scores: Record<string, number> = { nl: 0, fr: 0, de: 0, en: 0 };
  for (const lang of Object.keys(STOPWORDS)) {
    for (const w of STOPWORDS[lang]) {
      if (tokenSet.has(w)) scores[lang] += 1;
    }
  }

  // Light diacritic signal — nudges fr/de/nl when present.
  if (/[çœ]/.test(lower) || /\bà\b/.test(lower)) scores.fr += 1;
  if (/ß/.test(lower) || /[üöä]/.test(lower)) scores.de += 1;
  if (/ij/.test(lower) || /ë/.test(lower)) scores.nl += 1;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = ranked[0];
  const runnerScore = ranked[1]?.[1] ?? 0;

  if (topScore < MIN_SCORE) return null;
  if (topScore - runnerScore < MARGIN) return null;
  return topLang;
}
