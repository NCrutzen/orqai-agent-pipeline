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
import { useEffect, useState } from "react";

import type { FeedbackReadBack } from "@/lib/automations/debtor-email/feedback/types";

import { OthersSaidBlock } from "./OthersSaidBlock";

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
  /** Phase 82.5 Plan 03 — server-prefetched read-back metadata for rendering
   *  the verdict chip + ✓ Saved-at indicator + "What others said (N)" toggle.
   *  Does NOT seed the textarea — `value` is parent-owned (stage-step.tsx
   *  Plan 05 Task 1 is the seeder). The panel is a pure controlled component
   *  on the prose state; this prop is metadata-only. */
  initialReadBack?: FeedbackReadBack | null;
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
  initialReadBack,
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
  // Phase 82.5 Plan 03 — readBack is metadata-only (chip + others list).
  // It is NEVER used to seed `prose`; parent (stage-step.tsx) owns seeding.
  const [readBack, setReadBack] = useState<FeedbackReadBack | null>(
    initialReadBack ?? null,
  );
  const [othersOpen, setOthersOpen] = useState<boolean>(false);

  // Sync metadata only on row identity change. Do NOT call setProse here —
  // doing so would break the controlled-component contract and double-seed
  // with Plan 05's parent-side useEffect on stage-step.tsx.
  useEffect(() => {
    setReadBack(initialReadBack ?? null);
    setOthersOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailId, stage]);

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
      // R2 refresh-after-write — refetch GET endpoint and merge into local
      // readBack state (chip + others block re-render). Non-fatal on failure.
      try {
        const r = await fetch(
          `${FEEDBACK_ENDPOINT}?email_id=${encodeURIComponent(emailId)}&stage=${stage}`,
          { method: "GET", credentials: "same-origin" },
        );
        if (r.ok) {
          const fresh = (await r.json()) as FeedbackReadBack;
          setReadBack(fresh);
        }
      } catch {
        // Refresh failure is non-fatal; the write already succeeded.
      }
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
    // R5 soft-confirm guard: empty prose → window.confirm() before posting.
    if (prose.trim().length === 0) {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Confirm this stage without writing a note?")
      ) {
        return;
      }
    }
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
      {/* R5 CONTEXT Discretion: below 1366px viewport collapse the subtitle
          row of Save/Confirm — icons + data-testid identification persist. */}
      <style>
        {`@media (max-width: 1365px) {
  [data-testid="stage-feedback-save"] [data-row="primary"],
  [data-testid="stage-feedback-confirm"] [data-row="primary"] {
    display: none;
  }
}`}
      </style>
      <label
        htmlFor={`stage-feedback-textarea-${stage}`}
        style={{ ...labelStyle, display: "block", marginBottom: "var(--space-1)" }}
      >
        Notes
      </label>
      {/* R4 — persistent microcopy showing override+note coupling. */}
      <div
        data-testid="override-coupling-helper"
        style={{
          marginTop: 2,
          marginBottom: 6,
          color: "var(--v7-amber)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
        }}
      >
        ⤓ Override + note save together
      </div>
      <textarea
        id={`stage-feedback-textarea-${stage}`}
        value={prose}
        onChange={(e) => setProse(e.target.value)}
        onKeyDown={(e) => {
          // W4 — ⌘+s / Ctrl+s → Save (preventDefault to avoid browser save).
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            e.stopPropagation();
            void postFeedback("unclear");
            return;
          }
          // Esc → blur + close expander; draft persists via parent-owned value.
          if (e.key === "Escape") {
            e.stopPropagation();
            (e.currentTarget as HTMLTextAreaElement).blur();
            onAfterConfirm?.();
            return;
          }
          // `n` / Enter MUST NOT bubble to the document-level shortcut handler
          // while the textarea is focused — let them flow as normal typing.
          if (e.key === "n" || e.key === "Enter") {
            e.stopPropagation();
          }
        }}
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
        {/* R5 Save — outline treatment with 💾 + microcopy subtitle. */}
        <button
          type="button"
          data-testid="stage-feedback-save"
          data-variant="save"
          onClick={onSave}
          disabled={inFlight !== null}
          aria-label={`Save feedback for Stage ${stage}`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid var(--v7-brand-secondary)",
            borderRadius: "var(--v7-radius-pill)",
            color: "var(--v7-brand-secondary)",
            cursor: inFlight !== null ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)",
            opacity: inFlight !== null ? 0.6 : 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14 }}>
            {inFlight === "unclear" ? "…" : "💾"}
          </span>
          <span data-row="primary" style={{ fontSize: 12 }}>
            Save note · come back later
          </span>
        </button>
        {/* R5 Confirm — filled lime with ✓ + microcopy subtitle. */}
        <button
          type="button"
          data-testid="stage-feedback-confirm"
          data-variant="confirm"
          onClick={onConfirm}
          disabled={confirmDisabled}
          aria-label={`Confirm Stage ${stage} looks correct`}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            padding: "8px 14px",
            background: "var(--v7-lime)",
            border: "1px solid var(--v7-lime)",
            borderRadius: "var(--v7-radius-pill)",
            color: "var(--v7-bg)",
            cursor: confirmDisabled ? "not-allowed" : "pointer",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
            opacity: confirmDisabled ? 0.6 : 1,
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 14 }}>
            {inFlight === "confirm" ? "…" : "✓"}
          </span>
          <span data-row="primary" style={{ fontSize: 12 }}>
            Confirm · looks right
          </span>
        </button>
      </div>
      {/* R1 — Cross-operator notes collapsible (returns null when empty). */}
      <OthersSaidBlock
        notes={readBack?.others ?? []}
        open={othersOpen}
        onToggle={() => setOthersOpen((p) => !p)}
      />
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
