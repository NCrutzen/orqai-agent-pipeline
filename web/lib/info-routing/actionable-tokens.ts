// Phase 130 NOISE-04 — actionable-token carve-out (the cardinal safety
// constraint of the info-routing noise leak-fix).
//
// The info-routing "unknown" pool is MIXED: several high-frequency senders are
// genuinely routable (fire-control inspecties/ontruimingsplattegronden, klant
// PO's/orders/openstaande posten, finance retour-facturen) and MUST NOT be
// archived as noise — even when the sender domain looks noisy (CONTEXT). A
// leak-fix that eats routable mail is worse than the leak.
//
// This module is the PRODUCTION carve-out backstop: a pure predicate the
// screen-worker calls when the LLM-prompt carve-out needs a programmatic check.
// The boundary test (web/__tests__/stage-1/info-routing-actionable-carveout.test.ts)
// imports `hasActionableToken` directly so the tested code IS the production code.
//
// Dual enforcement (see docs/agentic-pipeline/stage-1-regex.md):
//   (a) the LLM agent category definitions ("never classify as noise if the
//       body mentions offerte/order/keuring/ontruiming/storing/werkbon"), and
//   (b) the Wilson-CI shadow gate (a false-archive shows as an operator reject
//       → agree drops → CI-lo never clears 0.92 → the rule never promotes).
//
// ReDoS safety (v8.2 RESL-08): the regex is a bounded, word-boundary-anchored
// alternation of literal keywords — NO unbounded `.*`/`.+` over keyword soup.
// Word-boundary semantics are deliberate and pinned by the boundary test:
//   - `storing` is a start-boundary-only token (`\bstoring` with no right \b):
//     it matches the routable Dutch compounds "storingsmelding" /
//     "storingsdienst" (a storing report/desk is genuinely actionable mail).
//   - every other token is FULL word-boundary (`\btoken\b`): `\bfactuur\b` does
//     NOT match "factuurloos" — the carve-out protects standalone tokens, not
//     compounds, so a marketing word that merely embeds "factuur" cannot
//     hijack the carve-out.
//
// Structure: `storing` lives in its own start-boundary alternation arm; all
// other tokens share a full-boundary arm. The whole pattern stays a bounded
// literal-keyword alternation — ReDoS-safe (no `.*`/`.+`).

/**
 * The actionable-token carve-out regex. Bounded, anchored on word boundaries,
 * case-insensitive. Matches if any of the nine actionable signals appears as a
 * standalone-ish token in the supplied text. `storing` is start-boundary-only
 * (matches its routable compounds); the other eight are full-boundary.
 */
export const ACTIONABLE_TOKEN_REGEX =
  /\b(?:(?:offerte|order|inkooporder|factuur|aanmaning|keuring|ontruiming|werkbon)\b|storing)/i;

/**
 * Returns true if `text` (subject and/or body) carries an actionable signal,
 * in which case the email must NOT be classified as noise regardless of how
 * noisy the sender looks. Pure, allocation-light, ReDoS-safe.
 */
export function hasActionableToken(text: string): boolean {
  if (!text) return false;
  return ACTIONABLE_TOKEN_REGEX.test(text);
}
