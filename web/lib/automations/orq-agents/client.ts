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
// The Orq Router Responses endpoint. Unlike the agents-path
// (/v2/agents/{key}/responses, configuration.blocking) this is a direct,
// queue-free model call — it does NOT enqueue an agent run, so it does not
// saturate under burst (the failure mode behind the intermittent 45s
// "Orq agents-path deadline exceeded" timeouts on the high-volume Stage-1
// classifier). Opt-in per agent via orq_agents.use_router; Studio remains the
// source of truth (the agent's model + instructions + response_format are
// fetched from /v2/agents/{key} and replayed inline). Measured 2026-06-24:
// agents-path ~1.5s / router ~1.4s steady; both fine, but the router removes
// the agent-queue as a burst failure mode entirely. CLAUDE.md already prefers
// the Router for ad-hoc LLM calls.
const ORQ_ROUTER_URL = "https://api.orq.ai/v3/router/responses";
const REGISTRY_CACHE_TTL_MS = 60_000; // matches zapier_tools cadence

/**
 * Phase 999.4 Fix B (D-01) — client-side hard deadline at the Orq.ai fetch
 * boundary. Replaces per-agent `timeout_ms` for the OUTER deadline so any
 * caller (Stage 0, future agent-product callers) gets a 45s upper bound on
 * the wall-clock wait — covering both queue-wait + chat-completion span.
 *
 * Why 45s and not the registry value: Orq.ai's internal retry tier is 31s
 * (CLAUDE.md §Orq.ai). 45s leaves a 14s buffer above the retry tier and
 * sits well below Vercel Pro's 60s function ceiling. The registry's
 * `timeout_ms` (90s / 120s) was sized for the OLD agents-path queue and
 * is now superseded by this constant for the abort signal — `timeout_ms`
 * remains in the registry for read-only reference + Wave 2 Router clients.
 */
const CLIENT_DEADLINE_MS = 45_000;

/**
 * Typed error thrown when the Orq.ai client fetch exceeds CLIENT_DEADLINE_MS
 * and the AbortController fires. Callers (Stage 0 worker, Stage 1 D-11
 * catch) discriminate on `err.name === "OrqClientTimeoutError"` to decide
 * fail-open coercion vs rethrow. Non-timeout errors (HTTP 500, JSON parse
 * failures, schema rejection) MUST surface as their original error type
 * — see Phase 999.4 Plan 02 / RESEARCH §Pitfalls 1.
 */
export class OrqClientTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrqClientTimeoutError";
  }
}

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
  // When true, invoke via the queue-free Orq Router (/v3/router/responses)
  // instead of the blocking agents-path. Default false → existing behaviour.
  use_router: boolean;
};

let cache: { fetched_at: number; agents: Map<string, OrqAgentRow> } | null =
  null;

// The Studio agent definition needed to replay an agent over the Router:
// its model id, system instructions, response_format, and fallback model ids.
// Fetched from GET /v2/agents/{key} and cached per agent (same TTL as the
// registry) so the hot path does not pay a Studio round-trip on every call.
type OrqAgentDef = {
  model: string;
  instructions: string;
  response_format: unknown;
  fallback_models: string[];
};
const defCache = new Map<string, { fetched_at: number; def: OrqAgentDef }>();

