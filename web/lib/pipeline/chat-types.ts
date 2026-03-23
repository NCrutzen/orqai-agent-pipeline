/** A single chat message stored in pipeline_chat_messages */
export interface ChatMessage {
  id: string;
  run_id: string;
  role: "assistant" | "user";
  content: string;
  stage_name: string | null;
  turn_index: number | null;
  created_at: string;
}

/** Broadcast payload for streaming tokens from server to client */
export interface ChatTokenPayload {
  messageId: string;
  role: "assistant";
  token: string;
  isStart?: boolean;
  isDone?: boolean;
  stageName?: string;
}

/** Broadcast payload for a complete chat message (user messages, template messages) */
export interface ChatMessagePayload {
  id: string;
  role: "assistant" | "user";
  content: string;
  stageName?: string;
  turnIndex?: number;
}
