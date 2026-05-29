"use client";

// Phase 3 Plan 03-07 (gap-closure) — Stage 0 (Safety) Decide column.
//
// Rewritten to sketch 002 Variant C exactly (replacing the prior inline-style
// binary-radio + fireFeedback surface). Pixel values + class structure come
// from 002-stage-0-safety-detail-convergence/index.html:
//   - .stage0-widget radio + label states (lines ~256-290)
//   - Variant C Decide markup (lines ~844-876)
//   - setVerdict toggle logic (lines ~1015-1031)
//
// Shape (canonical-patterns.md §8/§9, per-stage-content.md Stage 0):
//   - Section label "Decide · your verdict".
//   - 2-state verdict radio inside .stage0Widget:
//       • "Confirm: Injection suspected"  → data-mode="confirm" (green)
//       • "Override → mark as Safe (will re-enter Stage 1)" → data-mode="override" (amber)
//     The selected label tints green/amber via .confirmState / .overrideState.
//   - Shared AuditBlock — OPTIONAL note (Stage 0 audit is not gated; sketch
//     line 863 "Notes (optional)").
//   - Footer submit whose data-mode + label follow the verdict triad
//     (green "Confirm injection ⏎" / amber "Submit override ⏎").
//
// 2-state invariant (sketch line 858 lock): the verdict is ONLY ever
// `safe` | `injection_suspected` — never a third value. The radio maps to
// exactly one of those two enums, which is what reaches overrideStage0Safety.
//
// Server-action wiring: overrideStage0Safety (stage-0/actions.ts). The
// operator_id is server-stamped; the corrected_value enum is re-validated at
// the zod layer. On success we optimistically markPendingRemoval(email_id) so
// the row leaves the queue immediately (the loader's excludeReviewed filter
// confirms on the next round-trip) — mirroring stage-0-widget.tsx.

import { useState, useTransition } from "react";

import type { BulkReviewRow } from "@/lib/bulk-review/types";

import { AuditBlock } from "./audit-block";
import styles from "./stage-0-decide.module.css";
import { useSelection } from "../selection-context";
import { overrideStage0Safety } from "../../stage-0/actions";

interface Stage0DecideProps {
  row: BulkReviewRow;
  /** Optional — invoked after the override server action resolves so a parent
   *  can refresh feedback read-back state. */
  onSubmitted?: () => void;
}

/** Sketch-locked 2-state verdict (line 858). "injection" = confirm the system
 *  verdict (green); "safe" = override → re-enter Stage 1 (amber). */
type Verdict = "injection" | "safe";

/** Map the radio verdict to the locked corrected_value enum the server action
 *  accepts. The ONLY two values that can ever reach overrideStage0Safety. */
function toCorrectedValue(v: Verdict): "safe" | "injection_suspected" {
  return v === "injection" ? "injection_suspected" : "safe";
}

function pickInitialVerdict(row: BulkReviewRow): Verdict {
  // A row only surfaces in Stage 0 review when it tripped the safety gate, so
  // the system verdict is "injection_suspected" — default the radio to confirm
  // (sketch line 850 `checked`). A null slot is handled by the placeholder
  // branch before this is used.
  return row.stage_0?.verdict === "safe" ? "safe" : "injection";
}

export function Stage0Decide({ row, onSubmitted }: Stage0DecideProps) {
  const slot = row.stage_0;
  const [verdict, setVerdict] = useState<Verdict>(() => pickInitialVerdict(row));
  const [auditNote, setAuditNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { markPendingRemoval } = useSelection();

  // Null-slot guard (P2-D-03): Stage 0 verdict capture has nothing to decide
  // when the row never ran the safety gate.
  if (slot === null) {
    return (
      <p data-testid="stage-0-decide-placeholder" className={styles.placeholder}>
        Stage 0 hasn&apos;t run yet — nothing to decide.
      </p>
    );
  }

  // Verdict color triad (§8 / sketch setVerdict lines 1020-1029): confirming
  // the injection verdict is the green "confirm"; flipping to Safe is the amber
  // "override".
  const submitMode: "confirm" | "override" =
    verdict === "injection" ? "confirm" : "override";
  const submitLabel =
    submitMode === "confirm" ? "Confirm injection ⏎" : "Submit override ⏎";

  const submitting = isPending;
  // Stage 0 audit note is OPTIONAL (sketch line 863) — submit is never gated on
  // an empty note. Only an in-flight action or a missing email_id disables it.
  const submitDisabled = submitting || !row.email_id;

  function handleSubmit() {
    if (!row.email_id) return;
    setError(null);
    const corrected_value = toCorrectedValue(verdict);
    const trimmed = auditNote.trim();
    startTransition(async () => {
      try {
        await overrideStage0Safety({
          email_id: row.email_id as string,
          swarm_type: row.swarm_type,
          corrected_value,
          prose_notes: trimmed.length > 0 ? trimmed : undefined,
        });
        // Optimistic removal — keep the row hidden until the loader confirms.
        markPendingRemoval(row.email_id as string);
        onSubmitted?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Override failed.");
      }
    });
  }

  return (
    <div data-testid="stage-0-decide" className={styles.decide}>
      <div
        data-testid="stage-0-decide-section-label"
        className={styles.sectionLabel}
      >
        Decide · your verdict
      </div>

      {/* 2-state verdict radio (sketch 002 .stage0-widget, lines 847-860). */}
      <div className={styles.stage0Widget}>
        <div className={styles.widgetHead}>Override Stage 0 safety</div>
        <fieldset
          className={styles.verdictFieldset}
          role="radiogroup"
          aria-label="Stage 0 verdict"
          disabled={submitting}
        >
          <label
            data-testid="stage-0-decide-label-confirm"
            className={`${styles.verdictLabel} ${
              verdict === "injection" ? styles.confirmState : ""
            }`}
          >
            <input
              type="radio"
              name={`stage-0-verdict-${row.email_label_id}`}
              value="injection"
              checked={verdict === "injection"}
              onChange={() => setVerdict("injection")}
              disabled={submitting}
            />
            <span>Confirm: Injection suspected</span>
          </label>
          <label
            data-testid="stage-0-decide-label-override"
            className={`${styles.verdictLabel} ${
              verdict === "safe" ? styles.overrideState : ""
            }`}
          >
            <input
              type="radio"
              name={`stage-0-verdict-${row.email_label_id}`}
              value="safe"
              checked={verdict === "safe"}
              onChange={() => setVerdict("safe")}
              disabled={submitting}
            />
            <span>Override → mark as Safe (will re-enter Stage 1)</span>
          </label>
          <div className={styles.help}>
            Stay 2-state: only <code>safe</code> / <code>injection_suspected</code>.
            Re-emits the safety event with <code>safety_overridden=true</code>{" "}
            when flipped to Safe.
          </div>
        </fieldset>
      </div>

      {/* Optional audit note — helps the system improve (sketch 863). */}
      <AuditBlock
        testId="stage-0-decide-audit"
        question="Why this verdict?"
        sub="Optional — add context if you override; your note helps the system improve."
        placeholder="Add a short note if you override…"
        value={auditNote}
        onChange={setAuditNote}
        required={false}
        disabled={submitting}
      />

      <div className={styles.footer}>
        <button
          type="button"
          data-testid="stage-0-decide-submit"
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
          data-testid="stage-0-decide-error"
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
