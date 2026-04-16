/**
 * Kanban stage constants. Locked to the `swarm_jobs.stage` CHECK
 * constraint values from `supabase/migrations/20260415_v7_foundation.sql`.
 *
 * Display labels are user-facing per REQUIREMENTS.md KAN-01.
 */

import type { SwarmJobStage } from "@/lib/v7/types";

export const KANBAN_STAGES: SwarmJobStage[] = [
  "backlog",
  "ready",
  "progress",
  "review",
  "done",
];

export const STAGE_LABELS: Record<SwarmJobStage, string> = {
  backlog: "Backlog",
  ready: "Ready",
  progress: "In progress",
  review: "Human review",
  done: "Done",
};

export function isKanbanStage(value: unknown): value is SwarmJobStage {
  return (
    typeof value === "string" &&
    (KANBAN_STAGES as string[]).includes(value)
  );
}
