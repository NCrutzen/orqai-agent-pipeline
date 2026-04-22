"use client";

/**
 * Kanban column wrapper. Combines two dnd-kit primitives:
 *   - `useDroppable` -- so the empty area accepts drops too
 *   - `SortableContext` -- so child cards can be reordered (V7 only
 *     supports cross-column moves; within-column reordering is not
 *     persisted -- see Plan 52-02 D-14)
 *
 * Shows up to VISIBLE_LIMIT cards by default; a "Toon N meer" button
 * expands the rest in place so users can still drag from the full list.
 */

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { KanbanJobCard } from "@/components/v7/kanban/kanban-job-card";
import { STAGE_LABELS } from "@/lib/v7/kanban/stages";
import type { SwarmJob, SwarmJobStage } from "@/lib/v7/types";

interface KanbanColumnProps {
  stage: SwarmJobStage;
  jobs: SwarmJob[];
}

const VISIBLE_LIMIT = 5;

export function KanbanColumn({ stage, jobs }: KanbanColumnProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleJobs = expanded ? jobs : jobs.slice(0, VISIBLE_LIMIT);
  const hiddenCount = jobs.length - visibleJobs.length;

  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage}`,
    data: { stage, kind: "column" as const },
  });

  return (
    <section
      ref={setNodeRef}
      data-stage={stage}
      data-active-drop={isOver || undefined}
      className={cn(
        "rounded-[var(--v7-radius)] p-[10px]",
        "border border-[var(--v7-line)]",
        "grid grid-rows-[auto_1fr] min-h-0",
        "transition-[outline-color,background-color] duration-150",
      )}
      style={{
        background: isOver
          ? "rgba(58,199,201,0.06)"
          : "rgba(255,255,255,0.025)",
        outline: isOver ? "2px dashed var(--v7-teal)" : "none",
        outlineOffset: -2,
      }}
    >
      <header className="flex justify-between items-center px-[6px] pt-[6px] pb-[12px]">
        <span className="font-[var(--font-cabinet)] text-[14px] leading-[1.2] font-bold text-[var(--v7-text)]">
          {STAGE_LABELS[stage]}
        </span>
        <span className="text-[12.8px] leading-[1.2] text-[var(--v7-muted)]">
          {jobs.length}
        </span>
      </header>

      <div
        className="grid gap-[10px] min-h-[60px]"
        style={{ paddingRight: 3 }}
      >
        <SortableContext
          items={visibleJobs.map((j) => j.id)}
          strategy={verticalListSortingStrategy}
        >
          {jobs.length === 0 ? (
            <div
              className="text-center text-[13px] leading-[1.4] text-[var(--v7-faint)] py-[18px]"
              aria-hidden
            >
              No jobs in {STAGE_LABELS[stage]}
            </div>
          ) : (
            <>
              {visibleJobs.map((job) => (
                <KanbanJobCard key={job.id} job={job} />
              ))}
              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="flex items-center justify-center gap-1.5 rounded-[var(--v7-radius-sm)] border border-dashed border-[var(--v7-line)] px-3 py-2 text-[12px] text-[var(--v7-muted)] transition-colors hover:border-[var(--v7-teal)] hover:text-[var(--v7-text)]"
                >
                  <ChevronDown size={12} />
                  Toon {hiddenCount} meer
                </button>
              )}
              {expanded && jobs.length > VISIBLE_LIMIT && (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="flex items-center justify-center gap-1.5 rounded-[var(--v7-radius-sm)] border border-dashed border-[var(--v7-line)] px-3 py-2 text-[12px] text-[var(--v7-muted)] transition-colors hover:border-[var(--v7-teal)] hover:text-[var(--v7-text)]"
                >
                  <ChevronDown size={12} className="rotate-180" />
                  Inklappen
                </button>
              )}
            </>
          )}
        </SortableContext>
      </div>
    </section>
  );
}
