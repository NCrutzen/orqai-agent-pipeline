"use client";

// Phase 64-05 (SAFE-02 / SAFE-04). Detail-pane variant rendered when the
// selected automation_runs row has topic='safety_review'. Shape per
// 64-UI-SPEC.md "Detail pane — flagged email view" section.
//
// Three sections, three operator actions. Copywriting verbatim from UI-SPEC.
//   1. STAGE 0 · REGEX SCREEN  → pattern matched (or "No regex pattern matched")
//   2. STAGE 0 · LLM VERDICT   → model_key → injection_suspected, Why, Quoted span
//   3. STAGE 0 · COST          → cents · tokens · model
//
// Actions (D-11, D-12 — three only, no manual reply):
//   - Mark safe & reprocess  → re-emits stage-0/email.received with safety_overridden=true
//   - Dismiss                → optimistic remove + 5s undo (existing toast layer)
//   - Escalate to human review → writes a human-review automation_runs row
//
// Mark-safe and Dismiss use the existing pendingRemovalIds optimistic
// mechanism in selection-context.tsx. Escalate has no undo (matches UI-SPEC
// "no extra confirm — opens existing Kanban lane").

import { useCallback, useState } from "react";
import { toast } from "sonner";
import {
  markSafeAndReprocess,
  dismissSafetyReview,
  escalateToKanban,
} from "../actions";
import type { PredictedRow } from "../page";
// Phase 82 Plan 06: selection-context moved to _shell/.
import { useSelection } from "../../_shell/selection-context";
import { MatchedSpanHighlight } from "./matched-span-highlight";

interface SafetyResult {
  stage?: string;
  email_id?: string;
  message_id?: string;
  source_mailbox?: string;
  subject?: string;
  verdict?: "safe" | "injection_suspected";
  regex_matched?: string | null;
  llm_reason?: string;
  matched_span?: string | null;
  cost_cents?: number;
  token_count?: number;
  model_key?: string;
  safety_overridden?: boolean;
}

interface SafetyDetailPaneProps {
  row: PredictedRow;
  /** Optional fetched email body for span highlighting. May be null/empty
   *  before the body fetch resolves; the highlight component falls back to
   *  rendering the matched span quoted on its own when body is unavailable. */
  bodyText?: string | null;
}

