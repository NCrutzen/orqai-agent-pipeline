"use client";

import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, AlertCircle } from "lucide-react";

interface PipelineRun {
  id: string;
  project_id: string;
  name: string;
  use_case: string | null;
  status: string;
  step_count: number;
  steps_completed: number;
  agent_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  last_error?: string | null;
  projects?: { name: string } | null;
}

interface RunCardProps {
  run: PipelineRun;
  showProject?: boolean;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function humanDuration(startStr: string, endStr: string): string {
  const diffMs =
    new Date(endStr).getTime() - new Date(startStr).getTime();
  const totalSec = Math.floor(diffMs / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

const statusVariant: Record<string, string> = {
  pending: "bg-[var(--v7-panel-2)] text-[var(--v7-muted)]",
  running: "bg-[var(--v7-blue-soft)] text-[var(--v7-blue)]",
  complete: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function RunCard({ run, showProject = false }: RunCardProps) {
  const progressPct =
    run.step_count > 0
      ? Math.round((run.steps_completed / run.step_count) * 100)
      : 0;

  return (
    <Link href={`/projects/${run.project_id}/runs/${run.id}`}>
      <GlassCard className="p-4 transition-all duration-[220ms] ease-out hover:-translate-y-[2px] hover:shadow-[var(--v7-glass-shadow-heavy)]">
        {/* Top row: name + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {showProject && run.projects?.name && (
              <p className="mb-0.5 truncate text-[12px] text-[var(--v7-faint)]">
                {run.projects.name}
              </p>
            )}
            <p className="truncate font-medium text-[var(--v7-text)]">{run.name}</p>
            {run.use_case && (
              <p className="mt-0.5 truncate text-[14px] text-[var(--v7-muted)]">
                {run.use_case}
              </p>
            )}
          </div>
          <Badge
            className={`shrink-0 ${statusVariant[run.status] || statusVariant.pending}`}
            variant="secondary"
          >
            {run.status}
          </Badge>
        </div>

        {/* Bottom row: metadata */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[var(--v7-faint)]">
          {/* Step progress */}
          <div className="flex items-center gap-1.5">
            <span>
              {run.steps_completed}/{run.step_count} steps
            </span>
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--v7-panel-2)]">
              <div
                className="h-full rounded-full bg-[var(--v7-muted)] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Agent count */}
          {run.agent_count > 0 && (
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" />
              {run.agent_count} agent{run.agent_count !== 1 ? "s" : ""}
            </span>
          )}

          {/* Started time */}
          {run.started_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {relativeTime(run.started_at)}
            </span>
          )}

          {/* Duration */}
          {run.started_at && run.completed_at && (
            <span>{humanDuration(run.started_at, run.completed_at)}</span>
          )}
        </div>

        {/* Error message if failed */}
        {run.status === "failed" && run.last_error && (
          <div className="mt-2 flex items-start gap-1.5 text-[12px] text-rose-700 dark:text-rose-300">
            <AlertCircle className="mt-0.5 size-3 shrink-0" />
            <p className="truncate">{run.last_error}</p>
          </div>
        )}
      </GlassCard>
    </Link>
  );
}
