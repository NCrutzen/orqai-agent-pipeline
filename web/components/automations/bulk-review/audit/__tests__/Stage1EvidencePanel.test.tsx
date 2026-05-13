import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { Stage1EvidencePanel } from "../Stage1EvidencePanel";
import type { Stage1AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";

const empty: Stage1AuditPayload = {
  stage: 1,
  rule_key: null,
  predictor_source: null,
  confidence: null,
  reasoning: null,
  raw: {},
};

const pass1Regex: Stage1AuditPayload = {
  stage: 1,
  rule_key: "newsletter",
  predictor_source: "regex",
  confidence: "high",
  reasoning: null,
  raw: {},
};

const pass2Llm: Stage1AuditPayload = {
  stage: 1,
  rule_key: "unknown",
  predictor_source: "llm",
  confidence: "medium",
  reasoning: "Email looks like marketing but mentions an invoice number",
  raw: {},
};

describe("Stage1EvidencePanel", () => {
  it("Pass-1 regex degraded mode renders locked degraded copy", () => {
    render(<Stage1EvidencePanel payload={pass1Regex} />);
    expect(
      screen.getByText("Regex Pass-1 matched — no LLM reasoning produced."),
    ).toBeTruthy();
  });

  it("Pass-1 regex renders rule chip 'newsletter'", () => {
    render(<Stage1EvidencePanel payload={pass1Regex} />);
    const chip = screen.getByTestId("stage1-rule-chip");
    expect(chip.textContent).toContain("newsletter");
  });

  it("Pass-1 regex renders predictor chip 'regex'", () => {
    render(<Stage1EvidencePanel payload={pass1Regex} />);
    const chip = screen.getByTestId("stage1-predictor-chip");
    expect(chip.textContent).toContain("regex");
  });

  it("Pass-1 regex renders confidence chip 'high'", () => {
    render(<Stage1EvidencePanel payload={pass1Regex} />);
    const chip = screen.getByTestId("stage1-confidence-chip");
    expect(chip.textContent).toContain("high");
  });

  it("Pass-2 LLM renders reasoning body", () => {
    render(<Stage1EvidencePanel payload={pass2Llm} />);
    expect(
      screen.getByText(
        "Email looks like marketing but mentions an invoice number",
      ),
    ).toBeTruthy();
  });

  it("Pass-2 LLM renders rule chip 'unknown'", () => {
    render(<Stage1EvidencePanel payload={pass2Llm} />);
    const chip = screen.getByTestId("stage1-rule-chip");
    expect(chip.textContent).toContain("unknown");
  });

  it("all-null payload renders only empty-state copy", () => {
    render(<Stage1EvidencePanel payload={empty} />);
    expect(
      screen.getByText("No evidence captured for this stage."),
    ).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
    expect(screen.queryByText("EVIDENCE")).toBeNull();
  });

  it("includes raw JSON slot placeholder", () => {
    render(<Stage1EvidencePanel payload={pass2Llm} />);
    expect(screen.getByTestId("stage1-raw-json-slot")).toBeTruthy();
  });

  it("hard-separation: rendered DOM contains no intent vocabulary", () => {
    const { container } = render(<Stage1EvidencePanel payload={pass2Llm} />);
    expect(screen.queryByText(/intent/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/intent_key/);
    expect(container.innerHTML).not.toMatch(/ranked_intents/);
  });
});
