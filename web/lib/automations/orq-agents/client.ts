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

/**
 * Phase 999.4 Fix C (D-06, D-07) — LLM Router direct-path endpoint.
 * Bypasses the Orq Agents-product queued path (`/v2/agents/{key}/responses`)
 * for single-shot JSON classifiers (Stage 0 safety, Stage 1 category).
 * Trace evidence (CONTEXT.md §trace_evidence) shows 6–17 min stuck rows
 * are queue-wait inside the Agents product; the Router endpoint does not
 * queue.
 */
const ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";

/** Per-key system-prompt + registry-row cache TTL (60s). Same cadence as REGISTRY_CACHE_TTL_MS. */
const SYSTEM_PROMPT_CACHE_TTL_MS = 60_000;

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
  description?: string;
  swarm_type?: string;
  version?: string;
  input_schema?: Record<string, unknown>;
  output_schema: Record<string, unknown>;
  model_config: Record<string, unknown>;
  timeout_ms?: number;
  enabled: boolean;
  /**
   * Phase 999.4 Fix C — system prompt cached on the registry row. SSOT remains
   * Studio (Operations re-syncs into the registry on prompt changes); the
   * Router-direct path reads from here so we don't make an extra get_agent
   * HTTP call per invocation.
   */
  system_prompt?: string;
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

/**
 * Phase 999.4 Fix C — sibling helper to invokeOrqAgent that hits the LLM
 * Router direct path. Same `OrqClientTimeoutError` + 45s `AbortController`
 * deadline as `invokeOrqAgent`, different transport: bypasses the Orq
 * Agents-product queue.
 *
 * Per-agent_key cache (60s TTL) folds the registry row + system_prompt
 * into one supabase fetch. SSOT for the system prompt remains Studio;
 * the registry mirrors it. The cache TTL bounds prompt-drift to 60s.
 *
 * Throws on:
 *   - agent not in registry / disabled
 *   - registry row missing model_config.primary or system_prompt
 *   - ORQ_API_KEY missing
 *   - timeout (> CLIENT_DEADLINE_MS) → OrqClientTimeoutError
 *   - non-2xx response
 *   - JSON parse failure on choices[0].message.content
 */
type AgentByKeyCacheEntry = { row: OrqAgentRow; fetched_at: number };
const agentByKeyCache = new Map<string, AgentByKeyCacheEntry>();

async function loadAgentByKeyCached(agent_key: string): Promise<OrqAgentRow> {
  const now = Date.now();
  const hit = agentByKeyCache.get(agent_key);
  if (hit && now - hit.fetched_at < SYSTEM_PROMPT_CACHE_TTL_MS) return hit.row;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("orq_agents")
    .select(
      "agent_key, orqai_id, description, swarm_type, version, input_schema, output_schema, model_config, timeout_ms, enabled, system_prompt",
    )
    .eq("agent_key", agent_key)
    .single();
  if (error) {
    throw new Error(
      `orq_agents registry read failed for ${agent_key}: ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(`orq_agents: agent_key="${agent_key}" not found`);
  }
  const row = data as OrqAgentRow;
  if (!row.enabled) {
    throw new Error(`orq_agents: agent_key="${agent_key}" is not enabled`);
  }
  agentByKeyCache.set(agent_key, { row, fetched_at: now });
  return row;
}

export async function invokeOrqModel(
  agent_key: string,
  inputs: Record<string, unknown>,
): Promise<InvokeResult> {
  if (!ORQ_API_KEY) {
    throw new Error("ORQ_API_KEY is not set");
  }

  const agent = await loadAgentByKeyCached(agent_key);

  const mc = (agent.model_config ?? {}) as {
    primary?: string;
    fallbacks?: string[];
    temperature?: number;
    max_tokens?: number;
  };
  const model = mc.primary;
  if (!model) {
    throw new Error(
      `Orq agent ${agent_key} registry row missing model_config.primary`,
    );
  }

  const systemPrompt = agent.system_prompt;
  if (!systemPrompt) {
    throw new Error(
      `Orq agent ${agent_key} registry row missing system_prompt — populate via Studio sync before invoking via Router-direct path`,
    );
  }

  const requestBody = {
    model,
    fallback_models: mc.fallbacks ?? [],
    temperature: mc.temperature ?? 0,
    max_tokens: mc.max_tokens ?? 600,
    messages: [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: JSON.stringify(inputs, null, 2) },
    ],
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: agent.agent_key.replace(/-/g, "_"),
        strict: true as const,
        schema: agent.output_schema,
      },
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_DEADLINE_MS);
  let res: Response;
  try {
    res = await fetch(ROUTER_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ORQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: ctrl.signal,
    });
  } catch (err) {
    if ((err as { name?: string } | undefined)?.name === "AbortError") {
      throw new OrqClientTimeoutError(
        `Orq router deadline exceeded for ${agent_key} after ${CLIENT_DEADLINE_MS}ms`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Orq router invoke ${agent_key} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const rawText = json.choices?.[0]?.message?.content ?? "";
  if (!rawText) {
    throw new Error(
      `Orq router invoke ${agent_key}: empty content in response`,
    );
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
      `Orq router invoke ${agent_key}: JSON.parse failed: ${(e as Error).message}`,
    );
  }

  return {
    raw,
    agent,
    usage: {
      prompt_tokens: json.usage?.prompt_tokens ?? 0,
      completion_tokens: json.usage?.completion_tokens ?? 0,
      total_tokens: json.usage?.total_tokens ?? 0,
    },
    // Router /chat/completions does not currently surface per-call billing.
    // Documented limitation — see Phase 999.4 Plan 03 SUMMARY.
    billing: { total_cost: 0 },
    cost_cents: 0,
  };
}

/** Test-only: clear the in-memory registry cache. */
export function __resetCacheForTests() {
  cache = null;
  agentByKeyCache.clear();
}
