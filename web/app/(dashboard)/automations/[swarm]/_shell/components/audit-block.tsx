"use client";

// Phase 3 Plan 01 Task 1 — AuditBlock primitive.
// Phase 3 Plan 11 Task 1 — finalized to the canonical-patterns.md §9 contract.
//
// Shared audit-block textarea consumed by all five Decide columns (Stages
// 0-4). Canonical §9 shape:
//   - Container: brand-orange 3px left-border + rgba(255,106,52,0.04) tinted
//     background, radius. Danger/escalate tone flips both to red.
//   - .audit-q: semibold 14px question + a required-asterisk (amber, red in
//     danger) when required, OR an "optional but encouraged" tag when not.
//   - .audit-sub: 12px dim subtitle.
//   - textarea: configurable min-height (110 default · 160 Stage 1 · 90 short),
//     worked-example placeholder supplied by the caller.
//   - When required + empty → callers gate Submit via auditBlockIsComplete and
//     surface what's missing in the button label.
//
// Lock matrix (UI-SPEC §13 anti-drift + sketch 003):
//   - NO 👍/👎 micro-widget — verdict signal is in the surrounding Decide
//     column's lime-Confirm vs amber-Submit-override button color.
//   - The eval-type radio control is intentionally absent — eval_type is
//     server-stamped per axis by writeOverride (anti-drift #6).
//   - Copy comes from the caller — this primitive renders strings verbatim
//     (UI-SPEC §10 copywriting lock).
//
// Styling lives in audit-block.module.css (token-only, no raw hex). The two
// dynamic values the component sets inline are the tone-driven left-border
// color (so the existing border-left assertions keep working) and the
// prop-driven textarea min-height.
//
// Backward compatibility: the props Stages 0-3 already pass (question, sub,
// placeholder, value, onChange, required, disabled, testId, variant) are
// unchanged. minHeight + tone are additive optionals with §9 defaults. The
// legacy variant="escalate" is honored as an alias for tone="danger".

import type { ChangeEvent } from "react";

import styles from "./audit-block.module.css";

export interface AuditBlockProps {
  /** Locked question copy (caller supplies — UI-SPEC §10). */
  question: string;
  /** Optional sub-line below the question (muted, 12px). */
  sub?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  /** Default false. When true, empty value gates Submit (see auditBlockIsComplete). */
  required?: boolean;
  /**
   * Legacy tone control kept for the Stage 0-3 consumers.
   * 'default' = brand-primary left border; 'escalate' = red.
   * Prefer the §9 `tone` prop in new code; this remains an alias.
   */
  variant?: "default" | "escalate";
  /**
   * Canonical §9 tone. 'default' = brand-orange; 'danger' = red left-border +
   * red tinted background (Stage 3 escalate / sketch 007 dismiss). When either
   * `tone="danger"` or `variant="escalate"` is set, the danger styling applies.
   */
  tone?: "default" | "danger";
  /**
   * Textarea min-height in px. §9 defaults: 110 standard · 160 Stage 1 (rule
   * feedback runs longer) · 90 short reason (sketch 007 dismiss).
   */
  minHeight?: number;
  /**
   * data-testid prefix so consumers can target multiple AuditBlocks on the
   * same row (e.g. one per axis Decide column) without selector collision.
   * Defaults to "audit-block".
   */
  testId?: string;
  /** Disable the textarea (e.g. while a server action is in-flight). */
  disabled?: boolean;
}

const TEXTAREA_MAX = 4000; // mirror writeOverride.reason max + Phase 2 feedback widget.
/** §9 default textarea min-height. Stage 1 passes 160; short reasons pass 90. */
const DEFAULT_MIN_HEIGHT = 110;

/**
 * Pure helper: gate a Submit button on AuditBlock completeness.
 * Exported separately so callers can wire Submit-disabled without re-rendering
 * the AuditBlock to inspect its inner state.
 */
export function auditBlockIsComplete(
  value: string,
  required: boolean,
): boolean {
  if (!required) return true;
  return value.trim().length > 0;
}

export function AuditBlock({
  question,
  sub,
  placeholder,
  value,
  onChange,
  required = false,
  variant = "default",
  tone = "default",
  minHeight = DEFAULT_MIN_HEIGHT,
  testId = "audit-block",
  disabled = false,
}: AuditBlockProps) {
  // Danger styling is the union of the legacy escalate variant and the §9 tone.
  // Plan 03-15 (r3-3): the tone-aware left-border lives on the CONTAINER
  // (.block + .block[data-tone="danger"] in the module) only. The textarea no
  // longer carries an inline borderLeft — it uses a normal border from the
  // module class. This kills the double-orange drift.
  const isDanger = tone === "danger" || variant === "escalate";
  const dataTone = isDanger ? "danger" : "default";

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  return (
    <div
      className={styles.block}
      data-testid={testId}
      data-tone={dataTone}
      data-variant={variant}
      data-required={required ? "true" : "false"}
    >
      <label className={styles.question} data-testid={`${testId}-question`}>
        {question}
        {required ? (
          <span
            aria-hidden="true"
            className={styles.requiredMarker}
            data-testid={`${testId}-required-marker`}
          >
            *
          </span>
        ) : (
          <span
            className={styles.optionalTag}
            data-testid={`${testId}-optional-tag`}
          >
            optional but encouraged
          </span>
        )}
      </label>
      {sub ? (
        <p className={styles.sub} data-testid={`${testId}-sub`}>
          {sub}
        </p>
      ) : null}
      <textarea
        className={styles.textarea}
        data-testid={`${testId}-textarea`}
        data-tone={dataTone}
        aria-required={required}
        value={value}
        onChange={handleChange}
        maxLength={TEXTAREA_MAX}
        placeholder={placeholder}
        disabled={disabled}
        style={{ minHeight }}
      />
    </div>
  );
}
