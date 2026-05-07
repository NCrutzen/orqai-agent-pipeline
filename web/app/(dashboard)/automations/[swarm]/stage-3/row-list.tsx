"use client";

// Phase 76 Plan 06 Task 3 — Stage 3 client composite (Stage3Client + RowList).
//
// Two-column grid `[1fr 460px]` per UI-SPEC §Layout. Filter chips + scrollable
// row list on the left; detail-pane on the right. Subscribes to selection-
// context for current selectedId + pendingRemovalIds (optimistic removal).
//
// Pipeline architecture lock: rows are filtered by kanban_reason ∈
// {no_handler, low_confidence}. Stage 1 / Stage 3 separation preserved
// upstream (page.tsx); this component only renders.
//
// Operator id: Phase 76 v1 uses a fixed placeholder — Phase 999.2 will wire
// real operator persona via the dashboard session.

import { useMemo, useState } from "react";
import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import type { KanbanRow } from "../_lib/kanban-loader";
import { useSelection } from "./selection-context";
import { FilterChips, type Stage3Filter } from "./filter-chips";
import { ReasonPill } from "./reason-pill";
import { ConfBar } from "./conf-bar";
import { DetailPane } from "./detail-pane";

export interface Stage3ClientProps {
  swarmType: string;
  rows: KanbanRow[];
  intents: SwarmIntentRow[];
  noiseCategories: SwarmNoiseCategoryRow[];
}

const OPERATOR_ID_PLACEHOLDER = "operator";

export function Stage3Client({
  swarmType,
  rows,
  intents,
  noiseCategories,
}: Stage3ClientProps) {
  const [filter, setFilter] = useState<Stage3Filter>("all");
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (pendingRemovalIds.has(r.id)) return false;
        if (filter === "all") return true;
        return r.result.kanban_reason === filter;
      }),
    [rows, filter, pendingRemovalIds],
  );

  const counts = useMemo(() => {
    const live = rows.filter((r) => !pendingRemovalIds.has(r.id));
    return {
      all: live.length,
      no_handler: live.filter((r) => r.result.kanban_reason === "no_handler").length,
      low_confidence: live.filter((r) => r.result.kanban_reason === "low_confidence").length,
    };
  }, [rows, pendingRemovalIds]);

  const selected = visible.find((r) => r.id === selectedId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <FilterChips active={filter} counts={counts} onChange={setFilter} />
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
            <EmptyState filter={filter} totalRows={counts.all} />
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
                    {r.result.kanban_reason === "low_confidence" && r.result.ranked?.[0] ? (
                      <ConfBar value={parseFloat(r.result.ranked[0].confidence) || 0} />
                    ) : null}
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
          intents={intents}
          noiseCategories={noiseCategories}
        />
      </div>
    </div>
  );
}

function EmptyState({ filter, totalRows }: { filter: Stage3Filter; totalRows: number }) {
  if (totalRows === 0) {
    return (
      <div style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h3 style={{ fontSize: "14px", fontWeight: 500, margin: 0, color: "var(--v7-text)" }}>
          No rows in Stage 3
        </h3>
        <p style={{ fontSize: "13px", color: "var(--v7-text-muted)", marginTop: "var(--space-2)" }}>
          Pipeline is fully resolving intents in the visible window. Filter chips still render zero counts.
        </p>
      </div>
    );
  }
  const chipName = filter === "no_handler" ? "no_handler" : "low_confidence";
  return (
    <div style={{ padding: "var(--space-6) var(--space-4)" }}>
      <h3 style={{ fontSize: "14px", fontWeight: 500, margin: 0, color: "var(--v7-text)" }}>
        No {chipName} rows
      </h3>
      <p style={{ fontSize: "13px", color: "var(--v7-text-muted)", marginTop: "var(--space-2)" }}>
        Switch chip to All to see other reasons.
      </p>
    </div>
  );
}
