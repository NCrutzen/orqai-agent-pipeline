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
// Stage 1's stage_1 axis override flow (category dropdown, notes,
// eval-type radio, OverrideConfirmDialog, POST /override, optimistic
// removal, keyboard shortcuts) lives INLINE in the Stage 1 cell widget
// (_shell/components/stage-1-widget.tsx) — UnifiedDetailPane renders it
// when activeStage===1 + predictedRow is threaded. The tagging-artifacts
// surface moves to the new `extrasBelowPipeline` slot (Phase 82.1 Plan 04
// CONTEXT D-07..D-10).
//
// Phase 81 D-19 channel-name lock: the page-level AutomationRealtimeProvider
// uses `${swarmType}-review` (not `-kanban`). This file consumes that scope
// transparently.

import { useMemo } from "react";

import type {
  SwarmIntentRow,
  SwarmNoiseCategoryRow,
} from "@/lib/swarms/types";
import type {
  FeedbackMap,
  FeedbackReadBack,
} from "@/lib/automations/debtor-email/feedback/types";
import { RowList } from "../_shell/row-list";
import { UnifiedDetailPane } from "../_shell/detail-pane";
import type { StageAuditMap } from "../_shell/_lib/audit-types";
import { useSelection } from "../_shell/selection-context";
import { KeyboardShortcuts } from "../_shell/keyboard-shortcuts";
import type { Row } from "../_shell/_lib/types";
// Stage 1 uses the rich PipelineTimelineEvent shape (id/created_at/decision_details/
// override/eval_type/triggered_by/...) from page.tsx. _shell/detail-pane.tsx's
// narrower PipelineTimelineEvent declares stage+decision only (structurally
// compatible — extra fields ignored when passed through).
import type { PredictedRow, PipelineTimelineEvent } from "./page";
import { TaggingArtifactsSection } from "./components/tagging-artifacts-section";
import { PredictorChip } from "./components/PredictorChip";

interface BodyEntry {
  bodyText: string;
  bodyHtml: string | null;
}

export interface Stage1ClientShellProps {
  swarmType: string;
  /** Raw PredictedRow set from loadPageData — threaded into the inline
   *  Stage 1 widget via UnifiedDetailPane.predictedRow for the override
   *  POST + recordVerdict server-action args (Phase 82.1 Plan 04). */
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
  stageAudit?: StageAuditMap;
  mailboxLabels?: Record<number, string>;
  /** Phase 82.5 Plan 06 — server-prefetched FeedbackReadBack per email_id at
   *  stage=1 (this shell's ACTIVE_STAGE). Reduced client-side into a
   *  rowVerdictMap (row strip dots, R3) and a paneFeedbackMap (detail pane
   *  per-stage readback, R1). Optional during cross-wave landings. */
  feedbackMap?: FeedbackMap;
}

