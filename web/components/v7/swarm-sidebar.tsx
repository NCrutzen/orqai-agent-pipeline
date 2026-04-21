"use client";

/**
 * V7 swarm sidebar. Renders the brand block, dynamic swarm list, and
 * live mini-stat pills. Owns a single dashboard-wide Realtime channel
 * (`dashboard:swarms`) that watches `swarm_jobs` and `swarm_agents`
 * globally so the mini-stats stay live across all swarm rows.
 *
 * This dashboard-level channel is distinct from the per-swarm-view
 * channel owned by `SwarmRealtimeProvider`. RT-01 constrains the
 * swarm-view count; sidebar chrome is layout-level.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Sparkles,
  Home,
  BarChart3,
  Play,
  Clock,
  Settings,
  LogOut,
  Mail,
  Timer,
  Tag,
  Wrench,
  ChevronDown,
  Search,
} from "lucide-react";
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { SwarmListItem } from "@/components/v7/swarm-list-item";
import {
  ACTIVE_JOB_STAGES,
  type SwarmAgentRow,
  type SwarmJobRow,
  type SwarmWithCounts,
} from "@/lib/v7/swarm-types";

interface SwarmSidebarProps {
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

const WORKSPACE_ITEMS = [
  { title: "Dashboard", href: "/", icon: Home, match: (p: string) => p === "/" || p.startsWith("/projects") },
  { title: "Executive", href: "/executive", icon: BarChart3, match: (p: string) => p.startsWith("/executive") },
  { title: "Creations", href: "/runs", icon: Play, match: (p: string) => p.startsWith("/runs") },
  { title: "Settings", href: "/settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

const AUTOMATIONS_ITEMS = [
  { title: "Debtor Review", href: "/automations/debtor-email-review", icon: Mail, match: (p: string) => p.startsWith("/automations/debtor-email-review") },
  { title: "Uren Controle", href: "/automations/uren-controle", icon: Timer, match: (p: string) => p.startsWith("/automations/uren-controle") },
  { title: "Agent Namer", href: "/automations/agent-namer", icon: Tag, match: (p: string) => p.startsWith("/automations/agent-namer") },
  { title: "Rijtijden", href: "/rijtijden", icon: Clock, match: (p: string) => p.startsWith("/rijtijden") },
];

function applyRowMutation<T extends { id: string }>(
  current: T[],
  payload: RealtimePostgresChangesPayload<T>,
): T[] {
  switch (payload.eventType) {
    case "INSERT": {
      const next = payload.new as T;
      if (current.some((r) => r.id === next.id)) return current;
      return [...current, next];
    }
    case "UPDATE": {
      const next = payload.new as T;
      return current.map((r) => (r.id === next.id ? next : r));
    }
    case "DELETE": {
      const prev = payload.old as Partial<T>;
      if (!prev.id) return current;
      return current.filter((r) => r.id !== prev.id);
    }
    default:
      return current;
  }
}

const ACTIVE_STAGE_SET = new Set<string>(ACTIVE_JOB_STAGES);

type NavItem = {
  title: string;
  href: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
};

function NavGroup({
  label,
  items,
  pathname,
  icon: LabelIcon,
}: {
  label: string;
  items: NavItem[];
  pathname: string | null;
  icon?: typeof Home;
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label={label}>
      <span className="mb-1 flex items-center gap-1.5 text-[11px] leading-[1.3] tracking-[0.12em] uppercase text-[var(--v7-faint)]">
        {LabelIcon && <LabelIcon size={12} />}
        {label}
      </span>
      {items.map((item) => {
        const isActive = pathname ? item.match(pathname) : false;
        const Icon = item.icon;
        return (
          <Link
            key={item.title}
            href={item.href}
            className={`flex items-center gap-3 rounded-[var(--v7-radius-sm)] px-3 py-2 text-[14px] transition-colors ${
              isActive
                ? "bg-[var(--v7-brand-primary-soft)] text-[var(--v7-text)]"
                : "text-[var(--v7-muted)] hover:bg-[var(--v7-panel-2)] hover:text-[var(--v7-text)]"
            }`}
          >
            <Icon
              size={16}
              className={isActive ? "text-[var(--v7-brand-primary)]" : ""}
            />
            <span>{item.title}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SwarmSidebar({
  user,
  swarms,
  initialJobs,
  initialAgents,
}: SwarmSidebarProps) {
  const [jobs, setJobs] = useState<SwarmJobRow[]>(initialJobs);
  const [agents, setAgents] = useState<SwarmAgentRow[]>(initialAgents);
  const router = useRouter();

  const pathname = usePathname();
  const activeId = useMemo(() => {
    if (!pathname || !pathname.startsWith("/swarm/")) return null;
    return pathname.split("/")[2] ?? null;
  }, [pathname]);

  // Collapse swarms by default when list is long; keep open if user is on a swarm route.
  const [swarmsOpen, setSwarmsOpen] = useState(() => swarms.length <= 10 || !!activeId);
  const [swarmFilter, setSwarmFilter] = useState("");

  const filteredSwarms = useMemo(() => {
    const q = swarmFilter.trim().toLowerCase();
    if (!q) return swarms;
    return swarms.filter((s) => s.name.toLowerCase().includes(q));
  }, [swarms, swarmFilter]);

  const displayName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email ||
    "User";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  useEffect(() => {
    const supabase = createClient();
    const channel: RealtimeChannel = supabase
      .channel("dashboard:swarms")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_jobs" },
        (payload) =>
          setJobs((prev) =>
            applyRowMutation(
              prev,
              payload as RealtimePostgresChangesPayload<SwarmJobRow>,
            ),
          ),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "swarm_agents" },
        (payload) =>
          setAgents((prev) =>
            applyRowMutation(
              prev,
              payload as RealtimePostgresChangesPayload<SwarmAgentRow>,
            ),
          ),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const statsBySwarm = useMemo(() => {
    const map = new Map<
      string,
      { active: number; agents: number }
    >();
    for (const swarm of swarms) {
      map.set(swarm.id, {
        active: jobs.filter(
          (j) => j.swarm_id === swarm.id && ACTIVE_STAGE_SET.has(j.stage),
        ).length,
        agents: agents.filter((a) => a.swarm_id === swarm.id).length,
      });
    }
    return map;
  }, [swarms, jobs, agents]);

  const jobsToday = jobs.length;
  const activeSwarmCount = Array.from(statsBySwarm.values()).filter(
    (s) => s.active > 0,
  ).length;

  return (
    <aside
      className="w-[286px] h-screen overflow-hidden flex flex-col gap-5 p-6 border-r border-[var(--v7-line)] bg-[var(--v7-bg)] [backdrop-filter:blur(var(--v7-glass-blur))]"
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center w-12 h-12 rounded-[var(--v7-radius-inner)] text-white shadow-[0_8px_22px_rgba(220,76,25,0.35)]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, var(--v7-brand-primary), var(--v7-brand-secondary))",
          }}
          aria-hidden
        >
          <Sparkles size={24} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--v7-brand-primary)]">
            Moyne Roberts
          </span>
          <span className="mt-1 font-[var(--font-cabinet)] text-[20px] font-bold tracking-[-0.02em] text-[var(--v7-text)]">
            Agent Workforce
          </span>
        </div>
      </div>

      <NavGroup label="Workspace" items={WORKSPACE_ITEMS} pathname={pathname} />

      <NavGroup
        label="Automations"
        items={AUTOMATIONS_ITEMS}
        pathname={pathname}
        icon={Wrench}
      />

      <div className="flex flex-col gap-2 min-h-0 flex-1">
        <button
          type="button"
          onClick={() => setSwarmsOpen((v) => !v)}
          className="group flex items-center gap-2 text-left"
          aria-expanded={swarmsOpen}
        >
          <ChevronDown
            size={14}
            className={`text-[var(--v7-faint)] transition-transform ${swarmsOpen ? "" : "-rotate-90"}`}
          />
          <span className="text-[11px] leading-[1.3] tracking-[0.12em] uppercase text-[var(--v7-faint)] group-hover:text-[var(--v7-text)]">
            Swarms
          </span>
          <span className="ml-auto rounded-full bg-[var(--v7-panel-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--v7-muted)]">
            {swarms.length}
          </span>
        </button>

        {swarmsOpen && (
          <>
            {swarms.length === 0 ? (
              <div className="flex flex-col gap-1 px-1">
                <span className="text-[14px] leading-[1.3] text-[var(--v7-text)]">
                  No swarms configured
                </span>
                <span className="text-[12px] leading-[1.3] text-[var(--v7-muted)]">
                  Create your first agent swarm to see it appear here.
                </span>
              </div>
            ) : (
              <>
                {swarms.length > 6 && (
                  <div className="relative">
                    <Search
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--v7-faint)]"
                    />
                    <input
                      type="text"
                      value={swarmFilter}
                      onChange={(e) => setSwarmFilter(e.target.value)}
                      placeholder="Filter swarms"
                      className="w-full rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)]/60 py-1.5 pl-7 pr-2 text-[12px] text-[var(--v7-text)] placeholder:text-[var(--v7-faint)] focus:border-[var(--v7-brand-primary)] focus:outline-none"
                    />
                  </div>
                )}
                <nav className="flex flex-col gap-2 overflow-y-auto pr-1">
                  {filteredSwarms.length === 0 ? (
                    <span className="px-1 text-[12px] text-[var(--v7-faint)]">
                      No matches
                    </span>
                  ) : (
                    filteredSwarms.map((swarm) => {
                      const stats = statsBySwarm.get(swarm.id) ?? {
                        active: 0,
                        agents: 0,
                      };
                      return (
                        <SwarmListItem
                          key={swarm.id}
                          swarm={swarm}
                          activeJobs={stats.active}
                          agentCount={stats.agents}
                          isActive={swarm.id === activeId}
                        />
                      );
                    })
                  )}
                </nav>
              </>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-3 border-t border-[var(--v7-line)]">
        <div className="flex flex-col gap-0.5 text-[11px] leading-[1.3] text-[var(--v7-faint)]">
          <span>{activeSwarmCount} active swarms</span>
          <span>{jobsToday} jobs today</span>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{
              backgroundImage:
                "linear-gradient(135deg, var(--v7-brand-primary), var(--v7-brand-secondary))",
            }}
            aria-hidden
          >
            {initials}
          </div>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] text-[var(--v7-text)]">
              {displayName}
            </span>
            <span className="truncate text-[11px] text-[var(--v7-faint)]">
              {user.email}
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            className="rounded-[var(--v7-radius-sm)] p-1.5 text-[var(--v7-muted)] transition-colors hover:bg-[var(--v7-panel-2)] hover:text-[var(--v7-text)]"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
