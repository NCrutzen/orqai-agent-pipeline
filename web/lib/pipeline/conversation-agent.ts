import { createChatBroadcaster } from "@/lib/supabase/broadcast";
import { saveChatMessage } from "@/lib/supabase/chat-messages";

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";

/**
 * The conversation agent is the single AI that talks to the user throughout
 * the entire pipeline. It replaces the separate discussion agent, narrator,
 * and hardcoded confirm/feedback logic.
 *
 * Like Claude Code in the terminal — one AI that understands context,
 * speaks the user's language, and orchestrates the pipeline.
 *
 * Returns: { response: string, action: PipelineAction }
 */

export type PipelineAction =
  | { type: "wait" }                          // Still in discussion, waiting for more input
  | { type: "discussion_complete" }           // Discussion done, start pipeline stages
  | { type: "continue" }                      // User confirmed, proceed to next stage
  | { type: "feedback"; summary: string };    // User gave feedback, re-run current stage

interface ConversationContext {
  /** Current pipeline phase: "discussion" | "architect-review" | "spec-review" | "running" | "complete" */
  phase: string;
  /** Latest stage output (architect result, spec result, etc.) */
  stageOutput?: string;
  /** What stage just completed */
  completedStage?: string;
  /** Number of discussion turns so far */
  discussionTurns?: number;
}

function buildSystemPrompt(context: ConversationContext): string {
  const phaseInstructions: Record<string, string> = {
    "discussion": `You are in the DISCUSSION phase. Ask ONE clarifying question at a time about the user's use case to help design the best agent swarm. Focus on: what the agents should do, target systems, expected inputs/outputs, and edge cases. After 3-5 questions (or when clear enough), wrap up and signal that you're ready to start designing.

${context.discussionTurns && context.discussionTurns >= 3 ? "You've asked enough questions. Unless the user wants to add more, wrap up the discussion." : ""}`,

    "architect-review": `The architect just designed an agent swarm. Here is the full output:

<architect_output>
${context.stageOutput?.slice(0, 4000) ?? ""}
</architect_output>

Summarize the designed swarm CONCISELY (bullet points, agent names and roles, under 10 lines). Do NOT ask for confirmation — just inform the user and say you're continuing to the next step. The pipeline keeps running.`,

    "spec-review": `The spec generator just created detailed agent specifications. Here is the output:

<spec_output>
${context.stageOutput?.slice(0, 4000) ?? ""}
</spec_output>

Highlight 2-3 key points per agent (model, main tools). Keep it compact. Do NOT ask for confirmation — just inform the user and say you're continuing. The pipeline keeps running.`,

    "running": `Pipeline stages are running. If the user asks a question, answer based on what you know. If they want to change something, explain that the current stage needs to finish first.`,
  };

  return `You are the AI orchestrator for Agent Workforce — a platform that creates AI agent swarms. You guide users through the entire process of designing, building, and deploying agent swarms on Orq.ai.

You are the user's single point of contact. You speak their language (auto-detect: Dutch, English, or whatever they use). You are friendly, concise, and encouraging. Non-technical users should feel comfortable.

${phaseInstructions[context.phase] ?? phaseInstructions["running"]}

CRITICAL: At the end of EVERY response, include exactly ONE action tag on its own line:
- <pipeline_action>wait</pipeline_action> — you asked a question during DISCUSSION and need the user's answer
- <pipeline_action>discussion_complete</pipeline_action> — discussion is done, start building
- <pipeline_action>continue</pipeline_action> — informing user about progress, pipeline continues

For architect-review and spec-review phases: ALWAYS use <pipeline_action>continue</pipeline_action> — these are informational, the pipeline doesn't wait.

The action tag MUST be the last line. Never include more than one.`;
}

function parseAction(text: string): PipelineAction {
  const match = text.match(/<pipeline_action>([\s\S]*?)<\/pipeline_action>/);
  if (!match) return { type: "wait" }; // Default to wait if no tag found

  const raw = match[1].trim();
  if (raw === "continue") return { type: "continue" };
  if (raw === "discussion_complete") return { type: "discussion_complete" };
  if (raw === "wait") return { type: "wait" };
  if (raw.startsWith("feedback:")) {
    return { type: "feedback", summary: raw.slice("feedback:".length).trim() };
  }
  return { type: "wait" };
}

function stripActionTag(text: string): string {
  return text.replace(/<pipeline_action>[\s\S]*?<\/pipeline_action>/, "").trim();
}

/**
 * Run a conversation turn: stream the agent's response and return the action.
 *
 * Called OUTSIDE step.run() since streaming is incompatible with Inngest memoization.
 */
export async function runConversationTurn(
  runId: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  context: ConversationContext,
  messageId: string,
): Promise<{ response: string; action: PipelineAction }> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  const systemPrompt = buildSystemPrompt(context);

  const response = await fetch(ORQ_ROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 4096,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
      ],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Orq.ai conversation error: ${response.status}`);
  }

  const broadcaster = createChatBroadcaster(runId);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";
  const stageName = context.phase === "discussion" ? "discussion"
    : context.phase === "architect-review" ? "architect-summary"
    : context.phase === "spec-review" ? "spec-summary"
    : "assistant";

  try {
    // Signal stream start
    await broadcaster.send({ messageId, role: "assistant", token: "", isStart: true, stageName });

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") break;
        try {
          const chunk = JSON.parse(payload);
          const token = chunk.choices?.[0]?.delta?.content ?? "";
          if (token) {
            fullText += token;
            // Stream all tokens to the user — action tag is stripped from DB save
            await broadcaster.send({ messageId, role: "assistant", token, stageName });
          }
        } catch {
          // skip malformed chunk
        }
      }
    }

    // Signal stream end
    await broadcaster.send({ messageId, role: "assistant", token: "", isDone: true, stageName });
  } finally {
    broadcaster.close();
  }

  // Parse action from full response
  const action = parseAction(fullText);
  const cleanResponse = stripActionTag(fullText);

  // Persist clean message (no action tag) to DB
  await saveChatMessage(runId, "assistant", cleanResponse, stageName);

  return { response: cleanResponse, action };
}
