"use client";

// Phase 3 Plan 09 (gap-closure) — Stage 2 Decide column (axis-2 customer override).
//
// Sketch 004 Variant A (clean sender-map match) + UI-SPEC §2 row 2 + §10
// (Stage 2 copy lock). Rewritten from the inline-styled draft to the full
// sketch-004 class structure (stage-2-decide.module.css).
//
// Visual contract (sketch 004 lines 554-640):
//   1. pick-card — the system's matched customer:
//      - pick-name: slot.customer_name (16px headline; "(name unavailable)"
//        fallback when null — NEVER fabricated).
//      - pick-meta: `customer_account_id {id} · NXT` (mono 11px).
//      - source-pill: "{source} · {confidence}%" (blue=match / purple=llm).
//      - lineage line: rendered ONLY when slot.sender_map_lineage is non-null
//        (null today per Plan 06 — the line is omitted; anti-drift note 5).
//   2. .big-action.primary.selected — "Confirm — system got it right" (26px
//      glyph circle, ⏎ keyhint, brand-orange 2px selected ring).
//   3. "or" divider.
//   4. <details class=override-disclosure> — opening adds the .overriding state
//      so pick-card/big-action/divider collapse. disc-body holds:
//      - Number-only 4-digit input <input inputMode="numeric"
//        pattern="[0-9]{4}" maxLength={4}> (anti-drift #7 — no fuzzy name
//        search; preserves zero-padding).
//      - Live validation via searchCustomers (debounced 250ms, AbortController-
//        style aborted flag). Lime ✓ on match · red ✗ on no-match · … in-flight.
//      - AuditBlock (REQUIRED, anti-drift #9).
//      - Re-run switch (34x18 toggle, DEFAULT ON, P3-D-02; auto-arms ON the
//        first time the operator dirties the input).
//   5. Submit override (amber button) — calls overrideStage2Customer + on
//      success calls useRerunContext().markInFlight when Re-run was ON,
//      THEN optimistically removes the row.
//
// Variant B deferred: the LLM-tiebreaker 2-big-action path (Confirm + Flip to
// runner-up) needs candidates_considered, which is NOT in the slot today
// (MISSING-IN-CODEBASE.md Stage 2). Plan 06 audited it as a corpus gap. We
// render Variant A only and never stub a fake runner-up.
//
// Hard-separation lock: Stage 2 vocabulary = customer_account_id only. This
// component does NOT import swarm_noise_categories (Stage 1) nor
// swarm_intents (Stage 3) — the resolver output is the only domain object
// it reads.
//
// Anti-drift gates:
//   #2 — animation timings limited to allowed set; markup uses none (the
//        disclosure's transitions live in the CSS module at 0.12/0.15s).
//   #6 — no EvalTypeRadio.
//   #7 — input shape: text inputMode=numeric, pattern \d{4}, maxLength=4.
//   #9 — AuditBlock required.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import type {
  BulkReviewRow,
  BulkReviewStage2Slot,
} from "@/lib/bulk-review/types";

import { AuditBlock, auditBlockIsComplete } from "./audit-block";
import { useSelection } from "../selection-context";
import { useRerunContextOptional } from "../hooks/use-rerun-subscription";
import { overrideStage2Customer } from "../actions/override-actions";
import { searchCustomers } from "../../stage-1/components/stage-2-search";

import styles from "./stage-2-decide.module.css";

export interface Stage2DecideProps {
  row: BulkReviewRow;
  /** Test hook — invoked after a successful submit (override or confirm). */
  onSubmitted?: () => void;
}

interface ValidationState {
  status: "idle" | "in-flight" | "match" | "miss";
  match?: { customer_account_id: string; customer_name: string };
}

const DIGITS_RX = /^\d{4}$/;

