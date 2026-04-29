// Phase 56-00 (D-13). Orq.ai LLM tiebreaker for multi-candidate debtor
// resolution. Pre-fetched candidate context (D-12) — never gives the LLM
// tool-use access to NXT.
//
// Hardening (threat T-56-00-03 prompt injection): post-validate that
// selected_account_id is in the caller-provided candidates list. Throw
// otherwise.
//
// 2026-04-29 (Phase 56-02 wave 3): registry-aware. Prefers
// public.orq_agents row 'label-tiebreaker' when enabled; falls back to
// LABEL_TIEBREAKER_AGENT_SLUG env var while operator fills in the
// real slug + flips enabled=true. After the registry row is active,
// the env var becomes vestigial.

import { z } from "zod";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";

const TiebreakerOutputSchema = z.object({
  selected_account_id: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().min(1),
});
export type TiebreakerOutput = z.infer<typeof TiebreakerOutputSchema>;

const ORQ_TIMEOUT_MS = 45_000;
const REGISTRY_AGENT_KEY = "label-tiebreaker";

export interface TiebreakerCandidate {
  customer_account_id: string;
  customer_name: string;
  contactperson_name?: string;
  recent_invoices?: unknown[];
  last_interaction?: string;
}

export interface TiebreakerArgs {
  email_subject: string;
  email_body: string;
  candidates: TiebreakerCandidate[];
}

export async function callTiebreaker(
  args: TiebreakerArgs,
): Promise<TiebreakerOutput> {
  const inputs = {
    email_subject: args.email_subject,
    email_body: args.email_body,
    candidates: args.candidates,
  };

  let raw: unknown;
  try {
    // Preferred path: registry-driven invocation.
    const result = await invokeOrqAgent(REGISTRY_AGENT_KEY, inputs, {
      jsonSchemaName: "label_tiebreaker_output",
    });
    raw = result.raw;
  } catch (err) {
    // Fallback to env-var path while the registry row is being populated
    // OR the registry connection isn't available (test env, missing
    // service-role key, etc.). Once the operator sets a real orqai_id +
    // enabled=true AND production has SUPABASE creds, registry path
    // succeeds and this branch becomes unreachable.
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      `[tiebreaker] registry path unavailable (${reason}); falling back to LABEL_TIEBREAKER_AGENT_SLUG env var`,
    );
    raw = await callTiebreakerLegacy(args);
  }

  const parsed = TiebreakerOutputSchema.parse(raw);

  // Post-validate (T-56-00-03 prompt-injection guard).
  const allowed = new Set(args.candidates.map((c) => c.customer_account_id));
  if (!allowed.has(parsed.selected_account_id)) {
    throw new Error(
      `Tiebreaker returned selected_account_id='${parsed.selected_account_id}' not in candidates`,
    );
  }
  return parsed;
}

/** Legacy env-var path. Removed once orq_agents row is populated. */
async function callTiebreakerLegacy(args: TiebreakerArgs): Promise<unknown> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");
  const slug = process.env.LABEL_TIEBREAKER_AGENT_SLUG;
  if (!slug) throw new Error("LABEL_TIEBREAKER_AGENT_SLUG not set");

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ORQ_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.orq.ai/v2/agents/${slug}/invoke`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        inputs: {
          email_subject: args.email_subject,
          email_body: args.email_body,
          candidates: args.candidates,
        },
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "label_tiebreaker_output",
            schema: {
              type: "object",
              properties: {
                selected_account_id: { type: "string" },
                confidence: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                },
                reason: { type: "string", minLength: 1 },
              },
              required: ["selected_account_id", "confidence", "reason"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Orq.ai tiebreaker failed: ${res.status}`);
    }
    const json = await res.json();
    return json && typeof json === "object" && "output" in json
      ? (json as { output: unknown }).output
      : json;
  } finally {
    clearTimeout(t);
  }
}
