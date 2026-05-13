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
import { useEffect, useState } from "react";
import type { StageData } from "./pipeline-flow";
import { StageDetailExpander } from "@/components/automations/bulk-review/audit/StageDetailExpander";
import { StageFeedbackPanel } from "@/components/automations/bulk-review/audit/StageFeedbackPanel";
import { fireFeedback } from "@/lib/automations/debtor-email/feedback/fire-feedback";

interface StageStepProps {
  stage: StageData;
  onMarkDirty: () => void;
}

/**
 * Phase 82.4 Plan 04 — exported for callers (Stage widgets) that submit an
 * override and want the matching `email_feedback` row written alongside the
 * existing Inngest override dispatch. Fire-and-forget; never throws.
 *
 * Stage-step itself uses `fireFeedback` directly on the "override stage"
 * link clicks to record the override INTENT (no corrected_value yet — the
 * widget submit produces a follow-up row with `corrected_value`).
 */
export function fireOverrideFeedback(
  emailId: string,
  stage: 0 | 1 | 2 | 3,
  corrected_value: string,
  prose_notes?: string,
): void {
  void fireFeedback({
    email_id: emailId,
    stage,
    verdict: "override",
    corrected_value,
    ...(prose_notes && prose_notes.trim().length > 0
      ? { prose_notes: prose_notes.trim() }
      : {}),
  });
}

function nodeBorderColor(state: StageData["state"]): string {
  if (state === "ok") return "var(--v7-lime)";
  if (state === "dirty") return "var(--v7-amber)";
  return "var(--v7-line)";
}

export function StageStep({ stage, onMarkDirty }: StageStepProps) {
  // Phase 82.4 Plan 03 — lift the audit-expander open-state up so the
  // embedded StageFeedbackPanel's ✓ Confirm chip can auto-collapse the
  // expander after a successful POST (operator-momentum). Defaults closed
  // to match the original uncontrolled behaviour.
  const [auditOpen, setAuditOpen] = useState(false);

  // Phase 82.4 Plan 04 — lift the StageFeedbackPanel's prose textarea state
  // up so that an "override stage" link click can read the current value and
  // pass it as `prose_notes` to fireFeedback() alongside the existing
  // Inngest override dispatch (preserved unchanged via onMarkDirty).
  const [proseNotes, setProseNotes] = useState("");

  // Phase 82.5 Plan 05 — parent-side seeding of the controlled textarea
  // (R1 read-back). The PANEL stays pure controlled; this useEffect is the
  // SINGLE seeding point. We only seed when local state is the empty default
  // so we don't clobber an operator's explicit clear.
  useEffect(() => {
    const seed = stage.feedbackReadBack?.own_latest?.prose_notes;
    if (seed && seed.length > 0 && proseNotes.length === 0) {
      setProseNotes(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage.emailId, stage.n]);

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
            <StageDetailExpander
              stage={stage.n as 0 | 1 | 2 | 3}
              open={auditOpen}
              onOpenChange={setAuditOpen}
            >
              {stage.auditDetails}
              {/* Phase 82.4 Plan 03 — operator feedback capture surface mounted
                  INSIDE the audit expander. Skipped silently when emailId is
                  not threaded from the parent. Stage 4 already excluded by
                  the outer guard. */}
              {stage.emailId && (
                <StageFeedbackPanel
                  stage={stage.n as 0 | 1 | 2 | 3}
                  emailId={stage.emailId}
                  onAfterConfirm={() => setAuditOpen(false)}
                  value={proseNotes}
                  onValueChange={setProseNotes}
                  initialReadBack={stage.feedbackReadBack ?? null}
                />
              )}
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
                onClick={() => {
                  // Phase 82.4 Plan 04 — record override INTENT alongside the
                  // existing Phase 71/82 Inngest override.submitted dispatch.
                  // onMarkDirty() runs first and unchanged; fireFeedback is
                  // fire-and-forget and never throws.
                  onMarkDirty();
                  if (stage.emailId && stage.n !== 4) {
                    void fireFeedback({
                      email_id: stage.emailId,
                      stage: stage.n as 0 | 1 | 2 | 3,
                      verdict: "override",
                      ...(proseNotes.trim().length > 0
                        ? { prose_notes: proseNotes.trim() }
                        : {}),
                    });
                  }
                }}
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
          {stage.state === "dirty" && (
            <>
              {stage.widget}
              {/* Phase 82.5 Plan 05 — R4 second placement (under override
                  picker). First copy ships in Plan 03 under the textarea
                  label. CONTEXT D-1 Discretion: two copies total, no third. */}
              <div
                data-testid="override-coupling-helper-picker"
                style={{
                  marginTop: 4,
                  color: "var(--v7-amber)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-xs)",
                }}
              >
                ⤓ Override + note save together
              </div>
            </>
          )}
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
                onClick={() => {
                  // Phase 82.4 Plan 04 — same additive feedback row as the
                  // state==='ok' branch. See comment there.
                  onMarkDirty();
                  if (stage.emailId && stage.n !== 4) {
                    void fireFeedback({
                      email_id: stage.emailId,
                      stage: stage.n as 0 | 1 | 2 | 3,
                      verdict: "override",
                      ...(proseNotes.trim().length > 0
                        ? { prose_notes: proseNotes.trim() }
                        : {}),
                    });
                  }
                }}
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
