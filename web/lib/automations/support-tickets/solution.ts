import "server-only";

import { createHash } from "crypto";
import type { Locale } from "@/lib/i18n/config";
import type { ClickupComment } from "@/lib/automations/support-tickets/clickup-read-client";

// Generate a CUSTOMER-FACING "solution" summary for a resolved ticket, from the
// ClickUp AI "Summary" field + the task comments, via the Orq.ai Router (CLAUDE.md:
// LLM only through Orq). Privacy-critical: the ticket list includes external
// customers, and comments contain internal staff discussion — so the prompt is
// instructed to write only an end-user-appropriate resolution and to omit internal
// names/@mentions/notes/jargon, and to return NONE when there is no clear fix.
// Cached in-memory per (locale, content-hash); never throws (returns "" on failure).

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";
const MODEL = "openai/gpt-4o-mini";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const LANG_NAMES: Record<Locale, string> = {
  nl: "Dutch",
  en: "English",
  fr: "French",
};

const cache = new Map<string, { text: string; exp: number }>();

export async function generateSolution(input: {
  summary: string;
  comments: ClickupComment[];
  locale: Locale;
}): Promise<string> {
  const summary = input.summary?.trim() ?? "";
  const comments = (input.comments ?? []).filter((c) => c.text.trim() !== "");
  if (!summary && comments.length === 0) return "";

  const source =
    (summary ? `Summary field:\n${summary}\n\n` : "") +
    (comments.length
      ? `Comments:\n${comments.map((c) => `- ${c.author}: ${c.text}`).join("\n")}`
      : "");

  const cacheKey = `${input.locale}:${createHash("sha1").update(source).digest("hex")}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return hit.text;

  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) return "";

  const lang = LANG_NAMES[input.locale];
  try {
    const res = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You write a short, customer-facing resolution summary for a resolved IT ` +
              `support ticket, addressed to the end user who submitted it. Write 1-3 ` +
              `sentences in ${lang}.\n` +
              `STRICT RULES:\n` +
              `- Describe ONLY what was done to resolve the request, in plain language.\n` +
              `- NEVER include internal staff names, @mentions, internal notes, internal ` +
              `tooling/system jargon, or back-and-forth discussion between colleagues.\n` +
              `- Do not invent details that are not supported by the input.\n` +
              `- If the input does not contain a clear resolution, output exactly: NONE`,
          },
          {
            role: "user",
            content: source,
          },
        ],
      }),
    });
    if (!res.ok) return "";
    const json = await res.json();
    const out: string = (json?.choices?.[0]?.message?.content ?? "").trim();
    const result = out === "NONE" || out === "" ? "" : out;
    cache.set(cacheKey, { text: result, exp: Date.now() + CACHE_TTL_MS });
    return result;
  } catch {
    return "";
  }
}
