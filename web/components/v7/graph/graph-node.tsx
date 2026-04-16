"use client";

/**
 * Single node in the V7 delegation graph (Phase 53).
 *
 * Renders an absolutely-positioned glass card that mirrors the design
 * reference `.node` style. Click + Enter + Space all open the agent
 * detail drawer via the consumer-supplied callback.
 */

import type { KeyboardEvent } from "react";
import type { LayoutNode } from "@/lib/v7/graph/layout";
import type { SwarmAgentStatus } from "@/lib/v7/types";

interface GraphNodeProps {
  node: LayoutNode;
  onOpen: (agentName: string) => void;
}

const STATUS_WORD: Record<SwarmAgentStatus, string> = {
  idle: "Idle",
  active: "Active",
  waiting: "Waiting",
  error: "Error",
  offline: "Offline",
};

export function GraphNode({ node, onOpen }: GraphNodeProps) {
  const { agent, isOrchestrator, xPct, yPct } = node;

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(agent.agent_name);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(agent.agent_name)}
      onKeyDown={handleKeyDown}
      aria-label={`${agent.agent_name}, ${agent.role ?? "no role"}, status ${agent.status}`}
      className="v7-graph-node"
      data-orchestrator={isOrchestrator || undefined}
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      <span className="v7-graph-node-label">
        {isOrchestrator ? "ORCHESTRATOR" : "SUBAGENT"}
      </span>
      <strong className="v7-graph-node-name">{agent.agent_name}</strong>
      <span className="v7-graph-node-meta">
        <span
          aria-hidden
          className={`v7-tiny-dot status-${agent.status}`}
        />
        {STATUS_WORD[agent.status]}
      </span>
    </div>
  );
}
