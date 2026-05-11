"use client";

// Phase 82 Plan 01 — Canonical condensed row strip (unified across Stages 0-4).
//
// Renders each row as a horizontal flex strip:
//   [StageBadge] · sender · subject · timestamp · [optional rightEdgeSlot]
//
// Hard-separation lock: this is a PRESENTATION primitive. Per-stage page
// boundaries map their loader-specific row shapes into `Row` (defined in
// _lib/types.ts) and pass it down. NO registry imports allowed here.
//
// V9 / D-18 bug fix is structural: Row carries ONE `stage_badge` slot. The
// prior stage-3 implementation rendered the intent code TWICE (once as topic,
// once as a right-aligned mono span); this version renders the badge label
// ONCE. The subject occupies the middle slot — never the intent code again.

import type { ReactNode } from "react";
import type { EmptyState, Row } from "./_lib/types";
import { useSelection } from "./selection-context";

export interface RowListProps {
  rows: Row[];
  emptyState: EmptyState;
  /** Optional right-aligned slot per row (e.g. ConfBar on low_confidence). */
  rightEdgeSlot?: (row: Row) => ReactNode;
}

export function RowList({ rows, emptyState, rightEdgeSlot }: RowListProps) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  const visible =
    pendingRemovalIds.size === 0
      ? rows
      : rows.filter((r) => !pendingRemovalIds.has(r.id));

  if (visible.length === 0) {
    return (
      <div style={{ padding: "var(--space-6) var(--space-4)" }}>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: 500,
            margin: 0,
            color: "var(--v7-text)",
          }}
        >
          {emptyState.title}
        </h3>
        <p
          style={{
            fontSize: "13px",
            color: "var(--v7-text-muted)",
            marginTop: "var(--space-2)",
          }}
        >
          {emptyState.body}
        </p>
      </div>
    );
  }

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {visible.map((r) => {
        const isSelected = r.id === selectedId;
        return (
          <li
            key={r.id}
            onClick={() => setSelected(r.id)}
            role="button"
            tabIndex={0}
            aria-selected={isSelected}
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
              display: "grid",
              gridTemplateColumns: rightEdgeSlot
                ? "140px 200px minmax(0, 1fr) 150px auto"
                : "140px 200px minmax(0, 1fr) 150px",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            <StageBadge {...r.stage_badge} />
            <span
              data-testid="row-sender"
              style={{
                fontSize: 13,
                color: "var(--v7-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {r.from_name ?? r.from_email ?? "(unknown sender)"}
            </span>
            <span
              data-testid="row-subject"
              style={{
                fontSize: 13,
                color: "var(--v7-text)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {r.subject ?? "(no subject)"}
            </span>
            <span
              data-testid="row-timestamp"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--v7-text-muted)",
                whiteSpace: "nowrap",
                textAlign: "right",
              }}
            >
              {new Date(r.timestamp).toLocaleString("en-GB")}
            </span>
            {rightEdgeSlot?.(r)}
          </li>
        );
      })}
    </ul>
  );
}

interface StageBadgeProps {
  label: string;
  variant: Row["stage_badge"]["variant"];
}

function StageBadge({ label, variant }: StageBadgeProps) {
  const { bg, fg, border } = badgeColors(variant);
  return (
    <span
      data-testid="stage-badge"
      data-variant={variant}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--v7-radius-pill)",
        border: `1px solid ${border}`,
        background: bg,
        color: fg,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.3,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function badgeColors(variant: Row["stage_badge"]["variant"]): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (variant) {
    case "noise":
      return {
        bg: "var(--v7-brand-secondary-soft)",
        fg: "var(--v7-brand-secondary)",
        border: "var(--v7-brand-secondary)",
      };
    case "intent":
      return {
        bg: "var(--v7-brand-primary-soft)",
        fg: "var(--v7-brand-primary)",
        border: "var(--v7-brand-primary)",
      };
    case "handler":
      return {
        bg: "var(--v7-brand-primary-soft)",
        fg: "var(--v7-brand-primary)",
        border: "var(--v7-brand-primary)",
      };
    case "safety":
      return {
        bg: "var(--v7-panel-2)",
        fg: "var(--v7-text)",
        border: "var(--v7-line)",
      };
    case "placeholder":
    default:
      return {
        bg: "var(--v7-panel-2)",
        fg: "var(--v7-text-muted)",
        border: "var(--v7-line)",
      };
  }
}
