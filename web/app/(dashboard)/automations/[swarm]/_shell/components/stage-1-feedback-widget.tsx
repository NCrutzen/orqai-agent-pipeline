"use client";

// Phase 2 Plan 02-04 — Stage 1 Decide column (rule-feedback widget).
//
// Sketch 003 lock + canonical-patterns.md §8 (verdict button color triad)
// + §9 (AuditBlock textarea). Operator-language locks (operator-language.md):
//   • "Confirm rule"        — primary green action when in confirm mode.
//   • "Submit override"     — primary green action after flipping to override.
//   • "Flip to override"    — amber secondary, exposes category dropdown.
//   • "Cancel"              — subtle, restores confirm mode.
//   • "What's the correction context? (optional)" — AuditBlock label.
//
// Hard-separation invariant (RFC stage-1-regex.md): the dropdown is
// hydrated from swarm_noise_categories (Stage 1 vocabulary) ONLY — never
// swarm_intents. The widget posts to the /feedback POST handler (never
// the axis-1 write surface), and the server gates the optional
// agent_runs.human_verdict flip on stage===1 + verdict='override' so
// Stage 3 intent semantics can never leak through this surface.
//
// Forbidden imports / patterns (sketch 003 + plan acceptance criteria) —
// guard tests assert the negative-space by reading this file off disk
// and grep-ing for the forbidden symbols, so they are intentionally
// not enumerated in this header. See:
//   • web/.../__tests__/stage-1-feedback-widget.test.tsx (Tests 6–8)
//   • web/.../__tests__/stage-1-feedback-widget.no-pipeline-events.test.tsx

import { useState } from "react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";
import { fireFeedback } from "@/lib/automations/debtor-email/feedback/fire-feedback";
import { Stage1Widget as Stage1CategorySelect } from "../../stage-1/components/stage-1-widget";

export interface Stage1FeedbackWidgetProps {
  row: BulkReviewRow;
  /**
   * Noise-category registry rows (Stage 1 vocabulary ONLY — swarm_noise_categories).
   * Threaded from the Server Component that calls loadSwarmNoiseCategories;
   * the widget never fetches the registry itself (P1-D-02).
   */
  categories: SwarmNoiseCategoryRow[];
  /** Optional callback after fireFeedback resolves (used by tests + future row-fade). */
  onSubmitted?: () => void;
}

const TEXTAREA_MAX = 4000; // mirror server-side zod max(4000).
const TEXTAREA_MIN_HEIGHT = 160; // canonical-patterns.md §9.

