"use client";

// Phase 3 Plan 01 Task 2 — Stage 1 Decide column (Axis 1 write-path flip).
// Phase 3 Plan 08 Task 1 — migrated to the sketch-003 class-based CSS module.
//
// Replaces the Phase 2 Stage1FeedbackWidget on the override path. The
// /feedback POST handler may continue to receive confirm-mode feedback for
// back-compat (Phase 2 verification still asserts the legacy widget works);
// THIS component's submit handler calls the Plan 01 overrideStage1Category
// server action, which emits a real pipeline_events row via writeOverride
// (P3-D-01).
//
// Structure (sketch 003 .col-decide, lines 507-561): a single always-visible
// category dropdown that defaults to the system's current verdict, a 160px
// audit-block ("Why this verdict?", optional but encouraged), the ★
// eval_type=regression server-default note, and a footer submit whose
// data-mode flips green "Confirm rule ⏎" / "Confirm rescue ⏎" (dropdown
// unchanged) ↔ amber "Submit override ⏎" (dropdown changed). The operator
// "treats every verdict as just another rule" — confirm and override share
// one server action; confirm emits new_category_key === current verdict.
//
// Hard separation (RFC stage-1-regex.md): the category dropdown options are
// the union of swarm_noise_categories.category_key + synthetic noise/archive +
// the literal "unknown". Stage 3 vocabulary (swarm_intents) is NEVER mixed in
// here.
//
// Anti-drift locks (UI-SPEC §13):
//   - #5: no thumbs-up/down widget — verdict signal is implicit in
//     lime-Confirm vs amber-Submit-override button color.
//   - #6: no eval-type radio — eval_type is server-stamped per axis
//     (eval_type=regression by default; engineers retag via QA admin).
//   - #9: AuditBlock is OPTIONAL on Stage 1 override (160px, rule-feedback).
//
// Confirm semantics (P3-D-01): leaving the dropdown unchanged and clicking
// "Confirm rule/rescue" emits a pipeline_events row carrying
// override.original_decision === decision (i.e. the operator confirmed the
// system's verdict). Phase 4's promotion-recommender uses the confirm signal
// to upvote the matched rule's Wilson-CI sample.

import { useState, useTransition } from "react";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import { Stage1Widget } from "../../stage-1/components/stage-1-widget";

import { AuditBlock } from "./audit-block";
import styles from "./stage-1-decide.module.css";
import { useSelection } from "../selection-context";
import { overrideStage1Category } from "../actions/override-actions";

export interface Stage1DecideProps {
  row: BulkReviewRow;
  /**
   * Stage 1 noise-category registry rows (Stage 1 vocabulary ONLY —
   * swarm_noise_categories). Threaded from the parent Server Component;
   * the widget never fetches the registry itself (P1-D-02). Synthetic
   * keys ("noise", "archive", "unknown") are added by Stage1Widget at
   * render time and validated server-side by overrideStage1Category.
   */
  categories: SwarmNoiseCategoryRow[];
  /** Test hook — invoked after a successful submit (mirrors Phase 2 pattern). */
  onSubmitted?: () => void;
}

export function Stage1Decide({
  row,
  categories,
  onSubmitted,
}: Stage1DecideProps) {
  const slot = row.stage_1;
  // The dropdown defaults to the system's current verdict. "Unchanged" (picked
  // === current) is a confirm; any other value is an override. Initialise lazily
  // so a null slot doesn't blow up the hook order.
  const currentCategory = slot?.category_key ?? null;
  const [picked, setPicked] = useState<string | null>(currentCategory);
  const [auditNote, setAuditNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { markPendingRemoval } = useSelection();

  if (slot === null) {
    return (
      <p data-testid="stage-1-decide-placeholder" className={styles.placeholder}>
        No Stage 1 decision to confirm yet.
      </p>
    );
  }

  const submitting = isPending;

  // Verdict triad (§8): dropdown unchanged → confirm (green); changed →
  // override (amber). When llm_invoked, the LLM 2nd-pass rescued the verdict,
  // so the confirm copy reads "Confirm rescue" (sketch Variant B footer).
  const isOverride = picked !== null && picked !== slot.category_key;
  const submitMode: "confirm" | "override" = isOverride ? "override" : "confirm";
  const confirmLabel = slot.llm_invoked
    ? "Confirm rescue ⏎"
    : "Confirm rule ⏎";
  const submitLabel = isOverride ? "Submit override ⏎" : confirmLabel;

  async function submit(verdictCategory: string, note: string | null) {
    if (!slot) return;
    setError(null);
    const original_event_id = slot.pipeline_event_id;
    if (!original_event_id) {
      setError("missing Stage 1 pipeline_event_id");
      return;
    }
    startTransition(async () => {
      const result = await overrideStage1Category({
        email_label_id: row.email_label_id,
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        original_event_id,
        original_decision: slot.category_key,
        context_version: row.context_version,
        new_category_key: verdictCategory,
        audit_note: note,
      });
      if (result.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
      } else {
        setError(result.error);
      }
    });
  }

  function handleSubmit() {
    // Confirm path: picked === current verdict → emit new_category_key ===
    // current. The partial-index guard picks the row up (override IS NOT NULL),
    // and override.original_decision === decision signals "confirm" to Phase 4's
    // recommender. Override path: emit the picked category + optional audit note.
    if (picked === null) return;
    void submit(picked, auditNote.trim() ? auditNote.trim() : null);
  }

  return (
    <div data-testid="stage-1-decide" className={styles.decide}>
      <div
        data-testid="stage-1-decide-section-label"
        className={styles.sectionLabel}
      >
        Decide · your verdict
      </div>

      <div className={styles.fieldGroup}>
        <span className={styles.fieldLabel}>Category</span>
        <div
          data-testid="stage-1-decide-category-dropdown"
          className={`${styles.selectWrap}${isOverride ? ` ${styles.dirty}` : ""}`}
          data-dirty={isOverride ? "true" : "false"}
        >
          <Stage1Widget
            categories={categories}
            value={picked}
            onChange={(k) => setPicked(k)}
          />
        </div>
        <div className={styles.selectHint}>
          Change the category to override; leave as-is to confirm.
        </div>
      </div>

      <AuditBlock
        testId="stage-1-decide-audit"
        question="Why this verdict?"
        sub="Tell us how the filter did on this email — your note helps the system improve."
        placeholder="e.g. This is a real customer asking for an invoice copy — it was wrongly filtered as auto-reply."
        minHeight={160}
        value={auditNote}
        onChange={setAuditNote}
        required={false}
        disabled={submitting}
      />

      <div className={styles.footer}>
        <button
          type="button"
          data-testid="stage-1-decide-submit"
          data-mode={submitMode}
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || picked === null}
        >
          {submitLabel}
        </button>
      </div>

      {error ? (
        <p
          data-testid="stage-1-decide-error"
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
