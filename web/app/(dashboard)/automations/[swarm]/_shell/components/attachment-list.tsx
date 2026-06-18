"use client";

// Phase 116-05 Task 2 (D-08) — Attachment metadata + extraction-status display.
//
// Presentation component for the Stage 2 Read column (sits alongside "Email
// body · identifiers highlighted" per the bulk-review-flow-ux per-stage-content
// spec). Pure read-only: filename / content-type / human-readable size + an
// extraction-status badge per attachment. NO download link, NO preview
// thumbnail — out of scope this phase (D-08).
//
// Anti-drift (sketch-findings-bulk-review-flow-ux):
//   - inline styles consuming var(--v7-*) tokens only, NO hardcoded hex
//   - SectionLabel = uppercase mono 11px (mirrors stage-2-read.tsx)
//   - status badge reuses the existing --v7-state-* token triad (match / warn /
//     llm-rescue / idle) — no new visual language, no new color tokens
//   - operator-safe language (no internal field names in the badge labels)

import type { ReactNode } from "react";
import type { BulkReviewAttachment } from "@/lib/bulk-review/types";

// Shared structural type. Aliased to the canonical BulkReviewAttachment (defined
// in lib/bulk-review/types.ts) so the hydrator → BulkReviewRow → detail-pane
// path and this component cannot drift. UI importing FROM lib/ is allowed; the
// out-of-band guard only forbids lib/bulk-review importing from the UI tree.
export type AttachmentRow = BulkReviewAttachment;

function SectionLabel({ children }: { children: string }) {
  return (
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
      {children}
    </div>
  );
}

// Human-readable byte size. null → "—" (never fabricate a size).
function formatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

// Each free-text extraction_status maps to an operator-facing label + one of the
// existing --v7-state-* token pairs. Unknown statuses degrade to a muted/idle
// treatment rather than crashing (free-text column — values may evolve).
type BadgeTone = "success" | "progress" | "warning" | "muted";

// Phase 116 review WR-02: `needs_vision` removed. Vision runs INLINE inside the
// extractor (no deferred queue exists), so the extractor only ever persists
// extracted / extraction_failed / skipped_cap / unsupported / source_gone — the
// "Awaiting image read" badge was unreachable and the status was a dead contract.
const STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  extracted: { label: "Text extracted", tone: "success" },
  pending: { label: "Queued", tone: "progress" },
  extraction_failed: { label: "Extraction failed", tone: "warning" },
  no_text: { label: "No text content", tone: "muted" },
  skipped_cap: { label: "Skipped (too large)", tone: "warning" },
  source_gone: { label: "Source removed", tone: "warning" },
  unsupported: { label: "Unsupported type", tone: "muted" },
  not_requested: { label: "Not processed", tone: "muted" },
};

function toneTokens(tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case "success":
      return { bg: "var(--v7-state-match-bg)", fg: "var(--v7-state-match-fg)" };
    case "progress":
      return {
        bg: "var(--v7-state-llm-rescue-bg)",
        fg: "var(--v7-state-llm-rescue-fg)",
      };
    case "warning":
      return { bg: "var(--v7-state-warn-bg)", fg: "var(--v7-state-warn-fg)" };
    case "muted":
    default:
      return { bg: "var(--v7-state-idle-bg)", fg: "var(--v7-state-idle-fg)" };
  }
}

function StatusBadge({ status }: { status: string }): ReactNode {
  const meta = STATUS_META[status] ?? { label: status, tone: "muted" as const };
  const { bg, fg } = toneTokens(meta.tone);
  return (
    <span
      data-testid="attachment-status-badge"
      data-status={status}
      data-tone={meta.tone}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 22,
        padding: "0 10px",
        background: bg,
        color: fg,
        borderRadius: "var(--v7-radius-pill)",
        fontSize: 11,
        fontWeight: 500,
        fontFamily: "var(--v7-font-mono)",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function AttachmentList({
  attachments,
}: {
  attachments: AttachmentRow[];
}): ReactNode {
  if (!attachments || attachments.length === 0) {
    return (
      <div
        data-testid="attachment-list"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <SectionLabel>ATTACHMENTS</SectionLabel>
        <p
          data-testid="attachment-list-empty"
          style={{
            fontSize: 13,
            color: "var(--v7-fg-muted)",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          No attachments
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="attachment-list"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
      }}
    >
      <SectionLabel>{`ATTACHMENTS · ${attachments.length}`}</SectionLabel>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
        }}
      >
        {attachments.map((a) => (
          <article
            key={a.attachment_id}
            data-testid="attachment-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--v7-panel-2)",
              borderRadius: "var(--v7-radius-sm)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                minWidth: 0,
                flex: 1,
              }}
            >
              <span
                data-testid="attachment-filename"
                style={{
                  fontSize: 13,
                  color: "var(--v7-text)",
                  fontWeight: 500,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.filename ?? "unnamed"}
              </span>
              <span
                data-testid="attachment-meta"
                style={{
                  fontSize: 11,
                  fontFamily: "var(--v7-font-mono)",
                  color: "var(--v7-fg-muted)",
                }}
              >
                {a.content_type ?? "unknown type"} · {formatSize(a.size_bytes)}
              </span>
            </div>
            <StatusBadge status={a.extraction_status} />
          </article>
        ))}
      </div>
    </div>
  );
}
