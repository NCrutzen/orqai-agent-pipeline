"use client";

// Phase 3 Plan 03 Task 1 / Plan 10 Task 1 — EscalateToHumanCard.
//
// Sketch 005 lock (.escalate-row, index.html lines 248-274 + markup 486-493):
// a red-bordered clickable row (glyph ⚠ / body title+sub / keyhint E) sitting
// below the ranked editor. Clicking it toggles the parent col-decide into
// "escalating" mode — the parent (stage-3-decide.tsx) dims the editor, flips
// the shared AuditBlock to red + REQUIRED with the reworded "What intent is
// missing from the registry?" prompt, and turns the footer submit red. This
// card no longer owns its own AuditBlock or Submit; the composer owns those so
// the escalate path reuses the single shared audit textarea (canonical §9).
//
// Hard-separation lock: presentation-only. The escalate path (in the composer)
// writes ONE pipeline_events row in Stage 3 vocabulary and routes the row to
// the human queue (routed_human_queue); it never touches Stage 1.
//
// Operator-copy lock (UI-SPEC §10) — every visible string says "human queue" /
// "human" (the legacy board name is forbidden). Reproduced verbatim from the
// copywriting contract.

import styles from "./stage-3-decide.module.css";

export interface EscalateToHumanCardProps {
  /** Whether the parent col-decide is in escalating mode. */
  escalating: boolean;
  /** Toggle escalating mode in the parent composer. */
  onToggle: () => void;
  /** Disable interaction (e.g. while a server action is in-flight). */
  disabled?: boolean;
  /** Optional test-id prefix; defaults to "escalate-to-human-card". */
  testId?: string;
}

export function EscalateToHumanCard({
  escalating,
  onToggle,
  disabled = false,
  testId = "escalate-to-human-card",
}: EscalateToHumanCardProps) {
  return (
    <div
      data-testid={testId}
      data-state={escalating ? "active" : "idle"}
      className={`${styles.escalateRow} escalate-row${escalating ? ` ${styles.escalateRowActive}` : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={escalating}
      onClick={() => {
        if (!disabled) onToggle();
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <span aria-hidden="true" className={styles.escalateGlyph}>
        ⚠
      </span>
      <div className={styles.escalateBody}>
        <div className={styles.escalateTitle} data-testid={`${testId}-title`}>
          None of these — escalate to human queue
        </div>
        <div className={styles.escalateSub} data-testid={`${testId}-sub`}>
          Routes the row to the human queue (
          <code>routed_human_queue</code>) for manual handling. Use when no
          listed intent fits — the audit note should describe what intent is
          missing from the registry.
        </div>
      </div>
      <span className={styles.escalateKeyhint} aria-hidden="true">
        E
      </span>
    </div>
  );
}
