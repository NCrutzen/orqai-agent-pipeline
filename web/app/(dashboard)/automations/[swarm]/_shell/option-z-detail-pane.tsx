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
import type {
  FeedbackMap,
  FeedbackReadBack,
} from "@/lib/automations/debtor-email/feedback/types";

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
  /** Phase 82.5 Plan 07 — full per-email feedback read-back map. Threaded
   *  through to <UnifiedDetailPane> via paneFeedbackMap reduction below; this
   *  gives Stage 0 + Stage 2 panes R1 read-back + R6 future-pill + R7
   *  bottom-button morph parity with Stage 1/3 (SPEC R6: "Same behavior on all
   *  4 stage tabs"). The wrapper still passes `categories=[]` and `intents=[]`
   *  to UnifiedDetailPane — hard-separation contract preserved (Stage 0/2 sit
   *  outside both registries). feedbackMap is orthogonal: keyed on
   *  email_feedback.(email_id, stage). */
  feedbackMap?: FeedbackMap;
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

  // Phase 82.5 Plan 07 — derive per-stage paneFeedbackMap so UnifiedDetailPane
  // can render R1 read-back / R6 future-pill / R7 bottom-button morph on
  // Stage 0 + Stage 2 panes with the same behavior as Stage 1/3. Guard:
  // undefined when no selection, no map, or activeStage > 3 (Stage 4 has no
  // feedback read-back surface).
  const paneFeedbackMap = useMemo<
    Partial<Record<0 | 1 | 2 | 3, FeedbackReadBack>> | undefined
  >(() => {
    if (!selectedId || !feedbackMap || activeStage > 3) return undefined;
    const entry = feedbackMap[selectedId];
    if (!entry) return undefined;
    return { [activeStage]: entry } as Partial<
      Record<0 | 1 | 2 | 3, FeedbackReadBack>
    >;
  }, [selectedId, feedbackMap, activeStage]);

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
      feedbackMap={paneFeedbackMap}
    />
  );
}