export function SafetyDetailPane({ row, bodyText }: SafetyDetailPaneProps) {
  const { markPendingRemoval } = useSelection();
  const [busy, setBusy] = useState<"mark-safe" | "dismiss" | "escalate" | null>(
    null,
  );

  const result = (row.result ?? {}) as SafetyResult;
  const regexMatched = result.regex_matched ?? null;
  const modelKey = result.model_key ?? "stage-0-safety-classifier";
  const llmReason = result.llm_reason ?? "(no reason recorded)";
  const matchedSpan = result.matched_span ?? null;
  const costCents = result.cost_cents ?? 0;
  const tokenCount = result.token_count ?? 0;

  // Phase 64.1: action error string for the Outlook 400 case is
  // friendlier than the raw API message — operators see this when an
  // already-deleted Outlook message can't be refetched.
  function friendlyError(raw: string): string {
    if (
      raw.includes("ErrorInvalidIdMalformed") ||
      raw.includes("fetchMessageBody 400") ||
      raw.includes("fetchMessageBody 404")
    ) {
      return "Couldn't refetch the original email — it may have been deleted from Outlook. Try Correct & Dismiss or Escalate instead.";
    }
    return raw || "try again";
  }

  const onMarkSafe = useCallback(async () => {
    setBusy("mark-safe");
    markPendingRemoval(row.id);
    try {
      await markSafeAndReprocess(row.id);
      toast.success("Marked safe — reprocessing through Stage 1 (Stage 0 false positive logged)");
    } catch (e) {
      toast.error(`Mark safe failed: ${friendlyError((e as Error).message)}`);
    } finally {
      setBusy(null);
    }
  }, [row.id, markPendingRemoval]);

  const onDismiss = useCallback(async () => {
    setBusy("dismiss");
    markPendingRemoval(row.id);
    try {
      await dismissSafetyReview(row.id);
      // Phase 64.1: copy clarifies the implied verdict — Dismiss = "Stage 0
      // was correct, archive". Used by future precision/recall analytics.
      toast.success("Confirmed and archived — Stage 0 true positive logged", {
        duration: 5000,
      });
    } catch (e) {
      toast.error(`Dismiss failed: ${friendlyError((e as Error).message)}`);
    } finally {
      setBusy(null);
    }
  }, [row.id, markPendingRemoval]);

  const onEscalate = useCallback(async () => {
    setBusy("escalate");
    markPendingRemoval(row.id);
    try {
      await escalateToKanban(row.id);
      toast.success("Escalated to human review — Stage 0 true positive logged");
    } catch (e) {
      toast.error(`Escalate failed: ${friendlyError((e as Error).message)}`);
    } finally {
      setBusy(null);
    }
  }, [row.id, markPendingRemoval]);

  return (
    <div
      aria-label="Stage 0 safety review detail"
      className="flex flex-col gap-4"
    >
      {/* Section 1 — Regex screen */}
      <section className="flex flex-col gap-2">
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--v7-muted)",
          }}
        >
          STAGE 0 · REGEX SCREEN
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          {regexMatched ? (
            <>
              Pattern matched:{" "}
              <code
                className="font-mono"
                style={{ fontSize: 12 }}
              >
                {regexMatched}
              </code>
            </>
          ) : (
            <span style={{ color: "var(--v7-faint)" }}>
              No regex pattern matched
            </span>
          )}
        </div>
      </section>

      {/* Section 2 — LLM verdict */}
      <section className="flex flex-col gap-2">
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--v7-muted)",
          }}
        >
          STAGE 0 · LLM VERDICT
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>
          <code className="font-mono" style={{ fontSize: 12 }}>
            {modelKey}
          </code>{" "}
          →{" "}
          <span
            style={{
              background: "var(--v7-blue-soft)",
              color: "var(--v7-blue)",
              padding: "2px 8px",
              borderRadius: "var(--v7-radius-pill)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            injection_suspected
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--v7-muted)",
            }}
          >
            Why
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{llmReason}</div>
        </div>
        <div className="flex flex-col gap-1">
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--v7-muted)",
            }}
          >
            Quoted from email body
          </div>
          {matchedSpan ? (
            bodyText ? (
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid var(--v7-line)",
                  borderRadius: "var(--v7-radius-sm)",
                  padding: "8px 12px",
                  maxHeight: "30vh",
                  overflow: "auto",
                }}
              >
                <MatchedSpanHighlight body={bodyText} span={matchedSpan} />
              </div>
            ) : (
              <blockquote
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  background: "var(--v7-amber-soft)",
                  borderLeft: "3px solid var(--v7-amber)",
                  padding: "8px 12px",
                  borderRadius: "0 var(--v7-radius-sm) var(--v7-radius-sm) 0",
                  margin: 0,
                  fontStyle: "italic",
                }}
              >
                {matchedSpan}
              </blockquote>
            )
          ) : (
            <div style={{ fontSize: 13, color: "var(--v7-faint)" }}>
              (no span quoted)
            </div>
          )}
        </div>
      </section>

      {/* Section 3 — Cost */}
      <section className="flex flex-col gap-2">
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--v7-muted)",
          }}
        >
          STAGE 0 · COST
        </div>
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {costCents} cents · {tokenCount} tokens ·{" "}
          <code className="font-mono" style={{ fontSize: 12 }}>
            {modelKey}
          </code>
        </div>
      </section>

      {/* Action bar — three buttons (D-11 / D-12, no manual reply).
          Phase 64.1 button copy + aria-label captures the implied verdict on
          Stage 0's classification: Mark safe = false positive,
          Correct & Dismiss = true positive (archive), Escalate = true positive (action). */}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <button
          type="button"
          onClick={onMarkSafe}
          disabled={busy !== null}
          aria-label="Mark safe and reprocess — Stage 0 was wrong (false positive)"
          title="Stage 0 was wrong — let this email continue through to the classifier"
          className="px-4 py-2 rounded-[var(--v7-radius-sm)] focus:outline-none focus:ring-2"
          style={{
            background: "var(--v7-brand-primary)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            // @ts-expect-error CSS custom prop for focus-ring color
            "--tw-ring-color": "var(--v7-brand-primary)",
            opacity: busy && busy !== "mark-safe" ? 0.5 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy === "mark-safe" ? "Marking safe…" : "Mark safe & reprocess"}
        </button>

        <button
          type="button"
          onClick={onDismiss}
          disabled={busy !== null}
          aria-label="Confirm Stage 0 was correct and dismiss — true positive, no further action"
          title="Stage 0 caught this correctly — archive without further action"
          className="px-4 py-2 rounded-[var(--v7-radius-sm)] border focus:outline-none focus:ring-2"
          style={{
            background: "transparent",
            borderColor: "var(--v7-line)",
            color: "var(--v7-text)",
            fontSize: 13,
            fontWeight: 600,
            // @ts-expect-error CSS custom prop for focus-ring color
            "--tw-ring-color": "var(--v7-brand-primary)",
            opacity: busy && busy !== "dismiss" ? 0.5 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy === "dismiss" ? "Dismissing…" : "Correct & Dismiss"}
        </button>

        <button
          type="button"
          onClick={onEscalate}
          disabled={busy !== null}
          aria-label="Escalate to human review — Stage 0 was correct AND this needs follow-up"
          title="Stage 0 was right and this needs human follow-up beyond archiving"
          className="px-4 py-2 rounded-[var(--v7-radius-sm)] border focus:outline-none focus:ring-2"
          style={{
            background: "transparent",
            borderColor: "var(--v7-amber)",
            color: "var(--v7-amber)",
            fontSize: 13,
            fontWeight: 600,
            // @ts-expect-error CSS custom prop for focus-ring color
            "--tw-ring-color": "var(--v7-brand-primary)",
            opacity: busy && busy !== "escalate" ? 0.5 : 1,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy === "escalate" ? "Escalating…" : "Escalate to human review"}
        </button>
      </div>
    </div>
  );
}
