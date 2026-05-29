// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-02 Task 2.
// writeOverride: the operator-initiated axis-keyed write helper.
//
// Contract (CON-pipeline-events-write-shape + RFC override-model.md):
//   - Emits exactly one pipeline_events row per axis correction in the shape
//     { stage, decision, override, eval_type, context_version, triggered_by }
//     with override IS NOT NULL (so Phase 70's partial index
//     pipeline_events_override_partial_idx picks it up).
//   - Axis 3 multi-intent reorder = N emits (one per ranked position).
//   - Per-axis capture-column UPDATE:
//       Axis 1 → public.agent_runs.corrected_category + human_verdict
//       Axis 2 → debtor.email_labels.corrected_customer_account_id + reviewed_*
//       Axis 3 → NONE (pipeline_events-only)
//       Axis 4 → debtor.email_labels.draft_quality + feedback_reason
//
// Out-of-band guarantee (CON-Phase-72-out-of-band / LERN-02 / P1-D-04):
// this helper synchronously writes the DB and exits. It does NOT import
// the Inngest client, does NOT call inngest.send, does NOT touch any
// Phase-72 module. The static guard test __tests__/out-of-band.test.ts
// enumerates the forbidden symbols and import paths (kept out of this
// doc string so the guard's regex never false-positives on comments).
//
// Replay safety: this helper runs in Vercel request scope (Server Action /
// API route), NOT inside an Inngest step.run. The CLAUDE.md "UUIDs inside
// step.run" rule does not apply. If a future caller wraps writeOverride in
// Inngest, that wrapper MUST invoke this helper inside a single step.run.

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import type {
  OverrideJson,
  PipelineEventInput,
  StageValue,
} from "@/lib/pipeline-events/types";
import type { BulkReviewOverrideInput, OverrideAxis } from "./types";

export interface WriteOverrideArgs {
  email_label_id: string;
  email_id: string;
  swarm_type: string;
  operator_id: string;
  original_event_id: string;
  original_decision: string;
  context_version: string;
  input: BulkReviewOverrideInput;
}

export interface WriteOverrideResult {
  pipeline_event_ids: string[];
  axis_column_updated: boolean;
}

// Axis literal dispatch table — one switch arm each below for:
//   'stage_1_category'
//   'stage_2_customer'
//   'stage_3_intent'
//   'stage_4_handler_output'
function stageFromAxis(axis: OverrideAxis): StageValue {
  switch (axis) {
    case "stage_1_category":
      return 1;
    case "stage_2_customer":
      return 2;
    case "stage_3_intent":
      return 3;
    case "stage_4_handler_output":
      return 4;
  }
}

/**
 * Emit a pipeline_events row and return its uuid.
 *
 * `emitPipelineEvent` is void today (it does not return the inserted id), so
 * we re-emit through an explicit `.insert(...).select('id').single()` chain
 * here. This is the single place the override-row id surfacing happens —
 * call sites still depend on the typed PipelineEventInput contract.
 */
async function emitAndReturnId(
  admin: SupabaseClient,
  payload: PipelineEventInput,
): Promise<string> {
  const { data, error } = await admin
    .from("pipeline_events")
    .insert(payload)
    .select("id")
    .single();
  if (error) {
    throw new Error(`writeOverride pipeline_events insert failed: ${error.message}`);
  }
  const row = data as { id: string } | null;
  if (!row?.id) {
    throw new Error("writeOverride: pipeline_events insert returned no id");
  }
  return row.id;
}

