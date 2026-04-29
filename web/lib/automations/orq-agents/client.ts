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

export type InvokeResult = {
  raw: unknown; // The Orq response (caller is responsible for Zod-parsing).
  agent: OrqAgentRow;
};

/**
 * Invoke an Orq.ai agent by registry key.
 *
 * - Reads slug + timeout from public.orq_agents
 * - Builds the response_format from registry output_schema (so model
 *   guardrails travel with the registry row, not the caller)
 * - Returns the raw response — caller Zod-parses against the same shape
 *   they want type-narrowed
 *
 * Throws on:
 *   - agent not in registry / disabled
 *   - ORQ_API_KEY missing
 *   - timeout (> agent.timeout_ms)
 *   - non-2xx response
 */
export async function invokeOrqAgent(
  agent_key: string,
  inputs: Record<string, unknown>,
  opts?: { jsonSchemaName?: string },
): Promise<InvokeResult> {
  if (!ORQ_API_KEY) {
    throw new Error("ORQ_API_KEY is not set");
  }

  const agent = await loadAgent(agent_key);

  // Build response_format guardrail from the registry's output_schema.
  // Orq's strict json_schema mode rejects any properties beyond the schema,
  // which is exactly what we want for prompt-injection-resistant outputs.
  const response_format = agent.output_schema
    ? {
        type: "json_schema" as const,
        json_schema: {
          name:
            opts?.jsonSchemaName ??
            agent.agent_key.replace(/[^a-z0-9]+/g, "_") + "_output",
          schema: agent.output_schema,
          strict: true,
        },
      }
    : undefined;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), agent.timeout_ms);
  try {
    const res = await fetch(`${ORQ_BASE_URL}/${agent.orqai_id}/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ORQ_API_KEY}`,
      },
      body: JSON.stringify({
        inputs,
        ...(response_format ? { response_format } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Orq invoke ${agent_key} failed: HTTP ${res.status} ${text.slice(0, 200)}`,
      );
    }
    const json = await res.json();
    // Orq sometimes wraps in { output: ... }; unwrap so callers don't have to.
    const raw =
      json && typeof json === "object" && "output" in json
        ? (json as { output: unknown }).output
        : json;
    return { raw, agent };
  } finally {
    clearTimeout(timer);
  }
}

/** Test-only: clear the in-memory registry cache. */
export function __resetCacheForTests() {
  cache = null;
}
