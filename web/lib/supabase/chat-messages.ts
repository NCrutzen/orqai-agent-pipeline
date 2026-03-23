import { createAdminClient } from "@/lib/supabase/admin";
import type { ChatMessage } from "@/lib/pipeline/chat-types";

/** Save a complete chat message to DB (called after streaming completes or for user messages) */
export async function saveChatMessage(
  runId: string,
  role: "assistant" | "user",
  content: string,
  stageName?: string,
  turnIndex?: number
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pipeline_chat_messages")
    .insert({
      run_id: runId,
      role,
      content,
      stage_name: stageName ?? null,
      turn_index: turnIndex ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Fetch all chat messages for a run, ordered by created_at ascending */
export async function getChatMessages(runId: string): Promise<ChatMessage[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pipeline_chat_messages")
    .select("*")
    .eq("run_id", runId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}
