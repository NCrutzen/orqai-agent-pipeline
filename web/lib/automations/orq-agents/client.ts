// Phase 56-02 wave 3: registry-driven Orq.ai client.
//
// Resolves the Orq agent slug + timeout + (future) input/output schemas
// from public.orq_agents at runtime. Adding a new agent = INSERT one row
// in orq_agents (no env var, no Vercel deploy, no edits to this file).
//
// Today this file owns only the invocation transport. Caller-side Zod
// validation stays in each automation's own module so the resolver
// doesn't need a generic schema-from-jsonb compiler. Wave 4 may add a
// runtime check that compares caller-side schemas against registry rows
// at startup to catch drift.

import { createAdminClient } from "@/lib/supabase/admin";

const ORQ_API_KEY = process.env.ORQ_API_KEY;
const ORQ_BASE_URL = "https://api.orq.ai/v2/agents";
const REGISTRY_CACHE_TTL_MS = 60_000; // matches zapier_tools cadence

export type OrqAgentRow = {
  agent_key: string;
  orqai_id: string;
  description: string;
  swarm_type: string;
  version: string;
  input_schema: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  model_config: Record<string, unknown>;
  timeout_ms: number;
  enabled: boolean;
};

let cache: { fetched_at: number; agents: Map<string, OrqAgentRow> } | null =
  null;

async function loadAgent(agent_key: string): Promise<OrqAgentRow> {
  const now = Date.now();
  if (!cache || now - cache.fetched_at > REGISTRY_CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orq_agents")
      .select(
        "agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled",
      )
      .eq("enabled", true);
    if (error) {
      throw new Error(`orq_agents registry read failed: ${error.message}`);
    }
    const map = new Map<string, OrqAgentRow>();
    for (const row of data ?? []) map.set(row.agent_key, row as OrqAgentRow);
    cache = { fetched_at: now, agents: map };
  }
  const agent = cache.agents.get(agent_key);
  if (!agent) {
    throw new Error(
      `orq_agents: agent_key="${agent_key}" not found or disabled`,
    );
  }
  return agent;
}

/**
 * Result shape — kept stable across the 2026-05-01 transport rewrite so
 * callers (Stage 0 budget counter, automation_runs.result.cost_cents write,
 * tests) don't need to change. cost_cents and billing.total_cost are 0
 * because Orq's /v2/agents/{key}/responses endpoint does not return cost
 * info — only token counts. See follow-up note in the rewrite block below.
 */
export type InvokeResult = {
  raw: unknown; // Parsed JSON object from the agent's text output.
  agent: OrqAgentRow;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  billing: { total_cost: number };
  cost_cents: number;
};

export function invokeResultCostCents(result: {
  cost_cents?: number;
  billing?: { total_cost?: number };
}): number {
  if (typeof result.cost_cents === "number") return result.cost_cents;
  return Math.round((result.billing?.total_cost ?? 0) * 100);
}

/**
 * Invoke an Orq.ai agent by registry key.
 *
 * 2026-05-01 rewrite: Plan 02's original implementation called
 * `${BASE}/${orqai_id}/invoke` with a body shape that does not exist on
 * Orq.ai's API — every call returned 404. Confirmed working transport
 * is `${BASE}/${agent_key}/responses` (mirrors `invoke-intent.ts`). The
 * agent's per-model JSON-schema enforcement is configured at the agent
 * level (Studio → Tools → JSON Schema → reference from Model Parameters
 * → Response Format), NOT in the per-call body — so this client no
 * longer sends `response_format`.
 *
 * Cost tracking caveat: /responses returns `usage.input_tokens` and
 * `output_tokens` but NO billing/cost field. cost_cents is therefore
 * 0 — budget enforcement falls back to token-count ceilings only until
 * we add a per-model price table or query Orq's analytics API for
 * per-trace cost retroactively.
 *
 * Throws on:
 *   - agent not in registry / disabled
 *   - ORQ_API_KEY missing
 *   - timeout (> agent.timeout_ms)
 *   - non-2xx response
 *   - JSON parse failure on agent output text
 */
export async function invokeOrqAgent(
  agent_key: string,
  inputs: Record<string, unknown>,
  // jsonSchemaName kept for signature compatibility — schema enforcement
  // now lives on the agent server-side, not in the per-call body.
  _opts?: { jsonSchemaName?: string },
): Promise<InvokeResult> {
  if (!ORQ_API_KEY) {
    throw new Error("ORQ_API_KEY is not set");
  }

  const agent = await loadAgent(agent_key);

  // User message = JSON inputs verbatim. Agents' system prompts handle
  // the interpretation — keeps client.ts generic across all agent keys.
  const userText = JSON.stringify(inputs, null, 2);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), agent.timeout_ms);
  try {
    const res = await fetch(`${ORQ_BASE_URL}/${agent.agent_key}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ORQ_API_KEY}`,
      },
      body: JSON.stringify({
        message: {
          role: "user",
          parts: [{ kind: "text", text: userText }],
        },
        configuration: { blocking: true },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Orq invoke ${agent_key} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
    const json = (await res.json()) as {
      output?: Array<{
        role?: string;
        parts?: Array<{ kind?: string; text?: string }>;
      }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        total_tokens?: number;
      };
    };

    const rawText = json.output?.[0]?.parts?.[0]?.text ?? "";
    if (!rawText) {
      throw new Error(`Orq invoke ${agent_key}: empty output text`);
    }
    const stripped = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");
    let raw: unknown;
    try {
      raw = JSON.parse(stripped);
    } catch (e) {
      throw new Error(
        `Orq invoke ${agent_key}: JSON.parse failed: ${(e as Error).message}`,
      );
    }

    const usage = {
      prompt_tokens: json.usage?.input_tokens ?? 0,
      completion_tokens: json.usage?.output_tokens ?? 0,
      total_tokens: json.usage?.total_tokens ?? 0,
    };
    // Orq /responses does not return cost — see header comment.
    const billing = { total_cost: 0 };
    const cost_cents = 0;
    return { raw, agent, usage, billing, cost_cents };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Phase 64 alias of `invokeOrqAgent`. Kept as a separately importable name so
 * Plan 01 RED tests (which mock both names) and downstream callers that want
 * to communicate intent ("I require usage+cost telemetry") have a stable
 * import target. The two functions return identical `InvokeResult`s — there
 * is only one transport seam.
 */
export const invokeOrqAgentWithUsage = invokeOrqAgent;

/** Test-only: clear the in-memory registry cache. */
export function __resetCacheForTests() {
  cache = null;
}
