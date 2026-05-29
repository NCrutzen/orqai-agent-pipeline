"use client";

// Phase 2 Plan 02-01 — RowStripList (list wrapper for the new 5-cell strip).
//
// Consumes BulkReviewRow[] (not the legacy Row shape) and mounts the
// InlineExpandRow inline below the selected row's RowStrip (sketch 002
// "one row open at a time" invariant — opening row B collapses row A
// because useSelection().selectedId is a single value).
//
// Fade-then-unmount logic copied from row-list.tsx Phase 82.7.1 D-04/D-05
// — keep in sync if RowList changes.

import { useEffect, useState } from "react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import { useSelection } from "../selection-context";
import { RowStrip } from "./row-strip";
import { InlineExpandRow } from "./inline-expand-row";
import { Stage0Read } from "./stage-0-read";
import { Stage0Decide } from "./stage-0-decide";
import { Stage1Read } from "./stage-1-read";
// Phase 3 Plan 01 Task 2 (P3-D-01): Stage1Decide replaces Stage1FeedbackWidget
// on the override path. The legacy widget file stays on disk so Phase 2's
// /feedback route + tests continue to work for the back-compat confirm path
// (Plan 03 cleanup decides its final fate).
import { Stage1Decide } from "./stage-1-decide";
import { Stage2Read } from "./stage-2-read";
// Phase 3 Plan 02 Task 2 — Stage 2 Decide column (axis-2 customer override).
import { Stage2Decide } from "./stage-2-decide";
import { Stage3Read } from "./stage-3-read";
import { Stage3Decide } from "./stage-3-decide";
// Phase 3 Plan 01 Task 3 (P3-D-06): Stage 4 Read + Decide columns. Decide
// wraps the existing Stage4Widget + AuditBlock + submitStage4Handler.
import { Stage4Read } from "./stage-4-read";
import { Stage4Decide } from "./stage-4-decide";

export interface RowStripListProps {
  rows: BulkReviewRow[];
  mailboxLabels?: Record<string, string>;
  /** Per-row sender label (optional). Caller resolves from email_pipeline.emails. */
  senderLabels?: Record<string, string>;
  /** Per-row subject (optional). Caller resolves from email_pipeline.emails. */
  subjectLabels?: Record<string, string>;
  /** Per-row ISO timestamp (optional). Caller resolves from email_pipeline.emails. */
  timestamps?: Record<string, string>;
  /**
   * Phase 2 Plan 02-04 — Stage 1 noise-category registry rows, threaded
   * through to the Stage1FeedbackWidget Decide column. Server Component
   * loader (loadSwarmNoiseCategories) is the source of truth; this list
   * never round-trips to the registry from the client (P1-D-02).
   * Optional so test-only RowStripList renders (Plan 02-01 tests) keep
   * working with `[]`-default category lists.
   */
  noiseCategories?: SwarmNoiseCategoryRow[];
  /**
   * Phase 3 Plan 02 Task 1 — visible email_id set currently in mid-re-run.
   * Forwarded to each RowStrip (pulse on Stage 3/4 cells) AND to
   * InlineExpandRow (disable Stage 3/4 tabs). When omitted, behavior
   * degrades to no pulse / no disable (legacy per-stage routes).
   */
  rerunInFlightIds?: ReadonlySet<string>;
  /**
   * Phase 5 Plan 05-01 Task 2 (D-02) — per-row email projection maps keyed by
   * email_label_id (same key precedent as senderLabels). Threaded into the
   * selected row's InlineExpandRow so EmailBodyBlock renders the real body +
   * thread launcher. Caller (client-shell) resolves these from loadReviewPageData.
   */
  bodyByRow?: Record<string, string | null>;
  conversationByRow?: Record<string, string | null>;
  messageCountByRow?: Record<string, number | null>;
  /** Swarm-type forwarded to EmailBodyBlock's ThreadModal. */
  swarmType?: string;
  /**
   * Phase 5 Plan 05-03 (D-06) — per-row dry_run flag keyed by email_label_id
   * (Plan 01 loader output, default true). Looked up per row to drive the
   * RowStrip "Auto-applied" lime marker (isLive = dryRunByRow[id] === false).
   * Same ?.[id] precedent as the other per-row maps.
   */
  dryRunByRow?: Record<string, boolean>;
  /**
   * Phase 5 Plan 05-03 (D-09) — History read-only browse posture. When true,
   * each RowStrip surfaces a "Corrigeer" affordance (amber) that expands the
   * row, opening the SAME per-axis Decide controls the Queue uses. The
   * correction itself flows through the existing override-actions (mounted in
   * the InlineExpandRow Decide columns) — no new write path. Default false
   * (Queue posture: clicking the row body expands it).
   */
  correctionMode?: boolean;
}

