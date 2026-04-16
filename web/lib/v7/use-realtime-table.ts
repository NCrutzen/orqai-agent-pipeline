"use client";

/**
 * Public hook for reading live rows from the single `SwarmRealtimeProvider`
 * channel. All V7 swarm-view components should use this hook rather than
 * opening their own Supabase channels (RT-01).
 */

import { useContext } from "react";
import { SwarmRealtimeContext } from "@/components/v7/swarm-realtime-provider";
import type {
  AgentEvent,
  ChannelStatus,
  SwarmAgent,
  SwarmBriefing,
  SwarmJob,
} from "@/lib/v7/types";

type TableMap = {
  events: AgentEvent;
  jobs: SwarmJob;
  agents: SwarmAgent;
  briefings: SwarmBriefing;
};

export function useRealtimeTable<K extends keyof TableMap>(
  table: K,
): { rows: TableMap[K][]; status: ChannelStatus } {
  const ctx = useContext(SwarmRealtimeContext);
  if (!ctx) {
    throw new Error(
      "useRealtimeTable must be used inside SwarmRealtimeProvider",
    );
  }
  return {
    rows: ctx[table] as TableMap[K][],
    status: ctx.status,
  };
}
