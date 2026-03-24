/**
 * Graph mapper: converts pipeline step results to React Flow node/edge data.
 *
 * The architect step outputs markdown describing agent definitions.
 * This module parses that output and maps it to React Flow nodes and edges
 * for the interactive swarm graph.
 *
 * Layout positions are all {x:0, y:0} -- dagre computes real positions later.
 */

import type { PipelineStep } from "@/components/step-log-panel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentNodeData {
  name: string;
  role: string;
  model: string;
  toolCount: number;
  tools: string[];
  status: "idle" | "running" | "complete" | "failed" | "waiting";
  score?: number;
  description?: string;
  instructions?: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    type: "agent";
    position: { x: number; y: number };
    data: AgentNodeData;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: "animated";
    data: { animated: boolean };
  }>;
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse the architect step's text output to extract agent definitions.
 *
 * The architect output is freeform markdown. We look for patterns like:
 * - `## Agent: Name` or `### Name` headings followed by role/model/tools
 * - `**Role:**` or `Role:` descriptions
 * - `**Model:**` or `Model:` mentions
 * - `**Tools:**` or `Tools:` lists
 *
 * Returns an array of AgentNodeData with status "idle" and no score.
 * Returns empty array if parsing fails or output is empty.
 */
export function parseArchitectOutput(output: string): AgentNodeData[] {
  if (!output || typeof output !== "string" || output.trim().length === 0) {
    return [];
  }

  // The architect output may contain tool_call/tool_response blocks before the actual agents.
  // Extract only the section after "## Agents" or "ARCHITECTURE COMPLETE" if present.
  let agentSection = output;
  const agentsHeaderIdx = output.search(/^##\s+Agents\b/m);
  const archCompleteIdx = output.indexOf("ARCHITECTURE COMPLETE");
  if (agentsHeaderIdx !== -1) {
    agentSection = output.slice(agentsHeaderIdx);
  } else if (archCompleteIdx !== -1) {
    agentSection = output.slice(archCompleteIdx);
  }

  const agents: AgentNodeData[] = [];

  // The architect output uses multiple possible formats:
  // Format A (Orq.ai pipeline): "### 1. agent-key-name" with Role:, Model recommendation:, Tools needed:
  // Format B (legacy): "## Agent: Name" with Role:, Model:, Tools:
  //
  // Split by numbered agent headings (### N. name) or "## Agent:" prefix
  const sections = agentSection.split(
    /(?=^#{1,3}\s+(?:\d+\.\s+|Agent:\s*))/m
  );

  for (const section of sections) {
    if (!section.trim()) continue;

    // Try Format A: "### 1. agent-key-name" or "### N. agent-key-name"
    let nameMatch = section.match(
      /^#{1,3}\s+\d+\.\s+(.+?)(?:\s*\(.*?\))?\s*$/m
    );

    // Try Format B: "## Agent: Name"
    if (!nameMatch) {
      nameMatch = section.match(
        /^#{1,3}\s+Agent:\s*(.+?)(?:\s*\(.*?\))?\s*$/m
      );
    }

    if (!nameMatch) continue;

    const name = nameMatch[1].trim().replace(/\*\*/g, "");

    // Skip non-agent sections (Orchestration, Architecture, etc.)
    // Agent names follow kebab-case with -agent suffix, or contain "Agent" in the name
    const lowerName = name.toLowerCase();
    if (!lowerName.includes("agent") && !lowerName.match(/^[a-z]+-[a-z]+/)) {
      // Check if section has Role: field — if not, skip
      if (!/\bRole\b/i.test(section)) continue;
    }

    // Extract role (handles **Role:** , Role:, **Responsibility:** formats)
    const roleMatch = section.match(
      /\*{0,2}(?:Role|Responsibility)\*{0,2}:\*{0,2}\s*(.+?)(?:\n|$)/i
    );
    const role = roleMatch ? roleMatch[1].trim() : "Agent";

    // Extract model (handles Model:, Model recommendation:, **Model:** formats)
    const modelMatch = section.match(
      /\*{0,2}Model(?:\s+recommendation)?\*{0,2}:\*{0,2}\s*(.+?)(?:\n|$)/i
    );
    const model = modelMatch ? modelMatch[1].trim() : "default";

    // Extract tools (handles Tools:, Tools needed:, **Tools:** formats)
    const toolsMatch = section.match(
      /\*{0,2}Tools?\s*(?:needed)?\*{0,2}:\*{0,2}\s*(.+?)(?:\n\n|\n(?=\*{0,2}[A-Z])|\n#{1,3}|$)/i
    );
    let tools: string[] = [];
    if (toolsMatch) {
      const toolsText = toolsMatch[1].trim();
      // Skip "none", "geen", "(geen)", "(none)" etc.
      if (!/^\(?(?:none|geen|no tools|n\/a)/i.test(toolsText)) {
        if (toolsText.includes("\n")) {
          tools = toolsText
            .split(/\n/)
            .map((t) => t.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean);
        } else {
          tools = toolsText
            .split(/,\s*/)
            .map((t) => t.trim())
            .filter(Boolean);
        }
      }
    }

    // Extract description (handles Description:, Responsibility: as fallback)
    const descMatch = section.match(
      /\*{0,2}Description\*{0,2}:\*{0,2}\s*(.+?)(?:\n\n|\n(?=\*{0,2}[A-Z])|\n#{1,3}|$)/i
    );
    const description = descMatch ? descMatch[1].trim() : undefined;

    agents.push({
      name,
      role,
      model,
      toolCount: tools.length,
      tools,
      status: "idle",
      description,
    });
  }

  return agents;
}

// ---------------------------------------------------------------------------
// Graph mapping
// ---------------------------------------------------------------------------

/**
 * Map pipeline steps and run status to React Flow graph data.
 *
 * Finds the architect step's result.output, parses it for agent definitions,
 * and creates a hub-spoke graph (first agent = orchestrator connected to all others).
 *
 * Node positions are all {x:0, y:0} -- dagre layout computes real positions.
 *
 * Status mapping:
 * - run "complete" -> all nodes "complete"
 * - run "running"  -> orchestrator node "running", others "idle"
 * - run "failed"   -> orchestrator node "failed", others "idle"
 */
export function mapPipelineToGraph(
  steps: PipelineStep[],
  runStatus: string
): GraphData {
  // Find architect step and extract output
  const architectStep = steps.find((s) => s.name === "architect");
  const architectOutput =
    architectStep?.result &&
    typeof architectStep.result === "object" &&
    (architectStep.result as { output?: string }).output
      ? (architectStep.result as { output: string }).output
      : "";

  const agents = parseArchitectOutput(architectOutput);

  if (agents.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Create nodes
  const nodes: GraphData["nodes"] = agents.map((agent, index) => {
    let status = agent.status;

    if (runStatus === "complete") {
      status = "complete";
    } else if (runStatus === "running" && index === 0) {
      status = "running";
    } else if (runStatus === "failed" && index === 0) {
      status = "failed";
    } else if (runStatus === "waiting") {
      status = index === 0 ? "waiting" : "idle";
    }

    return {
      id: `agent-${index}`,
      type: "agent" as const,
      position: { x: 0, y: 0 },
      data: { ...agent, status },
    };
  });

  // Create hub-spoke edges (first node -> all others)
  const edges: GraphData["edges"] = nodes.slice(1).map((node) => ({
    id: `edge-${nodes[0].id}-${node.id}`,
    source: nodes[0].id,
    target: node.id,
    type: "animated" as const,
    data: { animated: runStatus === "running" },
  }));

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Live status updates
// ---------------------------------------------------------------------------

/**
 * Map a pipeline step update to graph node status changes.
 *
 * The architect step affects all nodes (they appear when architect completes).
 * Other steps map to the most relevant node by name similarity.
 */
export function mapStepToNodeStatus(
  stepName: string,
  stepStatus: string,
  nodes: GraphData["nodes"]
): GraphData["nodes"] {
  if (nodes.length === 0) return nodes;

  // Architect step: affects all nodes
  if (stepName === "architect") {
    const status =
      stepStatus === "complete"
        ? ("idle" as const)
        : stepStatus === "running"
          ? ("running" as const)
          : stepStatus === "failed"
            ? ("failed" as const)
            : ("idle" as const);

    // When architect completes, all nodes become idle (ready).
    // When architect is running, show orchestrator (first node) as running.
    if (stepStatus === "running") {
      return nodes.map((node, i) => ({
        ...node,
        data: { ...node.data, status: i === 0 ? "running" : "idle" },
      }));
    }
    return nodes.map((node) => ({
      ...node,
      data: { ...node.data, status },
    }));
  }

  // Pipeline-complete pseudo-step
  if (stepName === "pipeline-complete") {
    return nodes.map((node) => ({
      ...node,
      data: { ...node.data, status: "complete" as const },
    }));
  }

  // For other steps, find the best matching node by name similarity
  const normalizedStep = stepName.toLowerCase().replace(/[-_]/g, " ");

  let bestMatchIndex = -1;
  let bestMatchScore = 0;

  nodes.forEach((node, index) => {
    const normalizedNode = node.data.name.toLowerCase().replace(/[-_]/g, " ");
    // Check if step name contains the node name or vice versa
    let score = 0;
    if (normalizedStep.includes(normalizedNode)) {
      score = normalizedNode.length / normalizedStep.length;
    } else if (normalizedNode.includes(normalizedStep)) {
      score = normalizedStep.length / normalizedNode.length;
    }
    // Also check individual words
    const stepWords = normalizedStep.split(/\s+/);
    const nodeWords = normalizedNode.split(/\s+/);
    const commonWords = stepWords.filter((w) => nodeWords.includes(w));
    const wordScore = commonWords.length / Math.max(stepWords.length, nodeWords.length);
    score = Math.max(score, wordScore);

    if (score > bestMatchScore) {
      bestMatchScore = score;
      bestMatchIndex = index;
    }
  });

  // Only apply if we have a reasonable match
  if (bestMatchIndex < 0 || bestMatchScore < 0.3) {
    return nodes;
  }

  const nodeStatus =
    stepStatus === "complete"
      ? ("complete" as const)
      : stepStatus === "running"
        ? ("running" as const)
        : stepStatus === "failed"
          ? ("failed" as const)
          : stepStatus === "waiting"
            ? ("waiting" as const)
            : ("idle" as const);

  return nodes.map((node, i) =>
    i === bestMatchIndex
      ? { ...node, data: { ...node.data, status: nodeStatus } }
      : node
  );
}