// Phase 82.5 Plan 06: ACTIVE_STAGE literal — Stage 1 (swarm_noise_categories).
const ACTIVE_STAGE = 1 as const;

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
  mailboxLabels,
  stageAudit,
  feedbackMap,
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

  // Phase 999.8 Plan 08 (D-08). Per-row predictor + confidence lookup keyed
  // by PredictedRow.id (which matches Row.id by construction in
  // toUnifiedRow). Built once per predictedRows change so the
  // RowList.rightEdgeSlot closure is O(1) per row.
  const predictorById = useMemo(() => {
    const m = new Map<
      string,
      {
        predictor: PredictedRow["predictor"];
        llmConfidence: PredictedRow["llmConfidence"];
      }
    >();
    for (const p of predictedRows) {
      if (p.predictor) {
        m.set(p.id, {
          predictor: p.predictor,
          llmConfidence: p.llmConfidence,
        });
      }
    }
    return m;
  }, [predictedRows]);

  // Phase 82.5 Plan 06 — derive rowVerdictMap for the row strip dot (R3).
  // Pattern: own_latest.verdict wins; falls back to first "other" operator's
  // verdict per loadFeedbackMap's desc-ordered scan (Pattern E / W4).
  const rowVerdictMap = useMemo<Record<string, "confirm" | "override" | "unclear" | null>>(() => {
    const out: Record<string, "confirm" | "override" | "unclear" | null> = {};
    if (!feedbackMap) return out;
    for (const [id, entry] of Object.entries(feedbackMap)) {
      out[id] = entry.own_latest?.verdict ?? entry.others[0]?.verdict ?? null;
    }
    return out;
  }, [feedbackMap]);

  // Phase 82.5 Plan 06 — derive per-stage paneFeedbackMap for UnifiedDetailPane.
  // Selected-only; ACTIVE_STAGE = 1 here.
  const paneFeedbackMap = useMemo<
    Partial<Record<0 | 1 | 2 | 3, FeedbackReadBack>> | undefined
  >(() => {
    if (!selectedId || !feedbackMap) return undefined;
    const entry = feedbackMap[selectedId];
    if (!entry) return undefined;
    return { [ACTIVE_STAGE]: entry } as Partial<Record<0 | 1 | 2 | 3, FeedbackReadBack>>;
  }, [selectedId, feedbackMap]);

  const body = selectedId ? bodyMap[selectedId] ?? null : null;
  const timeline = selectedId
    ? timelineMap[selectedId] ?? selectedTimeline ?? []
    : selectedTimeline ?? [];

  // Phase 82.1 Plan 04 (CONTEXT D-07..D-10):
  //   - The Stage 1 override picker logic (category dropdown, notes, eval-type,
  //     OverrideConfirmDialog, POST /override, optimistic removal, keyboard
  //     shortcuts) now lives INLINE in the Stage 1 cell widget at
  //     _shell/components/stage-1-widget.tsx. UnifiedDetailPane renders it
  //     automatically when activeStage===1 and predictedRow is passed.
  //   - The tagging-artifacts surface (iController tag-failure status,
  //     screenshots) moves to the new `extrasBelowPipeline` slot — narrower
  //     scope than the old taggingFailuresSection mount.
  //   - drawerFields, initialSelectedBody, initialBodyMap, initialSelectedRow,
  //     selectedTimeline still flow in for body/timeline lookups inside
  //     UnifiedDetailPane (body, timeline) — UnifiedDetailPane consumes
  //     `bodyText`/`bodyHtml`/`timeline` directly from props.
  const selectedPredictedRow = useMemo<PredictedRow | null>(() => {
    if (!selectedId) return initialSelectedRow ?? null;
    return (
      predictedRows.find((r) => r.id === selectedId) ??
      (initialSelectedRow?.id === selectedId ? initialSelectedRow : null)
    );
  }, [predictedRows, selectedId, initialSelectedRow]);
  // drawerFields + initialSelectedBody flow in from the RSC for symmetry with
  // the surface contract but are no longer consumed inside this file (bodyMap
  // covers the cache, selectedTimeline covers the timeline fallback). Marked
  // void to keep the prop API stable for downstream callers without TS
  // unused-locals noise.
  void drawerFields;
  void initialSelectedBody;
  const extrasBelowPipeline = (
    <TaggingArtifactsSection row={selectedPredictedRow} />
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
            gridTemplateColumns: "minmax(640px, 1fr) 540px",
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
            feedbackMap={rowVerdictMap}
            mailboxLabels={mailboxLabels}
            rightEdgeSlot={(row) => {
              // Phase 999.8 Plan 08 (D-08, D-12). Per-row predictor chip
              // mounted via the canonical RowList rightEdgeSlot extension
              // point (Phase 82 D-04). Hard-separation: looks up the Stage 1
              // PredictedRow (noise classifier output) by id; never reads
              // Stage 3 intent state. PredictorChip returns null for
              // pre-cutover rows (predictor undefined) so RowList renders
              // no empty cell.
              const p = predictorById.get(row.id);
              if (!p) return null;
              return (
                <PredictorChip
                  predictor={p.predictor}
                  llmConfidence={p.llmConfidence}
                />
              );
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
            extrasBelowPipeline={extrasBelowPipeline}
            predictedRow={selectedPredictedRow}
            stageAudit={stageAudit}
            mailboxLabels={mailboxLabels}
            feedbackMap={paneFeedbackMap}
            // Phase 82.7 Plan 04 (D-01) — same operator-filtered visible list
            // that drives <RowList> above (post-mailbox filter, pre-pendingRemoval
            // trim). Used by detail-pane's handlePrimary Approve branch to
            // compute the next selection target. Threading the .id array (not
            // the full Row[]) keeps the prop surface narrow.
            visibleRowIds={visibleUnified.map((r) => r.id)}
          />
        </div>
      </div>
    </>
  );
}
