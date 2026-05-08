// web/lib/stage-0/strip-quoted-history.ts
//
// Phase 999.7 — strips quoted reply history from email bodies before the
// Stage 0 safety LLM sees them. Pure function, no I/O.
//
// Library: email-reply-parser@2.3.5 (Crisp). Supports Outlook NL/EN,
// Gmail NL/EN, German, French, Spanish, Italian, Portuguese, Polish,
// Korean, Japanese, Chinese reply patterns out of the box. Verified
// patterns include `Op <date> schreef <name>:` and `Van: <name> <email>`
// (Outlook NL).
//
// Defensive: returns the original body if the parser throws OR returns
// an empty string. Stage 0 must NEVER silently see an empty body — that
// would bypass the safety classifier (Phase 999.7 T-999.7-02).
//
// Replay-safe: pure function over input string. Same input → same output.
// Wrap call site in step.run() for telemetry parity with sibling steps.

import EmailReplyParser from "email-reply-parser";

export interface StripResult {
  /** Body with quoted reply history removed. */
  stripped: string;
  /** True if the parser actually changed the body (i.e. quoted history was found). */
  changed: boolean;
  /** Length delta in characters (negative = shrunk). Useful for telemetry. */
  delta_chars: number;
  /** Set if the parser threw or returned empty; stripped === input in that case. */
  fallback_reason?: "parser_threw" | "parser_returned_empty";
}

export function stripQuotedHistory(body: string): StripResult {
  if (!body || body.length === 0) {
    return { stripped: body, changed: false, delta_chars: 0 };
  }

  try {
    const parser = new EmailReplyParser();
    const email = parser.read(body);
    const stripped = email.getVisibleText();

    if (!stripped || stripped.trim().length === 0) {
      return {
        stripped: body,
        changed: false,
        delta_chars: 0,
        fallback_reason: "parser_returned_empty",
      };
    }

    return {
      stripped,
      changed: stripped.length !== body.length,
      delta_chars: stripped.length - body.length,
    };
  } catch {
    return {
      stripped: body,
      changed: false,
      delta_chars: 0,
      fallback_reason: "parser_threw",
    };
  }
}
