// Phase 81 Plan 03 Task 1 — RTL + URL-write test for noise-category chip strip.
// Phase 88 Plan 03 — rewired to verdictPendingCount prop (was needsReviewCount
// client-side aggregation over `topic !== "skip"`). Added zero-case + default
// landing visual-active assertions per D-02c.
//
// Cases (per plan acceptance criteria):
//   (a) Renders one chip per category + "Needs review" + Pending tail pill.
//   (b) Click on a category chip → router.push with ?topic=<key> (sub removed).
//   (c) Click on "Needs review" chip → router.push with no topic param.
//   (d) When activeSub === "pending", the Pending pill has aria-selected="true".
//   (e) When categories === [], "Needs review" + Pending pill still render.
//   (f) (file-level grep) source file contains NO references to `swarm_intents`.
//   (g) Phase 88: verdictPendingCount=12 → badge "12" on Needs review chip.
//   (h) Phase 88: verdictPendingCount=0 → Needs review chip still renders (no hide).
//   (i) Phase 88 D-02c default landing — Needs review chip active when no
//        ?topic / ?sub (verifies the default-landing visual-active state).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/automations/debtor-email/stage-1",
  useSearchParams: () => new URLSearchParams(""),
}));

import { NoiseCategoryChipStrip } from "../noise-category-chip-strip";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { QueueCountRow } from "../page";

function cat(
  category_key: string,
  display_label: string,
): SwarmNoiseCategoryRow {
  return {
    swarm_type: "debtor-email",
    category_key,
    display_label,
    outlook_label: null,
    action: "categorize_archive",
    swarm_dispatch: null,
    display_order: 0,
    enabled: true,
  };
}

function count(topic: string | null, n: number): QueueCountRow {
  return {
    swarm_type: "debtor-email",
    topic,
    entity: null,
    mailbox_id: null,
    count: n,
  };
}

beforeEach(() => {
  push.mockReset();
});
afterEach(() => {
  cleanup();
});

describe("NoiseCategoryChipStrip", () => {
  const categories = [
    cat("payment", "Payment"),
    cat("dispute", "Dispute"),
    cat("unknown", "Unknown"),
  ];
  const counts: QueueCountRow[] = [
    count("payment", 12),
    count("dispute", 4),
    count("unknown", 7),
  ];

  it("(a) renders one chip per category + Needs review chip + Pending pill", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={5}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // categories (3) + "Needs review" (1) + Pending pill (1) = 5
    expect(tabs).toHaveLength(categories.length + 2);
    expect(screen.getByRole("tab", { name: /^Needs review —/ })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /^Payment —/ }),
    ).toBeInTheDocument();
    // "unknown" is rendered as a regular chip (NO special-casing).
    expect(
      screen.getByRole("tab", { name: /^Unknown —/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Pending promotion/ }),
    ).toBeInTheDocument();
  });

  it("(b) click on Payment chip → push with ?topic=payment and no ?sub", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={5}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Payment —/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).toContain("topic=payment");
    expect(url).not.toContain("sub=");
  });

  it("(c) click on Needs review chip → push with no topic param", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="payment"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={5}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Needs review —/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).not.toContain("topic=");
    expect(url).not.toContain("sub=");
  });

  it("(d) activeSub='pending' → Pending pill has aria-selected=true", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub="pending"
        verdictPendingCount={5}
      />,
    );
    const pending = screen.getByRole("tab", { name: /Pending promotion/ });
    expect(pending.getAttribute("aria-selected")).toBe("true");
    // Conversely, "Needs review" chip is no longer "active" while sub=pending.
    const needsReview = screen.getByRole("tab", { name: /^Needs review —/ });
    expect(needsReview.getAttribute("aria-selected")).toBe("false");
  });

  it("(e) empty categories → Needs review chip + Pending pill still render", () => {
    render(
      <NoiseCategoryChipStrip
        categories={[]}
        counts={[]}
        activeTopic="all"
        candidateCount={0}
        activeSub={null}
        verdictPendingCount={0}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2); // Needs review + Pending pill
    expect(screen.getByRole("tab", { name: /^Needs review —/ })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Pending promotion/ }),
    ).toBeInTheDocument();
  });

  it("(f) source file does NOT reference swarm_intents (hard-separation lock)", () => {
    // Static-source-grep gate: Stage 1 surface reads swarm_noise_categories only.
    const src = readFileSync(
      resolve(__dirname, "../noise-category-chip-strip.tsx"),
      "utf8",
    );
    expect(src).not.toContain("swarm_intents");
  });

  it("(g) Phase 88: verdictPendingCount=12 → badge '12' on Needs review chip", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={12}
      />,
    );
    const needsReview = screen.getByRole("tab", { name: /^Needs review —/ });
    // Badge sits inside the chip as a child span; assert the chip subtree
    // contains the literal "12" — not the unrelated `count("payment", 12)`
    // which renders on the Payment chip's badge.
    expect(within(needsReview).getByText("12")).toBeInTheDocument();
    // The aria-label also encodes the count ("Needs review — 12 rows").
    expect(needsReview.getAttribute("aria-label")).toMatch(/Needs review — 12 rows/);
  });

  it("(h) Phase 88: verdictPendingCount=0 → Needs review chip still renders with badge 0", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={0}
      />,
    );
    const needsReview = screen.getByRole("tab", { name: /^Needs review —/ });
    expect(needsReview).toBeInTheDocument();
    expect(within(needsReview).getByText("0")).toBeInTheDocument();
    expect(needsReview.getAttribute("aria-label")).toMatch(/Needs review — 0 rows/);
  });

  it("(i) Phase 88 D-02c default landing — Needs review chip active when no topic/sub", () => {
    // Default-landing contract: activeTopic="all" + activeSub=null →
    // Needs review chip is visually active (aria-selected="true"). Verifies
    // the URL-less landing renders the chip in its highlighted state so
    // operators see "you are looking at the verdict-pending bucket" without
    // needing to click anything.
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
        verdictPendingCount={7}
      />,
    );
    const needsReview = screen.getByRole("tab", { name: /^Needs review —/ });
    expect(needsReview.getAttribute("aria-selected")).toBe("true");
    // No category chip should be active in the default landing.
    expect(
      screen.getByRole("tab", { name: /^Payment —/ }).getAttribute("aria-selected"),
    ).toBe("false");
  });
});
