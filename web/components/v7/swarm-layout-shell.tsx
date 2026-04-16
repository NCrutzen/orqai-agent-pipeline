"use client";

/**
 * V7 layout shell for the `/swarm/[swarmId]` route. Owns the DrawerProvider
 * boundary and wires the hero components (briefing panel, fleet cards,
 * agent detail drawer) into the V7 grid. Phase 52/53 components (Kanban,
 * terminal, delegation graph, swimlanes) still render as placeholders.
 */

import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { RealtimeStatusIndicator } from "@/components/v7/realtime-status-indicator";
import { BriefingPanel } from "@/components/v7/briefing/briefing-panel";
import { SubagentFleet } from "@/components/v7/fleet/subagent-fleet";
import { AgentDetailDrawer } from "@/components/v7/drawer/agent-detail-drawer";
import { TerminalStream } from "@/components/v7/terminal/terminal-stream";
import { KanbanBoard } from "@/components/v7/kanban/kanban-board";
import { DelegationGraph } from "@/components/v7/graph/delegation-graph";
import {
  DrawerProvider,
  useDrawer,
} from "@/components/v7/drawer/drawer-context";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import { cn } from "@/lib/utils";

interface SwarmLayoutShellProps {
  swarmId: string;
  swarmName: string;
  swarmDescription: string | null;
}

interface PlaceholderRegionProps {
  heading: string;
  caption: string;
  className?: string;
  children?: ReactNode;
}

function PlaceholderRegion({
  heading,
  caption,
  className,
  children,
}: PlaceholderRegionProps) {
  return (
    <GlassCard
      className={cn(
        "p-5 flex flex-col items-center justify-center gap-2 text-center",
        className,
      )}
    >
      <h2 className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
        {heading}
      </h2>
      <span className="text-[12px] leading-[1.3] text-[var(--v7-faint)]">
        {caption}
      </span>
      {children}
    </GlassCard>
  );
}

function FleetBound() {
  const { setOpenAgent } = useDrawer();
  return <SubagentFleet onAgentClick={setOpenAgent} />;
}

function ShellBody({
  swarmId,
  swarmName,
  swarmDescription,
}: SwarmLayoutShellProps) {
  const { status } = useRealtimeTable("jobs");

  return (
    <>
      <div className="flex flex-col gap-5 p-5 min-h-screen">
        <header className="flex justify-between items-start">
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="font-[var(--font-cabinet)] text-[32px] leading-[1.1] font-bold tracking-[-0.03em] text-[var(--v7-text)] truncate">
              {swarmName}
            </h1>
            {swarmDescription && (
              <p className="text-[16px] leading-[1.5] text-[var(--v7-muted)]">
                {swarmDescription}
              </p>
            )}
            <div className="mt-2">
              <RealtimeStatusIndicator status={status} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <BriefingPanel swarmId={swarmId} />
          <DelegationGraph swarmId={swarmId} />
        </section>

        <section>
          <FleetBound />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <KanbanBoard swarmId={swarmId} />
          <TerminalStream swarmId={swarmId} />
        </section>
      </div>

      <AgentDetailDrawer />
    </>
  );
}

export function SwarmLayoutShell({
  swarmId,
  swarmName,
  swarmDescription,
}: SwarmLayoutShellProps) {
  return (
    <DrawerProvider>
      <ShellBody
        swarmId={swarmId}
        swarmName={swarmName}
        swarmDescription={swarmDescription}
      />
    </DrawerProvider>
  );
}
