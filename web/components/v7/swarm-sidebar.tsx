"use client";

/**
 * V7 swarm sidebar. Renders the brand block, dynamic swarm list, and
 * live mini-stat pills. Owns a single dashboard-wide Realtime channel
 * (`dashboard:swarms`) that watches `swarm_jobs` and `swarm_agents`
 * globally so the mini-stats stay live across all swarm rows.
 *
 * This dashboard-level channel is distinct from the per-swarm-view
 * channel owned by `SwarmRealtimeProvider`. RT-01 constrains the
 * swarm-view count; sidebar chrome is layout-level.
 */

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SwarmListItem } from "@/components/v7/swarm-list-item";
import {
  ACTIVE_JOB_STAGES,
  type SwarmAgentRow,
  type SwarmJobRow,
  type SwarmWithCounts,
} from "@/lib/v7/swarm-data";

interface SwarmSidebarProps {
  swarms: SwarmWithCounts[];
  initialJobs: SwarmJobRow[];
  initialAgents: SwarmAgentRow[];
}

function applyRowMutation<T extends { id: string }>(
  current: T[],
  payload: RealtimePostgresChangesPayload<T>,
): T[] {
  switch (payload.eventType) {
    case "INSERT": {
      const next = payload.new as T;
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

const ACTIVE_STAGE_SET = new Set<string>(ACTIVE_JOB_STAGES);

export function SwarmSidebar({
  swarms,
  initialJobs,
  initialAgents,
}: SwarmSidebarProps) {
  const [jobs, setJobs] = useState<SwarmJobRow[]>(initialJobs);
  const [agents, setAgents] = useState<SwarmAgentRow[]>(initialAgents);

  const pathname = usePathname();
  const activeId = useMemo(() => {
    if (!pathname || !pathname.startsWith("/swarm/")) return null;
    return pathname.split("/")[2] ?? null;
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel("dashboard:swarms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_jobs" },
        (payload) =>
          setJobs((prev) =>
            applyRowMutation(
              prev,
              payload as RealtimePostgresChangesPayload<SwarmJobRow>,
            ),
          ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_agents" },
        (payload) =>
          setAgents((prev) =>
            applyRowMutation(
              prev,
              payload as RealtimePostgresChangesPayload<SwarmAgentRow>,
            ),
          ),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const statsBySwarm = useMemo(() => {
    const map = new Map<
      string,
      { active: number; agents: number }
    >();
    for (const swarm of swarms) {
      map.set(swarm.id, {
        active: jobs.filter(
          (j) => j.swarm_id === swarm.id && ACTIVE_STAGE_SET.has(j.stage),
        ).length,
        agents: agents.filter((a) => a.swarm_id === swarm.id).length,
      });
    }
    return map;
  }, [swarms, jobs, agents]);

  const jobsToday = jobs.length;
  const activeSwarmCount = Array.from(statsBySwarm.values()).filter(
    (s) => s.active > 0,
  ).length;

  return (
    <aside
      className="w-[286px] h-screen overflow-hidden flex flex-col gap-5 p-6 border-r border-[var(--v7-line)] bg-[var(--v7-bg)] [backdrop-filter:blur(var(--v7-glass-blur))]"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-[var(--v7-radius-inner)] text-white"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--v7-teal), var(--v7-blue))",
          }}
          aria-hidden
        >
          <Sparkles size={24} />
        </div>
        <div className="flex flex-col gap-1 leading-none">
          <span className="font-[var(--font-cabinet)] text-[20px] font-bold tracking-[-0.02em] text-[var(--v7-text)]">
            Agent OS
          </span>
          <span className="text-[12px] leading-[1.3] text-[var(--v7-faint)]">
            Control room for swarms
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 min-h-0 flex-1">
        <span className="text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
          Swarms
        </span>

        {swarms.length === 0 ? (
          <div className="flex flex-col gap-1 px-1">
            <span className="text-[16px] leading-[1.3] text-[var(--v7-text)]">
              No swarms configured
            </span>
            <span className="text-[12px] leading-[1.3] text-[var(--v7-muted)]">
              Create your first agent swarm in the projects page to see it
              appear here.
            </span>
          </div>
        ) : (
          <nav className="flex flex-col gap-2 overflow-y-auto pr-1">
            {swarms.map((swarm) => {
              const stats = statsBySwarm.get(swarm.id) ?? {
                active: 0,
                agents: 0,
              };
              return (
                <SwarmListItem
                  key={swarm.id}
                  swarm={swarm}
                  activeJobs={stats.active}
                  agentCount={stats.agents}
                  isActive={swarm.id === activeId}
                />
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex flex-col gap-1 text-[12px] leading-[1.3] text-[var(--v7-faint)]">
        <span>{activeSwarmCount} active swarms</span>
        <span>{jobsToday} jobs today</span>
      </div>
    </aside>
  );
}
