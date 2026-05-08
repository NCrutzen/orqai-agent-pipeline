/**
 * Phase 64 BUDG-01 + Phase 999.7 — Per-Inngest-invocation budget guards.
 *
 * Two ceilings, two distinct roles (Phase 999.7 D-03 / D-08):
 *
 *   BUDGET_CEILING_CENTS  — RUNAWAY-LOOP GUARD.
 *     Fires on cost regardless of token count. Catches Stage 4 handlers
 *     in tool-call loops, runaway agent fan-outs, or model-pricing
 *     surprises. Independent of token ceiling.
 *
 *   BUDGET_CEILING_TOKENS — LONG-EMAIL GUARD.
 *     Fires on token volume. Catches genuinely huge prompt+completion
 *     pairs. Tuned 2026-05-07 from 5000 → 16000 after observing real
 *     long debtor threads at 12358/12362 tokens. Quoted-history strip
 *     (Phase 999.7) reduces typical long-email tokens before this fires.
 *
 * Per D-15 (Phase 64): ceilings are PER Inngest invocation (one inbound
 * email = one Stage 0 run = one BudgetState lifetime).
 *
 * Per D-13: breach is data, not exception. The check() function returns
 * { breached: true, reason } and the worker emits pipeline/budget_breached.
 *
 * Pure module. No I/O. No imports.
 */

export const BUDGET_CEILING_CENTS = 15;
export const BUDGET_CEILING_TOKENS = 16000;

export interface BudgetState {
  cost_cents: number;
  token_count: number;
}

export function check(state: BudgetState): {
  breached: boolean;
  reason?: string;
} {
  if (state.cost_cents > BUDGET_CEILING_CENTS) {
    return {
      breached: true,
      reason: `cost_cents ${state.cost_cents} > ${BUDGET_CEILING_CENTS}`,
    };
  }
  if (state.token_count > BUDGET_CEILING_TOKENS) {
    return {
      breached: true,
      reason: `token_count ${state.token_count} > ${BUDGET_CEILING_TOKENS}`,
    };
  }
  return { breached: false };
}
