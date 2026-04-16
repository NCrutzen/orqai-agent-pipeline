import { describe, expect, it } from "vitest";
import {
  computeLayout,
  pickOrchestrator,
  type LayoutNode,
} from "@/lib/v7/graph/layout";
import type { SwarmAgent } from "@/lib/v7/types";

function makeAgent(
  agent_name: string,
  overrides: Partial<SwarmAgent> = {},
): SwarmAgent {
  return {
    id: agent_name,
    swarm_id: "swarm-1",
    agent_name,
    role: null,
    status: "idle",
    parent_agent: null,
    metrics: {},
    skills: [],
    orqai_deployment_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("pickOrchestrator", () => {
  it("returns null on empty input", () => {
    expect(pickOrchestrator([])).toBeNull();
  });

  it("picks an agent whose name contains 'orchestrator'", () => {
    const agents = [
      makeAgent("Beta_worker"),
      makeAgent("Alpha_orchestrator"),
      makeAgent("Gamma_worker"),
    ];
    expect(pickOrchestrator(agents)?.agent_name).toBe("Alpha_orchestrator");
  });

  it("falls back to a name starting with 'orch'", () => {
    const agents = [
      makeAgent("zeta"),
      makeAgent("OrchMain"),
      makeAgent("alpha"),
    ];
    expect(pickOrchestrator(agents)?.agent_name).toBe("OrchMain");
  });

  it("falls back to the alphabetically first agent_name", () => {
    const agents = [
      makeAgent("Zeta"),
      makeAgent("Alpha"),
      makeAgent("Mu"),
    ];
    expect(pickOrchestrator(agents)?.agent_name).toBe("Alpha");
  });

  it("is deterministic across input order shuffles", () => {
    const a = makeAgent("Alpha");
    const b = makeAgent("Bravo");
    const c = makeAgent("Charlie");
    expect(pickOrchestrator([a, b, c])?.agent_name).toBe("Alpha");
    expect(pickOrchestrator([c, b, a])?.agent_name).toBe("Alpha");
    expect(pickOrchestrator([b, a, c])?.agent_name).toBe("Alpha");
  });
});

describe("computeLayout", () => {
  it("returns [] for empty input", () => {
    expect(computeLayout([])).toEqual([]);
  });

  it("places single agent at the orchestrator anchor", () => {
    const layout = computeLayout([makeAgent("Solo")]);
    expect(layout).toHaveLength(1);
    expect(layout[0].isOrchestrator).toBe(true);
    expect(layout[0].xPct).toBeCloseTo(18);
    expect(layout[0].yPct).toBeCloseTo(50);
  });

  it("places three agents: orchestrator + two on the right fan", () => {
    const layout = computeLayout([
      makeAgent("Alpha"),
      makeAgent("Bravo"),
      makeAgent("Charlie"),
    ]);
    expect(layout).toHaveLength(3);
    const orch = layout.find((n) => n.isOrchestrator);
    expect(orch?.agent.agent_name).toBe("Alpha");
    const subs = layout.filter((n) => !n.isOrchestrator);
    expect(subs).toHaveLength(2);
    // Both subagents are right of the orchestrator
    expect(subs.every((s) => s.xPct > orch!.xPct)).toBe(true);
    // First subagent is upper-right; second is lower-right
    const [first, second] = subs.sort(
      (a, b) => a.agent.agent_name.localeCompare(b.agent.agent_name),
    );
    expect(first.yPct).toBeLessThan(second.yPct);
  });

  it("produces the same coordinates regardless of input order", () => {
    const a = makeAgent("Alpha");
    const b = makeAgent("Bravo");
    const c = makeAgent("Charlie");
    const layoutA = computeLayout([a, b, c]);
    const layoutB = computeLayout([c, b, a]);
    const sortById = (xs: LayoutNode[]) =>
      [...xs].sort((x, y) => x.id.localeCompare(y.id));
    const a0 = sortById(layoutA);
    const b0 = sortById(layoutB);
    expect(a0).toEqual(b0);
  });

  it("centers a single subagent's arc position at the middle of the fan", () => {
    const layout = computeLayout([
      makeAgent("Alpha_orchestrator"),
      makeAgent("Bravo"),
    ]);
    const sub = layout.find((n) => !n.isOrchestrator)!;
    expect(sub.yPct).toBeCloseTo(50, 1); // single subagent should sit at the orchestrator's y
  });
});
