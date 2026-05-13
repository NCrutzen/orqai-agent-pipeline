"use client";

/**
 * Phase 82.4 Plan 03 — operator feedback capture panel.
 *
 * Renders BELOW each Stage 0–3 audit body (inside the existing 82.3
 * `StageDetailExpander` content area). Captures:
 *   - free-text prose-notes (optional, ≤4000 chars; enforced again server-side)
 *   - "Save" click → POST verdict='unclear' with whatever prose was typed
 *   - "✓ Confirm" chip → POST verdict='confirm' (+ prose if any) and then
 *     fires `onAfterConfirm` so the parent stage-step can auto-collapse the
 *     expander for operator momentum.
 *
 * No Tailwind colour classes — V7 OKLCH inline-style tokens only, matching
 * the audit-surface convention (StageDetailExpander, Stage{N}EvidencePanel).
 *
 * Stage 4 is NEVER mounted here — the caller (`stage-step.tsx`) gates on
 * `stage.n !== 4` per CONTEXT.md <out_of_scope>.
 */
import { useState } from "react";

interface StageFeedbackPanelProps {
  stage: 0 | 1 | 2 | 3;
  emailId: string;
  /** Invoked after a successful (2xx) Confirm POST so the parent can collapse
   *  the surrounding StageDetailExpander. Save flow does NOT trigger it. */
  onAfterConfirm?: () => void;
  /** Phase 82.4 Plan 04 — optional controlled-prose hooks so an enclosing
   *  component (e.g. `stage-step.tsx`) can read the current textarea value
   *  at the moment an override-link is clicked and pass it as `prose_notes`
   *  to the `fireFeedback` call alongside the existing Inngest dispatch.
   *  When both are omitted, the panel falls back to internal uncontrolled
   *  state (Plan 03 behaviour). */
  value?: string;
  onValueChange?: (next: string) => void;
}

type Verdict = "confirm" | "unclear";

const FEEDBACK_ENDPOINT = "/api/automations/debtor-email/feedback";
const MAX_PROSE = 4000;

export function StageFeedbackPanel({
  stage,
  emailId,
  onAfterConfirm,
  value,
  onValueChange,
}: StageFeedbackPanelProps) {
  const [internalProse, setInternalProse] = useState("");
  const isControlled = value !== undefined && onValueChange !== undefined;
  const prose = isControlled ? (value as string) : internalProse;
  const setProse = (next: string) => {
    if (isControlled) {
      (onValueChange as (n: string) => void)(next);
    } else {
      setInternalProse(next);
    }
  };
  const [inFlight, setInFlight] = useState<null | Verdict>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const saveDisabled = prose.trim().length === 0 || inFlight !== null;
  const confirmDisabled = inFlight !== null;

  async function postFeedback(verdict: Verdict): Promise<boolean> {
    setError(null);
    setInFlight(verdict);
    const trimmed = prose.trim();
    const body: Record<string, unknown> = {
      email_id: emailId,
      stage,
      verdict,
    };
    if (trimmed.length > 0) body.prose_notes = trimmed;

    try {
      const res = await fetch(FEEDBACK_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(`Save failed (${res.status}). Try again.`);
        return false;
      }
      // Save (verdict=unclear): keep the note visible so the operator can
      // see what they wrote and continue editing. Confirm clears via the
      // auto-collapse path. The note is durable on the server either way.
      if (verdict === "confirm") setProse("");
      setSavedAt(new Date());
      return true;
    } catch {
      setError("Network error — could not save feedback.");
      return false;
    } finally {
      setInFlight(null);
    }
  }

  async function onSave() {
    await postFeedback("unclear");
  }

  async function onConfirm() {
    const ok = await postFeedback("confirm");
    if (ok) onAfterConfirm?.();
  }

  const labelStyle = {
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    color: "var(--v7-muted)",
  };

  const textareaStyle = {
    width: "100%",
    minHeight: "80px",
    fontSize: "12px",
    lineHeight: 1.4,
    padding: "var(--space-2)",
    background: "var(--v7-panel-1)",
    border: "1px solid var(--v7-line)",
    borderRadius: "var(--v7-radius-sm)",
    color: "var(--v7-text)",
    resize: "vertical" as const,
    outlineColor: "var(--v7-brand-secondary)",
    fontFamily: "inherit",
  };

  const saveBtnStyle = {
    fontSize: "12px",
    padding: "var(--space-1) var(--space-3)",
    background: "var(--v7-brand-secondary-soft)",
    color: "var(--v7-brand-secondary)",
    border: "1px solid var(--v7-brand-secondary)",
    borderRadius: "var(--v7-radius-pill)",
    cursor: saveDisabled ? ("not-allowed" as const) : ("pointer" as const),
    opacity: saveDisabled ? 0.4 : 1,
    outlineColor: "var(--v7-brand-secondary)",
  };

  const confirmBtnStyle = {
    fontSize: "12px",
    padding: "var(--space-1) var(--space-3)",
    // No --v7-lime-soft token exists; use color-mix matching the
    // --v7-brand-secondary-soft idiom (rgba-from-token) inline.
    background: "color-mix(in srgb, var(--v7-lime) 14%, transparent)",
    color: "var(--v7-lime)",
    border: "1px solid var(--v7-lime)",
    borderRadius: "var(--v7-radius-pill)",
    cursor: confirmDisabled ? ("not-allowed" as const) : ("pointer" as const),
    opacity: confirmDisabled ? 0.6 : 1,
    outlineColor: "var(--v7-brand-secondary)",
  };

  const errorStyle = {
    fontSize: "12px",
    color: "var(--v7-red)",
    marginTop: "var(--space-1)",
  };

  return (
    <div
      data-testid={`stage-feedback-panel-${stage}`}
      style={{
        padding: "var(--space-3)",
        background: "var(--v7-panel-2)",
        borderTop: "1px solid var(--v7-border)",
        marginTop: "var(--space-3)",
      }}
    >
      <label
        htmlFor={`stage-feedback-textarea-${stage}`}
        style={{ ...labelStyle, display: "block", marginBottom: "var(--space-1)" }}
      >
        Notes
      </label>
      <textarea
        id={`stage-feedback-textarea-${stage}`}
        value={prose}
        onChange={(e) => setProse(e.target.value)}
        maxLength={MAX_PROSE}
        placeholder="Add a note about this stage's decision..."
        rows={4}
        style={textareaStyle}
        disabled={inFlight !== null}
      />
      <div
        style={{
          marginTop: "var(--space-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-2)",
        }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          style={saveBtnStyle}
          aria-label={`Save feedback for Stage ${stage}`}
        >
          {inFlight === "unclear" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          style={confirmBtnStyle}
          aria-label={`Confirm Stage ${stage} looks correct`}
        >
          {inFlight === "confirm" ? "Saving…" : "✓ Confirm"}
        </button>
      </div>
      {error !== null && (
        <div role="alert" style={errorStyle}>
          {error}
        </div>
      )}
      {error === null && savedAt !== null && (
        <div
          aria-live="polite"
          style={{
            fontSize: "11px",
            color: "var(--v7-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          ✓ Saved at{" "}
          {savedAt.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}
