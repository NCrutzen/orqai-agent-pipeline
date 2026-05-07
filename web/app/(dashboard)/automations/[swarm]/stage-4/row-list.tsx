"use client";

// Phase 76 Plan 07 Task 2 — Stage 4 client composite (Stage4Client + RowList).
//
// Two-column grid `[1fr 460px]` per UI-SPEC §Layout. Single filter chip +
// scrollable row list on the left; detail-pane on the right. Subscribes to
// selection-context for current selectedId + pendingRemovalIds (optimistic
// removal).
//
// Row filter is fixed: result.kanban_reason === 'handler_error' (already
// filtered server-side in stage-4/page.tsx). No client-side filter state.
//
// Operator id: Phase 76 v1 uses fixed placeholder — Phase 999.2 will wire
// real operator persona via the dashboard session.

import { useMemo } from "react";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { useSelection } from "./selection-context";
import { Stage4FilterChips } from "./filter-chips";
import { ReasonPill } from "../stage-3/reason-pill";
import { DetailPane } from "./detail-pane";

export interface Stage4ClientProps {
  swarmType: string;
  rows: KanbanRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
}

const OPERATOR_ID_PLACEHOLDER = "operator";

export function Stage4Client({
  swarmType,
  rows,
  noiseCategories,
}: Stage4ClientProps) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  const visible = useMemo(
    () => rows.filter((r) => !pendingRemovalIds.has(r.id)),
    [rows, pendingRemovalIds],
  );

  const selected = visible.find((r) => r.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <Stage4FilterChips count={visible.length} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 460px",
          flex: 1,
          minHeight: 0,
        }}
      >
        <div style={{ overflowY: "auto", background: "var(--v7-bg)" }}>
          {visible.length === 0 ? (
            <EmptyState />
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visible.map((r) => {
                const isSelected = r.id === selectedId;
                return (
                  <li
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    role="button"
                    tabIndex={0}
                    style={{
                      padding: isSelected
                        ? "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) - 2px)"
                        : "var(--space-2) var(--space-4)",
                      borderBottom: "1px solid var(--v7-border)",
                      borderLeft: isSelected
                        ? "2px solid var(--v7-brand-primary)"
                        : "2px solid transparent",
                      background: isSelected ? "var(--v7-bg-2)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-3)",
                    }}
                  >
                    <ReasonPill reason={r.result.kanban_reason} />
                    <span
                      style={{
                        fontSize: "13px",
                        color: "var(--v7-text)",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.topic ?? "(no topic)"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {r.result.intent ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DetailPane
          row={selected}
          swarmType={swarmType}
          operatorId={OPERATOR_ID_PLACEHOLDER}
          noiseCategories={noiseCategories}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  // UI-SPEC §Empty states — verbatim copy.
  return (
    <div style={{ padding: "var(--space-6) var(--space-4)" }}>
      <h3 style={{ fontSize: "14px", fontWeight: 500, margin: 0, color: "var(--v7-text)" }}>
        No handler errors
      </h3>
      <p style={{ fontSize: "13px", color: "var(--v7-text-muted)", marginTop: "var(--space-2)" }}>
        Stage 4 handlers ran cleanly in the visible window.
      </p>
    </div>
  );
}