export function Stage2Decide({ row, onSubmitted }: Stage2DecideProps) {
  const slot = row.stage_2;
  // `overriding` mirrors the <details open> state so the .overriding collapse
  // class can be toggled on the column wrapper deterministically (and so tests
  // do not depend on jsdom's native <details> toggle behavior).
  const [overriding, setOverriding] = useState(false);
  const [digits, setDigits] = useState("");
  const [auditNote, setAuditNote] = useState("");
  const [rerun, setRerun] = useState(true); // P3-D-02 — default ON.
  const [validation, setValidation] = useState<ValidationState>({
    status: "idle",
  });
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { markPendingRemoval } = useSelection();
  // Use the optional context variant — Stage2Decide may be rendered in tests
  // / legacy contexts where no RerunContext provider is mounted.
  const rerunCtx = useRerunContextOptional();

  // P3-D-02 — when the operator starts typing in the input, auto-toggle the
  // Re-run switch ON if it was OFF. We only auto-toggle once; once they
  // explicitly turn it OFF after dirtying, we respect that.
  const autoToggleArmedRef = useRef(true);

  const handleDigitsChange = useCallback(
    (raw: string) => {
      // Strip non-digit chars; cap at 4.
      const clean = raw.replace(/\D+/g, "").slice(0, 4);
      setDigits(clean);
      if (clean.length > 0 && autoToggleArmedRef.current) {
        autoToggleArmedRef.current = false;
        if (!rerun) setRerun(true);
      }
    },
    [rerun],
  );

  // Debounced searchCustomers — 250ms; per-effect "aborted" flag drops stale
  // results when the digits string changes mid-flight. The effect drives an
  // EXTERNAL system (the network) and stores its result in `validation`; the
  // initial idle/in-flight status is computed below from `digits` directly,
  // not from a setState-in-effect call (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!DIGITS_RX.test(digits)) return;
    const aborted = { current: false };
    const t = window.setTimeout(async () => {
      try {
        const results = await searchCustomers(digits);
        if (aborted.current) return;
        const hit = results.find((r) => r.customer_account_id === digits);
        if (hit) {
          setValidation({
            status: "match",
            match: {
              customer_account_id: hit.customer_account_id,
              customer_name: hit.customer_name,
            },
          });
        } else {
          setValidation({ status: "miss" });
        }
      } catch {
        if (aborted.current) return;
        setValidation({ status: "miss" });
      }
    }, 250);
    return () => {
      aborted.current = true;
      window.clearTimeout(t);
    };
  }, [digits]);

  // The validation state above tracks the async network result. When the
  // operator changes the digits string, the previous network result becomes
  // stale — derive the EFFECTIVE display status from the current digits.
  // A stale match/miss (where validation.match.customer_account_id !== digits)
  // collapses back to "in-flight" until the debounced effect re-resolves.
  const isStaleResult =
    validation.status === "match"
      ? validation.match?.customer_account_id !== digits
      : false;
  const effectiveValidation: ValidationState = !DIGITS_RX.test(digits)
    ? { status: "idle" }
    : isStaleResult
      ? { status: "in-flight" }
      : validation.status === "match" || validation.status === "miss"
        ? validation
        : { status: "in-flight" };

  if (slot === null) {
    return (
      <p
        data-testid="stage-2-decide-placeholder"
        className={styles.placeholder}
      >
        No Stage 2 customer to confirm yet.
      </p>
    );
  }

  const currentAccount = slot.customer_account_id ?? null;
  const submitting = isPending;
  const auditComplete = auditBlockIsComplete(auditNote, true);
  const digitsValid = DIGITS_RX.test(digits);
  const changedCustomer = digitsValid && digits !== (currentAccount ?? "");
  const submitOverrideDisabled =
    submitting ||
    !digitsValid ||
    effectiveValidation.status !== "match" ||
    !auditComplete ||
    !changedCustomer;

  // UI-SPEC §10 — dynamic submit button label.
  let submitLabel = "Submit override ⏎";
  if (!digitsValid) {
    submitLabel = "Submit override ⏎ — pick a customer";
  } else if (effectiveValidation.status === "in-flight") {
    submitLabel = "Submit override ⏎ — checking…";
  } else if (effectiveValidation.status === "miss") {
    submitLabel = "Submit override ⏎ — unknown account";
  } else if (!auditComplete) {
    submitLabel = "Submit override ⏎ — add audit note";
  } else if (!changedCustomer) {
    submitLabel = "Submit override ⏎ — same as current";
  }

  // pick-card display values. customer_name drives the 16px headline; the
  // mono sub-line is the resolved account id; the source-pill reads the
  // resolver_source + confidence. NEVER fabricate when data is absent.
  const pickName = slot.customer_name ?? "(name unavailable)";
  const pickAccount = currentAccount ?? "(none)";
  const isLlm = slot.resolver_source === "llm_tiebreaker";
  const confidencePct =
    slot.confidence != null ? `${Math.round(slot.confidence * 100)}%` : null;
  const sourceLabel = labelForSource(slot.resolver_source);
  const sourceText = confidencePct
    ? `${sourceLabel} · ${confidencePct}`
    : sourceLabel;

  function resetOverride() {
    setOverriding(false);
    setDigits("");
    setAuditNote("");
    setValidation({ status: "idle" });
    setError(null);
    setWarning(null);
    autoToggleArmedRef.current = true;
    setRerun(true);
  }

  function handleConfirm() {
    // P3-D-07 / Plan 02 spec lock: Stage 2 confirm is a pure UI advance — no
    // server call, no pipeline_events emit, no Inngest re-emit. Optimistically
    // remove the row so the operator can move on.
    markPendingRemoval(row.email_label_id);
    onSubmitted?.();
  }

  function handleSubmitOverride() {
    if (submitOverrideDisabled) return;
    setError(null);
    setWarning(null);
    const original_event_id = slot?.pipeline_event_id ?? "";
    const original_decision = currentAccount ?? "<unknown>";
    startTransition(async () => {
      const result = await overrideStage2Customer({
        email_label_id: row.email_label_id,
        email_id: row.email_id ?? "",
        swarm_type: row.swarm_type,
        original_event_id,
        original_decision,
        context_version: row.context_version,
        new_customer_account_id: digits,
        audit_note: auditNote.trim(),
        rerun,
        // Forward existing ranked-intents into the predicted re-emit so the
        // dispatcher has a populated list to route on (Plan 02 design note —
        // when Stage 3 has not run yet the list is empty; the server returns
        // rerun_failed which we surface as a partial-success warning).
        ranked_intents: row.stage_3?.ranked_intents.map((r) => ({
          intent: r.intent_key,
          confidence:
            r.confidence !== null ? String(r.confidence) : "medium",
        })),
      });
      if (result.ok) {
        if (rerun && result.data.rerun_emitted && row.email_id) {
          rerunCtx.markInFlight(row.email_id);
        }
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
        return;
      }
      // Partial-success: override saved, re-run failed. Surface a warning but
      // STILL remove the row (the capture write succeeded).
      if (result.code === "rerun_failed") {
        setWarning(result.error);
        markPendingRemoval(row.email_label_id);
        onSubmitted?.();
        return;
      }
      setError(result.error);
    });
  }

  return (
    <div
      data-testid="stage-2-decide"
      className={`${styles.root} ${overriding ? styles.overriding : ""}`}
    >
      <div
        data-testid="stage-2-decide-section-label"
        className={styles.sectionLabel}
      >
        Decide · your verdict
      </div>

      {/* The system's pick — what's being confirmed */}
      <div data-testid="stage-2-decide-pick-card" className={styles.pickCard}>
        <div className={styles.pickLabel}>
          {isLlm ? "⚠ LLM tiebreaker" : "The system matched"}
        </div>
        <div data-testid="stage-2-decide-pick-card-name" className={styles.pickName}>
          {pickName}
        </div>
        <div
          data-testid="stage-2-decide-pick-card-account"
          className={styles.pickMeta}
        >
          customer_account_id {pickAccount} · NXT
        </div>
        <div className={styles.pickSource}>
          <span
            data-testid="stage-2-decide-source-pill"
            className={`${styles.sourcePill} ${
              isLlm ? styles.sourcePillLlm : styles.sourcePillMatch
            }`}
          >
            {sourceText}
          </span>
          {/* Lineage line — rendered ONLY when present (null today; omitted). */}
          {slot.sender_map_lineage != null ? (
            <span
              data-testid="stage-2-decide-lineage"
              className={styles.pickLineage}
            >
              {slot.sender_map_lineage}
            </span>
          ) : null}
        </div>
      </div>

      {/* Default action: Confirm (big-action, shown big for clarity). */}
      <button
        type="button"
        data-testid="stage-2-decide-confirm"
        onClick={handleConfirm}
        disabled={submitting}
        className={`${styles.bigAction} ${styles.bigActionPrimary} ${styles.bigActionSelected}`}
      >
        <span className={styles.glyph}>✓</span>
        <span className={styles.bigActionBody}>
          <span className={styles.bigActionTitle}>
            Confirm — system got it right
          </span>
          <span className={styles.bigActionSubtitle}>
            Customer stays {pickName} · {sourceLabel} signal +1
          </span>
        </span>
        <span className={styles.keyhint}>⏎</span>
      </button>

      <div className={styles.orDivider}>or</div>

      {/* Override disclosure — collapsed by default. */}
      <details
        data-testid="stage-2-decide-override-disclosure"
        className={styles.overrideDisclosure}
        open={overriding}
      >
        <summary
          data-testid="stage-2-decide-flip"
          onClick={(e) => {
            // Drive the open-state mirror ourselves (deterministic for tests +
            // the .overriding collapse). preventDefault stops the native
            // toggle from racing the controlled `open` attribute.
            e.preventDefault();
            if (overriding) {
              resetOverride();
            } else {
              setOverriding(true);
            }
          }}
        >
          <span>Override — this isn&apos;t the right customer</span>
          <span
            style={{ marginLeft: "auto" }}
            className={styles.bigActionSubtitle}
          >
            amber path
          </span>
        </summary>
        <div className={styles.discBody}>
          <div className={styles.fieldGroup}>
            <label
              htmlFor="stage-2-decide-input"
              className={styles.fieldLabel}
            >
              Customer account number
              <span className={styles.reqAsterisk}>*</span>
            </label>
            <div
              data-testid="stage-2-decide-input-row"
              className={`${styles.customerInputRow} ${
                effectiveValidation.status === "match"
                  ? styles.customerInputRowHasMatch
                  : effectiveValidation.status === "miss"
                    ? styles.customerInputRowNoMatch
                    : ""
              }`}
            >
              <input
                id="stage-2-decide-input"
                data-testid="stage-2-decide-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="e.g. 0079"
                value={digits}
                onChange={(e) => handleDigitsChange(e.target.value)}
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <p className={styles.fieldHint}>
              Look up the customer&apos;s account number in NXT first. The
              number is the canonical truth — Stage 3 + 4 will re-run against
              it. Digits only · zero-padded to 4 characters.
            </p>
            <div
              data-testid="stage-2-decide-validation"
              className={`${styles.resolvedFeedback} ${
                effectiveValidation.status === "match" ||
                effectiveValidation.status === "miss"
                  ? styles.resolvedFeedbackShow
                  : ""
              } ${
                effectiveValidation.status === "match"
                  ? styles.resolvedFeedbackMatch
                  : effectiveValidation.status === "miss"
                    ? styles.resolvedFeedbackMiss
                    : ""
              }`}
              role="status"
              aria-live="polite"
            >
              {effectiveValidation.status === "in-flight"
                ? "…"
                : effectiveValidation.status === "match" && validation.match
                  ? `✓ ${validation.match.customer_name} · acct ${validation.match.customer_account_id}`
                  : effectiveValidation.status === "miss"
                    ? `✗ No customer with account number ${digits} · double-check the number in NXT`
                    : ""}
            </div>
          </div>

          <AuditBlock
            testId="stage-2-decide-audit"
            question="How did you find this customer?"
            sub='Audit trail — describe the NXT lookup or evidence chain so reviewers can verify your override later. Required.'
            placeholder="Found by invoice reference {ref} in the body / matched signature block / etc."
            value={auditNote}
            onChange={setAuditNote}
            required={true}
            disabled={submitting}
          />

          <label
            data-testid="stage-2-decide-rerun-switch"
            className={styles.switchRow}
          >
            <span className={styles.switchMeta}>
              <span className={styles.switchTitle}>
                Re-run Topic + Action with the corrected customer
              </span>
              <span className={styles.switchDesc}>
                Default ON when overriding — downstream draft regenerates with
                the new customer. Turn OFF to record the correction without
                spending LLM tokens.
              </span>
            </span>
            <input
              type="checkbox"
              data-testid="stage-2-decide-rerun-checkbox"
              className={styles.switchCheckbox}
              checked={rerun}
              onChange={(e) => {
                // Operator explicitly toggled — disarm auto-toggle.
                autoToggleArmedRef.current = false;
                setRerun(e.target.checked);
              }}
              disabled={submitting}
            />
            <span
              aria-hidden="true"
              className={`${styles.switch} ${rerun ? styles.switchOn : ""}`}
            />
          </label>

          <div className={styles.actionsRow}>
            <button
              type="button"
              data-testid="stage-2-decide-submit-override"
              onClick={handleSubmitOverride}
              disabled={submitOverrideDisabled}
              className={styles.submitBtn}
            >
              {submitLabel}
            </button>
            <button
              type="button"
              data-testid="stage-2-decide-cancel"
              onClick={resetOverride}
              disabled={submitting}
              className={styles.cancelBtn}
            >
              Cancel
            </button>
          </div>
        </div>
      </details>

      {warning ? (
        <p
          data-testid="stage-2-decide-warning"
          role="status"
          className={styles.warning}
        >
          {warning}
        </p>
      ) : null}
      {error ? (
        <p
          data-testid="stage-2-decide-error"
          role="alert"
          className={styles.error}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Human-readable label for the source-pill (sketch 004 lines 564 / 814). */
function labelForSource(
  source: BulkReviewStage2Slot["resolver_source"],
): string {
  switch (source) {
    case "sender_map":
      return "sender-map";
    case "identifier_match":
      return "identifier";
    case "llm_tiebreaker":
      return "stage-2-tiebreaker";
    default:
      return "no match";
  }
}
