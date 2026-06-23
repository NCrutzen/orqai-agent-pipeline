// web/lib/stage-0/normalize-body.ts
//
// Strips mail-client chrome from an email body BEFORE the Stage 0 safety
// classifier sees it. Pure function, no I/O.
//
// Motivation: the Q2Q mail-security banner ("Internal (…) / Safe Spam Phish
// More… FAQ Protection by Q2Q"), "CAUTION: External Sender" prefixes, and
// long zero-width-non-joiner (U+200C) signature walls used by Outlook were
// tripping the Stage 0 LLM with `injection_suspected` verdicts. The prompt
// explicitly lists zero-width walls and fake system markers as injection
// signals, so the model is doing what it's told — the noise is in the input.
//
// Scope: ONLY Stage 0. The original body still flows to Stage 1 unchanged
// (per stage-0-safety-worker.ts Pitfall 4 — Stage 1 noise rules depend on
// full-thread markers including the banner text). This module runs before
// stripQuotedHistory in the worker.
//
// Defensive: never returns empty. If normalization collapses the body to
// whitespace, falls back to the original input. Same contract as
// strip-quoted-history.ts (Phase 999.7 T-999.7-02): Stage 0 must NEVER
// silently see an empty body.
//
// Replay-safe: pure function. Same input → same output.

export interface NormalizeResult {
  /** Body with mail-client chrome removed. */
  normalized: string;
  /** True if normalization changed the body. */
  changed: boolean;
  /** Length delta in characters (negative = shrunk). Useful for telemetry. */
  delta_chars: number;
  /** Comma-separated list of cleaners that fired. Empty string if none. */
  removed: string;
  /** Set if normalization collapsed to whitespace and we fell back to input. */
  fallback_reason?: "normalized_to_empty";
}

// Invisible / zero-render characters used as signature spacers by Outlook and
// as obfuscation padding by bulk/marketing senders (interspersed BETWEEN
// letters). All render as nothing, so stripping them is always safe and
// correctly de-obfuscates padded words.
//
// Covered: U+00AD SOFT HYPHEN, U+034F COMBINING GRAPHEME JOINER, U+180E
// MONGOLIAN VOWEL SEPARATOR, U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+200E LRM,
// U+200F RLM, U+2060 WORD JOINER, U+2061-U+2064 invisible math operators,
// U+FEFF ZWNBSP/BOM.
//
// Why expanded (live debtor injection-FPs, 2026-06): the Stage 0 safety LLM
// correctly flags zero-width walls as injection. The old pattern stripped only
// U+200B-200D/FEFF/2060, so legit marketing/payment-advice mail padded with
// SOFT HYPHEN + CGJ still tripped `injection_suspected` after normalize \u2014 the
// dominant FP class (every big-delta FP's llm_reason cited "zero-width spaces
// AND soft hyphens"). Telemetry label kept as `zero_width` for continuity.
const ZERO_WIDTH_PATTERN =
  /[\u00AD\u034F\u180E\u200B-\u200F\u2060-\u2064\uFEFF]/g;

// "CAUTION: External Sender" lines. Outlook prepends this on external mail
// and Mimecast/Q2Q sometimes injects a duplicate copy inside the body.
const CAUTION_LINE_PATTERN = /^[ \t]*CAUTION:[ \t]*External Sender.*$/gim;

// Q2Q quarantine banner pasted into bodies. Examples:
//   "  Safe  Spam  Phish  More...  FAQ  Protection by Q2Q"
//   "  Graymail  Spam  Phish  More...  FAQ  Protection by Q2Q"
// Anchor on the trailing "Protection by Q2Q" — the action labels vary.
const Q2Q_BANNER_PATTERN = /^.*Protection by Q2Q.*$/gim;

// Chrome wrappers around the Q2Q banner. Outlook renders the sender envelope
// as one of these lines just before the banner:
//   "Internal (crediteuren@smeba.nl)"
//   "External (evewijk@reavas.nl)"
//   "Caution: External (vve@dpi.nl)"
// These read as fake system/role markers to the safety LLM. Killing the
// line is safe — the real sender lives in `from` / `fromName` on the event.
const SENDER_ENVELOPE_PATTERN =
  /^[ \t]*(?:Caution:[ \t]*)?(?:Internal|External)[ \t]*\([^)]*\)[ \t]*$/gim;
const FIRST_TIME_SENDER_PATTERN = /^[ \t]*First-Time Sender.*$/gim;

// Collapse 3+ consecutive newlines (with optional whitespace between) into 2.
const EXCESS_BLANK_LINES_PATTERN = /(?:[ \t]*\n){3,}/g;

function applyCleaner(
  input: string,
  pattern: RegExp,
  replacement: string,
  label: string,
  removed: string[],
): string {
  const out = input.replace(pattern, replacement);
  if (out !== input) removed.push(label);
  return out;
}

export function normalizeBody(body: string): NormalizeResult {
  if (!body || body.length === 0) {
    return { normalized: body, changed: false, delta_chars: 0, removed: "" };
  }

  const removed: string[] = [];
  let out = body;

  out = applyCleaner(out, ZERO_WIDTH_PATTERN, "", "zero_width", removed);
  out = applyCleaner(out, CAUTION_LINE_PATTERN, "", "caution_prefix", removed);
  out = applyCleaner(out, Q2Q_BANNER_PATTERN, "", "q2q_banner", removed);
  out = applyCleaner(out, SENDER_ENVELOPE_PATTERN, "", "sender_envelope", removed);
  out = applyCleaner(out, FIRST_TIME_SENDER_PATTERN, "", "first_time_sender", removed);
  out = applyCleaner(out, EXCESS_BLANK_LINES_PATTERN, "\n\n", "excess_blank_lines", removed);

  // Defensive: if normalization stripped everything meaningful, fall back to
  // the original body. Stage 0 must never silently see an empty body.
  if (!out.trim()) {
    return {
      normalized: body,
      changed: false,
      delta_chars: 0,
      removed: "",
      fallback_reason: "normalized_to_empty",
    };
  }

  return {
    normalized: out,
    changed: out !== body,
    delta_chars: out.length - body.length,
    removed: removed.join(","),
  };
}
