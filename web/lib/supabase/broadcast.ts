/**
 * Supabase Broadcast helpers for real-time pipeline updates (server-side).
 *
 * Server-side: broadcastStepUpdate / broadcastRunUpdate emit events via admin client.
 * Client-side: useBroadcast hook is in broadcast-client.ts (separate "use client" file).
 *
 * Channel structure:
 * - `run:{runId}` -- per-run channel for step-level updates
 * - `runs:live`   -- global channel for run-level updates (run list page)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { HealthUpdatePayload } from "@/lib/credentials/types";
import type { ChatTokenPayload } from "@/lib/pipeline/chat-types";

// Re-export so consumers can import from broadcast.ts
export type { ChatTokenPayload };

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface StepUpdatePayload {
  stepName: string;
  status: "pending" | "running" | "complete" | "failed" | "skipped" | "waiting";
  displayName: string;
  durationMs?: number;
  stepsCompleted?: number;
  runStatus?: string;
  log?: string;
  approvalId?: string;
  /** Included only for the architect step so the graph can populate in real-time */
  result?: { output: string };
  /** Review content for interactive review entries (agent summaries, etc.) */
  reviewData?: {
    agents: Array<{ name: string; role: string; tools: string[] }>;
  };
}

export interface RunUpdatePayload {
  runId: string;
  status: string;
  stepsCompleted: number;
  agentCount?: number;
}

// ---------------------------------------------------------------------------
// Server-side emission helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast a step status update to the per-run channel.
 * Called from Inngest pipeline function after each step transition.
 */
export async function broadcastStepUpdate(
  runId: string,
  payload: StepUpdatePayload
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(`run:${runId}`);
  await channel.send({
    type: "broadcast",
    event: "step-update",
    payload,
  });
  admin.removeChannel(channel);
}

/**
 * Broadcast a run-level update to the global runs channel.
 * Called from Inngest pipeline function on run status transitions.
 */
export async function broadcastRunUpdate(
  runId: string,
  payload: RunUpdatePayload
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel("runs:live");
  await channel.send({
    type: "broadcast",
    event: "run-update",
    payload,
  });
  admin.removeChannel(channel);
}

/**
 * Broadcast health check results to the health dashboard.
 * Channel: health:status, Event: health-update
 */
export async function broadcastHealthUpdate(
  payload: HealthUpdatePayload
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel("health:status");
  await channel.send({
    type: "broadcast",
    event: "health-update",
    payload,
  });
  admin.removeChannel(channel);
}

// ---------------------------------------------------------------------------
// Chat token broadcasting (persistent channel pattern)
// ---------------------------------------------------------------------------

/**
 * Create a chat token broadcaster that keeps the channel open for the
 * duration of a streaming session. Call send() for each token, then close()
 * when done. This avoids the per-token channel open/close anti-pattern.
 */
export function createChatBroadcaster(runId: string) {
  const admin = createAdminClient();
  const channel = admin.channel(`run:${runId}`);

  return {
    async send(payload: ChatTokenPayload): Promise<void> {
      await channel.send({
        type: "broadcast",
        event: "chat-token",
        payload,
      });
    },
    close(): void {
      admin.removeChannel(channel);
    },
  };
}

/**
 * Broadcast a complete chat message (non-streaming: user messages, template status messages).
 * Uses the open-send-close pattern since it's a single event.
 */
export async function broadcastChatMessage(
  runId: string,
  payload: { id: string; role: "assistant" | "user"; content: string; stageName?: string }
): Promise<void> {
  const admin = createAdminClient();
  const channel = admin.channel(`run:${runId}`);
  await channel.send({
    type: "broadcast",
    event: "chat-message",
    payload,
  });
  admin.removeChannel(channel);
}

