import type { Language } from "./types";

// Keyword sources: agents/debtor-copy-document-body-agent.md §emotion_detection.
// Case-insensitive substring match; "!!" catches any run of 2+ exclamation marks.
const KEYWORDS: Record<Language, string[]> = {
  nl: [
    "waar blijft",
    "al weken",
    "niet acceptabel",
    "!!",
    "boos",
    "teleurgesteld",
    "klacht",
  ],
  en: [
    "where is",
    "still waiting",
    "unacceptable",
    "!!",
    "angry",
    "disappointed",
    "complaint",
  ],
  de: [
    "wo bleibt",
    "seit wochen",
    "inakzeptabel",
    "!!",
    "enttäuscht",
    "beschwerde",
  ],
  fr: [
    "où est",
    "depuis des semaines",
    "inacceptable",
    "!!",
    "déçu",
    "plainte",
  ],
};

export type EmotionResult = {
  match: boolean;
  matched_keywords: string[];
};

export function detectEmotion(bodyText: string, language: Language): EmotionResult {
  const haystack = bodyText.toLowerCase();
  const list = KEYWORDS[language] ?? [];
  const matched: string[] = [];
  for (const kw of list) {
    if (haystack.includes(kw.toLowerCase())) matched.push(kw);
  }
  return { match: matched.length > 0, matched_keywords: matched };
}
