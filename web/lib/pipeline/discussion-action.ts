"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { saveChatMessage } from "@/lib/supabase/chat-messages";
import { broadcastChatMessage } from "@/lib/supabase/broadcast";

/**
 * Submit a discussion response (user's typed message).
 * Persists the message to DB, broadcasts it to the chat panel,
 * and sends an Inngest event to resume the pipeline's waitForEvent.
 */
export async function submitDiscussionResponse(
  runId: string,
  message: string,
  turnIndex: number
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Persist user message to DB
  const messageId = await saveChatMessage(runId, "user", message, "discussion", turnIndex);

  // Broadcast to chat panel so other open tabs see the message immediately
  await broadcastChatMessage(runId, {
    id: messageId,
    role: "user",
    content: message,
    stageName: "discussion",
  });

  // Send Inngest event to resume pipeline
  await inngest.send({
    name: "pipeline/discussion.responded",
    data: {
      runId,
      message,
      turnIndex,
    },
  });

  // Revalidate run page
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("pipeline_runs")
    .select("project_id")
    .eq("id", runId)
    .single();

  if (run) {
    revalidatePath(`/projects/${run.project_id}/runs/${runId}`);
  }
}
