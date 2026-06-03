"use client";

// Phase 3 Plan 03 Task 2 — Stage 3 Decide column (Axis 3 ranked-intent reorder).
//
// Sketch 005 Variants A + B + UI-SPEC §2 row 3 + §10 (Stage 3 escalate copy
// lock) + §13 anti-drift #2 / #4 / #6 / #8 / #9.
//
// Visual contract:
//   1. Section header "Decide · pick the right intent" (UI-SPEC §10 lock).
//   2. RankedIntentEditor — vertical list, ▲▼ buttons, position-1 pill swap.
//   3. Footer button bar:
//      - Clean state (!isDirty): green "⏎ Confirm ranking".
//      - Dirty state, top-1 unchanged: amber "Submit reorder ⏎".
//      - Dirty state + top-1 changed: amber "Submit reorder → {new_top} ⏎".
//   4. EscalateToHumanCard below the reorder footer (alongside, per sketch
//      005 lock).
//
// Hard-separation lock (RFC stage-3-coordinator.md): this component reads
// row.stage_3.ranked_intents (swarm_intents vocabulary) only; it NEVER reads
// row.stage_1 noise categories. The ranked-intent-editor validates intent_keys
// against the codegen SWARM_INTENTS literal-union — Stage 1 vocabulary cannot
// leak into this surface.
//
// Anti-drift gates honored:
//   #4 — no side-pane revert (no detail-pane / option-z-detail-pane imports).
//   #6 — no EvalTypeRadio.
//   #8 — no HTML5 DnD (ranked-intent-editor enforces).
//   #9 — AuditBlock required on escalate; reorder audit is optional + only
//        rendered once the list is dirty (collapsed by default).

import { useMemo, useState, useTransition } from "react";

import type { BulkReviewRow, RankedIntent } from "@/lib/bulk-review/types";

import { AuditBlock, auditBlockIsComplete } from "./audit-block";
import { RankedIntentEditor } from "./ranked-intent-editor";
import { EscalateToHumanCard } from "./escalate-to-human-card";
import styles from "./stage-3-decide.module.css";
import { useSelection } from "../selection-context";
import { useRerunContextOptional } from "../hooks/use-rerun-subscription";
import {
  reorderStage3Intents,
  escalateStage3ToHuman,
} from "../actions/override-actions";

export interface Stage3DecideProps {
  row: BulkReviewRow;
  /** Test hook — invoked after a successful submit (reorder or escalate). */
  onSubmitted?: () => void;
}

function arraysEqualByIntentKey(a: RankedIntent[], b: RankedIntent[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].intent_key !== b[i].intent_key) return false;
  }
  return true;
}

