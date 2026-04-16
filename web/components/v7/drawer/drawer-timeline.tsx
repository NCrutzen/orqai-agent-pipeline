"use client";

/**
 * Drawer timeline -- renders the last 5 events for the open agent, grouped
 * by trace_id. Each event row is a colored dot + event description + tiny
 * timestamp. Color of the dot uses the agent's tone (status color).
 */

import { format } from "date-fns";
import { describeEvent, type TimelineGroup } from "@/lib/v7/drawer/timeline";

interface DrawerTimelineProps {
  groups: TimelineGroup[];
  dotColor: string; // CSS color / token reference
}

export function DrawerTimeline({ groups, dotColor }: DrawerTimelineProps) {
  if (groups.length === 0) {
    return (
      <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)]">
        No recent activity.
      </p>
    );
  }

  return (
    <div className="grid gap-[14px]">
      {groups.map((group) => (
        <div key={group.traceId} className="grid gap-2">
          <small className="text-[11px] leading-[1.3] text-[var(--v7-faint)] font-mono">
            trace {group.traceId === "unknown" ? "unknown" : group.traceId.slice(0, 8)}
          </small>
          <div className="grid gap-3">
            {group.events.map((event) => (
              <div
                key={event.id}
                className="grid grid-cols-[auto_1fr] gap-3 items-start"
              >
                <span
                  aria-hidden
                  className="inline-block w-3 h-3 rounded-full mt-[5px]"
                  style={{
                    background: dotColor,
                    boxShadow: `0 0 0 6px color-mix(in srgb, ${dotColor} 16%, transparent)`,
                  }}
                />
                <div className="min-w-0">
                  <p className="text-[14px] leading-[1.4] text-[var(--v7-muted)] break-words">
                    {describeEvent(event)}
                  </p>
                  <time className="text-[11px] leading-[1.3] text-[var(--v7-faint)] font-mono">
                    {format(new Date(event.created_at), "HH:mm:ss")}
                  </time>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
