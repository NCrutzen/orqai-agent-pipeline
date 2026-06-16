// Phase 130 WR-03 — actionable-token carve-out: a SHARED, swarm-AGNOSTIC
// Stage-1 block-rule (relocated Phase 130 Plan 05 from web/lib/info-routing/).
//
// This is NOT an info-routing thing. It is a shared Stage-1 block-rule that
// ANY swarm may ADOPT via the registry (public.swarms.stage1_shared_block_rules
// — membership of 'actionable_token'). Info-routing is the FIRST adopter;
// debtor/sales/planning/order-entry adopt nothing by default and are therefore
// untouched until they opt in. Per the operator directive, a rule written once
// lives in a shared pool and is transferable across swarms — never a
// swarm-specific special-case (no `swarm_type === 'info-routing'` literal).
//
// WIRED enforcement (this is real, not prompt-only): `hasActionableToken` is
// imported and called in classifier-screen-worker.ts on the LLM success path,
// registry-gated on the adopting swarm's stage1_shared_block_rules array. When
// an adopting swarm's LLM 2nd-pass returns a noise key but the subject/body
// carries an actionable token, the worker forces the verdict BACK to 'unknown'
// (the non-archive key) and records the override in agent_runs.tool_outputs
// (gated_to='unknown', shared_block_rule='actionable_token'). This makes the
// NOISE-04 threat mitigation (T-130-02-01) a real upstream hard block.
//
// Why the carve-out exists: several high-frequency senders in the unknown pool
// are genuinely routable (fire-control inspecties/ontruimingsplattegronden,
// klant-PO's/orders/openstaande posten, finance retour-facturen) and MUST NOT
// be archived as noise — even from a noisy-looking sender domain. A leak-fix
// that eats routable mail is worse than the leak.
//
// Three-layer enforcement (see docs/agentic-pipeline/stage-1-regex.md):
//   (a) the LLM agent category definitions ("never classify as noise if the
//       body mentions offerte/order/keuring/ontruiming/storing/werkbon"),
//   (b) THIS programmatic shared block-rule — WIRED into the worker as a
//       registry-gated production veto, and
//   (c) the Wilson-CI shadow gate (a false-archive shows as an operator reject
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