export function RowStripList({
  rows,
  mailboxLabels,
  senderLabels,
  subjectLabels,
  timestamps,
  noiseCategories = [],
  rerunInFlightIds,
  bodyByRow,
  conversationByRow,
  messageCountByRow,
  swarmType,
  dryRunByRow,
  correctionMode = false,
}: RowStripListProps) {
  const { selectedId, setSelected, pendingRemovalIds } = useSelection();

  // COPIED from row-list.tsx Phase 82.7.1 D-04/D-05 — keep in sync if RowList
  // changes. The pendingRemovalIds set drives opacity instantly; the local
  // _unmount Set is bumped 180ms later so the CSS opacity transition (150ms
  // ease-out + 30ms slop) has a window to play before the row leaves the DOM.
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
      : rows.filter((r) => !_unmount.has(r.email_label_id));

  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {visible.map((row) => {
        const id = row.email_label_id;
        const isSelected = selectedId === id;
        const isPending = pendingRemovalIds.has(id);
        const mailboxKey = mailboxLabels?.[id];
        return (
          <li
            key={id}
            data-testid="row-strip-list-item"
            data-row-id={id}
            data-pending={isPending ? "true" : undefined}
            style={{
              opacity: isPending ? 0 : 1,
              transition: "opacity 150ms ease-out",
              pointerEvents: isPending ? "none" : "auto",
            }}
          >
            <RowStrip
              row={row}
              mailboxLabel={mailboxKey ?? null}
              senderLabel={senderLabels?.[id] ?? null}
              subjectLabel={subjectLabels?.[id] ?? null}
              timestamp={timestamps?.[id] ?? null}
              isSelected={isSelected}
              onClick={() => setSelected(isSelected ? null : id)}
              rerunInFlightIds={rerunInFlightIds}
              isLive={dryRunByRow?.[id] === false}
              correctionMode={correctionMode}
            />
            {isSelected ? (
              <InlineExpandRow
                row={row}
                rerunInFlight={
                  row.email_id !== null &&
                  rerunInFlightIds?.has(row.email_id) === true
                }
                bodyText={bodyByRow?.[id] ?? null}
                conversationId={conversationByRow?.[id] ?? null}
                messageCount={messageCountByRow?.[id] ?? null}
                swarmType={swarmType}
                stage0Content={{
                  read: <Stage0Read row={row} />,
                  decide: <Stage0Decide row={row} />,
                }}
                stage1Content={{
                  read: <Stage1Read row={row} />,
                  decide: (
                    <Stage1Decide
                      row={row}
                      categories={noiseCategories}
                    />
                  ),
                }}
                stage2Content={{
                  read: <Stage2Read row={row} />,
                  decide: <Stage2Decide row={row} />,
                }}
                stage3Content={{
                  read: <Stage3Read row={row} />,
                  decide: <Stage3Decide row={row} />,
                }}
                stage4Content={{
                  read: <Stage4Read row={row} />,
                  decide: <Stage4Decide row={row} />,
                }}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
