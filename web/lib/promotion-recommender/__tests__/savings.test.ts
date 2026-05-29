import { describe, it, expect } from "vitest";
import {
  computeExpectedSavingsCentsPerMonth,
  SAVINGS_CALCULATION_VERSION,
} from "../savings";

describe("computeExpectedSavingsCentsPerMonth (sketch 006 / P4-D-05)", () => {
  it("SAVINGS_CALCULATION_VERSION is 1 (v1 deterministic-only formula)", () => {
    expect(SAVINGS_CALCULATION_VERSION).toBe(1);
  });

  it("returns null when matched_event_count_30d < 3", () => {
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 2,
        avg_replaced_cost_cents: 50,
        avg_promoted_cost_cents: 0,
        confirm_rate: 1.0,
      }),
    ).toBeNull();
  });

  it("deterministic Filter rule with 10 events, confirm 0.8, 22¢ replaced → 176¢", () => {
    // (10/30) * 30 * (22 - 0) * 0.8 = 176
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 10,
        avg_replaced_cost_cents: 22,
        avg_promoted_cost_cents: 0,
        confirm_rate: 0.8,
      }),
    ).toBe(176);
  });

  it("non-deterministic kinds (AI tuning / New topic / Draft style) → null", () => {
    for (const kind of [
      "prompt_tune_stage_3",
      "new_intent",
      "prompt_tune_stage_4",
    ] as const) {
      expect(
        computeExpectedSavingsCentsPerMonth({
          kind,
          matched_event_count_30d: 50,
          avg_replaced_cost_cents: 100,
          avg_promoted_cost_cents: 0,
          confirm_rate: 1.0,
        }),
      ).toBeNull();
    }
  });

  it("confirm_rate clipped: 0.2 → 0.5 floor, 1.5 → 1.0 ceil", () => {
    // floor: (30/30)*30*100*0.5 = 1500
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 30,
        avg_replaced_cost_cents: 100,
        avg_promoted_cost_cents: 0,
        confirm_rate: 0.2,
      }),
    ).toBe(1500);
    // ceil: (30/30)*30*100*1.0 = 3000
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 30,
        avg_replaced_cost_cents: 100,
        avg_promoted_cost_cents: 0,
        confirm_rate: 1.5,
      }),
    ).toBe(3000);
  });

  it("caps at 9900 cents (€99/mo)", () => {
    // (1000/30)*30*1000*1.0 = 1_000_000, capped to 9900
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 1000,
        avg_replaced_cost_cents: 1000,
        avg_promoted_cost_cents: 0,
        confirm_rate: 1.0,
      }),
    ).toBe(9900);
  });

  it("null confirm_rate defaults to 0.5 floor", () => {
    // (10/30)*30*22*0.5 = 110
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 10,
        avg_replaced_cost_cents: 22,
        avg_promoted_cost_cents: 0,
        confirm_rate: null,
      }),
    ).toBe(110);
  });

  it("never returns negative (clamps at 0)", () => {
    expect(
      computeExpectedSavingsCentsPerMonth({
        kind: "regex_rule",
        matched_event_count_30d: 10,
        avg_replaced_cost_cents: 10,
        avg_promoted_cost_cents: 50, // promoted more expensive than replaced
        confirm_rate: 1.0,
      }),
    ).toBe(0);
  });
});
