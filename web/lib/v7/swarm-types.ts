/**
 * Shared types and constants for the V7 swarm sidebar.
 * Safe to import from both server and client components — no server-only deps.
 */

export const ACTIVE_JOB_STAGES = ["ready", "progress", "review"] as const;

export interface SwarmWithCounts {
  id: string;
  name: string;
  description: string | null;
  activeJobs: number;
  agentCount: number;
}

export interface SwarmJobRow {
  id: string;
  swarm_id: string;
  stage: string;
}

export interface SwarmAgentRow {
  id: string;
  swarm_id: string;
}

export interface SwarmSidebarData {
  swarms: SwarmWithCounts[];
  initialJobs: SwarmJobRow[];
  initialAgents: SwarmAgentRow[];
}
