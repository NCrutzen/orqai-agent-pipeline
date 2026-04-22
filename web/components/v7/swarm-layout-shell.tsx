"use client";

/**
 * V7 layout shell for the `/swarm/[swarmId]` route.
 *
 * Layout priorities (Apr 2026 iteration):
 *   1. Briefing compact + DelegationGraph (clickable nodes open drawer)
 *   2. KanbanBoard promoted to a full-width hero row — primary workload view
 *   3. Observability (SwimlaneTimeline + TerminalStream) moved to the bottom
 *
 * Subagent fleet is intentionally omitted: clicking a node in the delegation
 * graph already opens the same AgentDetailDrawer, so the fleet strip was
 * redundant and added noise.
 */

import { RealtimeStatusIndicator } from "@/components/v7/realtime-status-indicator";
import { BriefingPanel } from "@/components/v7/briefing/briefing-panel";
import { AgentDetailDrawer } from "@/components/v7/drawer/agent-detail-drawer";
import { TerminalStream } from "@/components/v7/terminal/terminal-stream";
import { KanbanBoard } from "@/components/v7/kanban/kanban-board";
import { DelegationGraph } from "@/components/v7/graph/delegation-graph";
import { SwimlaneTimeline } from "@/components/v7/swimlane/swimlane-timeline";
import { DrawerProvider } from "@/components/v7/drawer/drawer-context";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";

interface SwarmLayoutShellProps {
  swarmId: string;
  swarmName: string;
  swarmDescription: string | null;
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
              <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] max-w-3xl">
                {swarmDescription}
              </p>
            )}
            <div className="mt-2">
              <RealtimeStatusIndicator status={status} />
            </div>
          </div>
        </header>

        {/* Row 1: Briefing (compact narrative + KPIs) + Delegation graph (clickable) */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_0.9fr]">
          <BriefingPanel swarmId={swarmId} />
          <DelegationGraph swarmId={swarmId} />
        </section>

        {/* Row 2: Kanban — primary workload view, full width */}
        <section>
          <KanbanBoard swarmId={swarmId} />
        </section>

        {/* Row 3: Observability — Gantt timeline + event stream */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <SwimlaneTimeline swarmId={swarmId} />
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
