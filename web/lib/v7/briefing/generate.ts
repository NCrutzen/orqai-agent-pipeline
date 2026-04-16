/**
 * Shared briefing generation helper. Used by both the server action (on-demand
 * UI regeneration) and the 30-min Inngest cron. Encapsulates:
 *
 *   1. Input gathering from Supabase (swarm_agents, swarm_jobs, agent_events)
 *   2. Orq.ai Briefing Agent invocation via the REST invoke endpoint (MCP lacks
 *      a direct `invoke_agent` tool; the REST endpoint uses the same bearer auth)
 *   3. Zod-validated output
 *   4. Cache-check against `swarm_briefings.expires_at`
 *   5. Insert of a new briefing row
 *
 * Never throws for external callers. Failures are logged to `settings` and
 * the function returns a structured result so callers can surface a cached
 * briefing or a neutral error pill in the UI.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildBriefingUserMessage,
  BRIEFING_SYSTEM_PROMPT,
  type BriefingAgentSummary,
  type BriefingEventsSnapshot,
  type BriefingInput,
  type BriefingJobsSnapshot,
} from "./prompt";
import {
  briefingOutputSchema,
  type BriefingOutput,
} from "./schema";
import {
  parseAgentMetrics,
} from "@/lib/v7/fleet/agent-metrics";

const BRIEFING_CACHE_TTL_MIN = 5;
const ORQAI_INVOKE_ENDPOINT = "https://api.orq.ai/v2/agents";
const INVOKE_TIMEOUT_MS = 45_000;

export interface GenerateBriefingResult {
  ok: boolean;
  reason?:
    | "cached"
    | "generated"
    | "orqai_error"
    | "parse_error"
    | "no_api_key";
  briefing?: BriefingOutput;
  generated_at?: string;
}

async function gatherBriefingInput(
  swarmId: string
): Promise<BriefingInput | null> {
  const admin = createAdminClient();

  const [projectRes, agentsRes, jobsRes, eventsRes, lastBriefingRes] =
    await Promise.all([
      admin.from("projects").select("name").eq("id", swarmId).single(),
      admin
        .from("swarm_agents")
        .select("agent_name, role, status, metrics")
        .eq("swarm_id", swarmId),
      admin.from("swarm_jobs").select("stage").eq("swarm_id", swarmId),
      admin
        .from("agent_events")
        .select("event_type")
        .eq("swarm_id", swarmId)
        .gte(
          "created_at",
          new Date(Date.now() - 30 * 60_000).toISOString()
        ),
      admin
        .from("swarm_briefings")
        .select("narrative")
        .eq("swarm_id", swarmId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (projectRes.error || !projectRes.data) return null;

  const agents: BriefingAgentSummary[] = (agentsRes.data ?? []).map(
    (row) => {
      const metrics = parseAgentMetrics(row.metrics);
      return {
        name: row.agent_name,
        role: row.role,
        status: row.status,
        active_jobs: metrics.active_jobs,
        queue_depth: metrics.queue_depth,
        error_count: metrics.error_count,
      };
    }
  );

  const jobs: BriefingJobsSnapshot = {
    backlog: 0,
    ready: 0,
    progress: 0,
    review: 0,
    done: 0,
  };
  for (const j of jobsRes.data ?? []) {
    if (j.stage in jobs) {
      jobs[j.stage as keyof BriefingJobsSnapshot]++;
    }
  }

  const events: BriefingEventsSnapshot = {
    thinking: 0,
    tool_call: 0,
    done: 0,
    error: 0,
  };
  for (const e of eventsRes.data ?? []) {
    if (e.event_type in events) {
      events[e.event_type as keyof BriefingEventsSnapshot]++;
    }
  }

  let lastBriefing: BriefingOutput | null = null;
  if (lastBriefingRes.data?.narrative) {
    try {
      const parsed = briefingOutputSchema.safeParse(
        JSON.parse(lastBriefingRes.data.narrative)
      );
      if (parsed.success) lastBriefing = parsed.data;
    } catch {
      // ignore; lastBriefing stays null
    }
  }

  return {
    swarm_name: projectRes.data.name,
    agents,
    jobs,
    events,
    last_briefing: lastBriefing,
  };
}

async function logBriefingError(
  swarmId: string,
  message: string,
  raw?: string
) {
  try {
    const admin = createAdminClient();
    await admin.from("settings").upsert(
      {
        key: "orqai_briefing_last_error",
        value: {
          error: message,
          swarm_id: swarmId,
          raw: raw?.slice(0, 2000),
          timestamp: new Date().toISOString(),
        },
      },
      { onConflict: "key" }
    );
  } catch {
    // never throw from the logger
  }
}

async function invokeBriefingAgent(
  input: BriefingInput
): Promise<{ raw: string; validated: BriefingOutput } | null> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) return null;

  const body = {
    messages: [
      { role: "system", content: BRIEFING_SYSTEM_PROMPT },
      { role: "user", content: buildBriefingUserMessage(input) },
    ],
  };

  const res = await fetch(
    `${ORQAI_INVOKE_ENDPOINT}/swarm-briefing-agent/invoke`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INVOKE_TIMEOUT_MS),
    }
  );

  if (!res.ok) {
    throw new Error(`Orq.ai invoke failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as {
    output?: string;
    message?: { content?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  const raw =
    json.output ??
    json.message?.content ??
    json.choices?.[0]?.message?.content ??
    "";

  if (!raw) {
    throw new Error("Orq.ai invoke returned empty output");
  }

  const validated = briefingOutputSchema.safeParse(JSON.parse(raw));
  if (!validated.success) {
    const err = new Error(`Zod validation failed: ${validated.error.message}`);
    (err as { raw?: string }).raw = raw;
    throw err;
  }

  return { raw, validated: validated.data };
}

/**
 * Main entry point. Idempotent w.r.t. 5-minute TTL.
 */
