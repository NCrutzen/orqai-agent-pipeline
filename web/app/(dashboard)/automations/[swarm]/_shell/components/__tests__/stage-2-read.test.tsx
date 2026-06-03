// Phase 04.1 Plan 06 — Stage 2 Read column tests (updated).
//
// Replaces the Phase 2 Plan 02-05 static-STEPS placeholder behavior. The
// 4-step rendering now lives in <ResolverChain>; this file exercises the
// chrome around it (placeholder, customer line, brand badge, no edit
// affordances, section label) and the wiring of resolver_steps +
// winner_step into the chain.
//
// Behavior locks:
//   T1. resolver_steps populated → 4 resolver-step-N rows render in order.
//   T2. resolver_source='sender_map' + winner_step=2 → step-2 marked
//       data-winner='true'; others 'false'.
//   T3. resolver_source='llm_tiebreaker' + winner_step=4 → step-4 winner.
//   T3b. resolver_source='identifier_match' + winner_step=3 → step-3 winner.
//   T4. stage_2 === null → "Stage 2 has not yet run on this row.".
//   T4b. resolver_steps === null → SC #6 empty-state copy renders.
//   T5. Brand badge renders var(--v7-brand-<brand>-soft) / fg token; null
//       brand → no badge.
//   T6. Customer line: "Customer: <id>" when present, "Customer: —" when null.
//   T7. NO inputs / dropdowns — pure read-only (collapse toggles ARE
//       allowed as clickable divs, not <button>).

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type {
  BulkReviewRow,
  BulkReviewStage2Slot,
  ResolverStep,
} from "@/lib/bulk-review/types";
import { Stage2Read } from "../stage-2-read";

