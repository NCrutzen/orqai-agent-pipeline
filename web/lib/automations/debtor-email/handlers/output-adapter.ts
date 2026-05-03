// Phase 65 D-06 — adapter from existing body-agent shape to canonical HandlerOutput.
// Future Stage 4 handlers (sales-email Phase 73, etc.) implement HandlerOutput directly; the adapter
// is a transitional bridge for the existing debtor-copy-document-body-agent only.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandlerOutput } from "@/lib/agentic-pipeline/types";
import type { BodyAgentOutput } from "@/lib/automations/debtor-email/triage/types";

export function bodyAgentOutputToHandlerOutput(
  body: BodyAgentOutput,
  ctx: {
    handler_key: string;
    intent: string;
    language: HandlerOutput["language"];
    references: string[];
    confidence: HandlerOutput["confidence"];
  },
): HandlerOutput {
  return {
    handler_key: ctx.handler_key,
    intent: ctx.intent,
    content_kind: "draft_body",
    content: body.body_html,
    language: ctx.language,
    tone: body.detected_tone, // "neutral" | "de-escalation"
    references: ctx.references,
    confidence: ctx.confidence,
  };
}

// Read all Stage 4 handler outputs for a coordinator run.
// Skips rows where status='failed' (those are reflected in coordinator_runs.failed_handlers).
// JSONB double-decode guard per CLAUDE.md Supabase pattern.
export async function loadHandlerOutputsForRun(
  admin: SupabaseClient,
  run_id: string,
): Promise<HandlerOutput[]> {
  const { data, error } = await admin
    .from("agent_runs")
    .select("intent, tool_outputs, status, language, references")
    .eq("coordinator_run_id", run_id)
    .neq("status", "failed");
  if (error) throw error;

  const outputs: HandlerOutput[] = [];
  for (const row of (data ?? []) as Array<{
    intent: string | null;
    tool_outputs: unknown;
    status: string | null;
    language: string | null;
    references: string[] | null;
  }>) {
    let toolOutputs: unknown = row.tool_outputs;
    while (typeof toolOutputs === "string") {
      try {
        toolOutputs = JSON.parse(toolOutputs);
      } catch {
        toolOutputs = null;
        break;
      }
    }
    if (!toolOutputs || typeof toolOutputs !== "object") continue;

    const handlerOutputDirect = (toolOutputs as { handler_output?: HandlerOutput })
      ?.handler_output;
    if (handlerOutputDirect) {
      outputs.push(handlerOutputDirect);
      continue;
    }

    // Legacy body-agent output adapter path (existing debtor-copy-document-body-agent).
    const body = (toolOutputs as { body?: BodyAgentOutput })?.body;
    if (body) {
      outputs.push(
        bodyAgentOutputToHandlerOutput(body, {
          handler_key: "debtor-copy-document-body-agent",
          intent: row.intent ?? "copy_document_request",
          language: (row.language as HandlerOutput["language"]) ?? "nl",
          references: row.references ?? [],
          confidence: "medium",
        }),
      );
    }
  }
  return outputs;
}