export async function generateBriefing(
  swarmId: string,
  options: { force?: boolean } = {}
): Promise<GenerateBriefingResult> {
  const admin = createAdminClient();

  // Cache check (skip when force=true from cron)
  if (!options.force) {
    const { data: cached } = await admin
      .from("swarm_briefings")
      .select("narrative, generated_at, expires_at")
      .eq("swarm_id", swarmId)
      .gt("expires_at", new Date().toISOString())
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cached?.narrative) {
      try {
        const parsed = briefingOutputSchema.safeParse(
          JSON.parse(cached.narrative)
        );
        if (parsed.success) {
          return {
            ok: true,
            reason: "cached",
            briefing: parsed.data,
            generated_at: cached.generated_at,
          };
        }
      } catch {
        // fall through and regenerate
      }
    }
  }

  const input = await gatherBriefingInput(swarmId);
  if (!input) {
    await logBriefingError(swarmId, "Failed to gather input (swarm not found)");
    return { ok: false, reason: "orqai_error" };
  }

  if (!process.env.ORQ_API_KEY) {
    await logBriefingError(swarmId, "ORQ_API_KEY not configured");
    return { ok: false, reason: "no_api_key" };
  }

  let result: { raw: string; validated: BriefingOutput } | null = null;
  try {
    result = await invokeBriefingAgent(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const raw = (err as { raw?: string })?.raw;
    await logBriefingError(swarmId, message, raw);
    return { ok: false, reason: raw ? "parse_error" : "orqai_error" };
  }

  if (!result) {
    return { ok: false, reason: "no_api_key" };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + BRIEFING_CACHE_TTL_MIN * 60_000);

  const metricsSnapshot = {
    jobs: input.jobs,
    events: input.events,
    agent_count: input.agents.length,
  };

  const { error: insertError } = await admin.from("swarm_briefings").insert({
    swarm_id: swarmId,
    narrative: result.raw,
    metrics_snapshot: metricsSnapshot,
    generated_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  });

  if (insertError) {
    await logBriefingError(swarmId, `Insert failed: ${insertError.message}`);
    // The agent call succeeded; surface the briefing to the caller even if DB write failed.
    return {
      ok: true,
      reason: "orqai_error",
      briefing: result.validated,
      generated_at: now.toISOString(),
    };
  }

  return {
    ok: true,
    reason: "generated",
    briefing: result.validated,
    generated_at: now.toISOString(),
  };
}
