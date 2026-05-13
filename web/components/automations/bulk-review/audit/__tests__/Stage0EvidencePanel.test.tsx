import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

afterEach(() => cleanup());
import { Stage0EvidencePanel } from "../Stage0EvidencePanel";
import type { Stage0AuditPayload } from "@/app/(dashboard)/automations/[swarm]/_shell/_lib/audit-types";

const empty: Stage0AuditPayload = {
  stage: 0,
  regex_patterns_fired: [],
  llm_injection_verdict: null,
  llm_reasoning: null,
  budget_headroom_cents: null,
  raw: {},
};

const full: Stage0AuditPayload = {
  stage: 0,
  regex_patterns_fired: ["^unsubscribe", "viagra\\b"],
  llm_injection_verdict: "flagged",
  llm_reasoning: "Detected suspicious instruction override pattern.",
  budget_headroom_cents: 12,
  raw: { foo: "bar" },
};

describe("Stage0EvidencePanel", () => {
  it("renders REASONING and EVIDENCE section headers when payload has data", () => {
    render(<Stage0EvidencePanel payload={full} />);
    expect(screen.getByText("REASONING")).toBeTruthy();
    expect(screen.getByText("EVIDENCE")).toBeTruthy();
  });

  it("renders each regex_patterns_fired entry as a chip with the literal pattern string", () => {
    render(<Stage0EvidencePanel payload={full} />);
    expect(screen.getByText("^unsubscribe")).toBeTruthy();
    expect(screen.getByText("viagra\\b")).toBeTruthy();
  });

  it("renders flagged verdict with stage0-verdict-flagged testid", () => {
    render(<Stage0EvidencePanel payload={full} />);
    const el = screen.getByTestId("stage0-verdict-flagged");
    expect(el).toBeTruthy();
  });

  it("renders clean verdict with stage0-verdict-clean testid", () => {
    render(
      <Stage0EvidencePanel
        payload={{ ...empty, llm_injection_verdict: "clean" }}
      />,
    );
    expect(screen.getByTestId("stage0-verdict-clean")).toBeTruthy();
  });

  it("renders null verdict as 'Injection check skipped'", () => {
    render(
      <Stage0EvidencePanel
        payload={{ ...empty, llm_reasoning: "x" }}
      />,
    );
    expect(screen.getByText("Injection check skipped")).toBeTruthy();
  });

  it("renders llm_reasoning body in REASONING block", () => {
    render(<Stage0EvidencePanel payload={full} />);
    expect(
      screen.getByText("Detected suspicious instruction override pattern."),
    ).toBeTruthy();
  });

  it("formats budget_headroom_cents as $0.12", () => {
    render(<Stage0EvidencePanel payload={full} />);
    expect(screen.getByText("Budget headroom: $0.12")).toBeTruthy();
  });

  it("renders null budget headroom as muted em-dash", () => {
    render(
      <Stage0EvidencePanel
        payload={{ ...empty, llm_injection_verdict: "clean" }}
      />,
    );
    expect(screen.getByText("Budget headroom: —")).toBeTruthy();
  });

  it("empty payload renders only locked empty-state copy without section headers", () => {
    render(<Stage0EvidencePanel payload={empty} />);
    expect(screen.getByText("No evidence captured for this stage.")).toBeTruthy();
    expect(screen.queryByText("REASONING")).toBeNull();
    expect(screen.queryByText("EVIDENCE")).toBeNull();
  });

  it("includes raw JSON slot placeholder", () => {
    render(<Stage0EvidencePanel payload={full} />);
    expect(screen.getByTestId("stage0-raw-json-slot")).toBeTruthy();
  });
});