function makeSteps(): ResolverStep[] {
  return [
    { step: "thread", idx: 1, status: "miss", confidence: null, detail: null },
    {
      step: "sender_map",
      idx: 2,
      status: "matched",
      confidence: 0.95,
      detail: { account_id: "CUST-001" },
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

afterEach(() => cleanup());

function makeRow(stage2: BulkReviewStage2Slot | null): BulkReviewRow {
  return {
    email_label_id: "row-1",
    swarm_type: "debtor-email",
    email_id: "e-1",
    context_version: "1.0.0",
    stage_0: null,
    stage_1: null,
    stage_2: stage2,
    stage_3: null,
    stage_3p5: null,
    stage_4: null,
    overrides: {
      axis_1_corrected_category: null,
      axis_1_human_verdict: null,
      axis_2_corrected_customer_account_id: null,
      axis_2_reviewed_by: null,
      axis_2_reviewed_at: null,
      axis_4_draft_quality: null,
      axis_4_feedback_reason: null,
      axis_3_event_ids: [],
    },
  };
}

function makeSlot(
  overrides: Partial<BulkReviewStage2Slot> = {},
): BulkReviewStage2Slot {
  return {
    entity_brand: "smeba",
    resolver_source: "sender_map",
    customer_account_id: "CUST-001",
    corrected_customer_account_id: null,
    confidence: 0.8,
    pipeline_event_id: "pe-2",
    resolver_steps: null,
    winner_step: null,
    customer_name: null,
    sender_map_lineage: null,
    inputs: null,
    ...overrides,
  };
}

describe("Stage2Read", () => {
  it("T1: renders 4 resolver-step rows in fixed operator-facing order", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({ resolver_steps: makeSteps(), winner_step: 2 }),
        )}
      />,
    );
    const steps = screen.getAllByTestId(/^resolver-step-\d$/);
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent("Thread inheritance");
    expect(steps[1]).toHaveTextContent("Sender map");
    expect(steps[2]).toHaveTextContent("Identifier match");
    expect(steps[3]).toHaveTextContent("AI tiebreaker");
  });

  it("Plan 08: llm_tiebreaker inputs + null steps → standalone candidate analysis (not the empty chain)", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            resolver_source: "llm_tiebreaker",
            resolver_steps: null,
            customer_account_id: "587924",
            inputs: {
              kind: "llm_tiebreaker",
              sender_email: "j.smid@berki.nl",
              matched_identifiers: [],
              llm_reason: "No decisive signal; choosing lowest-index candidate.",
              picked_account_id: null,
              candidates: [
                {
                  id: "587924",
                  name: "Nooteboom Trailers B.V.",
                  contact_person: "de crediteurenadministratie",
                  recent_invoices: ["17006487", "17006488"],
                },
                {
                  id: "588020",
                  name: "Fa Van Tuijl Kesteren",
                  contact_person: "Van Tuijl",
                  recent_invoices: ["17007389"],
                },
              ],
            },
          }),
        )}
      />,
    );
    // Standalone analysis block renders, NOT the "Resolver path not recorded" chain.
    expect(
      screen.getByTestId("stage-2-tiebreaker-analysis"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("stage-2-read-no-trace")).toBeNull();
    const candidates = screen.getAllByTestId("tiebreaker-candidate");
    expect(candidates).toHaveLength(2);
    // Picked is derived from the resolved customer_account_id (no picked_account_id in data).
    expect(candidates[0]).toHaveAttribute("data-picked", "true");
    expect(candidates[0]).toHaveTextContent("Nooteboom Trailers B.V.");
    expect(candidates[1]).toHaveAttribute("data-picked", "false");
    expect(screen.getByTestId("stage-2-tiebreaker-reason")).toHaveTextContent(
      "No decisive signal",
    );
  });

  it("T2: winner_step=2 → step-2 data-winner='true', others 'false'", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            resolver_source: "sender_map",
            resolver_steps: makeSteps(),
            winner_step: 2,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("resolver-step-2").getAttribute("data-winner"),
    ).toBe("true");
    for (const idx of [1, 3, 4]) {
      expect(
        screen.getByTestId(`resolver-step-${idx}`).getAttribute("data-winner"),
      ).toBe("false");
    }
  });

  it("T3: winner_step=4 (llm_tiebreaker) → step-4 winner", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            resolver_source: "llm_tiebreaker",
            resolver_steps: makeSteps(),
            winner_step: 4,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("resolver-step-4").getAttribute("data-winner"),
    ).toBe("true");
  });

  it("T3b: winner_step=3 (identifier_match) → step-3 winner", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            resolver_source: "identifier_match",
            resolver_steps: makeSteps(),
            winner_step: 3,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("resolver-step-3").getAttribute("data-winner"),
    ).toBe("true");
  });

  it("T4: stage_2 === null → placeholder", () => {
    render(<Stage2Read row={makeRow(null)} />);
    expect(
      screen.getByTestId("stage-2-read-placeholder"),
    ).toHaveTextContent("Stage 2 has not yet run on this row.");
    expect(screen.queryAllByTestId(/^resolver-step-/)).toHaveLength(0);
  });

  it("T4b (SC #6): resolver_steps === null → 'Resolver path not recorded' empty state", () => {
    render(
      <Stage2Read
        row={makeRow(makeSlot({ resolver_steps: null, winner_step: null }))}
      />,
    );
    expect(
      screen.getByTestId("stage-2-read-no-trace"),
    ).toHaveTextContent("Resolver path not recorded for this row.");
  });

  it("T5a: brand badge renders for entity_brand='smeba'", () => {
    render(
      <Stage2Read row={makeRow(makeSlot({ entity_brand: "smeba" }))} />,
    );
    const badge = screen.getByTestId("stage-2-read-brand-badge");
    expect(badge).toHaveTextContent("smeba");
    expect(badge.getAttribute("style") ?? "").toMatch(
      /--v7-brand-smeba(-soft)?/,
    );
  });

  it("T5b: no badge when entity_brand === null", () => {
    render(
      <Stage2Read row={makeRow(makeSlot({ entity_brand: null }))} />,
    );
    expect(
      screen.queryByTestId("stage-2-read-brand-badge"),
    ).not.toBeInTheDocument();
  });

  it("T6a: Customer line shows account id when present", () => {
    render(
      <Stage2Read
        row={makeRow(makeSlot({ customer_account_id: "CUST-42" }))}
      />,
    );
    const line = screen.getByTestId("stage-2-read-customer");
    expect(line).toHaveTextContent(/Customer/);
    expect(line).toHaveTextContent("CUST-42");
  });

  it("T6b: Customer line shows em-dash when null", () => {
    render(
      <Stage2Read row={makeRow(makeSlot({ customer_account_id: null }))} />,
    );
    const line = screen.getByTestId("stage-2-read-customer");
    expect(line).toHaveTextContent("—");
  });

  // Plan 03-13 (UAT r3-1) — customer NAME headline + account sub-line.
  it("03-13 T1: renders customer_name as the headline + acct sub-line when present", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            customer_name: "Vos Logistics Technical Department B.V.",
            customer_account_id: "506909",
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("stage-2-read-customer-name").textContent,
    ).toBe("Vos Logistics Technical Department B.V.");
    expect(
      screen.getByTestId("stage-2-read-customer-acct").textContent,
    ).toContain("506909");
  });

  it("03-13 T2: prefers corrected_customer_account_id for the acct sub-line", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            customer_name: "SPIE Building Solutions",
            customer_account_id: "111111",
            corrected_customer_account_id: "592018",
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("stage-2-read-customer-acct").textContent,
    ).toContain("592018");
  });

  it("03-13 T3: customer_name null → account-only line, NO '(name unavailable)' / fabricated name", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({ customer_name: null, customer_account_id: "529909" }),
        )}
      />,
    );
    const line = screen.getByTestId("stage-2-read-customer");
    expect(line.textContent).toContain("529909");
    expect(line.textContent).not.toContain("(name unavailable)");
    expect(line.textContent).not.toMatch(/unavailable/i);
    // No name headline element when there is no name.
    expect(
      screen.queryByTestId("stage-2-read-customer-name"),
    ).not.toBeInTheDocument();
  });

  it("03-13 T4: resolver empty-state preserved when steps null and a name is present", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            customer_name: "Vos Logistics B.V.",
            resolver_steps: null,
            winner_step: null,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("stage-2-read-no-trace"),
    ).toHaveTextContent("Resolver path not recorded for this row.");
  });

  it("T7: renders NO buttons, inputs, selects — pure read-only", () => {
    const { container } = render(
      <Stage2Read row={makeRow(makeSlot())} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.querySelectorAll("input")).toHaveLength(0);
    expect(container.querySelectorAll("select")).toHaveLength(0);
  });

  it("T7b: section label CUSTOMER RESOLUTION renders", () => {
    render(<Stage2Read row={makeRow(makeSlot())} />);
    expect(screen.getByText("CUSTOMER RESOLUTION")).toBeInTheDocument();
  });

  it("T2b: at most one winner step rendered", () => {
    render(
      <Stage2Read
        row={makeRow(
          makeSlot({
            resolver_source: "sender_map",
            resolver_steps: makeSteps(),
            winner_step: 2,
          }),
        )}
      />,
    );
    const winners = screen
      .getAllByTestId(/^resolver-step-\d$/)
      .filter((el) => el.getAttribute("data-winner") === "true");
    expect(winners).toHaveLength(1);
  });
});
