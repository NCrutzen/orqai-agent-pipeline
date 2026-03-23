import { describe, it } from "vitest";

describe("AgentNode", () => {
  describe("display", () => {
    it.todo("renders agent name");
    it.todo("renders agent role");
    it.todo("renders tool count when tools exist");
    it.todo("does not render tool count when toolCount is 0");
  });

  describe("status styling", () => {
    it.todo("applies idle border style when status is idle");
    it.todo("applies blue pulsing border when status is running");
    it.todo("applies green border when status is complete");
    it.todo("applies destructive border when status is failed");
    it.todo("shows checkmark icon when status is complete");
  });

  describe("score display (GRAPH-04)", () => {
    it.todo("does not show score when status is not complete");
    it.todo("shows score percentage when status is complete and score is defined");
    it.todo("animates score from 0 to final value");
  });

  describe("tooltip", () => {
    it.todo("shows role, model, and tool count on hover");
  });
});

describe("agentNodeTypes", () => {
  it.todo("exports agent node type mapping for React Flow");
});
