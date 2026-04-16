/**
 * V7 domain types mirroring the Supabase schema from
 * `supabase/migrations/20260415_v7_foundation.sql`.
 *
 * JSONB columns are typed `unknown` so that components cast deliberately
 * rather than receiving implicit `any` values from the Supabase client.
 */

export type AgentEventType =
  | "thinking"
  | "tool_call"
  | "tool_result"
  | "waiting"
  | "done"
  | "error"
  | "delegation";

export interface AgentEvent {
  id: string;
  swarm_id: string;
  agent_name: string;
  event_type: AgentEventType;
  span_id: string | null;
  parent_span_id: string | null;
  content: unknown;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

export type SwarmJobStage =
  | "backlog"
  | "ready"
  | "progress"
  | "review"
  | "done";

export type SwarmJobPriority = "low" | "normal" | "high" | "urgent";

export interface SwarmJob {
  id: string;
  swarm_id: string;
  title: string;
  description: string | null;
  stage: SwarmJobStage;
  priority: SwarmJobPriority;
  assigned_agent: string | null;
  tags: unknown;
  position: number;
  created_at: string;
  updated_at: string;
}

export type SwarmAgentStatus =
  | "idle"
  | "active"
  | "waiting"
  | "error"
  | "offline";

export interface SwarmAgent {
  id: string;
  swarm_id: string;
  agent_name: string;
  role: string | null;
  status: SwarmAgentStatus;
  parent_agent: string | null;
  metrics: unknown;
  skills: unknown;
  orqai_deployment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SwarmBriefing {
  id: string;
  swarm_id: string;
  narrative: string;
  metrics_snapshot: unknown;
  generated_at: string;
  expires_at: string;
}

/**
 * Channel lifecycle states surfaced to consumers via `useRealtimeTable`.
 * `CONNECTING` is our own pre-subscribe state (before `.subscribe()` fires).
 * The rest come directly from the Supabase Realtime JS client callback.
 */
export type ChannelStatus =
  | "CONNECTING"
  | "SUBSCRIBED"
  | "TIMED_OUT"
  | "CLOSED"
  | "CHANNEL_ERROR";

/**
 * The value exposed by `SwarmRealtimeContext`. Consumers read one array at
 * a time via `useRealtimeTable(tableName)`.
 */
export interface RealtimeBundle {
  events: AgentEvent[];
  jobs: SwarmJob[];
  agents: SwarmAgent[];
  briefings: SwarmBriefing[];
  status: ChannelStatus;
}

export const EMPTY_BUNDLE: RealtimeBundle = {
  events: [],
  jobs: [],
  agents: [],
  briefings: [],
  status: "CONNECTING",
};
