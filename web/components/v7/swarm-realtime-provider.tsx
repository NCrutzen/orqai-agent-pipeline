"use client";

/**
 * Owns the single Supabase Realtime channel for a swarm view and
 * distributes rows to child components via React Context.
 *
 * Satisfies RT-01: one channel per swarm view. Teardown happens in the
 * useEffect cleanup, which runs when the route layout unmounts (i.e. when
 * the `[swarmId]` dynamic segment changes).
 */

import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  RealtimePostgresChangesPayload,
  RealtimeChannel,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import {
  EMPTY_BUNDLE,
  type AgentEvent,
  type ChannelStatus,
  type RealtimeBundle,
  type SwarmAgent,
  type SwarmBriefing,
  type SwarmJob,
} from "@/lib/v7/types";

export const SwarmRealtimeContext = createContext<RealtimeBundle | null>(null);

type TableKey = "events" | "jobs" | "agents" | "briefings";

type TableRow =
  | AgentEvent
  | SwarmJob
  | SwarmAgent
  | SwarmBriefing
  | { id: string };

function applyMutation<T extends { id: string }>(
  current: T[],
  payload: RealtimePostgresChangesPayload<T>,
): T[] {
  switch (payload.eventType) {
    case "INSERT": {
      const next = payload.new as T;
      // Avoid duplicates if the initial snapshot already contains this row.
      if (current.some((r) => r.id === next.id)) return current;
      return [...current, next];
    }
    case "UPDATE": {
      const next = payload.new as T;
      return current.map((r) => (r.id === next.id ? next : r));
    }
    case "DELETE": {
      const prev = payload.old as Partial<T>;
      if (!prev.id) return current;
      return current.filter((r) => r.id !== prev.id);
    }
    default:
      return current;
  }
}

interface SwarmRealtimeProviderProps {
  swarmId: string;
  children: ReactNode;
}

export function SwarmRealtimeProvider({
  swarmId,
  children,
}: SwarmRealtimeProviderProps) {
  const [bundle, setBundle] = useState<RealtimeBundle>(EMPTY_BUNDLE);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    // 1. Fetch initial snapshots for all 4 tables, filtered by swarm_id.
    (async () => {
      const [eventsRes, jobsRes, agentsRes, briefingsRes] = await Promise.all([
        supabase
          .from("agent_events")
          .select("*")
          .eq("swarm_id", swarmId)
          .order("created_at", { ascending: false }),
        supabase.from("swarm_jobs").select("*").eq("swarm_id", swarmId),
        supabase.from("swarm_agents").select("*").eq("swarm_id", swarmId),
        supabase
          .from("swarm_briefings")
          .select("*")
          .eq("swarm_id", swarmId)
          .order("generated_at", { ascending: false }),
      ]);

      if (cancelled) return;

      setBundle((prev) => ({
        ...prev,
        events: (eventsRes.data as AgentEvent[] | null) ?? [],
        jobs: (jobsRes.data as SwarmJob[] | null) ?? [],
        agents: (agentsRes.data as SwarmAgent[] | null) ?? [],
        briefings: (briefingsRes.data as SwarmBriefing[] | null) ?? [],
      }));
    })();

    // 2. Single channel carrying 4 postgres_changes subscriptions.
    const channel: RealtimeChannel = supabase
      .channel(`swarm:${swarmId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_events",
          filter: `swarm_id=eq.${swarmId}`,
        },
        (payload) =>
          setBundle((prev) => ({
            ...prev,
            events: applyMutation(
              prev.events,
              payload as RealtimePostgresChangesPayload<AgentEvent>,
            ),
          })),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swarm_jobs",
          filter: `swarm_id=eq.${swarmId}`,
        },
        (payload) =>
          setBundle((prev) => ({
            ...prev,
            jobs: applyMutation(
              prev.jobs,
              payload as RealtimePostgresChangesPayload<SwarmJob>,
            ),
          })),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swarm_agents",
          filter: `swarm_id=eq.${swarmId}`,
        },
        (payload) =>
          setBundle((prev) => ({
            ...prev,
            agents: applyMutation(
              prev.agents,
              payload as RealtimePostgresChangesPayload<SwarmAgent>,
            ),
          })),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "swarm_briefings",
          filter: `swarm_id=eq.${swarmId}`,
        },
        (payload) =>
          setBundle((prev) => ({
            ...prev,
            briefings: applyMutation(
              prev.briefings,
              payload as RealtimePostgresChangesPayload<SwarmBriefing>,
            ),
          })),
      )
      .subscribe((status) => {
        if (cancelled) return;
        setBundle((prev) => ({ ...prev, status: status as ChannelStatus }));
      });

    // 3. Teardown: runs on unmount or when swarmId changes.
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [swarmId]);

  const value = useMemo(() => bundle, [bundle]);

  return (
    <SwarmRealtimeContext.Provider value={value}>
      {children}
    </SwarmRealtimeContext.Provider>
  );
}

export type { TableKey, TableRow };
