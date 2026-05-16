"use client";

/**
 * Phase 71-04 (REVW-01..06). Vertical N-stage data-driven pipeline.
 *
 * Implements UI-SPEC §Detail-pane vertical pipeline (N-stage):
 *   - Renders <ol> of <StageStep> from a Stage[] data array.
 *   - 30px node circles, left-anchored.
 *   - Connecting line: 2px wide, --v7-line, 15px from left edge, CSS pseudo-element.
 *   - Empty list → returns null.
 *
 * The connecting line uses an inline <style> tag scoped via a class name to
 * stay self-contained (no CSS-module file). This matches the prevailing
 * pattern of inline `style={{ ... }}` already used by detail-pane.tsx /
 * row-strip.tsx (no styled-jsx, no module CSS).
 */
import type { ReactNode } from "react";
import type { OverrideAxis } from "@/lib/pipeline-events/types";
import type { FeedbackReadBack } from "@/lib/automations/debtor-email/feedback/types";
import { StageStep } from "./stage-step";

export type StageState = "ok" | "dirty" | "skipped";

export interface StageData {
  n: number;
  title: string;
  /** axis tag ("stage_1_category" etc.); null for stages without an override axis. */
  axis: OverrideAxis | null;
  state: StageState;
  /** Current decision value (e.g. "noise", "123.4567"); rendered mono after "Current:". */
  currentValue?: string;
  /** When state==='dirty', the per-stage form widget rendered in the control area. */
  widget?: ReactNode;
  /** Phase 82.3 Plan 02 — pre-rendered audit panel ReactNode injected by
   *  per-stage renderers (Stage0EvidencePanel … Stage3EvidencePanel). Plan 07
   *  consumes this inside <StageStep> via the Show-details expander.
   *  Stage 4 always undefined per 82.3 CONTEXT.md <out_of_scope>. */
  auditDetails?: ReactNode;
  /** Phase 82.4 Plan 03 — when present (and stage.n !== 4), <StageStep>
   *  mounts a <StageFeedbackPanel> inside the audit expander wired to this
   *  email_id. Omitted when the parent has no email_id in scope (panel is
   *  skipped silently in that case). */
  emailId?: string;
  /** Phase 82.5 Plan 05 — server-prefetched per-stage feedback read-back
   *  (own_latest + others). Threaded by detail-pane.tsx from feedbackMap and
   *  consumed by <StageStep> for parent-side textarea seeding (R1) and the
   *  "others said" surface inside <StageFeedbackPanel>. */
  feedbackReadBack?: FeedbackReadBack;
}

interface PipelineFlowProps {
  stages: StageData[];
  /** Called by each StageStep when the operator clicks "override stage". */
  onMarkDirty: (stageN: number) => void;
  /** Phase 82.7 Plan 03 (D-03 per-stage) — called by each StageStep when the
   *  operator clicks the per-stage "cancel override" link inside a dirty card.
   *  Parent clears ONLY stage N's dirty flag (local state in detail-pane.tsx);
   *  prose draft notes persist. */
  onCancelDirty: (stageN: number) => void;
  /** Phase 82.5 Plan 05 (R6) — when supplied, trailing skipped stages in
   *  [startN..endN] collapse into a single "future-pill" toggle. */
  futureRange?: { startN: number; endN: number } | null;
  /** Phase 82.5 Plan 05 — controlled expansion state from detail-pane.tsx. */
  futureExpanded?: boolean;
  /** Phase 82.5 Plan 05 — toggle handler from detail-pane.tsx. */
  onToggleFuture?: () => void;
}

export function PipelineFlow({
  stages,
  onMarkDirty,
  onCancelDirty,
  futureRange,
  futureExpanded,
  onToggleFuture,
}: PipelineFlowProps) {
  if (stages.length === 0) return null;
  return (
    <>
      <style>{`
        .pf-pipeline-flow {
          position: relative;
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .pf-pipeline-flow::before {
          content: "";
          position: absolute;
          left: 15px;
          top: 15px;
          bottom: 15px;
          width: 2px;
          background: var(--v7-line);
          z-index: 0;
        }
        .pf-pipeline-flow > li {
          position: relative;
          z-index: 1;
        }
      `}</style>
      <ol className="pf-pipeline-flow flex flex-col gap-4">
        {stages.map((s) => {
          const inFutureRange =
            futureRange != null &&
            s.n >= futureRange.startN &&
            s.n <= futureRange.endN;

          if (!inFutureRange || futureExpanded) {
            return (
              <li key={s.n}>
                <StageStep
                  stage={s}
                  onMarkDirty={() => onMarkDirty(s.n)}
                  onCancelDirty={() => onCancelDirty(s.n)}
                />
              </li>
            );
          }

          // Render the pill ONCE at the first future-range stage.
          if (s.n === futureRange!.startN) {
            return (
              <li key="future-pill" data-testid="future-pill">
                <button
                  type="button"
                  onClick={onToggleFuture}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    background: "var(--v7-panel-2)",
                    border: "1px dashed var(--v7-border)",
                    borderRadius: "var(--v7-radius-pill)",
                    color: "var(--v7-text-muted)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  Stages {futureRange!.startN}-{futureRange!.endN} haven&apos;t
                  run yet · expand to override pre-emptively
                </button>
              </li>
            );
          }

          // Other future-range stages: hidden until expanded.
          return null;
        })}
        {futureExpanded && futureRange != null && (
          <li key="future-collapse">
            <button
              type="button"
              onClick={onToggleFuture}
              data-testid="future-pill-collapse"
              style={{
                width: "100%",
                padding: "6px 10px",
                background: "transparent",
                border: "none",
                color: "var(--v7-text-muted)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              Collapse future stages
            </button>
          </li>
        )}
      </ol>
    </>
  );
}