export function Stage3Decide({ row, onSubmitted }: Stage3DecideProps) {
  const slot = row.stage_3;
  // Snapshot the initial ranked-intent order ONCE on mount. The parent
  // (row-strip-list.tsx) keys each row by email_label_id so Stage3Decide
  // remounts per row click — the state initializer captures the snapshot
  // correctly without a dependency-driven re-snapshot.
  const [initialOrder] = useState<RankedIntent[]>(
    () => slot?.ranked_intents.slice() ?? [],
  );
  const [local, setLocal] = useState<RankedIntent[]>(() => initialOrder.slice());
  const [reorderNote, setReorderNote] = useState("");
  const [escalateNote, setEscalateNote] = useState("");
  const [isEscalating, setIsEscalating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [escalatePending, startEscalateTransition] = useTransition();
  const { markPendingRemoval } = useSelection();
  const rerunCtx = useRerunContextOptional();

  const isDirty = useMemo(
    () => !arraysEqualByIntentKey(initialOrder, local),
    [initialOrder, local],
  );
  const topChanged = useMemo(() => {
    if (initialOrder.length === 0 || local.length === 0) return false;
    return initialOrder[0].intent_key !== local[0].intent_key;
  }, [initialOrder, local]);

  if (slot === null || initialOrder.length === 0) {
    return (
      <p data-testid="stage-3-decide-placeholder" className={styles.placeholder}>
        No Stage 3 ranked-intents to reorder yet.
      </p>
    );
  }

  const submitting = isPending;
  const escalating = escalatePending;
  const busy = submitting || escalating;
  const escalateComplete = auditBlockIsComplete(escalateNote, true);

  // Footer submit verdict triad (sketch 005 .submit-btn[data-mode]):
  //   escalate (red) — when the escalate-row is active.
  //   override (amber) — when the operator reordered the list.
  //   confirm (green) — clean state, operator agrees with the ranking.
  let submitMode: "confirm" | "override" | "escalate";
  let primaryLabel: string;
  if (isEscalating) {
    submitMode = "escalate";
    primaryLabel = "Escalate to Human ⏎";
  } else if (!isDirty) {
    submitMode = "confirm";
    primaryLabel = "Confirm ranking ⏎";
  } else if (topChanged) {
    submitMode = "override";
    primaryLabel = `Submit reorder → ${local[0].display_label ?? local[0].intent_key} ⏎`;
  } else {
    submitMode = "override";
    primaryLabel = "Submit reorder ⏎";
  }

  const submitDisabled = busy || (isEscalating && !escalateComplete);

  function handlePrimaryClick() {
    if (isEscalating) {
      handleEscalateSubmit();
    } else if (isDirty) {
      handleSubmitReorder();
    } else {
      handleConfirm();
    }
  }

  function toggleEscalate() {
    setError(null);
    setWarning(null);
    setIsEscalating((prev) => {
      const next = !prev;
      if (!next) setEscalateNote("");
      return next;
    });
  }

  function handleConfirm() {
    // Clean-state confirm: optimistic-remove the row; the operator agreed
    // with the system's ranking. No server call needed (matches Plan 02's
    // Stage 2 confirm-pick semantics; the verdict signal is the implicit
    // "operator viewed + did not override" which the Phase 4 recommender
    // can mine off the absence of pipeline_events override rows).
    markPendingRemoval(row.email_label_id);
    onSubmitted?.();
  }

  function handleSubmitReorder() {
    if (submitting || !isDirty) return;
    setError(null);
    setWarning(null);
    const original_event_id = slot?.pipeline_event_id ?? "";
    const original_decision = initialOrder[0]?.intent_key ?? "<unknown>";
    startTransition(async () => {
      const result = await reorderStage3Intents({
        email_label_id: row.email_label_id,
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        original_event_id,
        original_decision,
        context_version: row.context_version,
        new_ranked_intents: local.map((r) => ({
          intent_key: r.intent_key,
          confidence: r.confidence,
        })),
        audit_note: reorderNote.trim().length > 0 ? reorderNote.trim() : null,
      });
      if (result.ok) {
        if (topChanged && row.email_id) {
          rerunCtx.markInFlight(row.email_id);
        }
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
        return;
      }
      if (result.code === "rerun_failed") {
        // Partial-success: N pipeline_events rows persisted, re-emit failed.
        // Still drop the row optimistically; surface a warning toast.
        setWarning(result.error);
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
        return;
      }
      setError(result.error);
    });
  }

  function handleEscalateSubmit() {
    if (escalating) return;
    setError(null);
    setWarning(null);
    const original_event_id = slot?.pipeline_event_id ?? "";
    startEscalateTransition(async () => {
      const result = await escalateStage3ToHuman({
        email_label_id: row.email_label_id,
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        original_event_id,
        context_version: row.context_version,
        audit_note: escalateNote.trim(),
      });
      if (result.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
        return;
      }
      setError(result.error);
    });
  }

  // Submit-button test-id reflects the active verdict so the existing tests
  // (stage-3-decide-confirm / -submit-reorder) keep targeting the right node.
  const submitTestId = isEscalating
    ? "stage-3-decide-escalate"
    : isDirty
      ? "stage-3-decide-submit-reorder"
      : "stage-3-decide-confirm";

  return (
    <div
      data-testid="stage-3-decide"
      data-dirty={isDirty}
      data-top-changed={topChanged}
      data-escalating={isEscalating}
      className={`${styles.decide} col-decide${isEscalating ? ` ${styles.escalating} escalating` : ""}`}
    >
      <div
        data-testid="stage-3-decide-section-label"
        className={styles.sectionLabel}
      >
        Decide · pick the right intent
      </div>

      <RankedIntentEditor
        value={local}
        onChange={setLocal}
        disabled={busy || isEscalating}
        testId="stage-3-decide-editor"
      />

      <EscalateToHumanCard
        escalating={isEscalating}
        onToggle={toggleEscalate}
        disabled={busy}
      />

      {/* Shared AuditBlock. Escalating → REQUIRED + danger + reworded prompt
          ("What intent is missing from the registry?"). Reorder (dirty, not
          escalating) → optional reorder context (anti-drift #9). Clean confirms
          never need a note. */}
      {isEscalating ? (
        <AuditBlock
          testId="stage-3-decide-audit"
          question="What intent is missing from the registry?"
          sub="Operator audit — describe the missing intent so the registry can grow."
          placeholder={
            'e.g. "Customer asking to schedule a phone call — we don\'t have a \'schedule_call\' intent yet."'
          }
          value={escalateNote}
          onChange={setEscalateNote}
          required={true}
          tone="danger"
          disabled={busy}
        />
      ) : isDirty ? (
        <AuditBlock
          testId="stage-3-decide-audit"
          question="Why this verdict?"
          sub="Optional — add context for your reorder; your note helps the system improve."
          placeholder="Operator note (optional)"
          value={reorderNote}
          onChange={setReorderNote}
          required={false}
          disabled={busy}
        />
      ) : null}

      <div className={styles.footer}>
        <button
          type="button"
          data-testid={submitTestId}
          data-mode={submitMode}
          className={styles.submitBtn}
          onClick={handlePrimaryClick}
          disabled={submitDisabled}
        >
          {primaryLabel}
        </button>
      </div>

      {warning ? (
        <p
          data-testid="stage-3-decide-warning"
          role="status"
          className={styles.warning}
        >
          {warning}
        </p>
      ) : null}
      {error ? (
        <p
          data-testid="stage-3-decide-error"
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
