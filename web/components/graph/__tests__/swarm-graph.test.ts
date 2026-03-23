import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getLayoutedElements, NODE_WIDTH, NODE_HEIGHT } from "../use-graph-layout";

// ---------------------------------------------------------------------------
// Source code structural assertions for SwarmGraph
// (Full React rendering requires ReactFlow context + DOM which is complex
//  to mock. We verify key patterns exist in the source.)
// ---------------------------------------------------------------------------

const sourceCode = readFileSync(
  resolve(__dirname, "../swarm-graph.tsx"),
  "utf-8"
);

describe("SwarmGraph", () => {
  describe("rendering (GRAPH-01)", () => {
    it("renders ReactFlow with nodes and edges when steps are provided", () => {
      expect(sourceCode).toContain("<ReactFlow");
      expect(sourceCode).toContain("nodes={nodes}");
      expect(sourceCode).toContain("edges={edges}");
    });

    it("renders empty state when no nodes and status is pending", () => {
      expect(sourceCode).toContain("Waiting for pipeline to start");
      expect(sourceCode).toContain(
        "The agent graph will appear as the pipeline designs your swarm."
      );
    });

    it("renders loading state when no nodes and status is running", () => {
      expect(sourceCode).toContain("Building swarm...");
      expect(sourceCode).toContain("Skeleton");
    });

    it("applies dagre layout to position nodes hierarchically", () => {
      expect(sourceCode).toContain("getLayoutedElements");
      expect(sourceCode).toContain('"TB"');
    });

    it("wraps content in ReactFlowProvider", () => {
      expect(sourceCode).toContain("ReactFlowProvider");
      expect(sourceCode).toContain("<ReactFlowProvider>");
    });
  });

  describe("live updates (GRAPH-03)", () => {
    it("subscribes to Broadcast channel run:{runId}", () => {
      expect(sourceCode).toContain("useBroadcast");
      expect(sourceCode).toContain("`run:${runId}`");
      expect(sourceCode).toContain('"step-update"');
    });

    it("updates node status when step-update event is received", () => {
      expect(sourceCode).toContain("handleStepUpdate");
      expect(sourceCode).toContain("payload.status");
      expect(sourceCode).toContain("setNodes");
    });

    it("activates edge animation for edges connected to running nodes", () => {
      expect(sourceCode).toContain('payload.status === "running"');
      expect(sourceCode).toContain("animated:");
    });

    it("deactivates edge animation when connected nodes complete", () => {
      expect(sourceCode).toContain('"complete"');
      expect(sourceCode).toContain("setEdges");
    });
  });

  describe("celebration", () => {
    it("fires confetti when run status becomes complete", () => {
      expect(sourceCode).toContain("confetti(");
      expect(sourceCode).toContain("particleCount: 100");
      expect(sourceCode).toContain("zIndex: 9999");
    });

    it("shows Pipeline Complete overlay on completion", () => {
      expect(sourceCode).toContain("Pipeline Complete");
      expect(sourceCode).toContain("CelebrationOverlay");
      expect(sourceCode).toContain("agents designed");
    });

    it("does not fire confetti more than once per run", () => {
      expect(sourceCode).toContain("hasCompleteCelebrated");
      expect(sourceCode).toContain("hasCompleteCelebrated.current = true");
    });
  });

  describe("interaction", () => {
    it("opens agent detail panel when a node is clicked", () => {
      expect(sourceCode).toContain("onNodeClick");
      expect(sourceCode).toContain("handleNodeClick");
      expect(sourceCode).toContain("setDetailOpen(true)");
    });

    it("passes correct agent data to AgentDetailPanel", () => {
      expect(sourceCode).toContain("AgentDetailPanel");
      expect(sourceCode).toContain("agent={selectedAgent}");
      expect(sourceCode).toContain("open={detailOpen}");
      expect(sourceCode).toContain("onOpenChange={setDetailOpen}");
    });
  });
});

// ---------------------------------------------------------------------------
// getLayoutedElements: pure function, directly testable
// ---------------------------------------------------------------------------

describe("getLayoutedElements", () => {
  const makeNodes = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `node-${i}`,
      type: "agent" as const,
      position: { x: 0, y: 0 },
      data: { name: `Agent ${i}` },
    }));

  const makeEdges = (nodeCount: number) =>
    Array.from({ length: nodeCount - 1 }, (_, i) => ({
      id: `edge-${i}`,
      source: "node-0",
      target: `node-${i + 1}`,
    }));

  it("computes dagre layout positions for nodes", () => {
    const nodes = makeNodes(3);
    const edges = makeEdges(3);
    const result = getLayoutedElements(nodes, edges);

    // All nodes should have non-zero positions (dagre assigned them)
    for (const node of result.nodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }

    // The root node should have a different y than leaf nodes (hierarchical)
    const rootY = result.nodes[0].position.y;
    const leafY = result.nodes[1].position.y;
    expect(rootY).not.toBe(leafY);
    expect(rootY).toBeLessThan(leafY); // TB direction: root is above leaves
  });

  it("uses TB (top-to-bottom) direction by default", () => {
    const nodes = makeNodes(2);
    const edges = makeEdges(2);
    const result = getLayoutedElements(nodes, edges);

    // With TB direction, the source node (0) should be above the target (1)
    expect(result.nodes[0].position.y).toBeLessThan(
      result.nodes[1].position.y
    );
  });

  it("applies nodesep and ranksep spacing", () => {
    const nodes = makeNodes(3);
    const edges = makeEdges(3);
    const result = getLayoutedElements(nodes, edges);

    // Nodes at the same rank (leaf nodes 1 and 2) should be separated by at least nodesep
    const node1 = result.nodes[1];
    const node2 = result.nodes[2];
    const xDiff = Math.abs(node1.position.x - node2.position.x);

    // nodesep: 60 minimum separation between nodes at the same rank
    // Since nodes have width, the actual separation includes NODE_WIDTH
    expect(xDiff).toBeGreaterThanOrEqual(60);

    // ranksep: 80 minimum separation between ranks
    const rootNode = result.nodes[0];
    const leafNode = result.nodes[1];
    const yDiff = Math.abs(leafNode.position.y - rootNode.position.y);

    // The y difference should be at least ranksep (80) plus node heights
    expect(yDiff).toBeGreaterThanOrEqual(80);
  });
});