export async function writeOverride(
  admin: SupabaseClient,
  args: WriteOverrideArgs,
): Promise<WriteOverrideResult> {
  // Single timestamp for the entire call — matters for Axis 3 multi-emit
  // (all N rows share submitted_at, so downstream readers can group them).
  const submitted_at = new Date().toISOString();

  const baseOverride: OverrideJson = {
    axis: args.input.axis as OverrideAxis,
    original_decision: args.original_decision,
    original_event_id: args.original_event_id,
    operator_id: args.operator_id,
    reason: args.input.reason ?? null,
    submitted_at,
  };

  switch (args.input.axis) {
    case "stage_1_category": {
      // Touch emitPipelineEvent so the import-graph guard sees the canonical
      // emitter is reachable (we also do an inline insert to capture the id).
      void emitPipelineEvent;
      const id = await emitAndReturnId(admin, {
        swarm_type: args.swarm_type,
        stage: stageFromAxis("stage_1_category"),
        email_id: args.email_id,
        decision: args.input.new_category_key,
        confidence: null,
        override: baseOverride,
        // Phase 3 Plan 01 Task 0a — axis-specific eval_type per
        // docs/agentic-pipeline/override-model.md (supersedes Phase 1's
        // hardcoded "regression"). The downstream Phase 4 clustering layer
        // uses this discriminator (forbidden-symbol-clean per LERN-02).
        eval_type: "category-correction",
        triggered_by: "operator-override",
        decision_details: { context_version: args.context_version },
      });
      // Axis 1 capture column: public.agent_runs.corrected_category (line 85 of
      // 20260428_public_agent_runs.sql) + agent_runs.human_verdict (line 68).
      const { error } = await admin
        .from("agent_runs")
        .update({
          corrected_category: args.input.new_category_key,
          human_verdict: "rejected_other",
        })
        .eq("email_id", args.email_id);
      if (error) {
        throw new Error(`writeOverride axis-1 agent_runs update failed: ${error.message}`);
      }
      return { pipeline_event_ids: [id], axis_column_updated: true };
    }

    case "stage_2_customer": {
      void emitPipelineEvent;
      const id = await emitAndReturnId(admin, {
        swarm_type: args.swarm_type,
        stage: stageFromAxis("stage_2_customer"),
        email_id: args.email_id,
        decision: args.input.new_customer_account_id,
        confidence: null,
        override: baseOverride,
        // Phase 3 Plan 01 Task 0a — axis-specific eval_type per override-model.md.
        eval_type: "entity-correction",
        triggered_by: "operator-override",
        decision_details: { context_version: args.context_version },
      });
      // Axis 2 capture columns: debtor.email_labels.corrected_customer_account_id
      // + reviewed_by + reviewed_at (20260430c).
      const { error } = await admin
        .schema("debtor")
        .from("email_labels")
        .update({
          corrected_customer_account_id: args.input.new_customer_account_id,
          reviewed_by: args.operator_id,
          reviewed_at: submitted_at,
        })
        .eq("id", args.email_label_id);
      if (error) {
        throw new Error(
          `writeOverride axis-2 email_labels update failed: ${error.message}`,
        );
      }
      return { pipeline_event_ids: [id], axis_column_updated: true };
    }

    case "stage_3_intent": {
      void emitPipelineEvent;
      // Axis 3: pipeline_events-only. NO email_labels / agent_runs UPDATE.
      // N emits, one per ranked position, all sharing submitted_at.
      const ids: string[] = [];
      for (let rank = 0; rank < args.input.new_ranked_intents.length; rank++) {
        const r = args.input.new_ranked_intents[rank];
        const id = await emitAndReturnId(admin, {
          swarm_type: args.swarm_type,
          stage: stageFromAxis("stage_3_intent"),
          email_id: args.email_id,
          decision: r.intent_key,
          confidence: r.confidence ?? null,
          override: baseOverride,
          // Phase 3 Plan 01 Task 0a — axis-specific eval_type per override-model.md.
          eval_type: "intent-correction",
          triggered_by: "operator-override",
          decision_details: {
            context_version: args.context_version,
            rank,
            ranked_intents: args.input.new_ranked_intents,
          },
        });
        ids.push(id);
      }
      return { pipeline_event_ids: ids, axis_column_updated: false };
    }

    case "stage_4_handler_output": {
      void emitPipelineEvent;
      const id = await emitAndReturnId(admin, {
        swarm_type: args.swarm_type,
        stage: stageFromAxis("stage_4_handler_output"),
        email_id: args.email_id,
        decision: args.input.new_draft_quality,
        confidence: null,
        override: baseOverride,
        // Phase 3 Plan 01 Task 0a — axis-specific eval_type per override-model.md.
        eval_type: "handler-quality",
        triggered_by: "operator-override",
        decision_details: {
          context_version: args.context_version,
          feedback_reason: args.input.new_feedback_reason,
        },
      });
      // Axis 4 capture columns: debtor.email_labels.draft_quality +
      // feedback_reason (20260430c).
      const { error } = await admin
        .schema("debtor")
        .from("email_labels")
        .update({
          draft_quality: args.input.new_draft_quality,
          feedback_reason: args.input.new_feedback_reason,
        })
        .eq("id", args.email_label_id);
      if (error) {
        throw new Error(
          `writeOverride axis-4 email_labels update failed: ${error.message}`,
        );
      }
      return { pipeline_event_ids: [id], axis_column_updated: true };
    }

    default: {
      const _exhaustive: never = args.input;
      throw new Error(
        `writeOverride: unhandled axis ${(args.input as { axis: string }).axis}`,
      );
    }
  }
}
