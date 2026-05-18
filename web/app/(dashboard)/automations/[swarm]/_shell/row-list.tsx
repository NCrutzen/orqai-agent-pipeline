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

import { useEffect, useState, type ReactNode } from "react";
import type { EmptyState, Row } from "./_lib/types";
import { RowVerdictDot } from "./components/row-verdict-dot";
import { useSelection } from "./selection-context";

export interface RowListProps {
  rows: Row[];
  emptyState: EmptyState;
  /** Optional right-aligned slot per row (e.g. ConfBar on low_confidence). */
  rightEdgeSlot?: (row: Row) => ReactNode;
  /** Phase 82.5 Plan 06 — per-row latest verdict for the row strip dot.
   *  Optional, declared here so Plan 06 can plumb the prop end-to-end before
   *  Plan 04 wires the visual rendering. Currently accepted-but-ignored;
   *  Plan 04 will consume and render the dot. */
  feedbackMap?: Record<string, "confirm" | "override" | "unclear" | null>;
}

export function RowList({ rows, emptyState, rightEdgeSlot, feedbackMap }: RowListProps) {
  // Phase 82.5 Plan 04: consume feedbackMap to render the per-row verdict dot.
  // When the prop is undefined, every row renders the dashed empty-state dot
  // (graceful default until Plan 06 page-level prefetch lands).
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  // Phase 82.7.1 Plan 02 — D-04/D-05 fade-then-unmount.
  // `pendingRemovalIds` (from selection-context) controls opacity instantly.
  // `_unmount` is a local deferred Set: a row is added 180ms after it enters
  // pendingRemovalIds (150ms fade + 30ms slop), and only then does the render
  // filter strip it. This gives the CSS opacity transition a window to play.
  // Both Approve auto-advance and Submit-override flows write to
  // pendingRemovalIds, so both inherit the fade automatically (D-05).
  const [_unmount, setUnmount] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (pendingRemovalIds.size === 0) return;
    const timers: number[] = [];
    pendingRemovalIds.forEach((id) => {
      if (_unmount.has(id)) return;
      const t = window.setTimeout(() => {
        setUnmount((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
      }, 180);
      timers.push(t);
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [pendingRemovalIds, _unmount]);

  const visible =
    _unmount.size === 0
      ? rows
      : rows.filter((r) => !_unmount.has(r.id));

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
        const isPending = pendingRemovalIds.has(r.id);
        return (
          <li
            key={r.id}
            onClick={() => setSelected(r.id)}
            role="button"
            tabIndex={0}
            aria-selected={isSelected}
            data-pending={isPending ? "true" : undefined}
            style={{
              padding: isSelected
                ? "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) - 2px)"
                : "var(--space-2) var(--space-4)",
              borderBottom: "1px solid var(--v7-border)",
              borderLeft: isSelected
                ? "2px solid var(--v7-brand-primary)"
                : "2px solid transparent",
              background: isSelected ? "var(--v7-bg-2)" : "transparent",
              cursor: isPending ? "default" : "pointer",
              display: "grid",
              gridTemplateColumns: rightEdgeSlot
                ? "140px 200px minmax(0, 1fr) 150px auto"
                : "140px 200px minmax(0, 1fr) 150px",
              alignItems: "center",
              gap: "var(--space-3)",
              position: "relative",
              // Phase 82.7.1 D-04/D-05 — 150ms ease-out fade before unmount.
              // Filter on _unmount (deferred 180ms) keeps the row in DOM for
              // the transition window. pointerEvents disabled during fade so
              // a half-faded row cannot be re-selected.
              opacity: isPending ? 0 : 1,
              transition: "opacity 150ms ease-out",
              pointerEvents: isPending ? "none" : "auto",
            }}
          >
            <RowVerdictDot verdict={feedbackMap?.[r.id] ?? null} />
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
  // Phase 82.7.1 D-12/D-13/D-15 — empty/null label renders a muted em-dash
  // placeholder chip. Same chip shell (padding, radius, font) so the row's
  // chip column always has a chip-shaped element (row rhythm preserved per
  // D-15). Brittle Stage 0 + Stage 2 mappers (page.tsx) pass r.stage_state
  // directly with no fallback; this is the renderer-side safety net.
  const trimmed = (label ?? "").toString().trim();
  const isEmpty = trimmed.length === 0;
  const { bg, fg, border } = badgeColors(variant);
  return (
    <span
      data-testid="stage-badge"
      data-variant={variant}
      data-empty={isEmpty ? "true" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: "var(--v7-radius-pill)",
        border: `1px solid ${isEmpty ? "var(--v7-muted)" : border}`,
        background: isEmpty ? "transparent" : bg,
        color: isEmpty ? "var(--v7-muted)" : fg,
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        lineHeight: 1.3,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        flexShrink: 0,
        opacity: isEmpty ? 0.7 : 1,
      }}
      aria-label={isEmpty ? "No category" : undefined}
    >
      {isEmpty ? "—" : trimmed}
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
