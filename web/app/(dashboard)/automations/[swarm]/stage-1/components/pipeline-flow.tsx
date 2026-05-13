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
}

interface PipelineFlowProps {
  stages: StageData[];
  /** Called by each StageStep when the operator clicks "override stage". */
  onMarkDirty: (stageN: number) => void;
}

export function PipelineFlow({ stages, onMarkDirty }: PipelineFlowProps) {
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
        {stages.map((s) => (
          <li key={s.n}>
            <StageStep stage={s} onMarkDirty={() => onMarkDirty(s.n)} />
          </li>
        ))}
      </ol>
    </>
  );
}
