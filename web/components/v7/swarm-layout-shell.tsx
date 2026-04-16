"use client";

/**
 * V7 layout shell for the `/swarm/[swarmId]` route. Renders the swarm
 * header and glass placeholder regions where Phase 51/52/53 components
 * will dock. Reads the Realtime channel status via `useRealtimeTable` so
 * the connection indicator surfaces whenever the provider reports an
 * error state.
 */

import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { RealtimeStatusIndicator } from "@/components/v7/realtime-status-indicator";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import { cn } from "@/lib/utils";

interface SwarmLayoutShellProps {
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

export function SwarmLayoutShell({
  swarmName,
  swarmDescription,
}: SwarmLayoutShellProps) {
  // Read channel status. Any table works -- status is shared across the bundle.
  const { status } = useRealtimeTable("jobs");

  return (
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
        <PlaceholderRegion
          heading="Briefing"
          caption="AI narrative \u2014 Phase 51"
          className="min-h-[200px]"
        />
        <PlaceholderRegion
          heading="KPIs"
          caption="Snapshot grid \u2014 Phase 51"
          className="min-h-[200px]"
        />
      </section>

      <section>
        <PlaceholderRegion
          heading="Subagent fleet"
          caption="Agent cards \u2014 Phase 51"
          className="min-h-[220px] items-stretch"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 w-full mt-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="min-h-[120px] rounded-[var(--v7-radius-card)] border border-dashed border-[var(--v7-line)]"
                aria-hidden
              />
            ))}
          </div>
        </PlaceholderRegion>
      </section>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <PlaceholderRegion
          heading="Kanban"
          caption="Job board \u2014 Phase 52"
          className="min-h-[280px]"
        />
        <PlaceholderRegion
          heading="Terminal"
          caption="Event stream \u2014 Phase 52"
          className="min-h-[280px]"
        />
      </section>
    </div>
  );
}
