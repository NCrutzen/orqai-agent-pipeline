/**
 * Shared types for the generic swarm bridge. The bridge reads
 * `automation_runs` and materializes `swarm_jobs` + `agent_events` for
 * the V7 `/swarm/[id]` shell.
 *
 * Any new automation-backed swarm registers a SwarmBridgeConfig instead
 * of writing its own sync module. See docs/swarm-bridge-contract.md.
 */

export interface AutomationRun {
  id: string;
  automation: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
  completed_at: string | null;
}

export interface TimelineEntry {
  run_id: string;
  automation: string;
  agent: string;
  status: string;
  stage_label: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface SwarmBridgeConfig {
  /** Swarm id (projects.id) this bridge materializes into. */
  swarmId: string;
  /** LIKE pattern prefix matched against automation_runs.automation. */
  prefix: string;
  /** Entity grouping — collapses N runs sharing the same result[key] into 1 card. */
  entity?: {
    key: string;
    titleKey?: string;
    label: string;
  };
  /**
   * Map a run → agent name shown on the card + graph. Return null to fall
   * back to the default (Title-Cased automation name). Called for every
   * run, so keep it cheap and deterministic.
   */
  resolveAgent?: (run: AutomationRun) => string | null;
  /**
   * Extra tags derived from the grouped runs. Combined with built-in tags
   * (error, needs-review). Return [] when nothing to add.
   */
  deriveTags?: (runs: AutomationRun[]) => string[];
  /**
   * Ingest window in days. Only runs with created_at within the last N
   * days are materialized into swarm_jobs/agent_events. Defaults to 7.
   *
   * WHY this matters: the bridge does delete-then-insert on swarm_jobs and
   * agent_events per swarm. Without a window, once automation_runs grows
   * past the row limit, the sync can silently lock onto a stale slice and
   * the dashboard freezes at old timestamps. A window keeps the working
   * set bounded and recent — old "done" runs stay in automation_runs for
   * audit but drop off the kanban.
   */
  windowDays?: number;
  /**
   * Additional agent-run source merged into the same swarm_jobs +
   * agent_events rebuild. Used by the debtor-email triage (phase 1):
   * classifier rules come from automation_runs, triage state-machine
   * rows come from debtor.agent_runs.
   *
   * Leave undefined for swarms without a triage pipeline.
   */
  triageSource?: {
    schema: string;
    table: string;
    /** Optional swarm_type filter — required when reading the cross-swarm
     * `public.agent_runs` table so the bridge only sees this swarm's rows. */
    swarmType?: string;
    /** Agents to ensure exist in swarm_agents (so they appear on the
     * Live Delegation Graph even when idle). */
    seedAgents: Array<{ name: string; role: string }>;
  };
}

/** Row shape from debtor.agent_runs (and any other triage-style source
 *  that follows the same contract). Kept deliberately narrow — only the
 *  columns the bridge renders. */
export interface AgentRunRow {
  id: string;
  email_id: string;
  entity: string | null;
  intent: string | null;
  sub_type: string | null;
  document_reference: string | null;
  confidence: string | null;
  language: string | null;
  body_version: string | null;
  intent_version: string | null;
  status: string;
  human_verdict: string | null;
  draft_url: string | null;
  tool_outputs: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface BridgeResult {
  swarm_id: string;
  runs_seen: number;
  entities_seen: number;
  jobs_upserted: number;
  events_upserted: number;
}
