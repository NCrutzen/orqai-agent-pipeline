// Phase 4 Plan 02 Task 2 — ClusterCard tests.
//
// Covers the operator-facing translation lock (P4-D-04), the display_signature
// verbatim-render contract (P4-D-10 → T-04-02-03), the savings display
// formula (P4-D-05 — "—" when null, whole € otherwise), and the absence of
// forbidden-jargon strings.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { ClusterCard } from "../cluster-card";
import type { PromotionCandidateRow } from "@/lib/promotion-recommender/types";

// next/link is fine in jsdom but harmless to mock for predictability.
vi.mock("next/link", () => ({
  default: (props: Record<string, unknown>) => {
    const { children, href, ...rest } = props as {
      children: unknown;
      href: string;
    };
    return (
      <a href={href} {...(rest as Record<string, unknown>)}>
        {children as React.ReactNode}
      </a>
    );
  },
}));

afterEach(() => cleanup());

function makeCandidate(
  overrides: Partial<PromotionCandidateRow> = {},
): PromotionCandidateRow {
  return {
    id: "cand-1",
    kind: "regex_rule",
    swarm_type: "debtor-email",
    stage: "1-noise",
    signature_key: "abc",
    proposed_change: {
      display_signature: "Filter rule for billing@konstantijn.example",
      structured_payload: {
        kind: "regex_rule",
        subject_pattern: "out of office",
      },
    },
    evidence_event_ids: ["e1", "e2", "e3"],
    evidence_email_ids: ["m1", "m2"],
    matched_event_count_30d: 12,
    confirm_rate: 1,
    expected_savings_cents_per_month: 2400,
    savings_calculation_version: 1,
    status: "open",
    approved_by: null,
    approved_at: null,
    dismissed_by: null,
    dismissed_at: null,
    created_at: "2026-05-01T10:00:00Z",
    updated_at: "2026-05-24T12:00:00Z",
    ...overrides,
  };
}

describe("ClusterCard — operator-facing terminology lock (P4-D-04)", () => {
  it("renders kind label 'Filter rule' for regex_rule + uses --v7-blue token", () => {
    render(<ClusterCard candidate={makeCandidate({ kind: "regex_rule" })} swarmType="debtor-email" />);
    const badge = screen.getByTestId("cluster-card-kind");
    expect(badge.textContent).toBe("Filter rule");
    expect(badge.style.background).toContain("--v7-blue");
  });

  it("renders kind label 'Known sender' for sender_mapping + --v7-lime token", () => {
    render(<ClusterCard candidate={makeCandidate({ kind: "sender_mapping" })} swarmType="debtor-email" />);
    const badge = screen.getByTestId("cluster-card-kind");
    expect(badge.textContent).toBe("Known sender");
    expect(badge.style.background).toContain("--v7-lime");
  });

  it("renders kind label 'AI tuning' for prompt_tune_stage_3 + --v7-brand-patterns token", () => {
    render(<ClusterCard candidate={makeCandidate({ kind: "prompt_tune_stage_3" })} swarmType="debtor-email" />);
    const badge = screen.getByTestId("cluster-card-kind");
    expect(badge.textContent).toBe("AI tuning");
    expect(badge.style.background).toContain("--v7-brand-patterns");
  });

  it("renders kind label 'New topic' for new_intent", () => {
    render(<ClusterCard candidate={makeCandidate({ kind: "new_intent" })} swarmType="debtor-email" />);
    expect(screen.getByTestId("cluster-card-kind").textContent).toBe("New topic");
  });

  it("renders kind label 'Draft style' for prompt_tune_stage_4 + --v7-amber token", () => {
    render(<ClusterCard candidate={makeCandidate({ kind: "prompt_tune_stage_4" })} swarmType="debtor-email" />);
    const badge = screen.getByTestId("cluster-card-kind");
    expect(badge.textContent).toBe("Draft style");
    expect(badge.style.background).toContain("--v7-amber");
  });
});

describe("ClusterCard — signature render (P4-D-10 + T-04-02-03)", () => {
  it("renders proposed_change.display_signature verbatim (no client-side transformation)", () => {
    const candidate = makeCandidate({
      proposed_change: {
        display_signature:
          "Auto-reply emails from billing@konstantijn.example with 'out of office' in the subject",
        structured_payload: { kind: "regex_rule", subject_pattern: "out of office" },
      },
    });
    render(<ClusterCard candidate={candidate} swarmType="debtor-email" />);
    const sig = screen.getByTestId("cluster-card-signature");
    expect(sig.textContent).toBe(
      "Auto-reply emails from billing@konstantijn.example with 'out of office' in the subject",
    );
  });
});

