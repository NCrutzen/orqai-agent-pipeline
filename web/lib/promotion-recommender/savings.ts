// Phase 4 Plan 01 — hardened savings formula per sketch 006 / P4-D-05.
//
// Formula:
//   (matched_event_count_30d / 30) * 30
//     * (avg_replaced_cost_cents - avg_promoted_cost_cents)
//     * clip(confirm_rate, 0.5, 1.0)
//
// Rules:
//   - matched_event_count_30d < 3 → NULL (display "—").
//   - Non-deterministic kinds (prompt_tune_stage_3 / new_intent /
//     prompt_tune_stage_4) → NULL (v1 deferral; v2 adds sampled-rerun).
//   - confirm_rate floor 0.5, ceil 1.0.
//   - Cap at €99/mo (9900 cents) per candidate.
//   - savings_calculation_version persisted alongside so v2 can re-evaluate
//     without overwriting v1 history.

import type { PromotionKind } from "./types";

export const SAVINGS_CALCULATION_VERSION = 1;

const DETERMINISTIC_KINDS: ReadonlyArray<PromotionKind> = [
  "regex_rule",
  "sender_mapping",
];
const CAP_CENTS_PER_MONTH = 9900;
const MIN_EVIDENCE_FOR_SAVINGS = 3;
const CONFIRM_RATE_FLOOR = 0.5;
const CONFIRM_RATE_CEIL = 1.0;

export interface SavingsArgs {
  kind: PromotionKind;
  matched_event_count_30d: number;
  avg_replaced_cost_cents: number;
  avg_promoted_cost_cents: number;
  confirm_rate: number | null;
}

export function computeExpectedSavingsCentsPerMonth(
  args: SavingsArgs,
): number | null {
  if (args.matched_event_count_30d < MIN_EVIDENCE_FOR_SAVINGS) return null;
  if (!DETERMINISTIC_KINDS.includes(args.kind)) return null;

  const rawConfirm = args.confirm_rate ?? CONFIRM_RATE_FLOOR;
  const confirm = Math.min(
    CONFIRM_RATE_CEIL,
    Math.max(CONFIRM_RATE_FLOOR, rawConfirm),
  );

  const dailyEvents = args.matched_event_count_30d / 30;
  const perEventDelta =
    args.avg_replaced_cost_cents - args.avg_promoted_cost_cents;
  const monthlyCents = Math.round(dailyEvents * 30 * perEventDelta * confirm);

  return Math.min(CAP_CENTS_PER_MONTH, Math.max(0, monthlyCents));
}
