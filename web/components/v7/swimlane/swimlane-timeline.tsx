"use client";

/**
 * Gantt-style swimlane timeline for a single swarm view. One lane per agent
 * (capped at 8), bars colored by event_type (terminal types win), x-axis
 * = trailing 30-minute window. Reuses the SwarmRealtimeProvider channel via
 * `useRealtimeTable` — does NOT open a new Realtime subscription.
 *
 * Sliding-window strategy: 5-second tick (see 53-RESEARCH.md section 5).
 */

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { SwimlaneAxis } from "@/components/v7/swimlane/swimlane-axis";
import { SwimlaneBar } from "@/components/v7/swimlane/swimlane-bar";
import { SwimlaneLane } from "@/components/v7/swimlane/swimlane-lane";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import { deriveBars } from "@/lib/v7/swimlane/bars";

const WINDOW_MS = 30 * 60 * 1000;
const TICK_INTERVAL_MS = 5000;
const LANE_HEIGHT = 36;
const LANE_GUTTER_TOP = 14;
const LANE_GUTTER_BOTTOM = 14;

export function SwimlaneTimeline({ swarmId: _swarmId }: { swarmId: string }) {
  const { rows: events } = useRealtimeTable("events");
  const { rows: agents } = useRealtimeTable("agents");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  const nowBucket = Math.floor(now / TICK_INTERVAL_MS);

  const { bars, lanes } = useMemo(
    () => deriveBars(events, agents, now - WINDOW_MS, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nowBucket pins re-render frequency
    [events, agents, nowBucket],
  );

  const laneCount = Math.max(lanes.length, 1);
  const gridHeight = LANE_GUTTER_TOP + laneCount * LANE_HEIGHT + LANE_GUTTER_BOTTOM;

  return (
    <GlassCard className="p-[18px] flex flex-col gap-[14px]">
      <header className="flex justify-between items-start gap-3">
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
            Observability
          </span>
          <span className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
            Gantt-style agent timeline
          </span>
        </div>
        <span className="px-3 py-1 rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] bg-[rgba(255,255,255,0.04)] text-[12px] leading-none text-[var(--v7-muted)] whitespace-nowrap">
          Past 30 minutes
        </span>
      </header>

      <SwimlaneAxis windowStart={now - WINDOW_MS} windowEnd={now} ticks={7} />

      <div
        className="v7-swimlane-grid"
        style={{ height: `${gridHeight}px` }}
        role="img"
        aria-label="Agent activity timeline, past 30 minutes"
      >
        {lanes.map((l, i) => (
          <SwimlaneLane
            key={l.agent}
            agent={l.agent}
            topPx={LANE_GUTTER_TOP + i * LANE_HEIGHT}
          />
        ))}
        {bars.map((bar) => (
          <SwimlaneBar key={bar.key} bar={bar} />
        ))}
        {bars.length === 0 && lanes.length > 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--v7-faint)] pointer-events-none">
            No agent activity in the last 30 minutes
          </div>
        )}
        {lanes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-[12px] text-[var(--v7-faint)] pointer-events-none">
            No agents registered
          </div>
        )}
      </div>
    </GlassCard>
  );
}
