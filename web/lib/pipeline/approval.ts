"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

/**
 * Create an approval request in the database.
 * Called from the Inngest pipeline function (server-side, admin client).
 */
export async function createApprovalRequest(params: {
  runId: string;
  stepName: string;
  oldContent: string;
  newContent: string;
  explanation: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("approval_requests")
    .insert({
      run_id: params.runId,
      step_name: params.stepName,
      old_content: params.oldContent,
      new_content: params.newContent,
      explanation: params.explanation,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create approval request: ${error?.message || "Unknown error"}`);
  }

  return data.id;
}

/**
 * Submit an approval decision (approve or reject).
 * Called from the UI via server action.
 *
 * Uses .eq("status", "pending") to prevent double-submit.
 * Sends Inngest event to resume the pipeline.
 */
export async function submitApprovalDecision(
  approvalId: string,
  decision: "approved" | "rejected",
  comment?: string
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  // Fetch approval to get runId and projectId for revalidation
  const { data: approval, error: fetchError } = await admin
    .from("approval_requests")
    .select("id, run_id, status")
    .eq("id", approvalId)
    .single();

  if (fetchError || !approval) {
    throw new Error("Approval request not found");
  }

  if (approval.status !== "pending") {
    throw new Error("This approval has already been decided.");
  }

  // Update approval request in DB (prevent double-submit with .eq status pending)
  const { error: updateError } = await admin
    .from("approval_requests")
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      comment: comment || null,
    })
    .eq("id", approvalId)
    .eq("status", "pending");

  if (updateError) {
    throw new Error(`Failed to update approval: ${updateError.message}`);
  }

  // Send Inngest event to resume pipeline
  await inngest.send({
    name: "pipeline/approval.decided",
    data: {
      approvalId,
      runId: approval.run_id,
      decision,
      decidedBy: user.id,
      comment: comment || null,
    },
  });

  // Fetch project_id for path revalidation
  const { data: run } = await admin
    .from("pipeline_runs")
    .select("project_id")
    .eq("id", approval.run_id)
    .single();

  if (run) {
    revalidatePath(`/projects/${run.project_id}/runs/${approval.run_id}`);
  }
}
