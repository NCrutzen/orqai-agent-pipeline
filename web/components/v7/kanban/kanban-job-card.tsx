"use client";

/**
 * Sortable Kanban card. The whole card is the drag handle; dnd-kit
 * applies transform/transition via inline style. We expose
 * `isDragOverlay` for the DragOverlay portal render so a duplicate is
 * not made sortable (which would cause id collisions).
 */

import { useMemo } from "react";
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
      let variant: JobTagVariant = "default";
      if (RISK_TAG_TOKENS.has(lower)) variant = "risk";
      else if (OK_TAG_TOKENS.has(lower)) variant = "ok";
      out.push({ label: raw, variant });
    }
  }

  return out;
}

export function KanbanJobCard({ job, isDragOverlay }: KanbanJobCardProps) {
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

  return (
    <article
      ref={isDragOverlay ? undefined : setNodeRef}
      {...(isDragOverlay ? {} : attributes)}
      {...(isDragOverlay ? {} : listeners)}
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
      <h4 className="font-[var(--font-cabinet)] text-[15.5px] leading-[1.3] font-bold text-[var(--v7-text)] m-0">
        {job.title}
      </h4>
      {job.description && (
        <p
          className="mt-2 text-[14px] leading-[1.4] text-[var(--v7-muted)] m-0"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {job.description}
        </p>
      )}
      {(visible.length > 0 || overflow > 0) && (
        <div className="flex flex-wrap gap-2 mt-[10px]">
          {visible.map((t, i) => (
            <JobTagPill key={`${t.label}-${i}`} label={t.label} variant={t.variant} />
          ))}
          {overflow > 0 && (
            <JobTagPill label={`+${overflow}`} variant="default" />
          )}
        </div>
      )}
    </article>
  );
}
