"use server";

/**
 * Server actions for Kanban (Phase 52, KAN-03).
 *
 * `moveJob(jobId, newStage)` validates the input, authenticates the
 * caller, authorizes via `project_members`, then UPDATEs `swarm_jobs`
 * via the service-role client. The Realtime publication on `swarm_jobs`
 * (Phase 48) broadcasts the resulting UPDATE to every viewer including
 * the originator -- the optimistic UI in the Kanban board reconciles
 * automatically.
 */

import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { KANBAN_STAGES } from "@/lib/v7/kanban/stages";
import type { SwarmJobStage } from "@/lib/v7/types";

const inputSchema = z.object({
  jobId: z.string().uuid(),
  newStage: z.enum(
    KANBAN_STAGES as [SwarmJobStage, ...SwarmJobStage[]],
  ),
});

export interface MoveJobResult {
  ok: true;
}

export async function moveJob(
  jobId: string,
  newStage: string,
): Promise<MoveJobResult> {
  const parsed = inputSchema.parse({ jobId, newStage });

  // 1. Authenticate.
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // 2. Load the job with service role (bypass RLS) -- need swarm_id
  //    for the authorization check.
  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin
    .from("swarm_jobs")
    .select("swarm_id, stage")
    .eq("id", parsed.jobId)
    .single();

  if (jobErr || !job) {
    throw new Error("Job not found");
  }

  // 3. Authorize: caller must be a project_members row for this swarm.
  const { count, error: memberErr } = await admin
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("project_id", job.swarm_id)
    .eq("user_id", user.id);

  if (memberErr) {
    throw new Error("Authorization check failed");
  }
  if ((count ?? 0) === 0) {
    throw new Error("Forbidden");
  }

  // 4. No-op short-circuit.
  if (job.stage === parsed.newStage) {
    return { ok: true };
  }

  // 5. UPDATE -- Realtime broadcast handles propagation to all viewers.
  const { error: updErr } = await admin
    .from("swarm_jobs")
    .update({
      stage: parsed.newStage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.jobId);

  if (updErr) {
    throw new Error(updErr.message || "Failed to update job stage");
  }

  return { ok: true };
}
