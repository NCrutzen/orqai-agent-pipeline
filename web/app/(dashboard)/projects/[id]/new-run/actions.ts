"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { inngest } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PIPELINE_STAGES } from "@/lib/pipeline/stages";

const startPipelineSchema = z.object({
  projectId: z.string().uuid("Invalid project ID"),
  useCase: z.string().min(10, "Use case description must be at least 10 characters"),
  runName: z.string().optional(),
});

/**
 * Server action to create a pipeline run and trigger Inngest execution.
 *
 * 1. Authenticates the user
 * 2. Validates input (useCase must be >= 10 chars)
 * 3. Creates pipeline_runs record
 * 4. Creates pipeline_steps records for all stages (status: pending)
 * 5. Triggers Inngest pipeline/run.started event
 * 6. Redirects to run detail page
 */
export async function startPipeline(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const projectId = formData.get("projectId") as string;
  const useCase = formData.get("useCase") as string;
  const runName = (formData.get("runName") as string) || undefined;

  // Validate input
  const parsed = startPipelineSchema.safeParse({ projectId, useCase, runName });
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message);
  }

  const admin = createAdminClient();

  // Create pipeline_runs record
  const { data: run, error: runError } = await admin
    .from("pipeline_runs")
    .insert({
      project_id: projectId,
      name: runName || useCase.slice(0, 60),
      use_case: useCase,
      status: "pending",
      step_count: PIPELINE_STAGES.length,
      created_by: user.id,
    })
    .select()
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create pipeline run: ${runError?.message || "Unknown error"}`);
  }

  // Create initial pipeline_steps records for all stages
  const { error: stepsError } = await admin.from("pipeline_steps").insert(
    PIPELINE_STAGES.map((s) => ({
      run_id: run.id,
      name: s.name,
      display_name: s.displayName,
      status: "pending",
      step_order: s.stepOrder,
    }))
  );

  if (stepsError) {
    throw new Error(`Failed to create pipeline steps: ${stepsError.message}`);
  }

  // Trigger Inngest durable function
  await inngest.send({
    name: "pipeline/run.started",
    data: {
      runId: run.id,
      projectId,
      useCase,
      userId: user.id,
    },
  });

  redirect(`/projects/${projectId}/runs/${run.id}`);
}

/**
 * Server action to retry a failed pipeline from the exact failure point.
 *
 * 1. Authenticates the user
 * 2. Finds the first failed step
 * 3. Resets failed + subsequent steps to pending
 * 4. Updates run status to running
 * 5. Re-triggers Inngest with resumeFromStep
 * 6. Revalidates the run detail page
 */
export async function retryPipeline(runId: string, projectId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // Find the first failed step (ordered by step_order)
  const { data: failedStep } = await admin
    .from("pipeline_steps")
    .select("id, name, step_order")
    .eq("run_id", runId)
    .eq("status", "failed")
    .order("step_order", { ascending: true })
    .limit(1)
    .single();

  if (!failedStep) {
    throw new Error("No failed step found to retry");
  }

  // Reset the failed step and all subsequent steps to pending
  const { error: resetError } = await admin
    .from("pipeline_steps")
    .update({
      status: "pending",
      error_message: null,
      started_at: null,
      completed_at: null,
      duration_ms: null,
      result: null,
      log: null,
    })
    .eq("run_id", runId)
    .gte("step_order", failedStep.step_order);

  if (resetError) {
    throw new Error(`Failed to reset steps: ${resetError.message}`);
  }

  // Update run status to running
  await admin
    .from("pipeline_runs")
    .update({ status: "running" })
    .eq("id", runId);

  // Re-trigger Inngest with resumeFromStep
  await inngest.send({
    name: "pipeline/run.started",
    data: {
      runId,
      projectId,
      useCase: "", // Will be loaded from the run record by the function if needed
      userId: user.id,
      resumeFromStep: failedStep.name,
    },
  });

  revalidatePath(`/projects/${projectId}/runs/${runId}`);
}
