"use client";

/**
 * Subagent fleet wrapper. Consumes `useRealtimeTable("agents")` and renders
 * the section header + grid of SubagentFleetCard components. Empty state
 * when no agents are registered.
 */

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { SubagentFleetCard } from "@/components/v7/fleet/subagent-fleet-card";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";

interface SubagentFleetProps {
  onAgentClick: (agentName: string) => void;
}

export function SubagentFleet({ onAgentClick }: SubagentFleetProps) {
  const { rows } = useRealtimeTable("agents");

  const sorted = useMemo(
    () => [...rows].sort((a, b) => a.agent_name.localeCompare(b.agent_name)),
    [rows]
  );

  if (sorted.length === 0) {
    return (
      <GlassCard className="p-5 flex flex-col items-center justify-center text-center gap-2 min-h-[220px]">
        <h2 className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
          No subagents registered
        </h2>
        <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] max-w-[48ch]">
          Deploy agents via Orq.ai to see them appear here.
        </p>
      </GlassCard>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <header className="flex justify-between items-end gap-3">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: "var(--v7-teal)",
                animation: "v7-pulse-eyebrow 1.8s ease-in-out infinite",
              }}
            />
            Subagent fleet
          </span>
          <span className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] text-[var(--v7-text)]">
            Each agent is clickable and opens a recursive detail view
          </span>
        </div>
        <span className="px-3 py-1 rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] bg-[rgba(255,255,255,0.04)] text-[12px] leading-none text-[var(--v7-muted)] whitespace-nowrap">
          {sorted.length} specialist{sorted.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-[14px]">
        {sorted.map((agent) => (
          <SubagentFleetCard
            key={agent.id}
            agent={agent}
            onClick={() => onAgentClick(agent.agent_name)}
          />
        ))}
      </div>
    </section>
  );
}
