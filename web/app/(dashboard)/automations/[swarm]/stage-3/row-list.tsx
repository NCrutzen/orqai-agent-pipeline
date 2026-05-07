"use client";

// Phase 76 Plan 06 Task 3 — Stage 3 client composite (Stage3Client) + row list.
// Placeholder shell created in Task 2 commit so the RSC page type-checks; the
// real implementation lands in Task 3 alongside detail-pane / action-stack /
// inline-editor.

import type { KanbanRow } from "../_lib/kanban-loader";
import type { SwarmIntentRow, SwarmNoiseCategoryRow } from "@/lib/swarms/types";

export interface Stage3ClientProps {
  swarmType: string;
  rows: KanbanRow[];
  intents: SwarmIntentRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
}

export function Stage3Client(_props: Stage3ClientProps) {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        color: "var(--v7-text-muted)",
        fontSize: "14px",
      }}
    >
      Loading Stage 3 surface…
    </div>
  );
}
