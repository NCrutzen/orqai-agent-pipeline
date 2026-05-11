// Phase 81 Plan 03 Task 1 — RTL + URL-write test for noise-category chip strip.
//
// Cases (per plan acceptance criteria):
//   (a) Renders one chip per category + "All" + Pending tail pill.
//   (b) Click on a category chip → router.push with ?topic=<key> (sub removed).
//   (c) Click on "All" chip → router.push with no topic param.
//   (d) When activeSub === "pending", the Pending pill has aria-selected="true".
//   (e) When categories === [], "All" + Pending pill still render.
//   (f) (file-level grep) source file contains NO references to `swarm_intents`.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

  it("(a) renders one chip per category + All chip + Pending pill", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="all"
        candidateCount={3}
        activeSub={null}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    // categories (3) + "All" (1) + Pending pill (1) = 5
    expect(tabs).toHaveLength(categories.length + 2);
    expect(screen.getByRole("tab", { name: /^All —/ })).toBeInTheDocument();
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
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Payment —/ }));
    expect(push).toHaveBeenCalledTimes(1);
    const url = String(push.mock.calls[0][0]);
    expect(url).toContain("topic=payment");
    expect(url).not.toContain("sub=");
  });

  it("(c) click on All chip → push with no topic param", () => {
    render(
      <NoiseCategoryChipStrip
        categories={categories}
        counts={counts}
        activeTopic="payment"
        candidateCount={3}
        activeSub={null}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^All —/ }));
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
      />,
    );
    const pending = screen.getByRole("tab", { name: /Pending promotion/ });
    expect(pending.getAttribute("aria-selected")).toBe("true");
    // Conversely, "All" chip is no longer "active" while sub=pending.
    const all = screen.getByRole("tab", { name: /^All —/ });
    expect(all.getAttribute("aria-selected")).toBe("false");
  });

  it("(e) empty categories → All chip + Pending pill still render", () => {
    render(
      <NoiseCategoryChipStrip
        categories={[]}
        counts={[]}
        activeTopic="all"
        candidateCount={0}
        activeSub={null}
      />,
    );
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2); // All + Pending pill
    expect(screen.getByRole("tab", { name: /^All —/ })).toBeInTheDocument();
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
});
