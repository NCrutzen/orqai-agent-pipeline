"use client";

// Phase 76 Plan 06 Task 3 — Reason pill (UI-SPEC §Color, sketch 006).
//
// Maps kanban_reason → label + soft-bg color pair. low_confidence renders
// as "low_conf" per UI-SPEC. handler_error included so the same component
// is reused on Stage 4 tab in Plan 07.

import type { KanbanReason } from "../_lib/kanban-loader";

const MAP: Record<KanbanReason, { label: string; bg: string; fg: string }> = {
  no_handler: {
    label: "no_handler",
    bg: "var(--v7-blue-soft)",
    fg: "var(--v7-blue)",
  },
  low_confidence: {
    label: "low_conf",
    bg: "var(--v7-amber-soft)",
    fg: "var(--v7-amber)",
  },
  handler_error: {
    label: "handler_error",
    bg: "var(--v7-red-soft)",
    fg: "var(--v7-red)",
  },
};

export function ReasonPill({ reason }: { reason: KanbanReason }) {
  const { label, bg, fg } = MAP[reason];
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "11px",
        fontWeight: 500,
        padding: "var(--space-1) var(--space-2)",
        background: bg,
        color: fg,
        borderRadius: "4px",
        display: "inline-block",
        letterSpacing: "0.02em",
      }}
    >
      {label}
    </span>
  );
}