describe("ClusterCard — volume cell (P4-D-04)", () => {
  it("renders '{N} times this month' label", () => {
    render(<ClusterCard candidate={makeCandidate({ matched_event_count_30d: 7 })} swarmType="debtor-email" />);
    const vol = screen.getByTestId("cluster-card-volume");
    // Sketch 006 lock — big number above small label ("7" / "times this month");
    // they live in sibling spans so textContent concatenates without a separator.
    expect(vol.textContent).toContain("7");
    expect(vol.textContent).toContain("times this month");
  });

  it("includes a hover tooltip with raw 30d / first-seen / last-seen", () => {
    render(
      <ClusterCard
        candidate={makeCandidate({
          matched_event_count_30d: 12,
          created_at: "2026-05-01T00:00:00Z",
          updated_at: "2026-05-24T00:00:00Z",
        })}
        swarmType="debtor-email"
      />,
    );
    const tt = screen.getByTestId("cluster-card-volume-tooltip");
    expect(tt.textContent).toContain("12× in last 30d");
    expect(tt.textContent).toContain("first seen");
    expect(tt.textContent).toContain("last seen");
  });
});

describe("ClusterCard — savings cell (P4-D-05)", () => {
  it("renders '€N/mo' rounded to whole € when expected_savings_cents_per_month is set", () => {
    render(
      <ClusterCard
        candidate={makeCandidate({ expected_savings_cents_per_month: 4250 })}
        swarmType="debtor-email"
      />,
    );
    // Sketch 006 lock — big "€N/mo" + small "est. saved" label below.
    const cell = screen.getByTestId("cluster-card-savings").textContent ?? "";
    expect(cell).toContain("€43/mo");
    expect(cell).toContain("est. saved");
  });

  it("renders '—' when expected_savings_cents_per_month is null", () => {
    render(
      <ClusterCard
        candidate={makeCandidate({ expected_savings_cents_per_month: null })}
        swarmType="debtor-email"
      />,
    );
    const cell = screen.getByTestId("cluster-card-savings").textContent ?? "";
    expect(cell).toContain("—");
    expect(cell).toContain("est. saved");
  });
});

describe("ClusterCard — status pill (P4-D-11)", () => {
  it("translates status='open' → 'needs review' with --v7-brand-patterns color token", () => {
    render(<ClusterCard candidate={makeCandidate({ status: "open" })} swarmType="debtor-email" />);
    const pill = screen.getByTestId("cluster-card-status");
    expect(pill.textContent).toBe("needs review");
    expect(pill.style.color).toContain("--v7-brand-patterns");
  });

  it("translates status='in_review' → 'being reviewed' with --v7-amber", () => {
    render(<ClusterCard candidate={makeCandidate({ status: "in_review" })} swarmType="debtor-email" />);
    const pill = screen.getByTestId("cluster-card-status");
    expect(pill.textContent).toBe("being reviewed");
    expect(pill.style.color).toContain("--v7-amber");
  });

  it("translates status='approved' → 'applied' with --v7-lime", () => {
    render(<ClusterCard candidate={makeCandidate({ status: "approved" })} swarmType="debtor-email" />);
    const pill = screen.getByTestId("cluster-card-status");
    expect(pill.textContent).toBe("applied");
    expect(pill.style.color).toContain("--v7-lime");
  });

  it("translates status='rejected' → 'dismissed'", () => {
    render(<ClusterCard candidate={makeCandidate({ status: "rejected" })} swarmType="debtor-email" />);
    expect(screen.getByTestId("cluster-card-status").textContent).toBe("dismissed");
  });

  it("translates status='rolled_back' → 'rolled back' with --v7-red", () => {
    render(<ClusterCard candidate={makeCandidate({ status: "rolled_back" })} swarmType="debtor-email" />);
    const pill = screen.getByTestId("cluster-card-status");
    expect(pill.textContent).toBe("rolled back");
    expect(pill.style.color).toContain("--v7-red");
  });
});

describe("ClusterCard — Review → CTA navigation", () => {
  it("renders a Link to /automations/{swarm}/patterns/{candidate_id}", () => {
    render(<ClusterCard candidate={makeCandidate({ id: "cand-xyz" })} swarmType="debtor-email" />);
    const cta = screen.getByTestId("cluster-card-review-cta");
    expect(cta.getAttribute("href")).toBe("/automations/debtor-email/patterns/cand-xyz");
    expect(cta.textContent).toContain("Review");
  });
});

describe("ClusterCard — anti-drift: no forbidden-jargon strings rendered", () => {
  it("rendered text never contains regex / eval_type / Wilson / LLM tiebreaker / coordinator_runs / swarm_intents / swarm_noise_categories / confirm_rate", () => {
    const { container } = render(
      <ClusterCard
        candidate={makeCandidate({
          status: "in_review",
          expected_savings_cents_per_month: 5000,
        })}
        swarmType="debtor-email"
      />,
    );
    const text = container.textContent ?? "";
    for (const forbidden of [
      "regex",
      "eval_type",
      "Wilson",
      "LLM tiebreaker",
      "coordinator_runs",
      "swarm_intents",
      "swarm_noise_categories",
      "confirm_rate",
    ]) {
      expect(text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
