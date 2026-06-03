"use client";

// Phase 3 Plan 01 Task 3 — Stage 4 Decide column.
//
// P3-D-06 lock: wrap the existing Stage4Widget (5-button quality picker +
// reason textarea, shipped Phase 71/82) inside the inline-expand container.
// Adds the AuditBlock (required-on-rejection per anti-drift #9) + Submit
// button + submitStage4Handler call.
//
// Stage 4 is TERMINAL — no re-run, no Inngest emit from this surface. The
// out-of-band guarantee holds: submitStage4Handler does not import the
// Inngest client (verified by the static grep guard in override-actions.test.ts).
//
// Quality-to-(draft_quality, verdict) mapping. Stage4Widget today emits a
// 5-point operator rating; the email_labels.draft_quality CHECK enum is
// 3-valued (correct | needed_edit | rejected) and agent_runs.human_verdict
// has its own 9-value CHECK enum. We collapse the 5-point UI to the
// schema-mandated 3-value draft_quality + an appropriate verdict per UI-SPEC
// §S4. Server-side validators (override-actions.ts) cross-check both.

import { useMemo, useState, useTransition } from "react";

import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { Stage4Widget, type Stage4Quality } from "../../stage-1/components/stage-4-widget";

import { AuditBlock, auditBlockIsComplete } from "./audit-block";
import styles from "./stage-4-decide.module.css";
import { useSelection } from "../selection-context";
import {
  submitStage4Handler,
  type Stage4Verdict,
  type DraftQuality,
} from "../actions/override-actions";

export interface Stage4DecideProps {
  row: BulkReviewRow;
  onSubmitted?: () => void;
}

interface QualityMapping {
  draft_quality: DraftQuality;
  verdict: Stage4Verdict;
}

function mapQualityToSchema(q: Stage4Quality): QualityMapping {
  switch (q) {
    case 1: // Terrible
    case 2: // Poor
      return { draft_quality: "rejected", verdict: "rejected_other" };
    case 3: // Okay
      return { draft_quality: "needed_edit", verdict: "edited_major" };
    case 4: // Good
      return { draft_quality: "needed_edit", verdict: "edited_minor" };
    case 5: // Perfect
      return { draft_quality: "correct", verdict: "approved" };
  }
}

export function Stage4Decide({ row, onSubmitted }: Stage4DecideProps) {
  const slot = row.stage_4;
  const [quality, setQuality] = useState<Stage4Quality | null>(null);
  const [reason, setReason] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { markPendingRemoval } = useSelection();

  // Compute the schema mapping + AuditBlock required-state for the picked
  // quality. Memoize so the render path doesn't re-allocate on every
  // setReason call.
  const mapping = useMemo<QualityMapping | null>(
    () => (quality === null ? null : mapQualityToSchema(quality)),
    [quality],
  );
  const auditRequired = useMemo(
    () => mapping !== null && mapping.verdict.startsWith("rejected_"),
    [mapping],
  );

  // Verdict color triad (§8): the operator agrees with the system (Confirm,
  // green) only when the picked quality maps to the "approved" verdict — i.e.
  // no change to the handler output. Any minor edit / rejection is an Override
  // (amber). Default to confirm before a quality is picked (submit is disabled
  // then anyway).
  const submitMode: "confirm" | "override" =
    mapping !== null && mapping.verdict !== "approved" ? "override" : "confirm";
  const submitLabel =
    submitMode === "override" ? "Submit override ⏎" : "Confirm ⏎";

  if (slot === null) {
    return (
      <p data-testid="stage-4-decide-placeholder" className={styles.placeholder}>
        Nothing to decide here yet — the handler runs once the upstream stages
        are settled (and in dry-run it won&apos;t send anything). Confirm or
        correct the Customer and Topic above.
      </p>
    );
  }

  const submitting = isPending;
  const auditComplete = auditBlockIsComplete(auditNote, auditRequired);
  const submitDisabled =
    submitting || quality === null || mapping === null || !auditComplete;

  async function handleSubmit() {
    if (mapping === null) return;
    setError(null);
    const original_event_id = slot?.pipeline_event_id ?? null;
    // P3-D-06 allows a null original_event_id in the Stage 4 case (handler
    // may have emitted no pipeline_events row pre-Phase 3). Pass an empty
    // string sentinel — writeOverride records it verbatim in
    // override.original_event_id; downstream readers tolerate the sentinel.
    startTransition(async () => {
      const result = await submitStage4Handler({
        email_label_id: row.email_label_id,
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        original_event_id: original_event_id ?? "",
        original_decision: slot?.draft_quality ?? "(no prior verdict)",
        context_version: row.context_version,
        new_draft_quality: mapping.draft_quality,
        new_feedback_reason: reason.trim(),
        verdict: mapping.verdict,
        audit_note: auditNote.trim() ? auditNote.trim() : null,
      });
      if (result.ok) {
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div data-testid="stage-4-decide" className={styles.decide}>
      <div
        data-testid="stage-4-decide-section-label"
        className={styles.sectionLabel}
      >
        Decide · reply edits
      </div>

      <div data-testid="stage-4-decide-widget-wrapper">
        <Stage4Widget
          quality={quality}
          onQualityChange={(q) => setQuality(q)}
          reason={reason}
          onReasonChange={setReason}
        />
      </div>

      <AuditBlock
        testId="stage-4-decide-audit"
        tone={auditRequired ? "danger" : "default"}
        minHeight={90}
        question={
          auditRequired
            ? "Why this rejection?"
            : "Why this correction?"
        }
        sub={
          auditRequired
            ? "Rejection requires context — describe what went wrong with the reply."
            : "Optional — add context if you want to help the system improve."
        }
        placeholder={
          auditRequired
            ? "e.g. wrong language — customer wrote in Dutch, reply went out in English"
            : "e.g. tightened the closing line; tone was a touch formal for this customer"
        }
        value={auditNote}
        onChange={setAuditNote}
        required={auditRequired}
        disabled={submitting}
      />

      <div className={styles.footer}>
        <button
          type="button"
          data-testid="stage-4-decide-submit"
          data-mode={submitMode}
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>

      {error ? (
        <p
          data-testid="stage-4-decide-error"
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
