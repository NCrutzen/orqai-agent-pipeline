"use client";

/**
 * Sortable Kanban card. The whole card is the drag handle; dnd-kit
 * applies transform/transition via inline style. We expose
 * `isDragOverlay` for the DragOverlay portal render so a duplicate is
 * not made sortable (which would cause id collisions).
 */

import { useMemo } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import {
  JobTagPill,
  type JobTagVariant,
} from "@/components/v7/kanban/job-tag-pill";
import type { SwarmJob } from "@/lib/v7/types";

interface KanbanJobCardProps {
  job: SwarmJob;
  isDragOverlay?: boolean;
  /**
   * Fired when the card is activated via click (no drag distance
   * threshold reached) or via Enter/Space while focused. The parent
   * column uses this to open the lane modal with this entity pre-
   * expanded. Not provided when rendered inside the modal itself or as
   * a DragOverlay.
   */
  onCardActivate?: (jobId: string) => void;
}

interface DerivedTag {
  label: string;
  variant: JobTagVariant;
}

const RISK_TAG_TOKENS = new Set(["sla", "blocked", "risk"]);
const OK_TAG_TOKENS = new Set(["approved", "done", "submitted", "archived"]);
const PRIORITY_LABEL: Record<SwarmJob["priority"], string | null> = {
  urgent: "Urgent",
  high: "High",
  normal: null,
  low: "Low",
};
const MAX_VISIBLE_TAGS = 3;

function deriveTags(job: SwarmJob): DerivedTag[] {
  const out: DerivedTag[] = [];

  // Priority pill (skip "normal" -- it's the default).
  const priorityLabel = PRIORITY_LABEL[job.priority];
  if (priorityLabel) {
    const isUrgent = job.priority === "urgent" || job.priority === "high";
    out.push({
      label: priorityLabel,
      variant: isUrgent ? "warn" : "default",
    });
  }

  if (Array.isArray(job.tags)) {
    for (const raw of job.tags) {
      if (typeof raw !== "string") continue;
      const lower = raw.toLowerCase();
      // next:<stage> — written by the swarm bridge for cards whose
      // review is resolved but still have downstream work. Render as a
      // teal "Next: <stage>" pill so the user sees what's coming up.
      if (lower.startsWith("next:")) {
        out.push({
          label: `Next: ${raw.slice(5).replace(/_/g, " ")}`,
          variant: "ok",
        });
        continue;
      }
      let variant: JobTagVariant = "default";
      if (RISK_TAG_TOKENS.has(lower)) variant = "risk";
      else if (OK_TAG_TOKENS.has(lower)) variant = "ok";
      out.push({ label: raw, variant });
    }
  }

  return out;
}

function formatCardTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}u`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d`;
}

export function KanbanJobCard({
  job,
  isDragOverlay,
  onCardActivate,
}: KanbanJobCardProps) {
  const sortable = useSortable({
    id: job.id,
    data: { stage: job.stage, kind: "job" as const },
    disabled: isDragOverlay,
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable;

  const derived = useMemo(() => deriveTags(job), [job]);
  const visible = derived.slice(0, MAX_VISIBLE_TAGS);
  const overflow = derived.length - visible.length;

  const handleActivate = () => {
    if (isDragOverlay || !onCardActivate) return;
    onCardActivate(job.id);
  };

  return (
    <article
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
      onClick={isDragOverlay || !onCardActivate ? undefined : handleActivate}
      onKeyDown={
        isDragOverlay || !onCardActivate
          ? undefined
          : (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleActivate();
              }
            }
      }
      role="button"
      tabIndex={isDragOverlay ? -1 : 0}
      aria-roledescription="Kanban job card"
      className={cn(
        "block p-[14px] rounded-[var(--v7-radius-mini)]",
        "border border-[var(--v7-line)]",
        "transition-[transform,box-shadow,opacity] duration-[180ms] ease-out",
        "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--v7-teal)] focus-visible:outline-offset-2",
        !isDragOverlay && "cursor-grab",
        isDragOverlay && "cursor-grabbing shadow-[var(--v7-glass-shadow-heavy)]",
      )}
      style={{
        transform: isDragOverlay ? undefined : CSS.Transform.toString(transform),
        transition: isDragOverlay ? undefined : transition,
        opacity: isDragging && !isDragOverlay ? 0.4 : 1,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02))",
        boxShadow: isDragOverlay
          ? "var(--v7-glass-shadow-heavy)"
          : "var(--v7-glass-shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-[var(--font-cabinet)] text-[15.5px] leading-[1.3] font-bold text-[var(--v7-text)] m-0 flex-1 min-w-0">
          {job.title}
        </h4>
        <span
          className="shrink-0 text-[11px] leading-[1.4] text-[var(--v7-faint)] tabular-nums"
          title={job.updated_at ?? job.created_at}
        >
          {formatCardTime(job.updated_at ?? job.created_at)}
        </span>
      </div>
      {(() => {
        // `description` may contain either:
        //   - A plain-text error/info message (legacy shape) → show as-is
        //   - A JSON blob with { timeline, latest_error, entity_id } from
        //     the entity-grouped bridge → extract the latest_error (if any)
        //     and the number of runs for a compact summary.
        const raw = job.description;
        if (!raw) return null;
        const trimmed = raw.trimStart();
        if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(raw) as {
              timeline?: unknown[];
              latest_error?: string | null;
            };
            const steps = Array.isArray(parsed.timeline)
              ? parsed.timeline.length
              : 0;
            const summary =
              parsed.latest_error ??
              (steps > 0
                ? `${steps} log ${steps === 1 ? "entry" : "entries"}`
                : null);
            if (!summary) return null;
            return (
              <p className="mt-2 line-clamp-2 text-[13px] leading-[1.4] text-[var(--v7-muted)] m-0">
                {summary}
              </p>
            );
          } catch {
            // Fall through to plain render below.
          }
        }
        return (
          <p className="mt-2 line-clamp-2 text-[13px] leading-[1.4] text-[var(--v7-muted)] m-0">
            {raw}
          </p>
        );
      })()}
      {(visible.length > 0 || overflow > 0 || job.stage === "review") && (
        <div className="flex flex-wrap items-center gap-2 mt-[10px]">
          {visible.map((t, i) => (
            <JobTagPill key={`${t.label}-${i}`} label={t.label} variant={t.variant} />
          ))}
          {overflow > 0 && (
            <JobTagPill label={`+${overflow}`} variant="default" />
          )}
          {job.stage === "review" && !isDragOverlay && (
            <Link
              href="/automations/debtor-email-review"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="ml-auto inline-flex items-center gap-1 rounded-[var(--v7-radius-pill)] border border-[var(--v7-teal)] bg-[var(--v7-teal-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--v7-teal)] transition-colors hover:bg-[var(--v7-teal)] hover:text-[var(--v7-inverse)]"
            >
              <ExternalLink size={10} />
              Open review
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
