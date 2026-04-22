"use client";

/**
 * Reusable live view for automation runs grouped as "agent runs".
 *
 * - Live tab   — kanban with 4 columns (Analyseert / Review / Afgerond / Fout)
 * - Archief tab — grid of completed runs that have screenshots
 *
 * Filters by automation-name prefix so a single board can render every
 * sub-agent in a swarm (e.g. prefix="debtor-email" matches
 * "debtor-email-review" + "debtor-email-cleanup" + future siblings).
 */

import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AutomationRealtimeProvider,
  useAutomationRuns,
} from "./automation-realtime-provider";
import { AgentRunCard } from "./agent-run-card";
import { AgentRunDrawer } from "./agent-run-drawer";
import {
  STAGE_META,
  hasScreenshots,
  stageFromStatus,
  type AgentRunStage,
  type AutomationRun,
} from "@/lib/automations/types";
import { cn } from "@/lib/utils";

const LIVE_COLUMNS: AgentRunStage[] = [
  "analyzing",
  "review",
  "completed",
  "failed",
];

const COLUMN_ACCENT: Record<AgentRunStage, string> = {
  analyzing: "before:bg-[var(--v7-blue)]",
  review: "before:bg-[var(--v7-amber)]",
  completed: "before:bg-[var(--v7-teal)]",
  failed: "before:bg-[var(--v7-red)]",
  skipped: "before:bg-[var(--v7-faint)]",
};

interface AgentRunBoardProps {
  /** Title shown in the header, e.g. "Debiteuren Email Swarm". */
  title: string;
  /** Automation-name prefix match, e.g. "debtor-email". */
  prefix: string;
  /** Optional subtitle / description below the title. */
  description?: string;
  /**
   * When true, the board omits its own title/description block (which
   * would otherwise duplicate the surrounding page header). Live stats
   * stay in a compact strip above the live/archive tabs.
   */
  embedded?: boolean;
}

export function AgentRunBoard(props: AgentRunBoardProps) {
  return (
    <AutomationRealtimeProvider prefix={props.prefix}>
      <AgentRunBoardInner {...props} />
    </AutomationRealtimeProvider>
  );
}

