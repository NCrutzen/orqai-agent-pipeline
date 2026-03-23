/**
 * Supabase Broadcast helpers for real-time pipeline updates.
 *
 * Server-side: broadcastStepUpdate / broadcastRunUpdate emit events via admin client.
 * Client-side: useBroadcast hook subscribes to channels via browser client.
 *
 * Channel structure:
 * - `run:{runId}` -- per-run channel for step-level updates
 * - `runs:live`   -- global channel for run-level updates (run list page)
 */

import { useEffect, useRef } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/client";

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

// ---------------------------------------------------------------------------
// Client-side subscription hook
// ---------------------------------------------------------------------------

/**
 * Subscribe to a Supabase Broadcast channel and receive typed payloads.
 *
 * Uses useRef for the callback to avoid re-subscribing when the callback
 * reference changes (common with inline arrow functions).
 *
 * Cleans up channel subscription on unmount.
 */
export function useBroadcast<T>(
  channelName: string,
  eventName: string,
  onMessage: (payload: T) => void
): void {
  const callbackRef = useRef(onMessage);

  // Keep ref in sync with latest callback without triggering re-subscribe
  useEffect(() => {
    callbackRef.current = onMessage;
  });

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on("broadcast", { event: eventName }, (message) => {
        callbackRef.current(message.payload as T);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, eventName]);
}
