/**
 * Bridge automation_runs (debtor-email-*) → swarm_jobs + agent_events so
 * the V7 Agent OS shell (/swarm/[id]) renders Debtor Email data.
 *
 * Entity grouping: when the swarm-registry defines `entity.key`, runs that
 * share the same `result[entity.key]` value (e.g. Outlook message_id) are
 * collapsed into ONE swarm_job with a timeline of all runs. Swarms without
 * an entity config stay in the 1-run-per-job fallback.
 *
 * Stage of the grouped job is derived from the latest run's status; title
 * uses `result[entity.titleKey]` with fallback to the first non-empty
 * subject/title found across the runs.
 *
 * Idempotent: swarm_jobs uses a deterministic id (entity id when grouped,
 * run id otherwise) so re-running the bridge upserts in place.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getAutomationBackingForSwarm,
  type AutomationBackedSwarm,
} from "@/lib/automations/swarm-registry";

const DEBTOR_EMAIL_SWARM_ID = "60c730a3-be04-4b59-87e8-d9698b468fc9";
const PREFIX = "debtor-email";

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

const RULE_AGENTS: Record<string, string> = {
  auto_reply: "Rule · auto_reply",
  ooo_temporary: "Rule · ooo_temporary",
  ooo_permanent: "Rule · ooo_permanent",
  payment_admittance: "Rule · payment_admittance",
  unknown: "Rule · unknown",
};

function extractCategory(run: AutomationRun): string | null {
  const r = run.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const applied = rec.applied_category;
  if (typeof applied === "string") return normalizeCategory(applied);
  const predicted = rec.predicted as Record<string, unknown> | undefined;
  const override = rec.override_category;
  if (typeof override === "string" && override.length > 0) return override;
  if (predicted && typeof predicted.category === "string") {
    return predicted.category as string;
  }
  const prediction = rec.prediction as Record<string, unknown> | undefined;
  if (prediction && typeof prediction.category === "string") {
    return prediction.category as string;
  }
  if (typeof rec.target_category === "string") return rec.target_category;
  return null;
}

function normalizeCategory(raw: string): string {
  const slug = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (slug.startsWith("auto_reply") || slug.startsWith("auto-reply")) return "auto_reply";
  if (slug.includes("ooo_temp") || slug === "ooo_temporary") return "ooo_temporary";
  if (slug.includes("ooo_perm") || slug === "ooo_permanent") return "ooo_permanent";
  if (slug.includes("payment")) return "payment_admittance";
  if (slug.includes("unknown")) return "unknown";
  return slug;
}

function resolveAgent(run: AutomationRun): string {
  if (run.automation === "debtor-email-cleanup") return "AutoReplyHandler";
  if (run.automation === "debtor-email-review") {
    const category = extractCategory(run);
    if (category && RULE_AGENTS[category]) return RULE_AGENTS[category];
    return "Classifier Orchestrator";
  }
  return "Classifier Orchestrator";
}

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

/**
 * Highest-priority stage wins across the runs for an entity. Order:
 *   failed > review > progress > done > backlog
 * A mail with one errored run should show as error on the kanban until
 * the next successful run supersedes it.
 */
const STAGE_PRIORITY: Record<string, number> = {
  "backlog": 0,
  "done": 1,
  "progress": 2,
  "review": 3,
  "failed": 4,
};

