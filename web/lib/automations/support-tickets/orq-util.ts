/**
 * Shared Orq.ai response helpers for the support-tickets pipeline.
 *
 * Every handler that calls an Orq agent and expects JSON output MUST run the
 * raw model content through `stripFences` before `JSON.parse`. Sonnet 4.5
 * (and other Anthropic variants) wrap JSON output in ```json ... ``` fences
 * even with `response_format=json_schema` strict mode (observed during the
 * 2026-06-01 live smoke; see Phase 3 Plan 04 dataset results bug #2).
 *
 * Originally lived inline in invoke-coordinator-agent.ts; extracted here in
 * Phase 4 Plan 01 so every handler (Plans 04-03..04-05) consumes one canonical
 * implementation.
 */

/**
 * Tolerate both bare JSON and ```json ... ``` / ``` ... ``` fenced JSON
 * coming back from Orq agents. Trims whitespace. If a fence opens without a
 * matching closing fence, returns the trimmed input unchanged so the caller's
 * `JSON.parse` produces a useful error.
 */
export const stripFences = (s: string): string => {
  const trimmed = s.trim();
  if (trimmed.startsWith("```")) {
    const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
    if (m) return m[1].trim();
  }
  return trimmed;
};
