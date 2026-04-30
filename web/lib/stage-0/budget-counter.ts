/**
 * Phase 64 BUDG-01. Per-Inngest-invocation token + cost ceiling guard.
 *
 * Ceilings sourced from
 * .planning/phases/64-stage-0-input-safety-per-run-budgets/64-01-PROBES.md
 * (validated against last 30 days of automation_runs.result.cost_cents —
 * found ZERO historical samples; defaults to D-16 starting points pending
 * Phase 65 re-tune once Stage 0 has written 100+ samples).
 *
 * Per D-14: breach when EITHER cost OR tokens exceed ceiling. Cost is the
 * operator-visible number (override axis 4 already speaks in cents); tokens
 * is the runaway-loop guard.
 *
 * Per D-15: ceilings are PER Inngest invocation (one inbound email = one
 * Stage 0 run = one BudgetState lifetime).
 *
 * Pure module. No I/O. No imports.
 */

export const BUDGET_CEILING_CENTS = 15;
export const BUDGET_CEILING_TOKENS = 5000;

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
