/**
 * Server-only helpers that fetch the user's accessible swarms and their
 * initial rollup counts for the V7 sidebar. RLS on `projects` (via
 * `project_members`) ensures we only see swarms the user can open.
 *
 * Do NOT import from client components — this module uses the server
 * Supabase client which reads the auth cookie.
 */

import { createClient } from "@/lib/supabase/server";

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

/**
 * Fetches the user's swarms (via RLS on projects + project_members) and
 * rolls up the counts used by sidebar mini-stats. Returns everything the
 * client needs to render the initial sidebar and seed its Realtime state.
 */
export async function fetchSwarmsWithCounts(): Promise<SwarmSidebarData> {
  const supabase = await createClient();

  const { data: swarms } = await supabase
    .from("projects")
    .select("id, name, description")
    .order("updated_at", { ascending: false });

  if (!swarms || swarms.length === 0) {
    return { swarms: [], initialJobs: [], initialAgents: [] };
  }

  const swarmIds = swarms.map((s) => s.id);

  const [jobsResult, agentsResult] = await Promise.all([
    supabase
      .from("swarm_jobs")
      .select("id, swarm_id, stage")
      .in("swarm_id", swarmIds),
    supabase
      .from("swarm_agents")
      .select("id, swarm_id")
      .in("swarm_id", swarmIds),
  ]);

  const jobs: SwarmJobRow[] = jobsResult.data ?? [];
  const agents: SwarmAgentRow[] = agentsResult.data ?? [];

  const activeStageSet = new Set<string>(ACTIVE_JOB_STAGES);

  const swarmsWithCounts: SwarmWithCounts[] = swarms.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    activeJobs: jobs.filter(
      (j) => j.swarm_id === s.id && activeStageSet.has(j.stage),
    ).length,
    agentCount: agents.filter((a) => a.swarm_id === s.id).length,
  }));

  return {
    swarms: swarmsWithCounts,
    initialJobs: jobs,
    initialAgents: agents,
  };
}
