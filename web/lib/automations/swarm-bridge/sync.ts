/**
 * Generic bridge: automation_runs → swarm_jobs + agent_events for a
 * single configured swarm. Swarm-specific logic lives in the
 * SwarmBridgeConfig (agent resolver, extra tags). Everything else —
 * grouping, stage derivation, timeline, event emission — is shared.
 *
 * See docs/swarm-bridge-contract.md for the contract every automation
 * must honour to plug into this bridge.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AutomationRun,
  BridgeResult,
  SwarmBridgeConfig,
  TimelineEntry,
} from "@/lib/automations/swarm-bridge/types";

function defaultAgentName(automation: string): string {
  return automation
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function stageFromStatus(status: string): string {
  switch (status) {
    case "pending":
      return "progress";
    case "deferred":
      // "I've handed off; another worker/cron will pick this up."
      // Distinct from `pending` (I own it now, actively processing).
      return "ready";
    case "feedback":
      return "review";
    case "completed":
    case "skipped_idempotent":
      return "done";
    case "failed":
      return "done";
    default:
      return "backlog";
  }
}

const STAGE_PRIORITY: Record<string, number> = {
  backlog: 0,
  done: 1,
  ready: 2,
  progress: 3,
  review: 4,
  failed: 5,
};

function deriveEntityStage(runs: AutomationRun[]): {
  stage: string;
  hasError: boolean;
} {
  // `feedback` runs are audit records. Once a later completed/skipped run
  // lands on the same entity, the review is resolved — the feedback row
  // stays for audit but must not pin the kanban at stage "review".
  const latestResolvedAt = runs.reduce<string | null>((acc, r) => {
    if (r.status !== "completed" && r.status !== "skipped_idempotent") {
      return acc;
    }
    const ts = r.completed_at ?? r.created_at;
    if (!acc || ts.localeCompare(acc) > 0) return ts;
    return acc;
  }, null);

  let best = "backlog";
  let bestScore = -1;
  let hasError = false;
  for (const run of runs) {
    if (run.status === "failed") hasError = true;
    let status = run.status;
    if (
      status === "feedback" &&
      latestResolvedAt &&
      run.created_at.localeCompare(latestResolvedAt) <= 0
    ) {
      status = "completed";
    }
    const stage = status === "failed" ? "failed" : stageFromStatus(status);
    const score = STAGE_PRIORITY[stage] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = stage;
    }
  }
  return { stage: best === "failed" ? "done" : best, hasError };
}

function runTitle(run: AutomationRun): string | null {
  const r = run.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  for (const key of ["subject", "title", "label", "email_subject"]) {
    const v = rec[key];
    if (typeof v === "string" && v.length > 0) return v.slice(0, 140);
  }
  const email = rec.email as Record<string, unknown> | undefined;
  if (email && typeof email.subject === "string" && email.subject.length > 0) {
    return email.subject.slice(0, 140);
  }
  return null;
}

function resolveTitle(
  runs: AutomationRun[],
  entity: SwarmBridgeConfig["entity"],
): string {
  if (entity?.titleKey) {
    for (const run of runs) {
      const r = run.result as Record<string, unknown> | null;
      if (r && typeof r === "object") {
        const v = r[entity.titleKey];
        if (typeof v === "string" && v.length > 0) return v.slice(0, 140);
        const email = r.email as Record<string, unknown> | undefined;
        if (email) {
          const nested = email[entity.titleKey];
          if (typeof nested === "string" && nested.length > 0) {
            return nested.slice(0, 140);
          }
        }
      }
    }
  }
  for (const run of runs) {
    const t = runTitle(run);
    if (t) return t;
  }
  const first = runs[0];
  return first ? `${first.automation} · ${first.id.slice(0, 8)}` : "(no title)";
}

function getEntityId(run: AutomationRun, entityKey: string): string | null {
  const r = run.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const direct = rec[entityKey];
  if (typeof direct === "string" && direct.length > 0) return direct;
  const email = rec.email as Record<string, unknown> | undefined;
  if (email && typeof email[entityKey] === "string") {
    return email[entityKey] as string;
  }
  return null;
}

async function stableUuidFrom(swarmId: string, key: string): Promise<string> {
  const enc = new TextEncoder().encode(`${swarmId}::${key}`);
  const hash = await crypto.subtle.digest("SHA-1", enc);
  const bytes = new Uint8Array(hash);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) +
      hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}

function buildTimeline(
  runs: AutomationRun[],
  resolveAgent: (run: AutomationRun) => string,
): TimelineEntry[] {
  return runs
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((run) => {
      const r = run.result as Record<string, unknown> | null;
      const stageLabel =
        (r && typeof r.stage === "string" ? r.stage.replace(/_/g, " ") : null) ??
        run.automation;
      return {
        run_id: run.id,
        automation: run.automation,
        agent: resolveAgent(run),
        status: run.status,
        stage_label: stageLabel,
        created_at: run.created_at,
        completed_at: run.completed_at,
        error: run.error_message,
      };
    });
}

export async function syncSwarmBridge(
  config: SwarmBridgeConfig,
): Promise<BridgeResult> {
  const admin = createAdminClient();
  const { swarmId, prefix, entity } = config;

  const agentResolver = (run: AutomationRun): string =>
    config.resolveAgent?.(run) ?? defaultAgentName(run.automation);

  // Window-based ingest. An earlier version used ascending+limit(1000)
  // without a date filter — once automation_runs grew past 1000 rows the
  // sync silently locked onto the oldest 1000 and the dashboard froze at
  // historical timestamps. Window + descending + generous limit keeps
  // the working set bounded to recent activity.
  const windowDays = config.windowDays ?? 7;
  const since = new Date(
    Date.now() - windowDays * 24 * 60 * 60_000,
  ).toISOString();

  const { data: runs, error } = await admin
    .from("automation_runs")
    .select(
      "id, automation, status, result, error_message, triggered_by, created_at, completed_at",
    )
    .like("automation", `${prefix}%`)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(`fetch automation_runs: ${error.message}`);
  const runRows = (runs ?? []) as AutomationRun[];

  if (runRows.length === 0) {
    return {
      swarm_id: swarmId,
      runs_seen: 0,
      entities_seen: 0,
      jobs_upserted: 0,
      events_upserted: 0,
    };
  }

  // Group by entity id when configured; else 1 card per run.
  const groups = new Map<string, AutomationRun[]>();
  const groupKeys = new Map<string, string | null>();

  if (entity) {
    for (const run of runRows) {
      const entityId = getEntityId(run, entity.key);
      if (entityId) {
        const key = `entity:${entityId}`;
        const arr = groups.get(key) ?? [];
        arr.push(run);
        groups.set(key, arr);
        if (!groupKeys.has(key)) groupKeys.set(key, entityId);
      } else {
        const key = `run:${run.id}`;
        groups.set(key, [run]);
        groupKeys.set(key, null);
      }
    }
  } else {
    for (const run of runRows) {
      groups.set(`run:${run.id}`, [run]);
      groupKeys.set(`run:${run.id}`, null);
    }
  }

  const jobs: Array<{
    id: string;
    swarm_id: string;
    title: string;
    description: string | null;
    stage: string;
    priority: string;
    assigned_agent: string;
    tags: string[];
    position: number;
    updated_at: string;
  }> = [];

  for (const [groupId, groupRuns] of groups.entries()) {
    const entityId = groupKeys.get(groupId);
    const jobId = entityId
      ? await stableUuidFrom(swarmId, entityId)
      : groupRuns[0].id;

    const latestRun = groupRuns
      .slice()
      .sort((a, b) =>
        (b.completed_at ?? b.created_at).localeCompare(
          a.completed_at ?? a.created_at,
        ),
      )[0];

    const { stage, hasError } = deriveEntityStage(groupRuns);
    const title = resolveTitle(groupRuns, entity);
    const timeline = buildTimeline(groupRuns, agentResolver);

    const extraTags = config.deriveTags?.(groupRuns) ?? [];
    const tags = [...extraTags];
    if (hasError && !tags.includes("error")) tags.push("error");
    if (
      groupRuns.some((r) => r.status === "feedback") &&
      !tags.includes("needs-review")
    ) {
      tags.push("needs-review");
    }

    const description = JSON.stringify({
      timeline,
      latest_error: hasError
        ? groupRuns
            .filter((r) => r.status === "failed")
            .map((r) => r.error_message)
            .filter(Boolean)
            .slice(-1)[0] ?? null
        : null,
      entity_id: entityId,
    });

    jobs.push({
      id: jobId,
      swarm_id: swarmId,
      title,
      description,
      stage,
      priority: hasError ? "high" : "normal",
      assigned_agent: agentResolver(latestRun),
      tags,
      position: 0,
      updated_at: latestRun.completed_at ?? latestRun.created_at,
    });
  }

  // Replace-all per swarm — volumes are low and grouping changes which
  // ids exist across runs.
  await admin.from("swarm_jobs").delete().eq("swarm_id", swarmId);
  const { error: jobsErr, count: jobsCount } = await admin
    .from("swarm_jobs")
    .insert(jobs, { count: "exact" });
  if (jobsErr) throw new Error(`insert swarm_jobs: ${jobsErr.message}`);

  // Per-run events drive Gantt + delegation graph edges.
  const events: Array<{
    swarm_id: string;
    agent_name: string;
    event_type: string;
    span_id: string;
    content: Record<string, unknown>;
    started_at: string;
    ended_at: string | null;
    created_at: string;
  }> = [];

  for (const run of runRows) {
    const agent = agentResolver(run);
    const endIso = run.completed_at ?? run.created_at;

    events.push({
      swarm_id: swarmId,
      agent_name: agent,
      event_type: "tool_call",
      span_id: `${run.id}:start`,
      content: { automation: run.automation, run_id: run.id },
      started_at: run.created_at,
      ended_at: endIso,
      created_at: run.created_at,
    });

    if (run.status === "failed") {
      events.push({
        swarm_id: swarmId,
        agent_name: agent,
        event_type: "error",
        span_id: `${run.id}:end`,
        content: { error: run.error_message },
        started_at: endIso,
        ended_at: endIso,
        created_at: endIso,
      });
    } else if (
      run.status === "completed" ||
      run.status === "skipped_idempotent"
    ) {
      events.push({
        swarm_id: swarmId,
        agent_name: agent,
        event_type: "done",
        span_id: `${run.id}:end`,
        content: { status: run.status },
        started_at: endIso,
        ended_at: endIso,
        created_at: endIso,
      });
    }
  }

  await admin.from("agent_events").delete().eq("swarm_id", swarmId);
  const { error: eventsErr, count: eventsCount } = await admin
    .from("agent_events")
    .insert(events, { count: "exact" });
  if (eventsErr) throw new Error(`insert agent_events: ${eventsErr.message}`);

  // Refresh swarm_agents.metrics. Seed every registered agent at zero so
  // agents with no current jobs don't keep a stale error_count.
  const { data: registered } = await admin
    .from("swarm_agents")
    .select("agent_name")
    .eq("swarm_id", swarmId);

  const agentsIncrement = new Map<
    string,
    { active: number; queue: number; errors: number }
  >();
  for (const row of registered ?? []) {
    agentsIncrement.set(row.agent_name, { active: 0, queue: 0, errors: 0 });
  }
  for (const job of jobs) {
    const agent = job.assigned_agent;
    if (!agent) continue;
    const bucket = agentsIncrement.get(agent) ?? {
      active: 0,
      queue: 0,
      errors: 0,
    };
    if (job.stage === "progress") bucket.active += 1;
    if (job.stage === "review" || job.stage === "ready") bucket.queue += 1;
    if (job.tags.includes("error")) bucket.errors += 1;
    agentsIncrement.set(agent, bucket);
  }

  for (const [agentName, m] of agentsIncrement.entries()) {
    await admin
      .from("swarm_agents")
      .update({
        metrics: {
          active_jobs: m.active,
          queue_depth: m.queue,
          error_count: m.errors,
        },
        status: m.errors > 0 ? "error" : m.active > 0 ? "active" : "idle",
      })
      .eq("swarm_id", swarmId)
      .eq("agent_name", agentName);
  }

  return {
    swarm_id: swarmId,
    runs_seen: runRows.length,
    entities_seen: groups.size,
    jobs_upserted: jobsCount ?? jobs.length,
    events_upserted: eventsCount ?? events.length,
  };
}
