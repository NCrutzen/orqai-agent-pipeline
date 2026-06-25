import "server-only";

import { createHash } from "crypto";
import type { Locale } from "@/lib/i18n/config";

// Translate user-generated ticket content (titles, descriptions) into the user's
// chosen UI language, via the Orq.ai Router (CLAUDE.md: all LLM calls go through
// Orq, never a direct provider key). Results are cached in-memory per instance so
// the force-dynamic ticket pages don't re-translate the same text every render.
// Never throws — on any failure it returns the original text (graceful: the user
// sees the source-language content instead of an error).

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";
const MODEL = "openai/gpt-4o-mini"; // cheap, accurate, preserves proper nouns
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const LANG_NAMES: Record<Locale, string> = {
  nl: "Dutch",
  en: "English",
  fr: "French",
};

const cache = new Map<string, { text: string; exp: number }>();

function keyFor(text: string, target: Locale): string {
  return `${target}:${createHash("sha1").update(text).digest("hex")}`;
}

/**
 * Translate a single string into `target`. Returns the original text unchanged
 * on empty input or any failure. Cached in-memory by (target, content-hash).
 */
export async function translateText(
  text: string,
  target: Locale,
): Promise<string> {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return text ?? "";

  const cacheKey = keyFor(trimmed, target);
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.text;

  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) return text;

  const lang = LANG_NAMES[target];
  try {
    const res = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              `You are a professional translator for an IT support ticketing app. ` +
              `Translate the user's message into ${lang}. If it is already in ${lang}, ` +
              `return it unchanged. Keep proper nouns, person names, company and system ` +
              `names, email addresses, and URLs exactly as written. Preserve line breaks. ` +
              `Output ONLY the translated text — no quotes, labels, or commentary.`,
          },
          { role: "user", content: trimmed },
        ],
      }),
    });
    if (!res.ok) return text;
    const json = await res.json();
    const out: string = json?.choices?.[0]?.message?.content ?? "";
    const result = out.trim() || text;
    cache.set(cacheKey, { text: result, exp: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return text;
  }
}

/** Translate many strings into `target` (parallel; cache de-dupes repeats). */
export async function translateMany(
  texts: string[],
  target: Locale,
): Promise<string[]> {
  return Promise.all(texts.map((t) => translateText(t, target)));
}
