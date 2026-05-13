"use client";

/**
 * Phase 82.5 Plan 03 — Collapsible cross-operator notes block.
 *
 * Rendered below the Save/Confirm row inside StageFeedbackPanel when a row
 * has feedback from other operators. Returns null when notes.length === 0
 * (panel hides entirely — no empty toggle).
 *
 * Hard-separation reminder: keyed on `email_feedback.(email_id, stage)` only;
 * orthogonal to `swarm_noise_categories` (Stage 1) and `swarm_intents` (Stage 3).
 *
 * Security: `prose_notes` is rendered as text content of a <p>; never as raw
 * HTML (XSS mitigation T-82.5.03-01).
 */

import { Button } from "@/components/ui/button";
import type { FeedbackOtherNote } from "@/lib/automations/debtor-email/feedback/types";

export type OthersSaidBlockProps = {
  notes: FeedbackOtherNote[];
  open: boolean;
  onToggle: () => void;
};

function verdictColor(v: FeedbackOtherNote["verdict"]): string {
  if (v === "confirm") return "var(--v7-lime)";
  if (v === "override") return "var(--v7-amber)";
  return "var(--v7-brand-secondary)";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return iso;
  }
}

export function OthersSaidBlock({ notes, open, onToggle }: OthersSaidBlockProps) {
  if (notes.length === 0) return null;

  return (
    <div
      data-testid="others-said-block"
      style={{
        marginTop: "var(--space-3)",
        paddingTop: "var(--space-2)",
        borderTop: "1px dashed var(--v7-border)",
      }}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onToggle}
        data-testid="others-said-toggle"
      >
        {open ? `Hide what others said (${notes.length})` : `What others said (${notes.length})`}
      </Button>

      {open && (
        <ul
          data-testid="others-said-list"
          style={{
            listStyle: "none",
            margin: "var(--space-2) 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {notes.map((n, i) => (
            <li
              key={`${n.display_name}-${n.created_at}-${i}`}
              style={{
                padding: "var(--space-2)",
                background: "var(--v7-panel-2)",
                border: "1px solid var(--v7-border)",
                borderRadius: 6,
                fontSize: 12,
                color: "var(--v7-text)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    color: "var(--v7-text-dim)",
                  }}
                >
                  {n.display_name}
                </span>
                <span
                  data-verdict={n.verdict}
                  style={{
                    display: "inline-flex",
                    padding: "2px 6px",
                    borderRadius: "var(--v7-radius-pill)",
                    background: verdictColor(n.verdict),
                    color: "var(--v7-bg)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    textTransform: "uppercase",
                  }}
                >
                  {n.verdict}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    color: "var(--v7-text-dim)",
                  }}
                >
                  {formatTimestamp(n.created_at)}
                </span>
              </div>
              {n.prose_notes && (
                <p
                  style={{
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    color: "var(--v7-text)",
                  }}
                >
                  {n.prose_notes}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
