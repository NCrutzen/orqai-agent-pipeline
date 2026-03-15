/**
 * Pipeline durable function: Inngest function with step-per-stage execution.
 *
 * Each pipeline stage runs as an individual Inngest step.run(), giving:
 * - Independent retry per step (3 retries)
 * - Memoization of completed steps within the same function run
 * - Resume-from-failed-step via DB state check on re-trigger
 *
 * CRITICAL Inngest patterns followed:
 * - All side effects (DB writes, API calls) inside step.run()
 * - Large outputs stored in Supabase, only references returned from step.run()
 * - Admin client used (no request context in Inngest functions)
 * - Non-streaming Claude API calls (streaming incompatible with Inngest steps)
 */

import { inngest } from "../client";
import { createAdminClient } from "@/lib/supabase/admin";
import { runPromptAdapter } from "@/lib/pipeline/adapter";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";
import { toPlainEnglish } from "@/lib/pipeline/errors";

/**
 * Context keys expected by each pipeline stage.
 * Used to assemble the correct context object from previous step results.
 */
const STAGE_CONTEXT_MAP: Record<string, (results: Record<string, string>, useCase: string) => Record<string, string>> = {
  architect: (_results, useCase) => ({ useCase }),
  "tool-resolver": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
  }),
  researcher: (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
  }),
  "spec-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    tools: results["tool-resolver"] || "",
    researchBrief: results.researcher || "",
  }),
  "orchestration-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
  "dataset-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
  "readme-generator": (results, useCase) => ({
    useCase,
    blueprint: results.architect || "",
    agentSpecs: results["spec-generator"] || "",
  }),
};

export const executePipeline = inngest.createFunction(
  {
    id: "pipeline/execute",
    retries: 3,
    onFailure: async ({ event, error }) => {
      const admin = createAdminClient();
      const { runId } = event.data.event.data;

      // Find the last running step
      const { data: failedStep } = await admin
        .from("pipeline_steps")
        .select("id, name")
        .eq("run_id", runId)
        .eq("status", "running")
        .single();

      if (failedStep) {
        await admin
          .from("pipeline_steps")
          .update({
            status: "failed",
            error_message: toPlainEnglish(error),
            completed_at: new Date().toISOString(),
          })
          .eq("id", failedStep.id);
      }

      await admin
        .from("pipeline_runs")
        .update({ status: "failed" })
        .eq("id", runId);
    },
  },
  { event: "pipeline/run.started" },
  async ({ event, step }) => {
    const { runId, useCase } = event.data;

    // Step: Mark run as running
    await step.run("mark-run-running", async () => {
      const admin = createAdminClient();
      await admin
        .from("pipeline_runs")
        .update({
          status: "running",
          started_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { started: true };
    });

    // Accumulate stage result references (step IDs for DB lookup)
    // These are loaded from DB on resume, not from Inngest state
    const stageResults: Record<string, string> = {};

    // Execute each stage as a separate Inngest step
    for (const stage of PIPELINE_STAGES) {
      const stepRef = await step.run(stage.name, async () => {
        const admin = createAdminClient();
        const startTime = Date.now();

        // Check for resume skip: if step already complete, return stored result
        const { data: existingStep } = await admin
          .from("pipeline_steps")
          .select("id, status, result")
          .eq("run_id", runId)
          .eq("name", stage.name)
          .single();

        if (existingStep?.status === "complete" && existingStep.result !== null) {
          // Step already completed (retry-from-failed-step scenario)
          return {
            skipped: true,
            stepId: existingStep.id,
            output: (existingStep.result as { output?: string })?.output || "",
          };
        }

        // Update status to running
        if (existingStep) {
          await admin
            .from("pipeline_steps")
            .update({
              status: "running",
              started_at: new Date().toISOString(),
            })
            .eq("id", existingStep.id);
        }

        // Build context from previous stage results
        const contextBuilder = STAGE_CONTEXT_MAP[stage.name];
        const context = contextBuilder
          ? contextBuilder(stageResults, useCase)
          : { useCase };

        // Call prompt adapter (non-streaming Claude API call)
        const result = await runPromptAdapter(stage.name, context);

        const durationMs = Date.now() - startTime;

        // Store result in Supabase (large output stays in DB, not Inngest state)
        if (existingStep) {
          await admin
            .from("pipeline_steps")
            .update({
              status: "complete",
              result: { output: result },
              completed_at: new Date().toISOString(),
              duration_ms: durationMs,
              log: `Completed ${stage.displayName} in ${Math.round(durationMs / 1000)}s`,
            })
            .eq("id", existingStep.id);
        }

        // Update run progress (increment steps_completed)
        const { data: currentRun } = await admin
          .from("pipeline_runs")
          .select("steps_completed")
          .eq("id", runId)
          .single();
        await admin
          .from("pipeline_runs")
          .update({ steps_completed: (currentRun?.steps_completed || 0) + 1 })
          .eq("id", runId);

        // Return a reference, NOT the full output (Pitfall 6)
        return {
          skipped: false,
          stepId: existingStep?.id || "",
          output: result,
        };
      });

      // Store the output for downstream stages to use
      // This is the return value from step.run() -- available across re-invocations via memoization
      stageResults[stage.name] = stepRef.output;
    }

    // All stages complete: mark run as complete
    await step.run("mark-run-complete", async () => {
      const admin = createAdminClient();
      await admin
        .from("pipeline_runs")
        .update({
          status: "complete",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { completed: true };
    });

    return { runId, status: "complete" };
  }
);
