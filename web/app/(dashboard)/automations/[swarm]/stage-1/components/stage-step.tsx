"use client";

/**
 * Phase 71-04 (REVW-01..06). Single stage node + control area.
 *
 * Implements UI-SPEC §Detail-pane vertical pipeline (N-stage):
 *   - 30×30 node circle on the left; border colour by state
 *     (ok → --v7-lime, dirty → --override (--v7-amber), skipped/neutral → --v7-line).
 *   - Title row + monospace axis tag.
 *   - "Current: {value}" muted line.
 *   - Control area:
 *       * state==='ok'  → "✓ Looks correct" + inline link "override stage" (right-aligned).
 *       * state==='dirty' → renders stage.widget.
 *       * state==='skipped' → "— Stage skipped".
 *   - Visually-hidden span announces state for screen readers; aria-hidden on the circle.
 */
import type { StageData } from "./pipeline-flow";
import { StageDetailExpander } from "@/components/automations/bulk-review/audit/StageDetailExpander";

interface StageStepProps {
  stage: StageData;
  onMarkDirty: () => void;
}

function nodeBorderColor(state: StageData["state"]): string {
  if (state === "ok") return "var(--v7-lime)";
  if (state === "dirty") return "var(--v7-amber)";
  return "var(--v7-line)";
}

export function StageStep({ stage, onMarkDirty }: StageStepProps) {
  const announce =
    stage.state === "dirty"
      ? `Stage ${stage.n} — overridden`
      : stage.state === "ok"
        ? `Stage ${stage.n} — ok`
        : `Stage ${stage.n} — skipped`;

  return (
    <div className="flex gap-3 items-start">
      {/* Node circle */}
      <div
        aria-hidden="true"
        className="shrink-0 inline-flex items-center justify-center font-mono text-[12px] font-semibold"
        style={{
          width: 30,
          height: 30,
          borderRadius: "50%",
          border: `2px solid ${nodeBorderColor(stage.state)}`,
          background: "var(--v7-bg-2)",
          color: "var(--v7-text)",
        }}
      >
        {stage.n}
      </div>

      <span className="sr-only">{announce}</span>

      <div className="flex flex-col gap-1 min-w-0 flex-1">
        {/* Title row + axis tag */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[14px] font-semibold leading-[1.3]">
            Stage {stage.n} — {stage.title}
          </span>
          {stage.axis && (
            <code
              className="text-[11px] font-mono px-1.5 py-0.5 rounded-[var(--v7-radius-pill)]"
              style={{
                background: "var(--v7-panel-2)",
                color: "var(--v7-muted)",
              }}
            >
              {stage.axis}
            </code>
          )}
        </div>

        {/* Current value */}
        {stage.currentValue !== undefined && (
          <div
            className="text-[12px] leading-[1.3] font-mono"
            style={{ color: "var(--v7-muted)" }}
          >
            Current: <span style={{ color: "var(--v7-text)" }}>{stage.currentValue}</span>
          </div>
        )}

        {/* Phase 82.3 Plan 07 — per-stage audit expander. Renders between the
            Current line and the override control area for Stages 0–3 only.
            Stage 4 is excluded per 82.3 CONTEXT.md <out_of_scope>. */}
        {stage.auditDetails != null && stage.n !== 4 && (
          <div className="mt-2">
            <StageDetailExpander stage={stage.n as 0 | 1 | 2 | 3}>
              {stage.auditDetails}
            </StageDetailExpander>
          </div>
        )}

        {/* Control area */}
        <div className="mt-1">
          {stage.state === "ok" && (
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[12px] leading-[1.3]"
                style={{ color: "var(--v7-lime)" }}
              >
                ✓ Looks correct
              </span>
              <button
                type="button"
                onClick={onMarkDirty}
                className="text-[12px] leading-[1.3] underline-offset-2 hover:underline transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  color: "var(--v7-brand-secondary)",
                  outlineColor: "var(--v7-brand-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--v7-brand-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--v7-brand-secondary)";
                }}
                aria-label={`Override Stage ${stage.n}`}
              >
                override stage
              </button>
            </div>
          )}
          {stage.state === "dirty" && stage.widget}
          {stage.state === "skipped" && (
            // Phase 71-07: even for stages that never ran, the operator can
            // still override (the override row IS the first decision). Show
            // the same "override stage" affordance as the 'ok' branch.
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-[12px] leading-[1.3]"
                style={{ color: "var(--v7-muted)", opacity: 0.7 }}
              >
                Stage didn't run — override to set
              </span>
              <button
                type="button"
                onClick={onMarkDirty}
                className="text-[12px] leading-[1.3] underline-offset-2 hover:underline transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  color: "var(--v7-brand-secondary)",
                  outlineColor: "var(--v7-brand-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--v7-brand-primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--v7-brand-secondary)";
                }}
                aria-label={`Override Stage ${stage.n}`}
              >
                override stage
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
