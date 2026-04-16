"use client";

/**
 * Kanban board root (Phase 52, KAN-01..04).
 *
 * Reads jobs via `useRealtimeTable("jobs")`, applies the current smart
 * filter from `?filter=` URL state, groups by stage, and renders a
 * 5-column dnd-kit drag-and-drop board. Drops persist via the
 * `moveJob` server action with optimistic UI + sonner toast revert.
 *
 * Realtime UPDATE arrives shortly after the server action commits and
 * reconciles the optimistic overlay (see effect: prune-on-match).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToWindowEdges, snapCenterToCursor } from "@dnd-kit/modifiers";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { KanbanColumn } from "@/components/v7/kanban/kanban-column";
import { KanbanJobCard } from "@/components/v7/kanban/kanban-job-card";
import { moveJob } from "@/lib/v7/kanban/actions";
import { KANBAN_STAGES, isKanbanStage } from "@/lib/v7/kanban/stages";
import { getFilterPredicate } from "@/lib/v7/kanban/filters";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import type { SwarmJob, SwarmJobStage } from "@/lib/v7/types";

interface KanbanBoardProps {
  swarmId: string;
}

const COLUMN_PREFIX = "column:";

function isColumnId(id: string): boolean {
  return id.startsWith(COLUMN_PREFIX);
}

function columnIdToStage(id: string): SwarmJobStage | null {
  const value = id.slice(COLUMN_PREFIX.length);
  return isKanbanStage(value) ? value : null;
}

export function KanbanBoard({ swarmId: _swarmId }: KanbanBoardProps) {
  const { rows: jobs } = useRealtimeTable("jobs");
  const params = useSearchParams();
  const filter = params?.get("filter") ?? null;

  // Optimistic stage overrides keyed by job id. Cleared once the
  // realtime row arrives with the matching stage (see effect below).
  const [overlay, setOverlay] = useState<Map<string, SwarmJobStage>>(
    new Map(),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const predicate = useMemo(() => getFilterPredicate(filter), [filter]);

  const displayedJobs = useMemo(
    () =>
      jobs.map((j) => {
        const o = overlay.get(j.id);
        return o ? { ...j, stage: o } : j;
      }),
    [jobs, overlay],
  );

  const filteredJobs = useMemo(
    () => displayedJobs.filter(predicate),
    [displayedJobs, predicate],
  );

  const byStage = useMemo<Record<SwarmJobStage, SwarmJob[]>>(() => {
    const acc: Record<SwarmJobStage, SwarmJob[]> = {
      backlog: [],
      ready: [],
      progress: [],
      review: [],
      done: [],
    };
    for (const j of filteredJobs) {
      acc[j.stage].push(j);
    }
    // Stable order within column: created_at desc.
    for (const stage of KANBAN_STAGES) {
      acc[stage].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return acc;
  }, [filteredJobs]);

  // Reconcile overlay with realtime: drop entries whose realtime row
  // already shows the optimistic stage.
  useEffect(() => {
    if (overlay.size === 0) return;
    let changed = false;
    const next = new Map(overlay);
    for (const [jobId, stage] of overlay) {
      const row = jobs.find((j) => j.id === jobId);
      if (row && row.stage === stage) {
        next.delete(jobId);
        changed = true;
      }
    }
    if (changed) setOverlay(next);
  }, [jobs, overlay]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeJob = useMemo(
    () => (activeId ? displayedJobs.find((j) => j.id === activeId) : null),
    [activeId, displayedJobs],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const revertOverlay = useCallback((jobId: string) => {
    setOverlay((prev) => {
      const next = new Map(prev);
      next.delete(jobId);
      return next;
    });
  }, []);

  const applyOverlay = useCallback((jobId: string, stage: SwarmJobStage) => {
    setOverlay((prev) => {
      const next = new Map(prev);
      next.set(jobId, stage);
      return next;
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const overId = event.over?.id;
      if (!overId) return;
      const activeIdStr = String(event.active.id);

      const job = displayedJobs.find((j) => j.id === activeIdStr);
      if (!job) return;

      let newStage: SwarmJobStage | null = null;
      const overIdStr = String(overId);
      if (isColumnId(overIdStr)) {
        newStage = columnIdToStage(overIdStr);
      } else {
        const overJob = displayedJobs.find((j) => j.id === overIdStr);
        if (overJob) newStage = overJob.stage;
      }

      if (!newStage || newStage === job.stage) return;

      applyOverlay(job.id, newStage);
      startTransition(async () => {
        try {
          await moveJob(job.id, newStage);
        } catch (err) {
          revertOverlay(job.id);
          const message =
            err instanceof Error
              ? err.message
              : "Couldn't move job. Reverted.";
          toast.error("Couldn't move job. Reverted.", {
            description: message,
          });
        }
      });
    },
    [displayedJobs, applyOverlay, revertOverlay],
  );

  return (
    <GlassCard className="p-[18px] flex flex-col gap-[14px] min-h-[280px]">
      <header className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
            Job board
          </span>
          <span className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
            Kanban for business stages, not micro-steps
          </span>
        </div>
        <span className="px-3 py-1 rounded-[var(--v7-radius-pill)] border border-[var(--v7-line)] bg-[rgba(255,255,255,0.04)] text-[12px] leading-none text-[var(--v7-muted)] whitespace-nowrap">
          {filteredJobs.length} job{filteredJobs.length === 1 ? "" : "s"}
          {filter ? " (filtered)" : " total"}
        </span>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        modifiers={[restrictToWindowEdges, snapCenterToCursor]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div
          className="grid gap-[12px] min-h-0"
          style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
        >
          {KANBAN_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              jobs={byStage[stage]}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeJob ? (
            <KanbanJobCard job={activeJob} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>
    </GlassCard>
  );
}
