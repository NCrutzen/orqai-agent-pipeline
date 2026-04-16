/**
 * Pure graph layout for the V7 delegation graph (Phase 53).
 *
 * Strategy: orchestrator-centered orbital layout. The orchestrator anchors
 * the left-of-center; subagents fan out across a 120deg arc on the right.
 * Coordinates are returned in `[0..100]` percent space so the SVG canvas
 * can resize without recomputing.
 *
 * Memoization key (called by `DelegationGraph`):
 *   `agents.map(a => a.id).sort().join("|")`
 * -- so reordering of `agents` does NOT recompute, only set membership
 * change does.
 */

import type { SwarmAgent } from "@/lib/v7/types";

export interface LayoutNode {
  id: string;
  agent: SwarmAgent;
  xPct: number;
  yPct: number;
  isOrchestrator: boolean;
}

const ORCHESTRATOR_X = 18;
const ORCHESTRATOR_Y = 50;
const ORBITAL_RADIUS = 38;
const HORIZONTAL_STRETCH = 1.6;
const ARC_HALF_RADIANS = Math.PI / 3;

/**
 * Pick the orchestrator agent.
 * Priority:
 *   1. Name contains "orchestrator" (case-insensitive)
 *   2. Name starts with "orch" (case-insensitive)
 *   3. First agent alphabetically by `agent_name`
 */
export function pickOrchestrator(agents: SwarmAgent[]): SwarmAgent | null {
  if (agents.length === 0) return null;
  const named =
    agents.find((a) => /orchestrator/i.test(a.agent_name)) ??
    agents.find((a) => /^orch/i.test(a.agent_name));
  if (named) return named;
  return [...agents].sort((a, b) =>
    a.agent_name.localeCompare(b.agent_name),
  )[0];
}

export function computeLayout(agents: SwarmAgent[]): LayoutNode[] {
  if (agents.length === 0) return [];

  const orchestrator = pickOrchestrator(agents);
  if (!orchestrator) return [];

  const subagents = agents
    .filter((a) => a.id !== orchestrator.id)
    .sort((a, b) => a.agent_name.localeCompare(b.agent_name));

  const positions: LayoutNode[] = [];

  positions.push({
    id: orchestrator.id,
    agent: orchestrator,
    xPct: ORCHESTRATOR_X,
    yPct: ORCHESTRATOR_Y,
    isOrchestrator: true,
  });

  const N = subagents.length;
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0.5 : i / (N - 1);
    const theta = -ARC_HALF_RADIANS + t * (2 * ARC_HALF_RADIANS);
    const xPct =
      ORCHESTRATOR_X + Math.cos(theta) * ORBITAL_RADIUS * HORIZONTAL_STRETCH;
    const yPct = ORCHESTRATOR_Y + Math.sin(theta) * ORBITAL_RADIUS;
    positions.push({
      id: subagents[i].id,
      agent: subagents[i],
      xPct,
      yPct,
      isOrchestrator: false,
    });
  }

  return positions;
}
