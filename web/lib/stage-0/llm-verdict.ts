/**
 * Phase 64 SAFE-01 / SAFE-03 — Stage 0 LLM injection verdict.
 *
 * Registry-driven Orq.ai invocation per docs/orqai-patterns.md.
 * Agent: `stage-0-safety-classifier` (provisioned in public.orq_agents).
 *
 * Pitfall 3 (recursive screening): this module is called ONCE per inbound
 * email by the Stage 0 worker (Plan 04). Downstream LLMs see the SCREENED
 * body and are NOT re-screened. The verdict prompt itself never feeds back
 * into another Stage 0 invocation.
 *
 * Threat T-64-03 (Tampering): Zod safeParse at boundary; throws on malformed
 * upstream JSON. Plan 04 worker catches the throw and persists the run as
 * status='failed' (no auto-retry, manual triage in Bulk Review).
 */

import { z } from "zod";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";

const VerdictSchema = z.object({
  verdict: z.enum(["safe", "injection_suspected"]),
  reason: z.string().max(280),
  matched_span: z.string().nullable(),
});

export type StageZeroVerdict = z.infer<typeof VerdictSchema> & {
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_cents: number;
  };
};

export async function llmInjectionVerdict(args: {
  email_id: string;
  body: string;
  subject: string;
}): Promise<StageZeroVerdict> {
  const result = await invokeOrqAgent(
    "stage-0-safety-classifier",
    {
      email_id: args.email_id,
      email_subject: args.subject,
      email_body: args.body,
    },
    { jsonSchemaName: "stage_0_safety_verdict" },
  );

  const parsed = VerdictSchema.safeParse(result.raw);
  if (!parsed.success) {
    throw new Error(
      `Stage 0 verdict parse failed: ${parsed.error.message}`,
    );
  }

  // The mock surface in Plan 01 RED tests returns { raw, usage, billing }
  // (no precomputed cost_cents). Production invokeOrqAgent additionally
  // returns cost_cents. Helper handles both shapes.
  const usage = result.usage ?? {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  // Plan 01 mock returns { raw, usage, billing } (no precomputed cost_cents).
  // Production extended invokeOrqAgent additionally returns cost_cents. Accept
  // both shapes by preferring cost_cents if present, falling back to billing.
  const r = result as {
    cost_cents?: number;
    billing?: { total_cost?: number };
  };
  const cost_cents =
    typeof r.cost_cents === "number"
      ? r.cost_cents
      : Math.round((r.billing?.total_cost ?? 0) * 100);

  return {
    ...parsed.data,
    usage: {
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
      cost_cents,
    },
  };
}