export function Stage1FeedbackWidget({
  row,
  categories,
  onSubmitted,
}: Stage1FeedbackWidgetProps) {
  const slot = row.stage_1;
  const [mode, setMode] = useState<"confirm" | "override">("confirm");
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Null-handling: nothing to vote on yet.
  if (slot === null) {
    return (
      <p
        data-testid="stage-1-feedback-widget-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-text-muted)",
          margin: 0,
        }}
      >
        No Stage 1 decision to vote on yet.
      </p>
    );
  }

  async function submit() {
    if (!slot) return; // never — narrowed above; appeases TS narrowing.
    if (submitting) return;
    const verdict: "confirm" | "override" = mode;
    if (
      verdict === "override" &&
      (selectedCategoryKey === null ||
        selectedCategoryKey === slot.category_key)
    ) {
      // Block submit; gated by button disabled too but defensive.
      return;
    }
    setSubmitting(true);
    const corrected_value =
      verdict === "override"
        ? (selectedCategoryKey ?? undefined)
        : undefined;
    const prose_notes = notes.trim() ? notes.trim() : undefined;
    const agent_run_id = slot.agent_run_id ?? undefined;
    await fireFeedback({
      email_id: row.email_id ?? "",
      stage: 1,
      verdict,
      corrected_value,
      prose_notes,
      agent_run_id,
    });
    setSubmitting(false);
    onSubmitted?.();
  }

  const ruleLabel = slot.matched_rule_id ?? "(no rule matched)";
  const categoryLabel = slot.category_display_label ?? slot.category_key;

  const submitDisabledOverride =
    mode === "override" &&
    (selectedCategoryKey === null ||
      selectedCategoryKey === slot.category_key);

  return (
    <div
      data-testid="stage-1-feedback-widget"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      {/* Section label — operator-language §RULE FEEDBACK */}
      <div
        style={{
          fontSize: 11,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--v7-fg-muted)",
          fontWeight: 600,
          fontFamily: "var(--v7-font-mono)",
        }}
      >
        RULE FEEDBACK
      </div>

      {/* Read-only context pill: which rule + category we're voting on. */}
      <div
        data-testid="stage-1-feedback-widget-context"
        style={{
          fontSize: 12,
          color: "var(--v7-text)",
          fontFamily: "var(--v7-font-mono)",
        }}
      >
        Confirming: <span data-testid="stage-1-feedback-widget-rule">{ruleLabel}</span>
        {" → "}
        <span data-testid="stage-1-feedback-widget-category">{categoryLabel}</span>
      </div>

      {/* Mode-dependent body: confirm CTA row OR override picker+CTA row. */}
      {mode === "confirm" ? (
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            data-testid="stage-1-feedback-widget-confirm"
            onClick={submit}
            disabled={submitting}
            style={{
              background: "var(--v7-action-confirm-bg)",
              color: "var(--v7-action-confirm-fg)",
              border: 0,
              borderRadius: "var(--v7-radius-pill)",
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Confirm rule
          </button>
          <button
            type="button"
            data-testid="stage-1-feedback-widget-flip"
            onClick={() => setMode("override")}
            disabled={submitting}
            style={{
              background: "var(--v7-action-override-bg)",
              color: "var(--v7-action-override-fg)",
              border: 0,
              borderRadius: "var(--v7-radius-pill)",
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 500,
              cursor: submitting ? "not-allowed" : "pointer",
            }}
          >
            Flip to override
          </button>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          <div data-testid="stage-1-feedback-widget-category-dropdown">
            <Stage1CategorySelect
              categories={categories}
              value={selectedCategoryKey}
              onChange={(k: string) => setSelectedCategoryKey(k)}
            />
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              data-testid="stage-1-feedback-widget-confirm"
              onClick={submit}
              disabled={submitting || submitDisabledOverride}
              style={{
                background: "var(--v7-action-confirm-bg)",
                color: "var(--v7-action-confirm-fg)",
                border: 0,
                borderRadius: "var(--v7-radius-pill)",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor:
                  submitting || submitDisabledOverride
                    ? "not-allowed"
                    : "pointer",
                opacity: submitting || submitDisabledOverride ? 0.5 : 1,
              }}
            >
              Submit override
            </button>
            <button
              type="button"
              data-testid="stage-1-feedback-widget-cancel"
              onClick={() => {
                setMode("confirm");
                setSelectedCategoryKey(null);
              }}
              disabled={submitting}
              style={{
                background: "var(--v7-action-discard-bg, transparent)",
                color: "var(--v7-action-discard-fg, var(--v7-text-muted))",
                border: "1px solid var(--v7-border)",
                borderRadius: "var(--v7-radius-pill)",
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* AuditBlock — canonical-patterns.md §9. Always visible; optional input. */}
      <div
        data-testid="stage-1-feedback-widget-audit-block"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
      >
        <label
          htmlFor={`stage-1-feedback-notes-${row.email_label_id}`}
          style={{
            fontSize: 12,
            color: "var(--v7-fg-muted)",
          }}
        >
          What&apos;s the correction context? (optional)
        </label>
        <textarea
          id={`stage-1-feedback-notes-${row.email_label_id}`}
          data-testid="stage-1-feedback-widget-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={TEXTAREA_MAX}
          placeholder="Why did you confirm / override? Anything we should know?"
          disabled={submitting}
          style={{
            minHeight: TEXTAREA_MIN_HEIGHT,
            borderLeft: "3px solid var(--v7-brand-primary)",
            borderTop: "1px solid var(--v7-border)",
            borderRight: "1px solid var(--v7-border)",
            borderBottom: "1px solid var(--v7-border)",
            borderRadius: 4,
            padding: "var(--space-2)",
            fontFamily: "var(--v7-font-sans)",
            fontSize: 13,
            background: "var(--v7-bg)",
            color: "var(--v7-text)",
            resize: "vertical",
          }}
        />
      </div>
    </div>
  );
}
