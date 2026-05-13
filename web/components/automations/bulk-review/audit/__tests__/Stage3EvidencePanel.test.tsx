import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { Stage3EvidencePanel } from "../Stage3EvidencePanel";
import type { Stage3AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";

const empty: Stage3AuditPayload = {
  stage: 3,
  ranked_intents: [],
  coordinator_reasoning: null,
  selected_intent_key: null,
  raw: {},
};

const fullTopSelected: Stage3AuditPayload = {
  stage: 3,
  ranked_intents: [
    { intent_key: "invoice_copy_request", confidence: 0.92 },
    { intent_key: "payment_promise", confidence: 0.55 },
    { intent_key: "dispute", confidence: 0.18 },
  ],
  coordinator_reasoning:
    "Sender explicitly asks for a duplicate invoice PDF; no payment commitment.",
  selected_intent_key: "invoice_copy_request",
  raw: {},
};

const midRankSelected: Stage3AuditPayload = {
  stage: 3,
  ranked_intents: [
    { intent_key: "invoice_copy_request", confidence: 0.62 },
    { intent_key: "payment_promise", confidence: 0.58 },
    { intent_key: "dispute", confidence: 0.21 },
  ],
  coordinator_reasoning: "Operator override applied — promise overrides copy.",
  selected_intent_key: "payment_promise",
  raw: {},
};

const emptyRankedWithReasoning: Stage3AuditPayload = {
  stage: 3,
  ranked_intents: [],
  coordinator_reasoning: "Coordinator returned no candidates above threshold.",
  selected_intent_key: null,
  raw: {},
};

describe("Stage3EvidencePanel", () => {
  it("renders coordinator reasoning body when present", () => {
    render(<Stage3EvidencePanel payload={fullTopSelected} />);
    expect(
      screen.getByText(
        "Sender explicitly asks for a duplicate invoice PDF; no payment commitment.",
      ),
    ).toBeTruthy();
  });

  it("renders selected top-rank intent with selected testid", () => {
    render(<Stage3EvidencePanel payload={fullTopSelected} />);
    const selected = screen.getByTestId("stage3-intent-row-selected");
    expect(selected.textContent).toContain("invoice_copy_request");
    expect(selected.textContent).toContain("92%");
  });

  it("renders non-selected rows with per-key testids", () => {
    render(<Stage3EvidencePanel payload={fullTopSelected} />);
    const promise = screen.getByTestId("stage3-intent-row-payment_promise");
    expect(promise.textContent).toContain("payment_promise");
    expect(promise.textContent).toContain("55%");
    const dispute = screen.getByTestId("stage3-intent-row-dispute");
    expect(dispute.textContent).toContain("dispute");
    expect(dispute.textContent).toContain("18%");
  });

  it("highlights mid-rank entry when selected_intent_key is not the top", () => {
    render(<Stage3EvidencePanel payload={midRankSelected} />);
    const selected = screen.getByTestId("stage3-intent-row-selected");
    expect(selected.textContent).toContain("payment_promise");
    // top entry is now rendered as a non-selected row
    expect(
      screen.getByTestId("stage3-intent-row-invoice_copy_request"),
    ).toBeTruthy();
  });

  it("empty ranked_intents renders locked empty-state copy", () => {
    render(<Stage3EvidencePanel payload={emptyRankedWithReasoning} />);
    expect(
      screen.getByText("No ranked intents returned by coordinator."),
    ).toBeTruthy();
  });

  it("all-null payload renders only top-level empty-state line", () => {
    render(<Stage3EvidencePanel payload={empty} />);
    expect(
      screen.getByText("No ranked intents returned by coordinator."),
    ).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
    expect(screen.queryByText("EVIDENCE")).toBeNull();
  });

  it("includes raw JSON slot placeholder", () => {
    render(<Stage3EvidencePanel payload={fullTopSelected} />);
    expect(screen.getByTestId("stage3-raw-json-slot")).toBeTruthy();
  });

  it("hard-separation: rendered DOM contains no noise-registry vocabulary", () => {
    const { container } = render(
      <Stage3EvidencePanel payload={fullTopSelected} />,
    );
    expect(screen.queryByText(/rule_key|noise/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/rule_key/);
    expect(container.innerHTML).not.toMatch(/swarm_noise/);
  });
});
