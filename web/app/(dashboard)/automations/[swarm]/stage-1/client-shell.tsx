"use client";

// Phase 82 Plan 06 — Stage 1 client shell wrapper.
//
// Bridges the RSC page (predicted rows + noise categories + intents +
// pre-fetched body/timeline maps + tagging-failure enrichment) to the unified
// _shell/ primitives. The client wrapper is needed because UnifiedDetailPane
// consumes the current `selectedId` from selection-context to know which row
// to render, and Stage 1's row-list / mailbox-filter coordination is local.
//
// Hard-separation contract (docs/agentic-pipeline/README.md):
//   - `categories` prop  = swarm_noise_categories (Stage 1 widget + override
//     dropdown source). Hard-separation lock: Stage 1 reads noise categories
//     ONLY.
//   - `intents` prop = swarm_intents — flows through to the embedded Stage 3
//     widget inside the unified pipeline cells. SEPARATE prop at the type
//     level (UnifiedDetailPane API).
//   - activeStage = 1 so the Stage 1 cell is pre-expanded.
//
// Stage 1's full 4-axis bulk-review override flow (notes, eval-type radio,
// confirm dialog, IC banner, tagging artifacts, body cache) is preserved
// inside <Stage1OverridePane>, mounted via UnifiedDetailPane's
// taggingFailuresSection slot. Same pattern Stage 4 used for its
// Stage4HandlerErrorWidget.
//
// Phase 81 D-19 channel-name lock: the page-level AutomationRealtimeProvider
// uses `${swarmType}-review` (not `-kanban`). This file consumes that scope
// transparently.

import { useMemo } from "react";

import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import { RowList } from "../_shell/row-list";
import { UnifiedDetailPane } from "../_shell/detail-pane";
import { useSelection } from "../_shell/selection-context";
import { KeyboardShortcuts } from "../_shell/keyboard-shortcuts";
import type { Row } from "../_shell/_lib/types";
// Stage 1 uses the rich PipelineTimelineEvent shape (id/created_at/decision_details/
// override/eval_type/triggered_by/...) from page.tsx — the embedded
// Stage1OverridePane consumes those fields for the full 4-axis override flow.
// _shell/detail-pane.tsx's narrower PipelineTimelineEvent declares stage+decision
// only (structurally compatible — extra fields ignored when passed through).
import type { PredictedRow, PipelineTimelineEvent } from "./page";
import { Stage1OverridePane } from "./stage-1-override-pane";

interface BodyEntry {
  bodyText: string;
  bodyHtml: string | null;
}

export interface Stage1ClientShellProps {
  swarmType: string;
  /** Raw PredictedRow set from loadPageData — fed into Stage1OverridePane for
   *  its full override-flow logic (advance-on-verdict, optimistic removal). */
  predictedRows: PredictedRow[];
  /** Unified Row[] for _shell/RowList rendering. */
  unifiedRows: Row[];
  initialSelectedRow: PredictedRow | null;
  categories: SwarmNoiseCategoryRow[];
  intents: SwarmIntentRow[];
  selectedMailboxes: number[];
  bodyMap: Record<string, BodyEntry>;
  timelineMap: Record<string, PipelineTimelineEvent[]>;
  initialSelectedBody: BodyEntry | null;
  selectedTimeline: PipelineTimelineEvent[];
  drawerFields: string[];
}

export function Stage1ClientShell({
  swarmType,
  predictedRows,
  unifiedRows,
  initialSelectedRow,
  categories,
  intents,
  selectedMailboxes,
  bodyMap,
  timelineMap,
  initialSelectedBody,
  selectedTimeline,
  drawerFields,
}: Stage1ClientShellProps) {
  const { selectedId } = useSelection();

  // Apply mailbox filter client-side. Server-rendered list is the full set;
  // URL ?mailbox= params narrow it. Mirrors Stage 3/4 behavior.
  const visibleUnified = useMemo(() => {
    if (selectedMailboxes.length === 0) return unifiedRows;
    const allowed = new Set(selectedMailboxes);
    return unifiedRows.filter(
      (r) => r.mailbox_id !== null && allowed.has(r.mailbox_id),
    );
  }, [unifiedRows, selectedMailboxes]);

  const selectedUnified: Row | null = useMemo(() => {
    if (!selectedId) return null;
    return visibleUnified.find((r) => r.id === selectedId) ?? null;
  }, [visibleUnified, selectedId]);

  const body = selectedId ? bodyMap[selectedId] ?? null : null;
  const timeline = selectedId
    ? timelineMap[selectedId] ?? selectedTimeline ?? []
    : selectedTimeline ?? [];

  // The Stage1OverridePane internally renders the meta grid, body expander,
  // tagging artifacts, 4-axis pipeline overrides, notes, eval-type, confirm
  // dialog, IC banner, and the keyboard-shortcut wiring for approve/reject/
  // skip/override-submit/override-discard/eval-type/stage-N-focus. Mounted
  // inside UnifiedDetailPane's taggingFailuresSection slot so the
  // _shell-canonical chrome (5-cell PipelineFlow + body toggle + action
  // footer) renders ABOVE it. This preserves all Phase 71 + Phase 81
  // behaviors verbatim while keeping the page composition on the unified
  // shell (CONTEXT D-08 — Phase 71 + Phase 81 surfaces preserved as slots).
  const overrideFlowSlot = (
    <Stage1OverridePane
      rows={predictedRows}
      initialSelectedRow={initialSelectedRow}
      swarmType={swarmType}
      categories={categories}
      drawerFields={drawerFields}
      selectedTimeline={selectedTimeline}
      timelineMap={timelineMap}
      intents={intents}
      initialSelectedBody={initialSelectedBody}
      initialBodyMap={bodyMap}
    />
  );

  return (
    <>
      <KeyboardShortcuts rowIds={visibleUnified.map((r) => r.id)} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          padding: "var(--space-4)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(380px,460px) 1fr",
            gap: "var(--space-3)",
            minHeight: 320,
          }}
        >
          <RowList
            rows={visibleUnified}
            emptyState={{
              title: "Nothing to review",
              body: "Predicted classifications appear here as the ingest route writes them.",
            }}
          />
          {/* Hard-separation: Stage 1 detail pane receives `categories` (for
              the Stage 1 widget — noise category override) AND `intents` (for
              the embedded Stage 3 widget when an operator promotes the
              override flow to Stage 3). SEPARATE props — never collapsed
              (RFC docs/agentic-pipeline/README.md). */}
          <UnifiedDetailPane
            row={selectedUnified}
            swarmType={swarmType}
            activeStage={1}
            categories={categories}
            intents={intents}
            timeline={timeline}
            bodyText={body?.bodyText ?? null}
            bodyHtml={body?.bodyHtml ?? null}
            taggingFailuresSection={overrideFlowSlot}
          />
        </div>
      </div>
    </>
  );
}
