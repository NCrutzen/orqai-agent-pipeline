// Plan 02-03 Task 2 step (c) — PII / prompt-injection detector.
//
// SAFETY-04 real implementation. Replaces the Phase 1 stub at
// stage-0-safety.ts (which still no-ops at Stage 0 because no transcript
// exists pre-Whisper; Stage 2 is the first place we have user-controlled
// natural-language text).
//
// Strategy: deterministic heuristics only — NO LLM call. Rationale:
//   1. Cost — running an LLM on every transcript would compete with the
//      Stage 2 cost ceiling (50¢/submission, SAFETY-05).
//   2. Determinism — replay-safe inside Inngest step.run.
//   3. The two threats we mitigate are LOW-NUANCE:
//        - prompt injection: short keyword set, very high precision
//        - credit-card PII: Luhn validation is mathematically exact
//      Email/phone patterns are intentionally NOT flagged because support
//      tickets routinely contain them and operator noise has real cost.
//
// Plans 02-04/02-05 SHORT-CIRCUIT when `pii_quarantine = true`, so this
// detector is the LAST line of defense before user-controlled text reaches
// the downstream LLMs. Better-precision detection (full LLM check) is a
// Phase 3+ follow-up; the keyword + Luhn pair is enough to mitigate the
// Phase 2 STRIDE register entries T-02-13 (PII Information Disclosure) and
// T-02-14 (prompt-injection Tampering).

const PROMPT_INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignore (?:all )?(?:the )?previous(?: instructions)?/i,
  /ignore (?:everything )?(?:above|before)/i,
  /(?:reveal|print|show)(?: me)?(?: the)? system prompt/i,
  /you are now (?:a |an )?/i,
  /\bDAN mode\b/i,
  /\bdeveloper mode\b/i,
  /\bjailbreak\b/i,
  /\bprompt injection\b/i,
  /disregard (?:all )?(?:previous|above|prior) (?:instructions|prompts?|rules?)/i,
];

// Match runs of 13-19 digits with optional spaces/dashes between them.
// Capture group 1 is the raw match; we strip separators before Luhn.
const CC_CANDIDATE_RE = /(?:\b|(?<=\D))(\d[\d\s-]{11,21}\d)(?=\D|\b)/g;

function luhnValid(digits: string): boolean {
  const trimmed = digits.replace(/[\s-]/g, "");
  if (trimmed.length < 13 || trimmed.length > 19) return false;
  if (!/^\d+$/.test(trimmed)) return false;
  let sum = 0;
  let alt = false;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    let n = trimmed.charCodeAt(i) - 48; // '0' === 48
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export type PiiDetectResult = {
  flagged: boolean;
  reason: string | null;
};

/**
 * Run deterministic PII / prompt-injection heuristics on a transcript.
 *
 * Flagged outcomes:
 *   - `reason='prompt_injection_keyword_match'` — one of PROMPT_INJECTION_PATTERNS matched.
 *   - `reason='pii_credit_card_luhn'` — a 13-19 digit substring is Luhn-valid.
 *
 * Otherwise returns `{ flagged: false, reason: null }`. Email and phone
 * patterns are intentionally NOT flagged (operator-noise tradeoff — see
 * file-level comment).
 *
 * Plan 02-03 step (c) — SAFETY-04 real implementation.
 */
export function detectPiiOrInjection(text: string | null | undefined): PiiDetectResult {
  if (text == null) return { flagged: false, reason: null };
  if (typeof text !== "string") return { flagged: false, reason: null };
  if (text.length === 0) return { flagged: false, reason: null };

  for (const re of PROMPT_INJECTION_PATTERNS) {
    if (re.test(text)) {
      return { flagged: true, reason: "prompt_injection_keyword_match" };
    }
  }

  // Reset lastIndex defensively (global regex statefulness).
  CC_CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CC_CANDIDATE_RE.exec(text)) !== null) {
    if (luhnValid(m[1])) {
      return { flagged: true, reason: "pii_credit_card_luhn" };
    }
  }

  return { flagged: false, reason: null };
}
