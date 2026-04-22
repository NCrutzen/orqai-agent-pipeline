"use client";

/**
 * Kanban column wrapper. Combines two dnd-kit primitives:
 *   - `useDroppable` -- so the empty area accepts drops too
 *   - `SortableContext` -- so child cards can be reordered (V7 only
 *     supports cross-column moves; within-column reordering is not
 *     persisted -- see Plan 52-02 D-14)
 *
 * Shows up to VISIBLE_LIMIT cards inline. Overflow opens a browse modal
 * modeled on the debtor bulk-review handpick screen: search box,
 * agent/tag filter chips, and per-row date/time context. Drag is disabled
 * in the modal (browse-only).
 */

import { useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KanbanJobCard } from "@/components/v7/kanban/kanban-job-card";
import { STAGE_LABELS } from "@/lib/v7/kanban/stages";
import type { SwarmJob, SwarmJobStage } from "@/lib/v7/types";

interface KanbanColumnProps {
  stage: SwarmJobStage;
  jobs: SwarmJob[];
}

const VISIBLE_LIMIT = 5;

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${diffSec}s geleden`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m geleden`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}u geleden`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d geleden`;
}

export function KanbanColumn({ stage, jobs }: KanbanColumnProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<string | null>(null);

  const visibleJobs = jobs.slice(0, VISIBLE_LIMIT);
  const hiddenCount = jobs.length - visibleJobs.length;

  const { setNodeRef, isOver } = useDroppable({
    id: `column:${stage}`,
    data: { stage, kind: "column" as const },
  });

  const agentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const j of jobs) {
      const a = j.assigned_agent ?? "Onbekend";
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((j) => {
      if (agentFilter && (j.assigned_agent ?? "Onbekend") !== agentFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        j.title,
        j.description ?? "",
        j.assigned_agent ?? "",
        Array.isArray(j.tags) ? (j.tags as string[]).join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [jobs, query, agentFilter]);

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
                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1.5 rounded-[var(--v7-radius-sm)] border border-dashed border-[var(--v7-line)] px-3 py-2 text-[12px] text-[var(--v7-muted)] transition-colors hover:border-[var(--v7-teal)] hover:text-[var(--v7-text)]"
                    >
                      <ChevronDown size={12} />
                      Toon {hiddenCount} meer
                    </button>
                  </DialogTrigger>
                  <DialogContent className="!max-w-[min(1100px,95vw)] max-h-[90vh] flex flex-col overflow-hidden bg-[var(--v7-bg)] border border-[var(--v7-line)] p-0">
                    <DialogHeader className="border-b border-[var(--v7-line)] p-5 space-y-3">
                      <DialogTitle className="flex items-center gap-3 text-[18px] font-semibold text-[var(--v7-text)]">
                        {STAGE_LABELS[stage]}
                        <span className="rounded-full bg-[var(--v7-panel-2)] px-2.5 py-0.5 text-[12px] font-medium text-[var(--v7-muted)]">
                          {filteredJobs.length}
                          {filteredJobs.length !== jobs.length
                            ? ` van ${jobs.length}`
                            : ""}
                        </span>
                      </DialogTitle>

                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--v7-faint)]"
                        />
                        <input
                          type="text"
                          autoFocus
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Zoek op titel, agent, tag of beschrijving…"
                          className="w-full h-9 pl-9 pr-9 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-[13px] text-[var(--v7-text)] placeholder:text-[var(--v7-faint)] focus:outline-none focus:border-[var(--v7-teal)]"
                        />
                        {query && (
                          <button
                            type="button"
                            onClick={() => setQuery("")}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-[var(--v7-faint)] hover:text-[var(--v7-text)]"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {agentCounts.length > 1 && (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setAgentFilter(null)}
                            className={cn(
                              "text-[11px] px-2 py-1 rounded-full border transition-colors",
                              agentFilter === null
                                ? "border-[var(--v7-teal)] bg-[var(--v7-teal-soft)] text-[var(--v7-teal)]"
                                : "border-[var(--v7-line)] text-[var(--v7-muted)] hover:text-[var(--v7-text)]",
                            )}
                          >
                            Alle agents
                          </button>
                          {agentCounts.map(([agent, count]) => (
                            <button
                              key={agent}
                              type="button"
                              onClick={() =>
                                setAgentFilter(
                                  agentFilter === agent ? null : agent,
                                )
                              }
                              className={cn(
                                "text-[11px] px-2 py-1 rounded-full border transition-colors",
                                agentFilter === agent
                                  ? "border-[var(--v7-teal)] bg-[var(--v7-teal-soft)] text-[var(--v7-teal)]"
                                  : "border-[var(--v7-line)] text-[var(--v7-muted)] hover:text-[var(--v7-text)]",
                              )}
                            >
                              {agent}
                              <span className="ml-1 font-mono opacity-70">
                                {count}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </DialogHeader>

                    <div className="overflow-y-auto flex-1 p-5">
                      {filteredJobs.length === 0 ? (
                        <div className="py-12 text-center text-[13px] text-[var(--v7-faint)]">
                          Geen jobs die voldoen aan dit filter.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          {filteredJobs.map((job) => (
                            <div key={job.id} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-[var(--v7-faint)]">
                                <span>
                                  {job.assigned_agent ?? "Onbekend"}
                                </span>
                                <span
                                  title={job.updated_at ?? job.created_at}
                                >
                                  {formatDateTime(
                                    job.updated_at ?? job.created_at,
                                  )}{" "}
                                  · {formatRelative(
                                    job.updated_at ?? job.created_at,
                                  )}
                                </span>
                              </div>
                              <KanbanJobCard job={job} isDragOverlay />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </>
          )}
        </SortableContext>
      </div>
    </section>
  );
}
