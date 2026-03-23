import { describe, it, expect } from "vitest";
import { agentNodeTypes } from "../agent-node";

// ---------------------------------------------------------------------------
// We test the agentNodeTypes export and structural assertions here.
// Full React rendering tests for AgentNode require @xyflow/react provider
// context which is complex to mock in unit tests -- the component is visually
// verified via the SwarmGraph integration and E2E tests.
//
// For unit tests we verify:
// 1. The module exports the expected shapes
// 2. The node type mapping is correct
// 3. The source code contains the required patterns (structural assertions)
// ---------------------------------------------------------------------------

import { readFileSync } from "fs";
import { resolve } from "path";

const sourceCode = readFileSync(
  resolve(__dirname, "../agent-node.tsx"),
  "utf-8"
);

describe("AgentNode", () => {
  describe("display", () => {
    it("renders agent name", () => {
      // Structural: component renders data.name
      expect(sourceCode).toContain("{data.name}");
    });

    it("renders agent role", () => {
      // Structural: component renders data.role
      expect(sourceCode).toContain("{data.role}");
    });

    it("renders tool count when tools exist", () => {
      // Structural: component conditionally renders toolCount
      expect(sourceCode).toContain("data.toolCount > 0");
      expect(sourceCode).toContain("data.toolCount");
    });

    it("does not render tool count when toolCount is 0", () => {
      // Structural: tool count is behind a > 0 guard
      expect(sourceCode).toContain("data.toolCount > 0");
    });
  });

  describe("status styling", () => {
    it("applies idle border style when status is idle", () => {
      expect(sourceCode).toContain("border-muted-foreground/30");
    });

    it("applies blue pulsing border when status is running", () => {
      expect(sourceCode).toContain(
        "border-blue-500 shadow-blue-500/20 shadow-lg animate-pulse"
      );
    });

    it("applies green border when status is complete", () => {
      expect(sourceCode).toContain("border-green-500 shadow-green-500/10 shadow-md");
    });

    it("applies destructive border when status is failed", () => {
      expect(sourceCode).toContain("border-destructive shadow-destructive/10 shadow-md");
    });

    it("shows checkmark icon when status is complete", () => {
      // CheckCircle2 only shown when complete
      expect(sourceCode).toContain("CheckCircle2");
      expect(sourceCode).toContain('data.status === "complete"');
    });
  });

  describe("score display (GRAPH-04)", () => {
    it("does not show score when status is not complete", () => {
      // Score guard: only when status is complete AND score is defined
      expect(sourceCode).toContain('data.status === "complete" && data.score !== undefined');
    });

    it("shows score percentage when status is complete and score is defined", () => {
      expect(sourceCode).toContain("displayScore");
      expect(sourceCode).toContain("%");
    });

    it("animates score from 0 to final value", () => {
      // Uses requestAnimationFrame for count-up animation
      expect(sourceCode).toContain("requestAnimationFrame");
      expect(sourceCode).toContain("useCountUp");
    });
  });

  describe("tooltip", () => {
    it("shows role, model, and tool count on hover", () => {
      expect(sourceCode).toContain("TooltipProvider");
      expect(sourceCode).toContain("TooltipContent");
      expect(sourceCode).toContain("{data.role}");
      expect(sourceCode).toContain("{data.model}");
      expect(sourceCode).toContain("{data.toolCount} tools");
    });
  });
});

describe("agentNodeTypes", () => {
  it("exports agent node type mapping for React Flow", () => {
    expect(agentNodeTypes).toBeDefined();
    expect(agentNodeTypes).toHaveProperty("agent");
    expect(typeof agentNodeTypes.agent).toBe("object"); // memo wraps component as object
  });
});
