/**
 * Phase 64 SAFE-01 (D-04). First-line regex screen for prompt-injection
 * patterns on inbound debtor-email bodies.
 *
 * This is the AUDIT layer — we do NOT strip or rewrite the body. The verdict
 * (matched: name | null) feeds into the Stage 0 worker (Plan 04) which
 * decides whether to short-circuit or pass through to the LLM verdict step.
 *
 * Pure function. No I/O. Single import target (./regex-patterns).
 */

import { INJECTION_PATTERNS } from "./regex-patterns";

export { INJECTION_PATTERNS } from "./regex-patterns";

export function regexScreen(body: string): { matched: string | null } {
  for (const p of INJECTION_PATTERNS) {
    if (p.pattern.test(body)) {
      return { matched: p.name };
    }
  }
  return { matched: null };
}
