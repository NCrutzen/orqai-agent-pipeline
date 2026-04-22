/**
 * Bridge automation_runs (debtor-email-*) → swarm_jobs + agent_events so
 * the V7 Agent OS shell (/swarm/[id]) renders Debtor Email data without
 * touching the V7 visual code.
 *
 * One automation_run = one swarm_job (deterministic id, upsertable).
 * An automation_run also emits 1-2 agent_events (tool_call at start,
 * done/error at completion) so the delegation graph and Gantt timeline
 * have timeline data to draw.
 *
 * Idempotent: safe to re-run. swarm_jobs uses automation_run.id as its
 * primary key; agent_events are de-duped by span_id.
 */

import { createAdminClient } from "@/lib/supabase/admin";

const DEBTOR_EMAIL_SWARM_ID = "60c730a3-be04-4b59-87e8-d9698b468fc9";
const PREFIX = "debtor-email";

/** automation_runs.automation → swarm_agents.agent_name */
const AGENT_MAP: Record<string, string> = {
  "debtor-email-review": "Classifier",
  "debtor-email-cleanup": "AutoReplyHandler",
};

function resolveAgent(automation: string): string {
  if (AGENT_MAP[automation]) return AGENT_MAP[automation];
  // Fall back to derived name (e.g. debtor-email-ooo-handler → OOOHandler)
  const suffix = automation.startsWith(`${PREFIX}-`)
    ? automation.slice(PREFIX.length + 1)
    : automation;
  return suffix
    .split(/[-_]/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

type AutomationRun = {
  id: string;
  automation: string;
  status: string;
  result: Record<string, unknown> | null;
  error_message: string | null;
  triggered_by: string;
  created_at: string;
  completed_at: string | null;
};

function stageFromStatus(status: string): string {
  switch (status) {
    case "pending":
      return "progress";
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

function extractTitle(run: AutomationRun): string {
  const r = run.result;
  if (r && typeof r === "object") {
    for (const key of ["subject", "title", "label", "email_subject"]) {
      const v = (r as Record<string, unknown>)[key];
      if (typeof v === "string" && v.length > 0) return v.slice(0, 120);
    }
    // Nested shapes (review feedback rows store email under .email or have
    // prediction/decision metadata we can synthesize a readable title from).
    const email = (r as Record<string, unknown>).email;
    if (email && typeof email === "object") {
      const sub = (email as Record<string, unknown>).subject;
      if (typeof sub === "string" && sub.length > 0) return sub.slice(0, 120);
    }
    const decision = (r as Record<string, unknown>).decision;
    const prediction = (r as Record<string, unknown>).prediction as
      | Record<string, unknown>
      | undefined;
    const category =
      (prediction?.category as string | undefined) ??
      ((r as Record<string, unknown>).override_category as string | undefined) ??
      ((r as Record<string, unknown>).target_category as string | undefined);
    if (typeof decision === "string" && category) {
      return `Review: ${decision} → ${category}`;
    }
    if (typeof decision === "string") {
      return `Review: ${decision}`;
    }
    if (category) {
      return `Categorized as ${category}`;
    }
    const stage = (r as Record<string, unknown>).stage;
    if (typeof stage === "string") return stage.replace(/_/g, " ");
  }
  if (run.error_message) return run.error_message.slice(0, 120);
  return `${run.automation} · ${run.id.slice(0, 8)}`;
}

function tagsFor(run: AutomationRun): string[] {
  const tags: string[] = [];
  if (run.status === "failed") tags.push("error");
  const r = run.result;
  if (r && typeof r === "object") {
    const category = (r as Record<string, unknown>).category;
    if (typeof category === "string") tags.push(category);
  }
  return tags;
}

export interface BridgeResult {
  runs_seen: number;
  jobs_upserted: number;
  events_upserted: number;
}

export async function syncDebtorEmailBridge(): Promise<BridgeResult> {
  const admin = createAdminClient();

  const { data: runs, error } = await admin
    .from("automation_runs")
    .select(
      "id, automation, status, result, error_message, triggered_by, created_at, completed_at",
    )
    .like("automation", `${PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(`fetch automation_runs: ${error.message}`);
  const runRows = (runs ?? []) as AutomationRun[];

  if (runRows.length === 0) {
    return { runs_seen: 0, jobs_upserted: 0, events_upserted: 0 };
  }

  const jobs = runRows.map((run) => ({
    id: run.id,
    swarm_id: DEBTOR_EMAIL_SWARM_ID,
    title: extractTitle(run),
    description: run.error_message ?? null,
    stage: stageFromStatus(run.status),
    priority: run.status === "failed" ? "high" : "normal",
    assigned_agent: resolveAgent(run.automation),
    tags: tagsFor(run),
    position: 0,
    updated_at: run.completed_at ?? run.created_at,
  }));

  const { error: jobsErr, count: jobsCount } = await admin
    .from("swarm_jobs")
    .upsert(jobs, { onConflict: "id", count: "exact" });

  if (jobsErr) throw new Error(`upsert swarm_jobs: ${jobsErr.message}`);

  // Emit agent_events for Gantt + delegation graph.
  // Each run emits a start event (tool_call) and an end event (done/error).
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
    const agent = resolveAgent(run.automation);
    const endIso = run.completed_at ?? run.created_at;

    events.push({
      swarm_id: DEBTOR_EMAIL_SWARM_ID,
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
        swarm_id: DEBTOR_EMAIL_SWARM_ID,
        agent_name: agent,
        event_type: "error",
        span_id: `${run.id}:end`,
        content: { error: run.error_message },
        started_at: endIso,
        ended_at: endIso,
        created_at: endIso,
      });
    } else if (run.status === "completed" || run.status === "skipped_idempotent") {
      events.push({
        swarm_id: DEBTOR_EMAIL_SWARM_ID,
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

  // No unique constraint on span_id, so replace-all for this swarm.
  // Volumes are small (≤ hundreds/day) and this keeps the sync idempotent.
  await admin
    .from("agent_events")
    .delete()
    .eq("swarm_id", DEBTOR_EMAIL_SWARM_ID);

  const { error: eventsErr, count: eventsCount } = await admin
    .from("agent_events")
    .insert(events, { count: "exact" });

  if (eventsErr) throw new Error(`insert agent_events: ${eventsErr.message}`);

  // Refresh swarm_agents.metrics based on the jobs we just wrote.
  const agentsIncrement = new Map<
    string,
    { active: number; queue: number; errors: number }
  >();
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
    if ((job.tags as string[]).includes("error")) bucket.errors += 1;
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
      .eq("swarm_id", DEBTOR_EMAIL_SWARM_ID)
      .eq("agent_name", agentName);
  }

  return {
    runs_seen: runRows.length,
    jobs_upserted: jobsCount ?? jobs.length,
    events_upserted: eventsCount ?? events.length,
  };
}
