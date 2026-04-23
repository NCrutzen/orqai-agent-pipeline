import type { SupabaseClient } from "@supabase/supabase-js";
import type { Entity, Status } from "./types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type CreateRunInput = {
  email_id: string;
  inngest_run_id: string;
  entity: Entity;
  status?: Status;
};

export async function createRun(
  supabase: SupabaseClient,
  input: CreateRunInput,
): Promise<string> {
  const { data, error } = await supabase
    .schema("debtor")
    .from("agent_runs")
    .insert({
      email_id: input.email_id,
      inngest_run_id: input.inngest_run_id,
      entity: input.entity,
      status: input.status ?? "classifying",
    })
    .select("id")
    .single();

  if (error) throw new Error(`createRun: ${error.message}`);
  return (data as { id: string }).id;
}

export type UpdateRunPatch = Partial<{
  status: Status;
  intent: string;
  sub_type: string | null;
  document_reference: string | null;
  language: string;
  confidence: string;
  urgency: string;
  intent_version: string;
  reasoning: string;
  body_version: string;
  detected_tone: string;
  draft_url: string;
  completed_at: string;
  // tool_outputs is intentionally NOT here — use mergeToolOutputs.
}>;

export async function updateRun(
  supabase: SupabaseClient,
  id: string,
  patch: UpdateRunPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase
    .schema("debtor")
    .from("agent_runs")
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(`updateRun: ${error.message}`);
}

/**
 * Appends `{ [stage]: payload }` into `tool_outputs` without clobbering other
 * keys. Read-modify-write under the row's UUID is race-safe for this pipeline
 * because Inngest serializes step.run calls for a single event invocation.
 */
export async function mergeToolOutputs(
  supabase: SupabaseClient,
  id: string,
  stage: string,
  payload: JsonValue,
): Promise<void> {
  const { data, error: readErr } = await supabase
    .schema("debtor")
    .from("agent_runs")
    .select("tool_outputs")
    .eq("id", id)
    .single();
  if (readErr) throw new Error(`mergeToolOutputs read: ${readErr.message}`);

  const current =
    ((data as { tool_outputs: Record<string, JsonValue> | null } | null)
      ?.tool_outputs as Record<string, JsonValue> | null) ?? {};
  const merged: Record<string, JsonValue> = { ...current, [stage]: payload };

  const { error: writeErr } = await supabase
    .schema("debtor")
    .from("agent_runs")
    .update({ tool_outputs: merged })
    .eq("id", id);
  if (writeErr) throw new Error(`mergeToolOutputs write: ${writeErr.message}`);
}

/**
 * Idempotency cache lookup: "has this (email_id, version) already produced
 * non-null output on column X?" Used to skip Orq re-invocations on replay.
 */
export async function findCachedOutput<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  email_id: string,
  version_field: "intent_version" | "body_version",
  version_value: string,
  output_field: "tool_outputs" | "body_html" | "draft_url",
): Promise<T | null> {
  const { data, error } = await supabase
    .schema("debtor")
    .from("agent_runs")
    .select(`id,${output_field}`)
    .eq("email_id", email_id)
    .eq(version_field, version_value)
    .not(output_field, "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`findCachedOutput: ${error.message}`);
  if (!data) return null;
  return (data as Record<string, unknown>)[output_field] as T | null;
}
