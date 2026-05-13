"use client";

// Client wrapper around UnifiedDetailPane for the Option Z pages
// (Stage 0 + Stage 2). The shared SelectionProvider syncs selection via
// history.replaceState — so a server-rendered <UnifiedDetailPane row=...>
// would never update after the first click. This wrapper reads selectedId
// from useSelection() and picks the right row + body + timeline from maps
// the server pre-fetched for the visible page.

import { useMemo } from "react";
import {
  UnifiedDetailPane,
  type PipelineTimelineEvent,
} from "./detail-pane";
import { useSelection } from "./selection-context";
import { buildStageAuditMap } from "./_lib/build-stage-audit-map";
import type { Row } from "./_lib/types";

export interface FullTimelineEvent extends PipelineTimelineEvent {
  decision_details: Record<string, unknown> | null;
}

interface Props {
  swarmType: string;
  activeStage: 0 | 1 | 2 | 3 | 4;
  rows: Row[];
  bodyMap: Record<string, string | null>;
  timelineMap: Record<string, FullTimelineEvent[]>;
  mailboxLabels?: Record<number, string>;
  /** Phase 82.5 Plan 06 — full per-email feedback read-back map. Optional and
   *  accepted-but-mostly-passthrough at this layer; Plan 07 consumes it to
   *  derive per-stage paneFeedbackMap from useSelection() and forward to
   *  UnifiedDetailPane. Threading the prop through Plan 06 first lets Plan 07
   *  land the consumer wiring without touching the four stage pages. */
  feedbackMap?: import("@/lib/automations/debtor-email/feedback/types").FeedbackMap;
}

export function OptionZDetailPane({
  swarmType,
  activeStage,
  rows,
  bodyMap,
  timelineMap,
  mailboxLabels,
  feedbackMap,
}: Props) {
  // Phase 82.5 Plan 06: prop accepted for forward-compatibility; Plan 07 wires
  // the per-stage paneFeedbackMap derivation. Marked void to keep TS quiet.
  void feedbackMap;
  const { selectedId } = useSelection();

  const { row, bodyText, timeline } = useMemo(() => {
    if (!selectedId) {
      return { row: null, bodyText: null, timeline: [] as FullTimelineEvent[] };
    }
    const r = rows.find((x) => x.id === selectedId) ?? null;
    return {
      row: r,
      bodyText: r ? bodyMap[r.id] ?? null : null,
      timeline: r ? timelineMap[r.id] ?? [] : [],
    };
  }, [selectedId, rows, bodyMap, timelineMap]);

  return (
    <UnifiedDetailPane
      row={row}
      swarmType={swarmType}
      activeStage={activeStage}
      // Stage 0 + Stage 2 sit outside both registries — hard-separation lock.
      categories={[]}
      intents={[]}
      timeline={timeline}
      bodyText={bodyText}
      stageAudit={buildStageAuditMap({
        timeline,
        agentRuns: [],
        automationRun: null,
      })}
      mailboxLabels={mailboxLabels}
    />
  );
}