function deriveEntityStage(runs: AutomationRun[]): {
  stage: string;
  hasError: boolean;
} {
  let best = "backlog";
  let bestScore = -1;
  let hasError = false;
  for (const run of runs) {
    if (run.status === "failed") hasError = true;
    const stage = run.status === "failed" ? "failed" : stageFromStatus(run.status);
    const score = STAGE_PRIORITY[stage] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = stage;
    }
  }
  // Map "failed" back to "done" (kanban stage) but keep the error flag.
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
  entity: AutomationBackedSwarm["entity"] | null,
): string {
  if (entity?.titleKey) {
    for (const run of runs) {
      const r = run.result as Record<string, unknown> | null;
      if (r && typeof r === "object") {
        const v = r[entity.titleKey];
        if (typeof v === "string" && v.length > 0) return v.slice(0, 140);
        // Nested email.subject shape
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

function getEntityId(
  run: AutomationRun,
  entityKey: string,
): string | null {
  const r = run.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const direct = rec[entityKey];
  if (typeof direct === "string" && direct.length > 0) return direct;
  // Nested under result.email.{key} — common for email swarms.
  const email = rec.email as Record<string, unknown> | undefined;
  if (email && typeof email[entityKey] === "string") {
    return email[entityKey] as string;
  }
  return null;
}

/**
 * Deterministic UUID v5-style id from a string (so swarm_jobs.id column
 * which is UUID can accept a message_id-derived value). Uses a simple
 * SHA-1 hash with UUID formatting — not cryptographic, just stable.
 */
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

interface TimelineEntry {
  run_id: string;
  automation: string;
  agent: string;
  status: string;
  stage_label: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
}

function buildTimeline(runs: AutomationRun[]): TimelineEntry[] {
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

export interface BridgeResult {
  runs_seen: number;
  entities_seen: number;
  jobs_upserted: number;
  events_upserted: number;
}

export async function syncDebtorEmailBridge(): Promise<BridgeResult> {
  const admin = createAdminClient();
  const backing = getAutomationBackingForSwarm(DEBTOR_EMAIL_SWARM_ID);
  const entity = backing?.entity ?? null;

  const { data: runs, error } = await admin
    .from("automation_runs")
    .select(
      "id, automation, status, result, error_message, triggered_by, created_at, completed_at",
    )
    .like("automation", `${PREFIX}%`)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (error) throw new Error(`fetch automation_runs: ${error.message}`);
  const runRows = (runs ?? []) as AutomationRun[];

  if (runRows.length === 0) {
    return {
      runs_seen: 0,
      entities_seen: 0,
      jobs_upserted: 0,
      events_upserted: 0,
    };
  }

  // Group by entity id when configured, else treat each run as its own group.
  const groups = new Map<string, AutomationRun[]>();
  const groupKeys = new Map<string, string | null>(); // groupId → entityId (null = ungrouped run)

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
        // Runs without an entity id stay as single-run jobs so we don't
        // silently drop data (e.g. failed runs that never reached Outlook).
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
      ? await stableUuidFrom(DEBTOR_EMAIL_SWARM_ID, entityId)
      : groupRuns[0].id;

    const latestRun =
      groupRuns
        .slice()
        .sort((a, b) =>
          (b.completed_at ?? b.created_at).localeCompare(
            a.completed_at ?? a.created_at,
          ),
        )[0];

    const { stage, hasError } = deriveEntityStage(groupRuns);
    const title = resolveTitle(groupRuns, entity);
    const timeline = buildTimeline(groupRuns);

    const tags: string[] = [];
    const category =
      groupRuns
        .map((r) => extractCategory(r))
        .find((c): c is string => !!c) ?? null;
    if (category) tags.push(category);
    if (hasError) tags.push("error");
    if (groupRuns.some((r) => r.status === "feedback")) tags.push("needs-review");

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
      swarm_id: DEBTOR_EMAIL_SWARM_ID,
      title,
      description,
      stage,
      priority: hasError ? "high" : "normal",
      assigned_agent: resolveAgent(latestRun),
      tags,
      position: 0,
      updated_at: latestRun.completed_at ?? latestRun.created_at,
    });
  }

  // Replace-all for this swarm — the grouping changes which ids exist, and
  // volumes are low. Avoids orphan rows when entity config changes.
  await admin
    .from("swarm_jobs")
    .delete()
    .eq("swarm_id", DEBTOR_EMAIL_SWARM_ID);

  const { error: jobsErr, count: jobsCount } = await admin
    .from("swarm_jobs")
    .insert(jobs, { count: "exact" });

  if (jobsErr) throw new Error(`insert swarm_jobs: ${jobsErr.message}`);

  // agent_events stay per-run (one row per run start/end) — they drive the
  // Gantt timeline and delegation graph edges, which care about per-run
  // activity, not per-entity aggregation.
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
    const agent = resolveAgent(run);
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

  await admin.from("agent_events").delete().eq("swarm_id", DEBTOR_EMAIL_SWARM_ID);

  const { error: eventsErr, count: eventsCount } = await admin
    .from("agent_events")
    .insert(events, { count: "exact" });

  if (eventsErr) throw new Error(`insert agent_events: ${eventsErr.message}`);

  // Refresh swarm_agents.metrics based on the grouped jobs.
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
      .eq("swarm_id", DEBTOR_EMAIL_SWARM_ID)
      .eq("agent_name", agentName);
  }

  return {
    runs_seen: runRows.length,
    entities_seen: groups.size,
    jobs_upserted: jobsCount ?? jobs.length,
    events_upserted: eventsCount ?? events.length,
  };
}
