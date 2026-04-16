"use client";

/**
 * Single swarm row in the V7 sidebar. URL-driven active state (no
 * localStorage): the parent passes `isActive` derived from `usePathname`.
 */

import Link from "next/link";
import { SidebarMiniStat } from "@/components/v7/sidebar-mini-stat";
import type { SwarmWithCounts } from "@/lib/v7/swarm-data";

interface SwarmListItemProps {
  swarm: SwarmWithCounts;
  activeJobs: number;
  agentCount: number;
  isActive: boolean;
}

export function SwarmListItem({
  swarm,
  activeJobs,
  agentCount,
  isActive,
}: SwarmListItemProps) {
  const baseClass =
    "flex flex-col gap-1 rounded-[var(--v7-radius-inner)] transition-all duration-[180ms] ease-out no-underline";
  const stateClass = isActive
    ? "bg-[var(--v7-teal-soft)] border-l-[3px] border-[var(--v7-teal)] pl-[9px] pr-3 py-3"
    : "bg-transparent hover:bg-[rgba(255,255,255,0.04)] hover:translate-x-0.5 px-3 py-3";

  return (
    <Link
      href={`/swarm/${swarm.id}`}
      className={`${baseClass} ${stateClass}`}
      aria-current={isActive ? "page" : undefined}
    >
      <span className="text-[16px] leading-[1.3] text-[var(--v7-text)] truncate">
        {swarm.name}
      </span>
      <span className="flex gap-2">
        <SidebarMiniStat count={activeJobs} label="active" tone="blue" />
        <SidebarMiniStat count={agentCount} label="agents" tone="teal" />
      </span>
    </Link>
  );
}
