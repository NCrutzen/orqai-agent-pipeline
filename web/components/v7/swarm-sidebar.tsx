"use client";

/**
 * V7 swarm sidebar. Renders the brand block, dynamic swarm list, and
 * mini-stat pills. Stats refresh via a 30s poll — NOT a Realtime
 * subscription. An earlier version subscribed to unfiltered
 * `postgres_changes` on swarm_jobs + swarm_agents from this layout-level
 * component; the bridge tick (every 2 min, business hours, Mon-Fri)
 * upserts hundreds of rows per tick and each row fanned out to every
 * open dashboard tab, blowing through the 5M Realtime cap. Polling
 * aggregates is sufficient for sidebar badges. See learning
 * d462b889-25a6-4790-84c7-b3ad437f7501.
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
  Boxes,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SwarmListItem } from "@/components/v7/swarm-list-item";
import {
  ACTIVE_JOB_STAGES,
  type SwarmAgentRow,
  type SwarmJobRow,
  type SwarmWithCounts,
} from "@/lib/v7/sidebar-types";

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
  { title: "Debtor Review", href: "/automations/debtor-email/review", icon: Mail, match: (p: string) => p.startsWith("/automations/debtor-email/review") || p.startsWith("/automations/debtor-email-review") },
  { title: "Uren Controle", href: "/automations/uren-controle", icon: Timer, match: (p: string) => p.startsWith("/automations/uren-controle") },
  { title: "Agent Namer", href: "/automations/agent-namer", icon: Tag, match: (p: string) => p.startsWith("/automations/agent-namer") },
  { title: "Rijtijden", href: "/rijtijden", icon: Clock, match: (p: string) => p.startsWith("/rijtijden") },
];

const ACTIVE_STAGE_SET = new Set<string>(ACTIVE_JOB_STAGES);
const SIDEBAR_POLL_INTERVAL_MS = 30_000;

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
  collapsible = false,
  defaultOpen = true,
}: {
  label: string;
  items: NavItem[];
  pathname: string | null;
  icon?: typeof Home;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const hasActiveChild = items.some((it) =>
    pathname ? it.match(pathname) : false,
  );
  const [open, setOpen] = useState(
    collapsible ? defaultOpen || hasActiveChild : true,
  );

  const header = (
    <span className="flex items-center gap-1.5 text-[11px] leading-[1.3] tracking-[0.12em] uppercase text-[var(--v7-faint)]">
      {LabelIcon && <LabelIcon size={12} />}
      {label}
    </span>
  );

  return (
    <nav className="flex flex-col gap-1" aria-label={label}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="group mb-1 flex items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown
            size={14}
            className={`text-[var(--v7-faint)] transition-transform ${open ? "" : "-rotate-90"}`}
          />
          {header}
        </button>
      ) : (
        <div className="mb-1">{header}</div>
      )}
      {open &&
        items.map((item) => {
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
    if (!pathname) return null;
    if (pathname.startsWith("/swarm/")) return pathname.split("/")[2] ?? null;
    if (pathname.startsWith("/projects/")) return pathname.split("/")[2] ?? null;
    return null;
  }, [pathname]);

  // Swarms collapsed by default; auto-open if the user is already on a swarm/project route.
  const [swarmsOpen, setSwarmsOpen] = useState(() => !!activeId);
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
    let cancelled = false;

    const refetch = async () => {
      const [jobsRes, agentsRes] = await Promise.all([
        supabase.from("swarm_jobs").select("*"),
        supabase.from("swarm_agents").select("*"),
      ]);
      if (cancelled) return;
      if (jobsRes.data) setJobs(jobsRes.data as SwarmJobRow[]);
      if (agentsRes.data) setAgents(agentsRes.data as SwarmAgentRow[]);
    };

    const intervalId = setInterval(refetch, SIDEBAR_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
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
        collapsible
        defaultOpen={false}
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
          <span className="flex items-center gap-1.5 text-[11px] leading-[1.3] tracking-[0.12em] uppercase text-[var(--v7-faint)] group-hover:text-[var(--v7-text)]">
            <Boxes size={12} />
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
