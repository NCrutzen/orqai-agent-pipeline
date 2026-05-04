// Phase 65-05 Task 2 — TDD test for the partial_synthesis Bulk Review badge.
//
// Locked behaviours:
//   1. partial_synthesis=true → renders "Partial" text.
//   2. partial_synthesis=false AND escalation_decision='single_shot' → renders nothing.
//   3. escalation_decision='orchestrator' (no partial) → renders "Multi-intent".

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CoordinatorBadge } from "../_components/CoordinatorBadge";

describe("CoordinatorBadge", () => {
  afterEach(() => cleanup());


  it("renders 'Partial' when partial_synthesis is true", () => {
    render(
      <CoordinatorBadge
        partial_synthesis={true}
        escalation_decision="orchestrator"
        escalation_reason="high_intent_count"
      />,
    );
    expect(screen.getByTestId("coordinator-badge")).toHaveTextContent("Partial");
  });

  it("renders nothing for the single-shot fast path with no partial flag", () => {
    const { container } = render(
      <CoordinatorBadge
        partial_synthesis={false}
        escalation_decision="single_shot"
        escalation_reason={null}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders 'Multi-intent' for the orchestrator path without partial flag", () => {
    render(
      <CoordinatorBadge
        partial_synthesis={false}
        escalation_decision="orchestrator"
        escalation_reason="high_intent_count"
      />,
    );
    expect(screen.getByTestId("coordinator-badge")).toHaveTextContent(
      "Multi-intent",
    );
  });
});
