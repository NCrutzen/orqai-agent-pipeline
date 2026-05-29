"use client";

// Phase 3 Plan 01 Task 3 — Stage 4 Read column (minimal).
//
// Renders the handler-output evidence so the operator can decide before
// editing/rejecting. Sourced from row.stage_4 (which the Phase 1 hydrator
// projects from email_labels.handler_key + handler_output_kind + the
// downstream draft_quality / feedback_reason capture columns).
//
// Plan 01 ships a minimal Read column — Plan 03 may layer richer evidence
// (live draft preview, attachments, replay link) once the inline-expand
// container is operator-driven.

import type { BulkReviewRow } from "@/lib/bulk-review/types";

interface Stage4ReadProps {
  row: BulkReviewRow;
}

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
        marginBottom: "var(--space-1)",
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      data-testid={`stage-4-read-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        display: "flex",
        gap: "var(--space-2)",
        fontSize: 13,
        color: "var(--v7-text)",
      }}
    >
      <span
        style={{
          minWidth: 140,
          color: "var(--v7-text-muted)",
          fontFamily: "var(--v7-font-mono)",
          fontSize: 12,
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1 }}>{value}</span>
    </div>
  );
}

export function Stage4Read({ row }: Stage4ReadProps) {
  const slot = row.stage_4;
  if (slot === null) {
    return (
      <p
        data-testid="stage-4-read-placeholder"
        style={{
          fontSize: 13,
          color: "var(--v7-text-muted)",
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        The handler hasn&apos;t acted on this row. In dry-run the system stages
        its decision without sending anything — your job is on the earlier
        stages: check the Customer and Topic the system found.
      </p>
    );
  }
  return (
    <div
      data-testid="stage-4-read"
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
    >
      <SectionLabel>HANDLER OUTPUT</SectionLabel>
      <Row label="Handler" value={slot.handler_key ?? "(no handler ran)"} />
      <Row
        label="Output kind"
        value={slot.handler_output_kind ?? "(unset)"}
      />
      <Row
        label="Draft quality"
        value={slot.draft_quality ?? "(no verdict yet)"}
      />
      {slot.feedback_reason ? (
        <Row label="Feedback reason" value={slot.feedback_reason} />
      ) : null}
    </div>
  );
}