function AgentRunBoardInner({
  title,
  prefix,
  description,
  embedded = false,
}: AgentRunBoardProps) {
  const { runs, status, loading } = useAutomationRuns();
  const [selected, setSelected] = useState<AutomationRun | null>(null);

  const { grouped, archive, counts } = useMemo(() => {
    const grouped: Record<AgentRunStage, AutomationRun[]> = {
      analyzing: [],
      review: [],
      completed: [],
      failed: [],
      skipped: [],
    };

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    for (const run of runs) {
      const stage = stageFromStatus(run.status);
      // Show completed/failed only from last 24h in the live board so columns
      // don't bloat; the full history lives in the archive tab.
      if (stage === "completed" || stage === "failed") {
        const ts = new Date(run.completed_at ?? run.created_at).getTime();
        if (now - ts <= DAY) grouped[stage].push(run);
      } else if (stage !== "skipped") {
        grouped[stage].push(run);
      }
    }

    const archive = runs
      .filter((r) => r.status === "completed" && hasScreenshots(r))
      .sort((a, b) => {
        const at = new Date(a.completed_at ?? a.created_at).getTime();
        const bt = new Date(b.completed_at ?? b.created_at).getTime();
        return bt - at;
      });

    const counts = {
      analyzing: grouped.analyzing.length,
      review: grouped.review.length,
      completedToday: grouped.completed.length,
      failedToday: grouped.failed.length,
      archive: archive.length,
    };

    return { grouped, archive, counts };
  }, [runs]);

  const stats = (
    <div className="flex items-center gap-2">
      <HeaderStat
        count={counts.analyzing + counts.review}
        label="actief"
        tone="blue"
        live={status === "SUBSCRIBED"}
      />
      <HeaderStat
        count={counts.completedToday}
        label="vandaag klaar"
        tone="teal"
      />
      {counts.failedToday > 0 && (
        <HeaderStat count={counts.failedToday} label="fouten" tone="red" />
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      {!embedded && (
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--v7-brand-primary)]">
              <Sparkles size={14} /> Agent Swarm
            </div>
            <h1 className="font-[var(--font-cabinet)] text-[26px] font-bold tracking-[-0.02em] text-[var(--v7-text)]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-[13px] text-[var(--v7-muted)]">
                {description}
              </p>
            )}
          </div>
          {stats}
        </header>
      )}

      <Tabs defaultValue="live" className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-4">
          <TabsList variant="line" className="self-start">
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="archive">
              Archief ({counts.archive})
            </TabsTrigger>
          </TabsList>
          {embedded && stats}
        </div>

        <TabsContent value="live" className="mt-4">
          {loading ? (
            <BoardSkeleton />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {LIVE_COLUMNS.map((stage) => (
                <KanbanColumn
                  key={stage}
                  stage={stage}
                  runs={grouped[stage]}
                  prefix={prefix}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="archive" className="mt-4">
          <ArchiveGrid
            runs={archive}
            prefix={prefix}
            loading={loading}
            onSelect={setSelected}
          />
        </TabsContent>
      </Tabs>

      <AgentRunDrawer
        run={selected}
        prefix={prefix}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}

function KanbanColumn({
  stage,
  runs,
  prefix,
  onSelect,
}: {
  stage: AgentRunStage;
  runs: AutomationRun[];
  prefix: string;
  onSelect: (r: AutomationRun) => void;
}) {
  const meta = STAGE_META[stage];

  return (
    <GlassCard
      className={cn(
        "relative flex flex-col gap-3 p-4",
        "before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:rounded-t-[var(--v7-radius)]",
        COLUMN_ACCENT[stage],
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--v7-text)]">
            {meta.dutchLabel}
          </span>
          {meta.pulse && runs.length > 0 && (
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--v7-brand-primary)]"
            />
          )}
        </div>
        <span className="rounded-[var(--v7-radius-pill)] bg-[var(--v7-panel-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--v7-muted)]">
          {runs.length}
        </span>
      </div>

      <div className="flex min-h-[60px] flex-col gap-2">
        {runs.length === 0 ? (
          <div className="flex h-[60px] items-center justify-center rounded-[var(--v7-radius-inner,12px)] border border-dashed border-[var(--v7-line)] text-[11px] text-[var(--v7-faint)]">
            Geen runs
          </div>
        ) : (
          runs.map((run) => (
            <AgentRunCard
              key={run.id}
              run={run}
              prefix={prefix}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </GlassCard>
  );
}

function ArchiveGrid({
  runs,
  prefix,
  loading,
  onSelect,
}: {
  runs: AutomationRun[];
  prefix: string;
  loading: boolean;
  onSelect: (r: AutomationRun) => void;
}) {
  if (loading) return <BoardSkeleton />;

  if (runs.length === 0) {
    return (
      <GlassCard className="flex h-48 items-center justify-center p-6 text-[13px] text-[var(--v7-muted)]">
        Nog geen afgeronde runs met screenshots.
      </GlassCard>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {runs.map((run) => (
        <AgentRunCard
          key={run.id}
          run={run}
          prefix={prefix}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function HeaderStat({
  count,
  label,
  tone,
  live = false,
}: {
  count: number;
  label: string;
  tone: "blue" | "teal" | "red";
  live?: boolean;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-[var(--v7-blue-soft)] text-[var(--v7-blue)]"
      : tone === "teal"
        ? "bg-[var(--v7-teal-soft)] text-[var(--v7-teal)]"
        : "bg-[rgba(181,69,78,0.14)] text-[var(--v7-red)]";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--v7-radius-pill)] px-3 py-1 text-[12px] font-semibold",
        toneClass,
      )}
    >
      {live && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current"
        />
      )}
      {count} {label}
    </span>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <GlassCard key={i} className="h-64 animate-pulse" />
      ))}
    </div>
  );
}
