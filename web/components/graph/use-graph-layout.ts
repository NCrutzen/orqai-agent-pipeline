import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 100;

// ---------------------------------------------------------------------------
// Dagre layout computation
// ---------------------------------------------------------------------------

/**
 * Compute hierarchical positions for React Flow nodes using dagre.
 *
 * All nodes are placed via dagre's automatic layout algorithm.
 * Positions are centered relative to node dimensions.
 *
 * @param nodes - React Flow nodes (positions will be overwritten)
 * @param edges - React Flow edges (define the graph structure)
 * @param direction - Layout direction: "TB" (top-to-bottom) or "LR" (left-to-right)
 * @returns Object with positioned nodes and unchanged edges
 */
export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: "TB" | "LR" = "TB"
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}
