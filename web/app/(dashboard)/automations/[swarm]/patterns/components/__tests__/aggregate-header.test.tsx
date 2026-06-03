// Phase 4 Plan 02 Task 2 — AggregateHeader tests.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { AggregateHeader } from "../aggregate-header";
import type { PromotionCandidateRow } from "@/lib/promotion-recommender/types";

afterEach(() => cleanup());

function makeCandidate(
  overrides: Partial<PromotionCandidateRow>,
): PromotionCandidateRow {
  return {
    id: "c",
    kind: "regex_rule",
    swarm_type: "debtor-email",
    stage: "1-noise",
    signature_key: "x",
    proposed_change: {
      display_signature: "x",
      structured_payload: { kind: "regex_rule", subject_pattern: "x" },
    },
    evidence_event_ids: [],
    evidence_email_ids: [],
    matched_event_count_30d: 5,
    confirm_rate: 1,
    expected_savings_cents_per_month: 0,
    savings_calculation_version: 1,
    status: "open",
    approved_by: null,
    approved_at: null,
    dismissed_by: null,
    dismissed_at: null,
    created_at: "2026-05-25",
    updated_at: "2026-05-25",
    ...overrides,
  };
}

// Phase 4 follow-up 2026-05-27 — header copy rewritten to the sketch-006
// narrative ("Things the system could learn · debtor-email" h1 + summary
// "{N} suggestions from your team's recent corrections (last 30 days) ·
// could save the company €{N} / month if all applied"). Savings span only
// renders when count>0 + totalEur>0.

describe("AggregateHeader", () => {
  it("counts only status IN ('open','in_review') and sums their savings", () => {
    const candidates = [
      makeCandidate({ id: "a", status: "open", expected_savings_cents_per_month: 1500 }),
      makeCandidate({ id: "b", status: "in_review", expected_savings_cents_per_month: 2500 }),
      makeCandidate({ id: "c", status: "approved", expected_savings_cents_per_month: 9900 }),
      makeCandidate({ id: "d", status: "rejected", expected_savings_cents_per_month: 1000 }),
      makeCandidate({ id: "e", status: "rolled_back", expected_savings_cents_per_month: 800 }),
    ];
    render(<AggregateHeader candidates={candidates} swarmType="debtor-email" />);
    expect(screen.getByTestId("patterns-aggregate-count").textContent).toBe("2 suggestions");
    // 1500 + 2500 = 4000¢ → €40 / month
    expect(screen.getByTestId("patterns-aggregate-savings").textContent).toBe("€40 / month");
  });

  it("treats null expected_savings_cents_per_month as 0", () => {
    const candidates = [
      makeCandidate({ id: "a", status: "open", expected_savings_cents_per_month: null }),
      makeCandidate({ id: "b", status: "open", expected_savings_cents_per_month: 1200 }),
    ];
    render(<AggregateHeader candidates={candidates} swarmType="debtor-email" />);
    expect(screen.getByTestId("patterns-aggregate-count").textContent).toBe("2 suggestions");
    expect(screen.getByTestId("patterns-aggregate-savings").textContent).toBe("€12 / month");
  });

  it("renders descriptive h1 + count summary for an empty candidate set", () => {
    render(<AggregateHeader candidates={[]} swarmType="debtor-email" />);
    expect(screen.getByTestId("patterns-aggregate-h1").textContent).toContain("Things the system could learn");
    expect(screen.getByTestId("patterns-aggregate-h1").textContent).toContain("debtor-email");
    expect(screen.getByTestId("patterns-aggregate-count").textContent).toBe("0 suggestions");
    // No savings span when count = 0 — header stays stable but savings copy
    // requires actual reviewable candidates to compute.
    expect(screen.queryByTestId("patterns-aggregate-savings")).toBeNull();
  });

  it("renders the header even when all candidates are terminal (stable position)", () => {
    const candidates = [
      makeCandidate({ id: "a", status: "approved", expected_savings_cents_per_month: 9900 }),
    ];
    render(<AggregateHeader candidates={candidates} swarmType="debtor-email" />);
    expect(screen.getByTestId("patterns-aggregate-h1").textContent).toContain("Things the system could learn");
    expect(screen.getByTestId("patterns-aggregate-count").textContent).toBe("0 suggestions");
    expect(screen.queryByTestId("patterns-aggregate-savings")).toBeNull();
  });

  it("pluralizes 'suggestion' correctly at count=1", () => {
    const candidates = [
      makeCandidate({ id: "a", status: "open", expected_savings_cents_per_month: 1200 }),
    ];
    render(<AggregateHeader candidates={candidates} swarmType="debtor-email" />);
    expect(screen.getByTestId("patterns-aggregate-count").textContent).toBe("1 suggestion");
  });
});
