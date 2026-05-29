// Phase 04.1 — Plan 06 (P4.1-D-01 + D-02 + D-03). ResolverChain tests.
//
// Behaviors:
//   T1. steps === null → renders `data-testid="stage-2-read-no-trace"` with
//       exact copy "Resolver path not recorded for this row." (SC #6).
//   T2. 4 steps + winner=2 → renders resolver-step-1..4; ONLY step-2 has
//       data-winner="true".
//   T3. winner step's detail panel is in DOM by default (auto-expanded).
//   T4. clicking a non-winner miss reveals its detail; winner detail remains.
//   T5. LLM tiebreaker winner + 2 candidates + picked id → exactly 2
//       tiebreaker-candidate articles; exactly one has data-picked="true"
//       matching the picked name.
//   T6. winner=null + steps populated → all 4 labels render; no winner
//       border; no candidate inline render.
//   T7. No raw hex anywhere in inline styles.
//
// Hard-separation: this component never reads swarm_noise_categories or
// swarm_intents — those vocabularies belong to Stage 1 and Stage 3
// respectively. Stage 2 vocabulary = resolver_steps + winner_step + the
// tiebreaker candidates plumbed via inputs JSONB.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ResolverStep } from "@/lib/bulk-review/types";
import {
  ResolverChain,
  type ResolverChainCandidate,
} from "../resolver-chain";

afterEach(() => cleanup());

function makeFourSteps(): ResolverStep[] {
  return [
    {
      step: "thread",
      idx: 1,
      status: "miss",
      confidence: null,
      detail: { reason: "no prior thread" },
    },
    {
      step: "sender_map",
      idx: 2,
      status: "matched",
      confidence: 0.95,
      detail: { account_id: "acc-1", source: "sender_map" },
    },
    {
      step: "identifier",
      idx: 3,
      status: "not_run",
      confidence: null,
      detail: null,
    },
    {
      step: "llm_tiebreaker",
      idx: 4,
      status: "not_run",
      confidence: null,
      detail: null,
    },
  ];
}

describe("ResolverChain", () => {
  it("T1: steps === null renders empty-state with exact SC #6 copy", () => {
    render(
      <ResolverChain
        steps={null}
        winner={null}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    const node = screen.getByTestId("stage-2-read-no-trace");
    expect(node).toHaveTextContent(
      "Resolver path not recorded for this row.",
    );
  });

  it("T2: 4 steps + winner=2 → only step-2 has data-winner='true'", () => {
    render(
      <ResolverChain
        steps={makeFourSteps()}
        winner={2}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    for (const idx of [1, 2, 3, 4]) {
      expect(screen.getByTestId(`resolver-step-${idx}`)).toBeInTheDocument();
    }
    expect(
      screen.getByTestId("resolver-step-2").getAttribute("data-winner"),
    ).toBe("true");
    for (const idx of [1, 3, 4]) {
      expect(
        screen.getByTestId(`resolver-step-${idx}`).getAttribute("data-winner"),
      ).toBe("false");
    }
  });

  it("T3: winner step detail is auto-expanded (in DOM by default)", () => {
    render(
      <ResolverChain
        steps={makeFourSteps()}
        winner={2}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    expect(
      screen.getByTestId("resolver-step-2-detail"),
    ).toBeInTheDocument();
  });

  it("T4: clicking non-winner miss reveals detail; winner detail stays", () => {
    render(
      <ResolverChain
        steps={makeFourSteps()}
        winner={2}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    expect(screen.queryByTestId("resolver-step-1-detail")).toBeNull();
    fireEvent.click(screen.getByTestId("resolver-step-1"));
    expect(
      screen.getByTestId("resolver-step-1-detail"),
    ).toBeInTheDocument();
    // Winner remains expanded — accordion does NOT collapse winner.
    expect(
      screen.getByTestId("resolver-step-2-detail"),
    ).toBeInTheDocument();
  });

  it("T5: LLM tiebreaker winner renders both candidates inline; picked one marked", () => {
    const steps = makeFourSteps();
    steps[3] = {
      step: "llm_tiebreaker",
      idx: 4,
      status: "picked",
      confidence: 0.8,
      detail: { reason: "ambiguous sender" },
    };
    const candidates: ResolverChainCandidate[] = [
      { id: "a", name: "Alpha", contact_person: null, recent_invoices: [] },
      { id: "b", name: "Bravo", contact_person: null, recent_invoices: [] },
    ];
    render(
      <ResolverChain
        steps={steps}
        winner={4}
        tiebreaker_candidates={candidates}
        tiebreaker_picked_account_id="b"
      />,
    );
    const articles = screen.getAllByTestId("tiebreaker-candidate");
    expect(articles).toHaveLength(2);
    const picked = articles.filter(
      (el) => el.getAttribute("data-picked") === "true",
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]).toHaveTextContent("Bravo");
  });

  it("T6: winner=null + steps populated → all labels render, no winner border, no candidates inline", () => {
    render(
      <ResolverChain
        steps={makeFourSteps()}
        winner={null}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    expect(screen.getByText("Thread inheritance")).toBeInTheDocument();
    expect(screen.getByText("Sender map")).toBeInTheDocument();
    expect(screen.getByText("Identifier match")).toBeInTheDocument();
    expect(screen.getByText("AI tiebreaker")).toBeInTheDocument();
    // None of the steps should be a winner.
    for (const idx of [1, 2, 3, 4]) {
      expect(
        screen.getByTestId(`resolver-step-${idx}`).getAttribute("data-winner"),
      ).toBe("false");
    }
    expect(screen.queryByTestId("tiebreaker-candidate")).toBeNull();
  });

  it("T7: no raw hex in inline styles anywhere in rendered DOM", () => {
    const { container } = render(
      <ResolverChain
        steps={makeFourSteps()}
        winner={2}
        tiebreaker_candidates={null}
        tiebreaker_picked_account_id={null}
      />,
    );
    const styled = container.querySelectorAll("[style]");
    for (const el of Array.from(styled)) {
      const style = el.getAttribute("style") ?? "";
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