async function loadAgent(agent_key: string): Promise<OrqAgentRow> {
  const now = Date.now();
  if (!cache || now - cache.fetched_at > REGISTRY_CACHE_TTL_MS) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orq_agents")
      .select(
        "agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, use_router",
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
 * Fetch the Studio agent definition (model + instructions + response_format +
 * fallbacks) for Router replay, cached per agent. Studio stays the source of
 * truth: we never duplicate instructions into the registry, we replay them.
 */
async function loadAgentDef(agent_key: string): Promise<OrqAgentDef> {
  const now = Date.now();
  const hit = defCache.get(agent_key);
  if (hit && now - hit.fetched_at <= REGISTRY_CACHE_TTL_MS) return hit.def;
  const res = await fetch(`${ORQ_BASE_URL}/${agent_key}`, {
    headers: { authorization: `Bearer ${ORQ_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Orq agent-def fetch ${agent_key} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const j = (await res.json()) as {
    model?: {
      id?: string;
      parameters?: { response_format?: unknown };
      fallback_models?: Array<{ id?: string }>;
    };
    instructions?: string;
  };
  const model = j.model?.id;
  const instructions = j.instructions;
  if (!model || !instructions) {
    throw new Error(
      `Orq agent-def ${agent_key}: missing model or instructions`,
    );
  }
  const def: OrqAgentDef = {
    model,
    instructions,
    // Mirror the agent's configured response_format; json_object is the safe
    // default if the agent has none (the caller still Zod-gates the output).
    response_format: j.model?.parameters?.response_format ?? {
      type: "json_object",
    },
    fallback_models: (j.model?.fallback_models ?? [])
      .map((f) => f.id)
      .filter((x): x is string => !!x),
  };
  defCache.set(agent_key, { fetched_at: now, def });
  return def;
}

/**
 * Queue-free Router transport for `invokeOrqAgent` (opt-in via
 * orq_agents.use_router). Replays the Studio agent inline over
 * /v3/router/responses. Returns the IDENTICAL InvokeResult shape as the
 * agents-path so every caller + Zod gate is unchanged. Same 45s deadline +
 * OrqClientTimeoutError contract (callers discriminate on the error name).
 */
async function invokeViaRouter(
  agent: OrqAgentRow,
  userText: string,
): Promise<InvokeResult> {
  const def = await loadAgentDef(agent.agent_key);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_DEADLINE_MS);
  let res: Response;
  try {
    res = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ORQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: def.model,
        ...(def.fallback_models.length > 0
          ? { fallbacks: def.fallback_models.map((model) => ({ model })) }
          : {}),
        instructions: def.instructions,
        input: userText,
        response_format: def.response_format,
      }),
      signal: ctrl.signal,
    });
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === "AbortError") {
      throw new OrqClientTimeoutError(
        `Orq router deadline exceeded for ${agent.agent_key} after ${CLIENT_DEADLINE_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Orq router invoke ${agent.agent_key} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    output_text?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    };
  };
  const msgItem = json.output?.find((o) => o.type === "message");
  const rawText =
    msgItem?.content?.find((c) => typeof c.text === "string")?.text ??
    json.output_text ??
    "";
  if (!rawText) {
    throw new Error(`Orq router invoke ${agent.agent_key}: empty output text`);
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
      `Orq router invoke ${agent.agent_key}: JSON.parse failed: ${(e as Error).message}`,
    );
  }
  const usage = {
    prompt_tokens: json.usage?.input_tokens ?? json.usage?.prompt_tokens ?? 0,
    completion_tokens:
      json.usage?.output_tokens ?? json.usage?.completion_tokens ?? 0,
    total_tokens: json.usage?.total_tokens ?? 0,
  };
  return { raw, agent, usage, billing: { total_cost: 0 }, cost_cents: 0 };
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

  // Opt-in queue-free Router transport (orq_agents.use_router). Default false
  // → debtor/sales and every other caller keep the agents-path unchanged.
  if (agent.use_router) {
    return invokeViaRouter(agent, userText);
  }

  // Phase 999.4 Fix B (D-01) — 45s client-side deadline. Wraps ONLY the
  // fetch; response parsing / JSON.parse / billing math live outside this
  // try/catch so their errors keep their original type (Pitfall 1).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_DEADLINE_MS);
  let res: Response;
  try {
    res = await fetch(`${ORQ_BASE_URL}/${agent.agent_key}/responses`, {
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
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === "AbortError") {
      throw new OrqClientTimeoutError(
        `Orq agents-path deadline exceeded for ${agent_key} after ${CLIENT_DEADLINE_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
