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
}

export function OptionZDetailPane({
  swarmType,
  activeStage,
  rows,
  bodyMap,
  timelineMap,
}: Props) {
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
    />
  );
}
