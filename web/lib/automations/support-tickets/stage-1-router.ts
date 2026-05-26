/**
 * Plan 01-02 Stage 1 router — pure deterministic switch on user_chosen_type.
 *
 * ZERO LLM. ZERO DB. ZERO fetch. ROUTE-02 budget: < 50ms p99 (this file
 * trivially satisfies that — synchronous switch on a 5-element literal-union).
 *
 * Defense-in-depth: although `ingestBodySchema` validates the input at the
 * route boundary, this function ALSO re-validates because it will be reused
 * by Phase 2 Inngest workers where the boundary check no longer applies.
 *
 * Output shape is consumed by:
 *   - the ingest route, which writes a stage=1 pipeline_events row with
 *     `decision = 'route_<branch_target>'` and `duration_ms = <measured>`
 *   - Phase 4+ Inngest fan-out, which switches on `branch_target` to pick
 *     the handler Inngest event name.
 */

import { USER_CHOSEN_TYPES, type UserChosenType } from "./types";

export interface Stage1Decision {
  decision: string;
  branch_target: UserChosenType;
  duration_ms: number;
}

const VALID = new Set<string>(USER_CHOSEN_TYPES);

export function runStage1Router(input: {
  user_chosen_type: UserChosenType;
}): Stage1Decision {
  const start = performance.now();
  const t = input.user_chosen_type;
  if (!VALID.has(t)) {
    throw new RangeError(`unknown_user_chosen_type: ${String(t)}`);
  }
  // Pure switch — by construction one branch per USER_CHOSEN_TYPES value. We
  // use the value verbatim as the branch target (no remap) so downstream
  // Inngest event names stay greppable from the SQL CHECK enum.
  return {
    decision: `route_${t}`,
    branch_target: t,
    duration_ms: performance.now() - start,
  };
}
