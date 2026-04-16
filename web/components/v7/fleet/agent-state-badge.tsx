"use client";

/**
 * Status pill for a subagent fleet card. 8px dot + short copy, styled per the
 * Phase 51 UI-SPEC color map.
 */

import type { SwarmAgentStatus } from "@/lib/v7/types";

interface StateStyle {
  dot: string; // CSS color / token reference
  copy: string;
  pulse: boolean;
}

const STATE_MAP: Record<SwarmAgentStatus, StateStyle> = {
  active: { dot: "var(--v7-teal)", copy: "Running", pulse: true },
  idle: { dot: "var(--v7-muted)", copy: "Idle", pulse: false },
  waiting: { dot: "var(--v7-amber)", copy: "Waiting", pulse: false },
  error: { dot: "var(--v7-red)", copy: "Error", pulse: false },
  offline: { dot: "var(--v7-faint)", copy: "Offline", pulse: false },
};

interface AgentStateBadgeProps {
  status: SwarmAgentStatus;
}

export function AgentStateBadge({ status }: AgentStateBadgeProps) {
  const style = STATE_MAP[status];
  return (
    <span
      className="inline-flex items-center gap-2 px-[11px] py-[7px] rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] bg-[rgba(255,255,255,0.04)] text-[12px] leading-none text-[var(--v7-muted)]"
      aria-label={`Agent state: ${style.copy}`}
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: style.dot,
          animation: style.pulse
            ? "v7-pulse 1.8s ease-in-out infinite"
            : undefined,
        }}
      />
      <span>{style.copy}</span>
    </span>
  );
}
