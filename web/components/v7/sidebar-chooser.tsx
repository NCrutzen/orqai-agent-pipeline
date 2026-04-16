"use client";

/**
 * Client-side wrapper that picks between the V7 swarm sidebar (on
 * `/swarm/*` routes) and the legacy shadcn app-sidebar (everywhere else).
 * Kept client-side because `usePathname` only works in client components;
 * the Server Component (dashboard) layout passes all data through.
 */

import { usePathname } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { SwarmSidebar } from "@/components/v7/swarm-sidebar";
import type {
  SwarmAgentRow,
  SwarmJobRow,
  SwarmWithCounts,
} from "@/lib/v7/swarm-types";

interface SidebarChooserProps {
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      name?: string;
    };
  };
  swarms: SwarmWithCounts[];
  initialJobs: SwarmJobRow[];
  initialAgents: SwarmAgentRow[];
}

export function SidebarChooser({
  user,
  swarms,
  initialJobs,
  initialAgents,
}: SidebarChooserProps) {
  const pathname = usePathname();
  const isSwarmRoute = pathname?.startsWith("/swarm") ?? false;

  if (isSwarmRoute) {
    return (
      <SwarmSidebar
        swarms={swarms}
        initialJobs={initialJobs}
        initialAgents={initialAgents}
      />
    );
  }

  return <AppSidebar user={user} />;
}
