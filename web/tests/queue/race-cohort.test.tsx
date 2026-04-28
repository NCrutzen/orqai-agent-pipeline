// Phase 60-05 (D-21). Race-cohort banner only renders when the current
// selection's rule was promoted today AND there are remaining predicted
// rows for that rule.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RaceCohortBanner } from "@/app/(dashboard)/automations/debtor-email-review/race-cohort-banner";

const today = new Date();
today.setHours(8, 0, 0, 0);
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

describe("D-21: race-cohort banner shows for promoted-today rules with remaining predicted rows", () => {
  it("renders banner when selection.rule.promoted_at >= today AND count > 0", () => {
    render(
      <RaceCohortBanner
        selection={{ rule: "subject_paid_marker" }}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: today.toISOString() },
        ]}
        count={47}
      />,
    );
    expect(
      screen.getByText(/Bulk-clear remaining 47 predicted rows for promoted rule "subject_paid_marker"/),
    ).toBeInTheDocument();
  });

  it("hides banner when count === 0", () => {
    const { container } = render(
      <RaceCohortBanner
        selection={{ rule: "subject_paid_marker" }}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: today.toISOString() },
        ]}
        count={0}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides banner when promoted_at < today", () => {
    const { container } = render(
      <RaceCohortBanner
        selection={{ rule: "subject_paid_marker" }}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: yesterday.toISOString() },
        ]}
        count={47}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides banner when selection.rule is unset", () => {
    const { container } = render(
      <RaceCohortBanner
        selection={{}}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: today.toISOString() },
        ]}
        count={47}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides banner when promotedToday does not include the selected rule", () => {
    const { container } = render(
      <RaceCohortBanner
        selection={{ rule: "payment_subject" }}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: today.toISOString() },
        ]}
        count={47}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("CTA copy matches UI-SPEC verbatim", () => {
    render(
      <RaceCohortBanner
        selection={{ rule: "subject_paid_marker" }}
        promotedToday={[
          { rule_key: "subject_paid_marker", promoted_at: today.toISOString() },
        ]}
        count={47}
      />,
    );
    // Full CTA string check — at least one button (the banner CTA) carries
    // this exact aria-label.
    const ctaButtons = screen.getAllByRole("button", {
      name: /Bulk-clear remaining 47 predicted rows for promoted rule "subject_paid_marker"/,
    });
    expect(ctaButtons.length).toBeGreaterThanOrEqual(1);
  });
});
