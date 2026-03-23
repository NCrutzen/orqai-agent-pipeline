import { describe, it } from "vitest";

describe("SwarmGraph", () => {
  describe("rendering (GRAPH-01)", () => {
    it.todo("renders ReactFlow with nodes and edges when steps are provided");
    it.todo("renders empty state when no nodes and status is pending");
    it.todo("renders loading state when no nodes and status is running");
    it.todo("applies dagre layout to position nodes hierarchically");
    it.todo("wraps content in ReactFlowProvider");
  });

  describe("live updates (GRAPH-03)", () => {
    it.todo("subscribes to Broadcast channel run:{runId}");
    it.todo("updates node status when step-update event is received");
    it.todo("activates edge animation for edges connected to running nodes");
    it.todo("deactivates edge animation when connected nodes complete");
  });

  describe("celebration", () => {
    it.todo("fires confetti when run status becomes complete");
    it.todo("shows Pipeline Complete overlay on completion");
    it.todo("does not fire confetti more than once per run");
  });

  describe("interaction", () => {
    it.todo("opens agent detail panel when a node is clicked");
    it.todo("passes correct agent data to AgentDetailPanel");
  });
});

describe("getLayoutedElements", () => {
  it.todo("computes dagre layout positions for nodes");
  it.todo("uses TB (top-to-bottom) direction by default");
  it.todo("applies nodesep and ranksep spacing");
});
