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
  AgentRunRow,
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
    case "predicted":
      // Classifier heeft geraden maar de rule zit niet in de auto-action
      // whitelist. Mens moet nog valideren via bulk-review UI. Rendert
      // in de review-lane net als feedback.
      return "review";
    case "feedback":
      return "review";
    case "completed":
    case "skipped_idempotent":
      return "done";
    case "failed":
      return "backlog";
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

/** Review-style statuses: audit records that must be demoted to "done"
 * once a downstream non-review run supersedes them on the same entity. */
function isReviewStatus(status: string): boolean {
  return status === "feedback" || status === "predicted";
}

function deriveEntityStage(runs: AutomationRun[]): {
  stage: string;
  hasError: boolean;
} {
  // Review runs (`feedback` = post-review decision, `predicted` = pre-review
  // classifier guess) are audit records. Once a later non-review run lands
  // on the same entity (any terminal or downstream state: completed,
  // skipped_idempotent, deferred, failed), the review is resolved — the
  // audit row stays but must not pin the kanban at "review".
  //
  // IMPORTANT: compare on `created_at` (actual insert time), NOT
  // `completed_at`. Several callers batch-insert multiple rows reusing
  // the same precomputed isoNow for `completed_at`, so that column can
  // end up identical — or even EARLIER than a later row's created_at.
  // created_at is DB-assigned at insert and always monotonic.
  const latestResolvedAt = runs.reduce<string | null>((acc, r) => {
    if (isReviewStatus(r.status)) return acc;
    const ts = r.created_at;
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
      isReviewStatus(status) &&
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
  return { stage: best === "failed" ? "backlog" : best, hasError };
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

// ──────────────────────────────────────────────────────── triage source ──
//
// Optional second materialization path for swarms that run an Orq-agent
// state machine alongside the rule-based classifier. Reads rows from
// `debtor.agent_runs` (or any table matching AgentRunRow) and produces
// swarm_jobs + agent_events that get inserted together with the
// automation_runs-derived rows.

type TriageStage = "backlog" | "ready" | "progress" | "review" | "done";

function triageStageFromStatus(status: string): TriageStage {
  switch (status) {
    case "classifying":
    case "fetching_document":
    case "generating_body":
    case "creating_draft":
      return "progress";
    case "routed_human_queue":
    case "copy_document_drafted":
    case "copy_document_needs_review":
    case "copy_document_failed_not_found":
      return "review";
    case "copy_document_failed_transient":
    case "login_failed_blocked":
      return "backlog";
    case "done":
      return "done";
    default:
      return "backlog";
  }
}

function triageAgentFromStatus(status: string): string {
  // Rough "who owns this right now" assignment for the kanban + graph.
  // Errors/terminals attach to the agent whose tool-call failed so the
  // delegation graph highlights the right node.
  switch (status) {
    case "classifying":
      return "Intent Agent";
    case "generating_body":
    case "copy_document_drafted":
    case "copy_document_needs_review":
      return "Copy-Document Agent";
    default:
      return "Copy-Document Agent";
  }
}

/** Terminal triage states: no further progress expected without human action. */
function isTriageTerminal(status: string): boolean {
  return (
    status === "done" ||
    status === "copy_document_drafted" ||
    status === "copy_document_failed_not_found" ||
    status === "routed_human_queue"
  );
}

async function ensureTriageAgents(
  admin: ReturnType<typeof createAdminClient>,
  swarmId: string,
  seedAgents: Array<{ name: string; role: string }>,
): Promise<void> {
  if (seedAgents.length === 0) return;
  const { data: existing } = await admin
    .from("swarm_agents")
    .select("agent_name")
    .eq("swarm_id", swarmId);
  const have = new Set((existing ?? []).map((r) => r.agent_name));
  const missing = seedAgents.filter((a) => !have.has(a.name));
  if (missing.length === 0) return;
  await admin.from("swarm_agents").insert(
    missing.map((a) => ({
      swarm_id: swarmId,
      agent_name: a.name,
      role: a.role,
      status: "idle",
      worker_kind: "agent",
      metrics: { active_jobs: 0, queue_depth: 0, error_count: 0 },
    })),
  );
}

async function fetchTriageRuns(
  admin: ReturnType<typeof createAdminClient>,
  schema: string,
  table: string,
  sinceIso: string,
): Promise<AgentRunRow[]> {
  const { data, error } = await admin
    .schema(schema)
    .from(table)
    .select(
      "id, email_id, entity, intent, sub_type, document_reference, confidence, language, body_version, intent_version, status, human_verdict, draft_url, tool_outputs, created_at, updated_at, completed_at",
    )
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`fetch ${schema}.${table}: ${error.message}`);
  return (data ?? []) as AgentRunRow[];
}

function buildTriageJob(
  swarmId: string,
  row: AgentRunRow,
): {
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
} {
  const stage = triageStageFromStatus(row.status);
  const agent = triageAgentFromStatus(row.status);
  const isError =
    row.status === "copy_document_failed_not_found" ||
    row.status === "copy_document_failed_transient" ||
    row.status === "login_failed_blocked";

  const tags: string[] = ["triage"];
  if (row.intent) tags.push(`intent:${row.intent}`);
  if (row.confidence) tags.push(`confidence:${row.confidence}`);
  if (row.language && row.language !== "nl") tags.push(`lang:${row.language}`);
  if (row.entity) tags.push(`entity:${row.entity}`);
  if (stage === "review" && !row.human_verdict) tags.push("needs-review");
  if (isError) tags.push("error");
  tags.push(`status:${row.status}`);

  // Title: prefer the fetched document reference if available, else
  // the intent label, else "Triage".
  let title = "Triage";
  if (row.document_reference && row.sub_type) {
    title = `${row.sub_type} ${row.document_reference}`;
  } else if (row.intent) {
    title = row.intent.replace(/_/g, " ");
  }

  const description = JSON.stringify({
    source: "debtor.agent_runs",
    agent_run_id: row.id,
    email_id: row.email_id,
    entity: row.entity,
    intent: row.intent,
    sub_type: row.sub_type,
    document_reference: row.document_reference,
    confidence: row.confidence,
    language: row.language,
    intent_version: row.intent_version,
    body_version: row.body_version,
    status: row.status,
    human_verdict: row.human_verdict,
    draft_url: row.draft_url,
  });

  return {
    id: row.id,
    swarm_id: swarmId,
    title,
    description,
    stage,
    priority: isError ? "high" : "normal",
    assigned_agent: agent,
    tags,
    position: 0,
    updated_at: row.updated_at,
  };
}

function buildTriageEvents(
  swarmId: string,
  rows: AgentRunRow[],
): Array<{
  swarm_id: string;
  agent_name: string;
  event_type: string;
  span_id: string;
  content: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}> {
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

  for (const row of rows) {
    const agent = triageAgentFromStatus(row.status);
    const endIso = row.completed_at ?? row.updated_at;
    const stage = triageStageFromStatus(row.status);

    const eventType =
      row.status === "copy_document_failed_not_found" ||
      row.status === "copy_document_failed_transient" ||
      row.status === "login_failed_blocked"
        ? "error"
        : isTriageTerminal(row.status)
          ? "done"
          : stage === "review"
            ? "delegation"
            : "thinking";

    events.push({
      swarm_id: swarmId,
      agent_name: agent,
      event_type: eventType,
      span_id: `triage:${row.id}`,
      content: {
        source: "debtor.agent_runs",
        agent_run_id: row.id,
        email_id: row.email_id,
        status: row.status,
        intent: row.intent,
        confidence: row.confidence,
      },
      started_at: row.created_at,
      ended_at: endIso,
      created_at: row.created_at,
    });
  }

  return events;
}

// ─────────────────────────────────────────────────────────────────────────

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

  // Optional triage source (debtor.agent_runs). Reads alongside
  // automation_runs within the same time window; materializes into the
  // same swarm_jobs + agent_events tables so the existing kanban/graph
  // renders both without UI changes.
  let triageRows: AgentRunRow[] = [];
  if (config.triageSource) {
    await ensureTriageAgents(admin, swarmId, config.triageSource.seedAgents);
    triageRows = await fetchTriageRuns(
      admin,
      config.triageSource.schema,
      config.triageSource.table,
      since,
    );
  }

  if (runRows.length === 0 && triageRows.length === 0) {
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

    // `needs-review` only applies when the card is actually sitting in
    // the Review lane — i.e. a feedback run is the most recent and
    // nothing has superseded it. Once downstream work lands (deferred,
    // pending, completed, failed), the review is resolved and we
    // instead surface a "next:<stage>" hint pulled from the newest
    // non-terminal run's result.stage so the card advertises what's
    // actually coming next (e.g. "next:icontroller_delete").
    if (stage === "review") {
      if (!tags.includes("needs-review")) tags.push("needs-review");
    } else {
      const nextRun = groupRuns
        .slice()
        .filter(
          (r) =>
            r.status === "deferred" ||
            r.status === "pending" ||
            r.status === "feedback" ||
            r.status === "predicted",
        )
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const nextStage =
        nextRun &&
        typeof (nextRun.result as Record<string, unknown> | null)?.stage ===
          "string"
          ? ((nextRun.result as Record<string, unknown>).stage as string)
          : null;
      if (nextStage) tags.push(`next:${nextStage}`);
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

  // Append triage jobs (from debtor.agent_runs if configured) before
  // the replace-all insert. One job per agent_run row — no grouping,
  // each row already represents one email.
  for (const row of triageRows) {
    jobs.push(buildTriageJob(swarmId, row));
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

  // Map run.status → start-event type so the live terminal actually
  // tells the reviewer what state each run is in right now:
  //   deferred  → waiting     ("queued for a downstream worker")
  //   pending   → thinking    ("actively processing")
  //   feedback  → delegation  ("handed off to human")
  //   predicted → delegation  ("classifier guessed, awaiting human review")
  //   else      → tool_call   (default, covers completed/skipped/failed)
  const startEventType = (run: AutomationRun): string => {
    if (run.status === "deferred") return "waiting";
    if (run.status === "pending") return "thinking";
    if (run.status === "feedback" || run.status === "predicted") {
      return "delegation";
    }
    return "tool_call";
  };

  for (const run of runRows) {
    const agent = agentResolver(run);
    const endIso = run.completed_at ?? run.created_at;
    const r = (run.result as Record<string, unknown> | null) ?? {};
    const stage = typeof r.stage === "string" ? r.stage : null;

    events.push({
      swarm_id: swarmId,
      agent_name: agent,
      event_type: startEventType(run),
      span_id: `${run.id}:start`,
      content: {
        automation: run.automation,
        run_id: run.id,
        status: run.status,
        stage,
      },
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
        content: { error: run.error_message, stage },
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
        content: { status: run.status, stage },
        started_at: endIso,
        ended_at: endIso,
        created_at: endIso,
      });
    }
  }

  // Append triage events (from debtor.agent_runs if configured).
  for (const ev of buildTriageEvents(swarmId, triageRows)) {
    events.push(ev);
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
