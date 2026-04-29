"use client";

// Phase 61-02. Two-line display-only row strip.
// - line 1: subject (14px semibold, truncate)
// - line 2: sender · rule · time (12px muted, truncate, tabular-nums on time)
// - selected → 3px brand-primary left bar + brand-primary-soft background
// - click → onSelect(row.id) — parent owns router.push(?selected=) so the
//   page-scoped keyboard handler can call the same selection fn.
// - hover → primes the body cache via prefetchReviewEmailBody (D-PREFETCH-NEXT).
//
// No Approve/Reject buttons (D-ROW-NO-BUTTONS) — actions live in detail-pane.tsx.
// No status pill on the strip — it moved to detail-pane.tsx.

import type { PredictedRow } from "./page";
import { prefetchReviewEmailBody } from "./detail-pane";

interface RowStripProps {
  row: PredictedRow;
  selected: boolean;
  onSelect: (rowId: string) => void;
}

interface ResultPayload {
  message_id?: string;
  source_mailbox?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  predicted?: { rule?: string; category?: string };
}

function readResult(row: PredictedRow): ResultPayload {
  const r = row.result as ResultPayload | null;
  return r ?? {};
}

export function RowStrip({ row, selected, onSelect }: RowStripProps) {
  const result = readResult(row);
  const subject = result.subject ?? "(no subject)";
  const sender = result.fromName
    ? `${result.fromName} <${result.from ?? "unknown"}>`
    : (result.from ?? "unknown sender");
  const ruleKey = result.predicted?.rule ?? "no_match";
  const time = new Date(row.created_at).toLocaleString("en-GB");

  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      onMouseEnter={() => prefetchReviewEmailBody(row.id)}
      aria-pressed={selected}
      aria-label={`Select email "${subject}" from ${sender}`}
      className="w-full text-left px-4 py-3 rounded-[var(--v7-radius-sm)] border border-[var(--v7-line)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--v7-brand-primary)]"
      style={{
        background: selected
          ? "var(--v7-brand-primary-soft)"
          : "var(--v7-panel-2)",
        borderLeft: selected
          ? "3px solid var(--v7-brand-primary)"
          : "1px solid var(--v7-line)",
        paddingLeft: selected ? 13 : 16,
      }}
    >
      <div className="min-w-0 flex flex-col gap-1">
        <div className="text-[14px] font-semibold leading-[1.35] truncate min-w-0">
          {subject}
        </div>
        <div className="text-[12px] leading-[1.4] text-[var(--v7-muted)] truncate min-w-0">
          <span>{sender}</span>
          <span> · </span>
          <code className="font-mono">{ruleKey}</code>
          <span> · </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{time}</span>
        </div>
      </div>
    </button>
  );
}
