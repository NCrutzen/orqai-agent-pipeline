/**
 * Supabase Broadcast helpers for real-time pipeline updates (server-side).
 *
 * Server-side: broadcastStepUpdate / broadcastRunUpdate emit events via admin client.
 * Client-side: useBroadcast hook is in broadcast-client.ts (separate "use client" file).
 *
 * Channel structure:
 * - `run:{runId}` -- per-run channel for step-level updates
 * - `runs:live`   -- global channel for run-level updates (run list page)
 *
 * Phase 59 D-03: step-update and run-update broadcasts route through an
 * in-module 500ms debounce keyed by (channel, event-key). Rapid status flips
 * (waiting → running → complete within 100ms) emit ONE broadcast (latest payload
 * wins) instead of three. Chat events and health updates bypass the debounce —
 * each is a distinct semantic event.
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
// Internal debounce (Phase 59 D-03)
// ---------------------------------------------------------------------------
// 500ms emit-the-latest coalescing for high-frequency status broadcasts.
// Chat events bypass — each token / message is a distinct semantic event.
//
// Storage is module-local (per-Vercel-function-instance). Two pipeline runs on
// different instances emitting for the same key duplicate rather than coalesce
// — accepted in CONTEXT.md (each run is single-threaded so this is rare).

const DEBOUNCE_MS = 500;

interface DebounceEntry {
  timer: ReturnType<typeof setTimeout>;
  channelName: string;
  event: string;
  payload: unknown;
}

const debounceMap = new Map<string, DebounceEntry>();

function debouncedSend(
  key: string,
  channelName: string,
  event: string,
  payload: unknown
): void {
  const existing = debounceMap.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.payload = payload;
    existing.channelName = channelName;
    existing.event = event;
    existing.timer = setTimeout(() => flushDebounced(key), DEBOUNCE_MS);
    return;
  }
  const timer = setTimeout(() => flushDebounced(key), DEBOUNCE_MS);
  debounceMap.set(key, { timer, channelName, event, payload });
}

function flushDebounced(key: string): void {
  const entry = debounceMap.get(key);
  if (!entry) return;
  debounceMap.delete(key);
  const admin = createAdminClient();
  const channel = admin.channel(entry.channelName);
  Promise.resolve(
    channel.send({ type: "broadcast", event: entry.event, payload: entry.payload })
  )
    .catch((err) =>
      console.warn("[broadcast.debounce] send failed", { key, err })
    )
    .finally(() => {
      admin.removeChannel(channel);
    });
}

// ---------------------------------------------------------------------------
// Server-side emission helpers
// ---------------------------------------------------------------------------

/**
 * Broadcast a step status update to the per-run channel.
 * Called from Inngest pipeline function after each step transition.
 *
 * Routes through the 500ms debounce keyed by (runId, stepName) so rapid flips
 * (waiting → running → complete within ~100ms) coalesce to one broadcast.
 * Returns once the call has been registered (timer scheduled), not when the
 * broadcast has been emitted — the existing 22 callers do not depend on
 * delivery confirmation.
 */
export async function broadcastStepUpdate(
  runId: string,
  payload: StepUpdatePayload
): Promise<void> {
  const key = `run:${runId}:step-update:${payload.stepName}`;
  debouncedSend(key, `run:${runId}`, "step-update", payload);
}

/**
 * Broadcast a run-level update to the global runs channel.
 * Called from Inngest pipeline function on run status transitions.
 *
 * Routes through the 500ms debounce keyed by runId — only the latest run-level
 * status survives the window.
 */
export async function broadcastRunUpdate(
  runId: string,
  payload: RunUpdatePayload
): Promise<void> {
  const key = `runs:live:run-update:${runId}`;
  debouncedSend(key, "runs:live", "run-update", payload);
}

/**
 * Broadcast health check results to the health dashboard.
 * Channel: health:status, Event: health-update
 *
 * NOT debounced (per Phase 59 D-03): health updates are low-frequency and each
 * is a distinct snapshot.
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
 *
 * NOT debounced (per Phase 59 D-03): each chat token is a distinct semantic
 * event — collapsing tokens would lose data.
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
 *
 * NOT debounced (per Phase 59 D-03): each chat message is a distinct
 * user/assistant turn — collapsing would lose data.
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
