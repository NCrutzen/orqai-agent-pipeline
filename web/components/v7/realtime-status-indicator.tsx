"use client";

/**
 * Inline status dot + copy rendered in the swarm view header whenever the
 * Realtime channel is not `SUBSCRIBED`. Stays out of the way at first paint
 * (CONNECTING is treated as no-op) and surfaces only real issues.
 */

import type { ChannelStatus } from "@/lib/v7/types";

interface RealtimeStatusIndicatorProps {
  status: ChannelStatus;
}

export function RealtimeStatusIndicator({
  status,
}: RealtimeStatusIndicatorProps) {
  if (status === "SUBSCRIBED" || status === "CONNECTING") {
    return null;
  }

  const isClosed = status === "CLOSED";
  const dotClass = isClosed
    ? "bg-[var(--v7-red)]"
    : "bg-[var(--v7-amber)]";
  const copy = isClosed
    ? "Disconnected. Refresh to retry."
    : "Reconnecting\u2026";

  return (
    <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] text-[var(--v7-muted)]">
      <span
        aria-hidden
        className={`inline-block w-2 h-2 rounded-full ${dotClass}`}
      />
      {copy}
    </span>
  );
}
